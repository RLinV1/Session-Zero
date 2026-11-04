import { describe, expect, it } from "vitest";
import {
  Command,
  DEFAULT_GRID,
  EncounterTemplateData,
  decide,
  emptyRoomState,
  encounterTable,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  reduceCommitted,
  tableOf,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type ResolvedEncounter,
  type RoomState,
} from "../src";
import { alice, bob, gm } from "./fixtures";

const ENCOUNTER: ResolvedEncounter = {
  id: "tpl-1",
  name: "Goblin ambush",
  scene: { map: { url: "/uploads/cave.png", width: 1400, height: 1000, assetId: "asset-cave" }, grid: DEFAULT_GRID },
  tokens: [
    { name: "Goblin", position: { x: 105, y: 105 }, size: 1, rotation: 0, color: "#22aa44", imageUrl: null, hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: [] },
    { name: "Ambusher", position: { x: 700, y: 700 }, size: 1, rotation: 0, color: "#aa2222", imageUrl: null, hidden: true, stats: { hp: 11, maxHp: 11, ac: 13 }, conditions: ["prone"] },
  ],
  fog: [{ shape: "rect", points: [{ x: 600, y: 600 }, { x: 800, y: 600 }, { x: 800, y: 800 }, { x: 600, y: 800 }] }],
};

/** A room the way the server runs it, with `encounter.apply` resolved from a one-template shelf. */
function room(shelf: ResolvedEncounter[] = [ENCOUNTER]) {
  let n = 0;
  const log: CommittedEvent[] = [];
  let state: RoomState = emptyRoomState("room-1");
  const commit = (events: DomainEvent[], actorId: string | null) => {
    const commandId = `cmd-${log.length + 1}`;
    for (const event of events) {
      const committed: CommittedEvent = { seq: log.length + 1, at: "2026-10-06T12:00:00.000Z", actorId, commandId, event };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
  };
  commit([{ type: "RoomCreated", name: "Keep" }, ...[gm, alice, bob].map((p) => ({ type: "ParticipantJoined" as const, participant: p }))], null);
  const attempt = (actor: Participant, input: CommandInput) =>
    decide(state, actor, Command.parse(input), {
      newId: () => `id-${++n}`,
      random: () => 0.5,
      encounterTemplate: (id) => shelf.find((e) => e.id === id) ?? null,
    });
  return {
    get state() { return state; },
    log,
    attempt,
    run(actor: Participant, input: CommandInput) {
      const decision = attempt(actor, input);
      if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
      commit(decision.events, actor.id);
      return decision.events;
    },
  };
}

const tokenNamed = (state: RoomState, name: string) => Object.values(state.tokens).find((t) => t.name === name)!;

/** A room that already has its own board, a player-owned token and a running encounter. */
function busy() {
  const r = room();
  r.run(gm, { type: "scene.setMap", map: { url: "/uploads/old.png", width: 500, height: 500 } });
  r.run(gm, { type: "token.create", name: "Hero", position: { x: 35, y: 35 }, ownerIds: [alice.id] });
  r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 100, y: 100 } } });
  r.run(alice, { type: "template.place", shape: "circle", origin: { x: 210, y: 210 }, toward: { x: 210, y: 210 }, size: 10 });
  r.run(gm, { type: "initiative.start", entries: [{ tokenId: tokenNamed(r.state, "Hero").id, score: 12 }] });
  r.run(alice, { type: "chat.send", text: "ready" });
  return r;
}

describe("apply encounter template (FR-GM-13)", () => {
  it("replaces the board with the template's, with fresh ids and no owners", () => {
    const r = busy();
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    expect(r.state.scene).toEqual(ENCOUNTER.scene);
    expect(Object.values(r.state.tokens).map((t) => t.name).sort()).toEqual(["Ambusher", "Goblin"]);
    for (const token of Object.values(r.state.tokens)) {
      expect(token.ownerIds).toEqual([]);
      expect(token.initiative).toBeUndefined();
      expect(r.state.tokens[token.id]).toBe(token);
    }
    expect(tokenNamed(r.state, "Ambusher")).toMatchObject({ hidden: true, conditions: ["prone"] });
    expect(Object.values(r.state.fog)).toHaveLength(1);
  });

  it("ends the running encounter and clears area templates, but keeps the session's records", () => {
    const r = busy();
    const { chat, rolls, participants, name, checkpoints } = r.state;
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    expect(r.state.initiative).toBeNull();
    expect(r.state.templates).toEqual({});
    expect(r.state).toMatchObject({ chat, rolls, participants, name, checkpoints });
  });

  it("applies twice with different token ids each time", () => {
    const r = room();
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const first = Object.keys(r.state.tokens);
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const second = Object.keys(r.state.tokens);
    expect(second).toHaveLength(2);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it("lets only the GM apply", () => {
    const r = room();
    expect(r.attempt(alice, { type: "encounter.apply", templateId: "tpl-1" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses a template the server did not provide, the same for foreign and missing ones", () => {
    const r = room([]);
    const missing = r.attempt(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const noContext = decide(r.state, gm, Command.parse({ type: "encounter.apply", templateId: "tpl-1" }), { newId: () => "x" });
    expect(missing).toMatchObject({ ok: false, code: "invalid" });
    expect(noContext).toEqual(missing);
  });

  it("rejects an unknown field on the command", () => {
    expect(Command.safeParse({ type: "encounter.apply", templateId: "tpl-1", board: {} }).success).toBe(false);
  });

  it("carries the board it replaced and reads in the activity log", () => {
    const r = busy();
    const before = tableOf(r.state);
    const [event] = r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    expect(event).toMatchObject({ type: "EncounterApplied", templateId: "tpl-1", name: "Goblin ambush", previous: before });
    expect(formatActivity(r.log.at(-1)!.event, "Mara", r.state)).toBe('Mara applied encounter template "Goblin ambush"');
  });
});

describe("encounterTable (FR-GM-13)", () => {
  it("builds ids from the supplied source, so it stays deterministic", () => {
    let n = 0;
    const table = encounterTable(ENCOUNTER, () => `t-${++n}`);
    expect(Object.keys(table.tokens)).toEqual(["t-1", "t-2"]);
    expect(Object.keys(table.fog)).toEqual(["t-3"]);
  });
});

describe("template data (FR-GM-13)", () => {
  it("drops owners and initiative when parsing a stored token", () => {
    const parsed = EncounterTemplateData.safeParse({
      map: { assetId: "a", width: 10, height: 10 },
      grid: ENCOUNTER.scene.grid,
      tokens: [{ ...ENCOUNTER.tokens[0]!, ownerIds: ["p-alice"], initiative: 12, id: "t" }],
      fog: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data.tokens[0]!)).not.toEqual(expect.arrayContaining(["ownerIds", "initiative", "id"]));
  });

  it("rejects a template without a library map", () => {
    expect(EncounterTemplateData.safeParse({ map: null, grid: ENCOUNTER.scene.grid, tokens: [], fog: [] }).success).toBe(false);
  });
});

describe("applying a template stays reversible (FR-GM-13, ADR 0013)", () => {
  it("undo puts the previous board back, owners included", () => {
    const r = busy();
    const before = tableOf(r.state);
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const commandId = r.log.at(-1)!.commandId!;
    expect(undoableAction(r.state.undo, commandId)).toBeTruthy();
    r.run(gm, { type: "history.undo", commandId });
    expect(tableOf(r.state)).toEqual(before);
    expect(tokenNamed(r.state, "Hero").ownerIds).toEqual([alice.id]);
  });

  it("won't undo once the board has changed since", () => {
    const r = room();
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const commandId = r.log.at(-1)!.commandId!;
    r.run(gm, { type: "token.move", tokenId: tokenNamed(r.state, "Goblin").id, to: { x: 315, y: 315 } });
    expect(r.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("closes the undo history of board edits made before the apply", () => {
    const r = room();
    r.run(gm, { type: "token.create", name: "Hero", position: { x: 35, y: 35 } });
    const moveId = (r.run(gm, { type: "token.move", tokenId: tokenNamed(r.state, "Hero").id, to: { x: 105, y: 35 } }), r.log.at(-1)!.commandId!);
    expect(undoableAction(r.state.undo, moveId)).toBeTruthy();
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    expect(undoableAction(r.state.undo, moveId)).toBeUndefined();
  });
});

describe("applying a template keeps GM secrets from players (FR-GM-13, invariant 3)", () => {
  it("resyncs players instead of sending the event, and the snapshot has no hidden token", () => {
    const r = room();
    const before = r.state;
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    const applied = r.log.at(-1)!;
    expect(filterEventForViewer(applied, before, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(applied, before, gm)).toMatchObject({ kind: "event" });
    const seen = filterStateForViewer(r.state, alice);
    expect(Object.values(seen.tokens).map((t) => t.name)).toEqual(["Goblin"]);
    expect(JSON.stringify(seen)).not.toContain("Ambusher");
  });
});

describe("template walls", () => {
  it("assigns fresh wall ids on every application and retains portal state", () => {
    const walls = [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 }, portal: { kind: "door" as const, state: "closed" as const } }];
    let id = 0;
    const first = encounterTable({ ...ENCOUNTER, walls }, () => `fresh-${++id}`);
    const second = encounterTable({ ...ENCOUNTER, walls }, () => `fresh-${++id}`);
    expect(Object.values(first.walls ?? {})).toEqual([expect.objectContaining(walls[0]!)]);
    expect(Object.keys(first.walls ?? {})).not.toEqual(Object.keys(second.walls ?? {}));
    expect(encounterTable(ENCOUNTER, () => `fresh-${++id}`).walls).toEqual({});
  });
});

describe("apply encounter template, keeping the map's setup (FR-GM-13)", () => {
  /** A room on the template's own map with walls, a portal, fog, terrain and line of sight. */
  function prepared() {
    const r = room();
    r.run(gm, { type: "scene.setMap", map: ENCOUNTER.scene.map!, grid: DEFAULT_GRID });
    r.run(gm, { type: "token.create", name: "Hero", position: { x: 35, y: 35 }, ownerIds: [alice.id] });
    r.run(gm, { type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, { a: { x: 100, y: 0 }, b: { x: 100, y: 100 }, portal: { kind: "door", state: "closed" } }] });
    r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 100, y: 100 } } });
    r.run(gm, {
      type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 2, end: 2, kind: "difficult" }],
      context: { boardEpoch: r.state.boardEpoch ?? 0, revision: r.state.terrainRevision ?? 0 },
    });
    r.run(gm, { type: "scene.setLineOfSight", enabled: true });
    return r;
  }

  it("takes the template's tokens and keeps the room's walls, portal, fog, terrain and sight flag", () => {
    const r = prepared();
    const { walls, fog, terrain } = r.state;
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1", keepMapSetup: true });
    expect(Object.values(r.state.tokens).map((t) => t.name).sort()).toEqual(["Ambusher", "Goblin"]);
    expect(r.state.walls).toEqual(walls);
    expect(Object.values(r.state.walls).some((w) => w.portal?.kind === "door")).toBe(true);
    expect(r.state.fog).toEqual(fog);
    expect(r.state.terrain).toEqual(terrain);
    expect(r.state.scene.lineOfSight).toBe(true);
    expect(r.state.scene.map).toEqual(ENCOUNTER.scene.map);
  });

  it("without the flag behaves as before: the template's fog and no walls", () => {
    const r = prepared();
    r.run(gm, { type: "encounter.apply", templateId: "tpl-1" });
    expect(r.state.walls).toEqual({});
    expect(Object.values(r.state.fog)).toHaveLength(1);
    expect(r.state.terrain).toBeUndefined();
    expect(r.state.scene.lineOfSight).toBeUndefined();
  });

  it("rejects a room on a different map and changes nothing", () => {
    const r = busy();
    const before = tableOf(r.state);
    expect(r.attempt(gm, { type: "encounter.apply", templateId: "tpl-1", keepMapSetup: true })).toMatchObject({ ok: false, code: "invalid" });
    expect(tableOf(r.state)).toEqual(before);
  });

  it("rejects the same map under a different grid", () => {
    const shelf = [{ ...ENCOUNTER, scene: { ...ENCOUNTER.scene, grid: { ...DEFAULT_GRID, cellSize: DEFAULT_GRID.cellSize + 10 } } }];
    const r = room(shelf);
    r.run(gm, { type: "scene.setMap", map: ENCOUNTER.scene.map!, grid: DEFAULT_GRID });
    expect(r.attempt(gm, { type: "encounter.apply", templateId: "tpl-1", keepMapSetup: true })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("still lets only the GM keep the setup", () => {
    expect(prepared().attempt(alice, { type: "encounter.apply", templateId: "tpl-1", keepMapSetup: true })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("carries the replaced board so it can be undone exactly", () => {
    const r = prepared();
    const before = tableOf(r.state);
    const [event] = r.run(gm, { type: "encounter.apply", templateId: "tpl-1", keepMapSetup: true });
    expect(event).toMatchObject({ type: "EncounterApplied", previous: before });
  });
});
