import { describe, expect, it } from "vitest";
import { filterEventForViewer, filterStateForViewer, type CommittedEvent } from "../src";
import { alice, baseRoom, bob, gm, run } from "./fixtures";

const commit = (seq: number, event: CommittedEvent["event"]): CommittedEvent => ({
  seq, at: new Date(0).toISOString(), actorId: gm.id, event,
});

describe("player-safe filtering (FR-GM-23)", () => {
  const room = () => {
    let s = run(baseRoom(), gm, { type: "token.create", name: "Visible", position: { x: 35, y: 35 } }).state;
    s = run(s, gm, { type: "token.create", name: "Hidden", position: { x: 105, y: 35 }, hidden: true }).state;
    return s;
  };

  it("removes hidden tokens from player snapshots but not GM snapshots", () => {
    const s = room();
    expect(Object.values(filterStateForViewer(s, alice).tokens).map((t) => t.name)).toEqual(["Visible"]);
    expect(Object.keys(filterStateForViewer(s, gm).tokens)).toHaveLength(2);
  });

  it("redacts events about hidden tokens for players", () => {
    const s = room();
    const hidden = Object.values(s.tokens).find((t) => t.hidden)!;
    const moved = commit(9, { type: "TokenMoved", tokenId: hidden.id, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
    expect(filterEventForViewer(moved, s, alice)).toEqual({ kind: "redacted", seq: 9 });
    expect(filterEventForViewer(moved, s, gm)).toMatchObject({ kind: "event" });
    const created = commit(10, { type: "TokenCreated", token: hidden });
    expect(filterEventForViewer(created, s, alice)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("forces a resync when visibility changes", () => {
    const s = room();
    const hidden = Object.values(s.tokens).find((t) => t.hidden)!;
    const reveal = commit(11, { type: "TokenHiddenSet", tokenId: hidden.id, hidden: false, previous: true });
    expect(filterEventForViewer(reveal, s, alice)).toEqual({ kind: "resync" });
  });

  it("never serializes a hidden token name into anything a player receives", () => {
    const s = room();
    const payload = JSON.stringify(filterStateForViewer(s, alice));
    expect(payload).not.toContain("Hidden");
  });
});

describe("GM-only rolls (FR-GM-22)", () => {
  const rolled = (state: ReturnType<typeof baseRoom>) => state;

  it("strips GM rolls from a player's snapshot but keeps public ones", () => {
    let s = baseRoom();
    s = run(s, alice, { type: "dice.roll", expression: "1d6" }).state;
    s = run(s, gm, { type: "dice.roll", expression: "1d20", visibility: "gm" }).state;
    expect(s.rolls).toHaveLength(2);

    const forPlayer = filterStateForViewer(rolled(s), alice);
    expect(forPlayer.rolls).toHaveLength(1);
    expect(forPlayer.rolls[0]!.visibility).toBe("public");
    expect(filterStateForViewer(s, gm).rolls).toHaveLength(2);
  });

  it("redacts a GM roll event, so the player learns only that a seq happened", () => {
    const s = baseRoom();
    const roll = {
      id: "r1", expression: "1d20", byParticipantId: gm.id,
      dice: [18], modifier: 0, total: 18, visibility: "gm" as const,
    };
    const e = commit(20, { type: "DiceRolled", roll });
    expect(filterEventForViewer(e, s, alice)).toEqual({ kind: "redacted", seq: 20 });
    expect(filterEventForViewer(e, s, gm)).toMatchObject({ kind: "event" });
  });

  it("never serializes a GM roll's result into a player payload", () => {
    let s = baseRoom();
    s = run(s, gm, { type: "dice.roll", expression: "1d20", visibility: "gm" }).state;
    const secretId = s.rolls[0]!.id;
    expect(JSON.stringify(filterStateForViewer(s, alice))).not.toContain(secretId);
  });
});

describe("initiative visibility (FR-GM-21, FR-GM-23)", () => {
  it("removes hidden tokens from the order a player sees", () => {
    let s = baseRoom();
    const visible = run(s, gm, {
      type: "token.create", name: "Visible", position: { x: 0, y: 0 }, ownerIds: [],
    });
    s = visible.state;
    const secret = run(s, gm, {
      type: "token.create", name: "Ambusher", position: { x: 105, y: 105 }, ownerIds: [], hidden: true,
    });
    s = secret.state;
    const ids = Object.keys(s.tokens);
    s = run(s, gm, {
      type: "initiative.start",
      entries: ids.map((tokenId, i) => ({ tokenId, score: 20 - i })),
    }).state;

    expect(s.initiative!.order).toHaveLength(2);
    const forPlayer = filterStateForViewer(s, alice);
    expect(forPlayer.initiative!.order).toHaveLength(1);
    const hiddenId = Object.values(s.tokens).find((t) => t.hidden)!.id;
    expect(forPlayer.initiative!.order).not.toContain(hiddenId);
    expect(JSON.stringify(forPlayer)).not.toContain("Ambusher");
  });

  it("points a player's active turn into their own order, and at no one on a hidden turn", () => {
    let s = baseRoom();
    const ids: Record<string, string> = {};
    for (const [name, hidden] of [["Ambusher", true], ["Aria", false], ["Bram", false]] as const) {
      const r = run(s, gm, { type: "token.create", name, position: { x: 35 + 70 * Object.keys(s.tokens).length, y: 35 }, hidden });
      s = r.state;
      ids[name] = r.events[0]!.type === "TokenCreated" ? r.events[0]!.token.id : "";
    }
    // GM order: Ambusher (hidden), Aria, Bram.
    s = run(s, gm, { type: "initiative.start", entries: [
      { tokenId: ids.Ambusher!, score: 20 }, { tokenId: ids.Aria!, score: 15 }, { tokenId: ids.Bram!, score: 10 },
    ] }).state;
    const activeFor = (state: typeof s) => {
      const init = filterStateForViewer(state, alice).initiative!;
      return init.order[init.activeIndex] ?? null;
    };

    // The hidden Ambusher's turn: nobody is highlighted, and the index doesn't hint at a gap.
    expect(s.initiative!.activeIndex).toBe(0);
    expect(activeFor(s)).toBeNull();
    expect(filterStateForViewer(s, alice).initiative!.activeIndex).toBe(2);

    // Aria's turn: GM index 1, player index 0, the same token.
    s = run(s, gm, { type: "initiative.advance" }).state;
    expect(activeFor(s)).toBe(ids.Aria);
    expect(filterStateForViewer(s, alice).initiative!.activeIndex).toBe(0);

    // Bram's turn: GM index 2 is past the end of the player's 2-entry order without remapping.
    s = run(s, gm, { type: "initiative.advance" }).state;
    expect(activeFor(s)).toBe(ids.Bram);
    expect(filterStateForViewer(s, gm).initiative!.activeIndex).toBe(2);
  });

  it("resyncs a player on an initiative change rather than sending the raw order", () => {
    const s = baseRoom();
    const e = commit(21, {
      type: "InitiativeStarted",
      initiative: { order: ["t1"], activeIndex: 0, round: 1 },
      previous: null,
    });
    expect(filterEventForViewer(e, s, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(e, s, gm)).toMatchObject({ kind: "event" });
  });
});

describe("leaving the table (KAN-58)", () => {
  it("passes ParticipantLeft to players", () => {
    const left = commit(5, { type: "ParticipantLeft", participant: bob });
    expect(filterEventForViewer(left, baseRoom(), alice)).toEqual({ kind: "event", committed: left });
  });

  it("redacts a hidden token's reassignment for players", () => {
    let s = run(baseRoom(), gm, {
      type: "token.create", name: "Secret", position: { x: 0, y: 0 }, hidden: true, ownerIds: [bob.id],
    }).state;
    s = run(s, bob, { type: "participant.leave" }).state;
    const secret = Object.values(s.tokens)[0]!;
    const { events } = run(s, gm, {
      type: "participant.resolveDeparture",
      participantId: bob.id,
      actions: [{ tokenId: secret.id, action: "reassign", to: alice.id }],
    });
    expect(filterEventForViewer(commit(9, events[0]!), s, alice)).toEqual({ kind: "redacted", seq: 9 });
  });
});
