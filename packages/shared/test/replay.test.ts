import { describe, expect, it } from "vitest";
import {
  Command,
  decide,
  emptyRoomState,
  filterStateForViewer,
  reduceCommitted,
  replayFrom,
  replayPoints,
  replayStates,
  replayTo,
  ReplayResponse,
  tableOf,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, bob, gm } from "./fixtures";

/** A room run the way the server runs it: seqs, one command id per batch, checkpoint replay (ADR 0019). */
function room() {
  let n = 0;
  const log: CommittedEvent[] = [];
  let state: RoomState = emptyRoomState("room-1");
  const commit = (events: DomainEvent[], actorId: string | null) => {
    const commandId = `cmd-${log.length + 1}`;
    for (const event of events) {
      const committed: CommittedEvent = { seq: log.length + 1, at: `2026-10-09T12:00:${String(log.length % 60).padStart(2, "0")}.000Z`, actorId, commandId, event };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
  };
  commit([{ type: "RoomCreated", name: "Keep" }], null);
  for (const p of [gm, alice, bob]) commit([{ type: "ParticipantJoined", participant: p }], p.id);
  return {
    get state() { return state; },
    log,
    run(actor: Participant, input: CommandInput) {
      const decision = decide(state, actor, Command.parse(input), {
        newId: () => `id-${++n}`,
        random: () => 0.5,
        lastSeq: log.length,
        checkpointTable: (id) => {
          const checkpoint = state.checkpoints.find((c) => c.id === id);
          return checkpoint ? tableOf(replayTo(state.roomId, log, checkpoint.seq)) : null;
        },
      });
      if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
      commit(decision.events, actor.id);
      return decision.events;
    },
  };
}

/** A session with everything replay must keep from players: a hidden goblin, GM rolls, fog, a checkpoint. */
function session() {
  const r = room();
  const [fighterCreated] = r.run(gm, { type: "token.create", name: "Fighter", position: { x: 35, y: 35 }, ownerIds: [alice.id] });
  const [goblinCreated] = r.run(gm, { type: "token.create", name: "Goblin", position: { x: 315, y: 315 }, hidden: true });
  const fighter = fighterCreated!.type === "TokenCreated" ? fighterCreated!.token : null!;
  const goblin = goblinCreated!.type === "TokenCreated" ? goblinCreated!.token : null!;
  r.run(gm, { type: "checkpoint.create", name: "Before the ambush" });
  r.run(alice, { type: "token.move", tokenId: fighter.id, to: { x: 105, y: 35 } });
  r.run(gm, { type: "token.move", tokenId: goblin.id, to: { x: 245, y: 245 } });
  r.run(gm, { type: "dice.roll", expression: "1d20", visibility: "gm" });
  r.run(alice, { type: "dice.roll", expression: "1d20" });
  r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 600, y: 600 }, to: { x: 700, y: 700 } } });
  r.run(gm, { type: "token.setHidden", tokenId: goblin.id, hidden: false });
  r.run(gm, { type: "initiative.start", entries: [{ tokenId: fighter.id, score: 15 }, { tokenId: goblin.id, score: 10 }] });
  r.run(gm, { type: "initiative.advance" });
  r.run(alice, { type: "chat.send", text: "Watch out" });
  r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });
  return { r, fighter, goblin };
}

const startPoint = (log: CommittedEvent[], viewer: Participant) => replayPoints(log, viewer).find((p) => p.id === "start")!;

describe("Replay points (FR-PL-07)", () => {
  it("lists start, encounter starts and checkpoints; players see checkpoints unnamed", () => {
    const { r } = session();
    const forPlayer = replayPoints(r.log, alice);
    expect(forPlayer.map((p) => p.label)).toEqual(["Start of the room", "Checkpoint 1", "Encounter 1 starts"]);
    const serialized = JSON.stringify(forPlayer);
    expect(serialized).not.toContain("Before the ambush");
    expect(serialized).not.toContain(r.state.checkpoints[0]!.id);
    expect(replayPoints(r.log, gm).map((p) => p.label)).toEqual(["Start of the room", "Before the ambush", "Encounter 1 starts"]);
  });

  it("starts an encounter point just before the encounter, so its start is the first step", () => {
    const { r } = session();
    const point = replayPoints(r.log, alice).find((p) => p.kind === "encounter")!;
    const started = r.log.find((c) => c.event.type === "InitiativeStarted")!;
    expect(point.seq).toBe(started.seq - 1);
    const replay = replayFrom("room-1", r.log, alice, point);
    expect(replay.frames[0]).toMatchObject({ kind: "table", seq: started.seq });
  });
});

describe("Replay is filtered for the viewer (FR-PL-07)", () => {
  it("never shows a player the hidden goblin before its reveal, nor a GM-only roll", () => {
    const { r, goblin } = session();
    const replay = replayFrom("room-1", r.log, alice, startPoint(r.log, alice));
    const revealSeq = r.log.find((c) => c.event.type === "TokenHiddenSet")!.seq;
    const states = replayStates(replay);
    replay.frames.forEach((frame, i) => {
      const seq = frame.kind === "event" ? frame.committed.seq : frame.seq;
      const json = JSON.stringify(frame);
      if (seq < revealSeq) {
        expect(json).not.toContain(goblin.id);
        expect(states[i + 1]!.tokens[goblin.id]).toBeUndefined();
      }
      expect(json).not.toContain("Before the ambush");
      expect(json).not.toContain('"commandId"');
      if (frame.kind === "table") expect(frame.rolls.every((roll) => roll.visibility === "public")).toBe(true);
    });
    const revealed = replay.frames.findIndex((f) => f.kind === "table" && f.seq === revealSeq);
    expect(states[revealed + 1]!.tokens[goblin.id]).toBeDefined();
    expect(states.every((s) => s.undo.length === 0 && s.checkpoints.length === 0)).toBe(true);
  });

  it("leaves changes the player could not see out entirely", () => {
    const { r } = session();
    const replay = replayFrom("room-1", r.log, alice, startPoint(r.log, alice));
    const seqs = replay.frames.map((f) => (f.kind === "event" ? f.committed.seq : f.seq));
    const gmRoll = r.log.find((c) => c.event.type === "DiceRolled" && c.event.roll.visibility === "gm")!;
    const checkpoint = r.log.find((c) => c.event.type === "CheckpointCreated")!;
    expect(seqs).not.toContain(gmRoll.seq);
    expect(seqs).not.toContain(checkpoint.seq);
  });

  it("gives the GM everything", () => {
    const { r, goblin } = session();
    const replay = replayFrom("room-1", r.log, gm, startPoint(r.log, gm));
    const json = JSON.stringify(replay);
    expect(json).toContain(goblin.id);
    expect(json).toContain("Before the ambush");
    expect(replay.frames.some((f) => f.kind === "event" && f.committed.event.type === "DiceRolled" && f.committed.event.roll.visibility === "gm")).toBe(true);
  });

  it("folds to exactly the filtered table at every step", () => {
    const { r } = session();
    for (const viewer of [alice, bob, gm]) {
      const replay = replayFrom("room-1", r.log, viewer, startPoint(r.log, viewer));
      const states = replayStates(replay);
      replay.frames.forEach((frame, i) => {
        const seq = frame.kind === "event" ? frame.committed.seq : frame.seq;
        const truth = filterStateForViewer(replayTo("room-1", r.log, seq), viewer);
        const shown = states[i + 1]!;
        expect(tableOf(shown)).toEqual(tableOf(truth));
        expect(shown.rolls).toEqual(truth.rolls);
        expect(shown.participants).toEqual(truth.participants);
      });
    }
  });

  it("preserves terrain and area effects together through filtered wire snapshots", () => {
    const r = room();
    r.run(gm, { type: "scene.setMap", map: { url: "/map.png", width: 700, height: 700 } });
    r.run(gm, { type: "token.create", name: "Fighter", position: { x: 35, y: 35 }, ownerIds: [alice.id] });
    r.run(gm, { type: "token.create", name: "Hidden goblin", position: { x: 315, y: 315 }, hidden: true });
    const tokenIds = Object.keys(r.state.tokens);
    const hiddenId = tokenIds.find((id) => r.state.tokens[id]!.hidden)!;
    r.run(gm, { type: "dice.rollGroup", tokenIds, expression: "1d20" });
    r.run(gm, { type: "areaEffect.start", tokenIds, expression: "1d20", label: "Fireball" });
    r.run(gm, {
      type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 2, end: 2, kind: "difficult" }],
      context: { boardEpoch: r.state.boardEpoch ?? 0, revision: r.state.terrainRevision ?? 0 },
    });
    r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 140, y: 0 }, to: { x: 210, y: 70 } } });

    for (const viewer of [alice, gm]) {
      const replay = ReplayResponse.parse(JSON.parse(JSON.stringify(replayFrom("room-1", r.log, viewer, startPoint(r.log, viewer)))));
      const states = replayStates(replay);
      replay.frames.forEach((frame, i) => {
        const seq = frame.kind === "event" ? frame.committed.seq : frame.seq;
        const truth = filterStateForViewer(replayTo("room-1", r.log, seq), viewer);
        const shown = states[i + 1]!;
        expect(tableOf(shown)).toEqual(tableOf(truth));
        expect(shown.terrainView).toEqual(truth.terrainView);
        expect(shown.sight).toEqual(truth.sight);
        expect(shown.boardEpoch).toEqual(truth.boardEpoch);
        expect(shown.areaEffect).toEqual(truth.areaEffect);
        expect(shown.rolls).toEqual(truth.rolls);
      });
      if (viewer.role === "player") {
        expect(JSON.stringify(replay)).not.toContain(hiddenId);
        expect(states.every((state) => state.terrain === undefined && state.terrainRevision === undefined)).toBe(true);
      }
    }
  });

  it("describes visible steps and keeps snapshot steps neutral", () => {
    const { r } = session();
    const replay = replayFrom("room-1", r.log, alice, startPoint(r.log, alice));
    const sentences = replay.frames.map((f) => f.sentence);
    expect(sentences).toContain("Alice moved Fighter from (35, 35) to (105, 35)");
    expect(sentences).toContain("GM changed what is on the board");
    expect(sentences).toContain("GM started initiative");
    expect(sentences).toContain("Alice joined the room as a player");
    expect(sentences.join(" ")).not.toContain("Goblin");
  });

  it("stops at the limit and says so", () => {
    const { r } = session();
    const full = replayFrom("room-1", r.log, alice, startPoint(r.log, alice));
    const cut = replayFrom("room-1", r.log, alice, startPoint(r.log, alice), 3);
    expect(full.truncated).toBe(false);
    expect(cut.frames).toEqual(full.frames.slice(0, 3));
    expect(cut.truncated).toBe(true);
  });

  it("round-trips through the response schema", () => {
    const { r } = session();
    const replay = replayFrom("room-1", r.log, alice, startPoint(r.log, alice));
    expect(ReplayResponse.parse(JSON.parse(JSON.stringify(replay)))).toEqual(replay);
  });
});
