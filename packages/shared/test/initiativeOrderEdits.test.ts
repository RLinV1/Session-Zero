import { beforeEach, describe, expect, it } from "vitest";
import {
  Command,
  decide,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  placeByScore,
  reduce,
  withInitiativeExits,
  withoutToken,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Initiative,
  type Participant,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, ctx, gm, resetRandom, run, withToken } from "./fixtures";

let batch = 0;
/** Like the server: decide, then reduce every event under one command id, so undo can find it. */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}
const types = (events: DomainEvent[]) => events.map((e) => e.type);
const active = (state: RoomState) => state.initiative!.order[state.initiative!.activeIndex];
const committed = (event: DomainEvent): CommittedEvent => ({ seq: 9, at: "2026-11-12T00:00:00.000Z", actorId: gm.id, event });

/** Aria 18 (Alice's), Goblin 15, Wolf 9, plus Orc, Bat and a hidden Assassin off the order. */
function encounter() {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  const wolf = withToken(goblin.state, { name: "Wolf" });
  const orc = withToken(wolf.state, { name: "Orc" });
  const bat = withToken(orc.state, { name: "Bat" });
  const assassin = withToken(bat.state, { name: "Assassin", hidden: true });
  const removing = run(assassin.state, gm, { type: "room.setDefeatRemoval", mode: "all" }).state;
  const state = run(removing, gm, {
    type: "initiative.start",
    entries: [
      { tokenId: aria.token.id, score: 18 },
      { tokenId: goblin.token.id, score: 15 },
      { tokenId: wolf.token.id, score: 9 },
    ],
  }).state;
  return { state, aria: aria.token, goblin: goblin.token, wolf: wolf.token, orc: orc.token, bat: bat.token, assassin: assassin.token };
}
const names = (state: RoomState) => state.initiative!.order.map((id) => state.tokens[id]?.name ?? id);

beforeEach(resetRandom);

describe("placing and removing in the order (FR-GM-21, ADR 0065)", () => {
  const tokens = (scores: Record<string, number | null>) =>
    Object.fromEntries(Object.entries(scores).map(([id, initiative]) => [id, { id, initiative }])) as unknown as RoomState["tokens"];
  const order = (ids: string[], activeIndex = 0, round = 1): Initiative => ({ order: ids, activeIndex, round });

  it("places by score, keeping the active token", () => {
    const t = tokens({ a: 18, b: 15, c: 9 });
    expect(placeByScore(order(["a", "b", "c"], 1), t, "x", 16)).toEqual(order(["a", "x", "b", "c"], 2));
    expect(placeByScore(order(["a", "b", "c"], 1), t, "x", 3)).toEqual(order(["a", "b", "c", "x"], 1));
    expect(placeByScore(order(["a", "b", "c"], 1), t, "x", 20)).toEqual(order(["x", "a", "b", "c"], 2));
  });

  it("breaks a tie by token id, as starting an encounter does", () => {
    const t = tokens({ b: 15, d: 15 });
    expect(placeByScore(order(["b", "d"]), t, "c", 15).order).toEqual(["b", "c", "d"]);
    expect(placeByScore(order(["b", "d"]), t, "a", 15).order).toEqual(["a", "b", "d"]);
  });

  it("puts a new token ahead of legacy entries with no token or score", () => {
    const t = tokens({ a: 18, b: null });
    expect(placeByScore(order(["a", "gone", "b"]), t, "x", -5).order).toEqual(["a", "x", "gone", "b"]);
  });

  it("removes before, at and after the active token", () => {
    expect(withoutToken(order(["a", "b", "c"], 1), "a")).toEqual(order(["b", "c"], 0));
    expect(withoutToken(order(["a", "b", "c"], 1), "b")).toEqual(order(["a", "c"], 1));
    expect(withoutToken(order(["a", "b", "c"], 1), "c")).toEqual(order(["a", "b"], 1));
  });

  it("wraps into the next round when the active last token leaves", () => {
    expect(withoutToken(order(["a", "b", "c"], 2, 2), "c")).toEqual(order(["a", "b"], 0, 3));
  });

  it("returns null when the last token leaves", () => {
    expect(withoutToken(order(["a"]), "a")).toBeNull();
  });
});

describe("GM adds tokens to a running encounter (FR-GM-21)", () => {
  it("joins mid-round without moving the turn, and saves the score", () => {
    const { state, goblin, orc } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    const { state: next, events } = run(atGoblin, gm, { type: "initiative.add", entries: [{ tokenId: orc.id, score: 16 }] });
    expect(types(events)).toEqual(["InitiativeJoined"]);
    expect(names(next)).toEqual(["Aria", "Orc", "Goblin", "Wolf"]);
    expect(active(next)).toBe(goblin.id);
    expect(next.initiative!.round).toBe(1);
    expect(next.tokens[orc.id]!.initiative).toBe(16);
    expect(events[0]).toMatchObject({ previous: atGoblin.initiative, previousScore: null });
  });

  it("takes a turn this round when placed after the active token", () => {
    const { state, bat, wolf } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    let next = run(atGoblin, gm, { type: "initiative.add", entries: [{ tokenId: bat.id, score: 3 }] }).state;
    expect(names(next)).toEqual(["Aria", "Goblin", "Wolf", "Bat"]);
    next = run(next, gm, { type: "initiative.advance" }).state;
    expect(active(next)).toBe(wolf.id);
    next = run(next, gm, { type: "initiative.advance" }).state;
    expect(active(next)).toBe(bat.id);
    expect(next.initiative!.round).toBe(1);
  });

  it("refuses a player, no encounter, an unknown token, a token already in, and a bad score", () => {
    const { state, aria, orc } = encounter();
    expect(attempt(state, alice, { type: "initiative.add", entries: [{ tokenId: orc.id, score: 5 }] })).toMatchObject({ ok: false, code: "forbidden" });
    const ended = run(state, gm, { type: "initiative.end" }).state;
    expect(attempt(ended, gm, { type: "initiative.add", entries: [{ tokenId: orc.id, score: 5 }] })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "initiative.add", entries: [{ tokenId: "nope", score: 5 }] })).toMatchObject({ ok: false, code: "not_found" });
    expect(attempt(state, gm, { type: "initiative.add", entries: [{ tokenId: aria.id, score: 5 }] })).toMatchObject({ ok: false, code: "invalid" });
    expect(() => Command.parse({ type: "initiative.add", entries: [{ tokenId: orc.id, score: 1000 }] })).toThrow();
  });

  it("places two reinforcements at once the same way whichever order they are sent in", () => {
    const { state, goblin, orc, bat } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    const sent = [
      { tokenId: bat.id, score: 3 },
      { tokenId: orc.id, score: 16 },
    ];
    for (const entries of [sent, [...sent].reverse()]) {
      const { state: next, events } = run(atGoblin, gm, { type: "initiative.add", entries });
      expect(types(events)).toEqual(["InitiativeJoined", "InitiativeJoined"]);
      expect(names(next)).toEqual(["Aria", "Orc", "Goblin", "Wolf", "Bat"]);
      expect(active(next)).toBe(goblin.id);
      expect(next.initiative!.round).toBe(1);
      expect(next.tokens[orc.id]!.initiative).toBe(16);
      expect(next.tokens[bat.id]!.initiative).toBe(3);
      // Each event carries the order just before it.
      expect(events[0]).toMatchObject({ tokenId: orc.id, previous: atGoblin.initiative });
      expect(events[1]).toMatchObject({ tokenId: bat.id, previous: (events[0] as { initiative: Initiative }).initiative });
    }
  });

  it("refuses the whole add when one entry is bad, adding nobody", () => {
    const { state, aria, orc } = encounter();
    const withAria = [{ tokenId: orc.id, score: 16 }, { tokenId: aria.id, score: 5 }];
    expect(attempt(state, gm, { type: "initiative.add", entries: withAria })).toMatchObject({ ok: false, code: "invalid" });
    const twice = [{ tokenId: orc.id, score: 16 }, { tokenId: orc.id, score: 4 }];
    expect(attempt(state, gm, { type: "initiative.add", entries: twice })).toMatchObject({ ok: false, code: "invalid" });
    const unknown = [{ tokenId: orc.id, score: 16 }, { tokenId: "nope", score: 4 }];
    expect(attempt(state, gm, { type: "initiative.add", entries: unknown })).toMatchObject({ ok: false, code: "not_found" });
    expect(() => Command.parse({ type: "initiative.add", entries: [] })).toThrow();
    const many = Array.from({ length: 61 }, (_, i) => ({ tokenId: `t${i}`, score: 1 }));
    expect(() => Command.parse({ type: "initiative.add", entries: many })).toThrow();
  });

  it("logs who joined with what score", () => {
    const { state, orc } = encounter();
    const { events } = run(state, gm, { type: "initiative.add", entries: [{ tokenId: orc.id, score: 16 }] });
    expect(formatActivity(events[0]!, "Mara", state)).toBe("Mara added Orc to the turn order with 16");
  });
});

describe("GM removes a token from a running encounter (FR-GM-21)", () => {
  it("keeps the turn when a token before the active one leaves, and keeps it on the board", () => {
    const { state, aria, goblin } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    const { state: next, events } = run(atGoblin, gm, { type: "initiative.remove", tokenId: aria.id });
    expect(types(events)).toEqual(["InitiativeLeft"]);
    expect(names(next)).toEqual(["Goblin", "Wolf"]);
    expect(active(next)).toBe(goblin.id);
    expect(next.tokens[aria.id]).toBeDefined();
  });

  it("moves the turn on when the active token leaves", () => {
    const { state, goblin, wolf } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    const next = run(atGoblin, gm, { type: "initiative.remove", tokenId: goblin.id }).state;
    expect(active(next)).toBe(wolf.id);
    expect(next.initiative!.round).toBe(1);
  });

  it("wraps the round when the active last token leaves", () => {
    const { state, aria, wolf } = encounter();
    let atWolf = run(state, gm, { type: "initiative.advance" }).state;
    atWolf = run(atWolf, gm, { type: "initiative.advance" }).state;
    expect(active(atWolf)).toBe(wolf.id);
    const next = run(atWolf, gm, { type: "initiative.remove", tokenId: wolf.id }).state;
    expect(active(next)).toBe(aria.id);
    expect(next.initiative!.round).toBe(2);
  });

  it("ends the encounter when the last token leaves", () => {
    const { state, aria, goblin, wolf } = encounter();
    let next = run(state, gm, { type: "initiative.remove", tokenId: aria.id }).state;
    next = run(next, gm, { type: "initiative.remove", tokenId: goblin.id }).state;
    const last = run(next, gm, { type: "initiative.remove", tokenId: wolf.id });
    expect(types(last.events)).toEqual(["InitiativeEnded"]);
    expect(last.state.initiative).toBeNull();
    expect(last.state.tokens[wolf.id]).toBeDefined();
  });

  it("can take out a legacy row whose token is gone", () => {
    const { state, goblin } = encounter();
    const legacy: RoomState = { ...state, initiative: { ...state.initiative!, order: [...state.initiative!.order, "gone"] } };
    const next = run(legacy, gm, { type: "initiative.remove", tokenId: "gone" }).state;
    expect(next.initiative!.order).not.toContain("gone");
    expect(next.initiative!.order).toContain(goblin.id);
  });

  it("refuses a player, no encounter, and a token not in the order", () => {
    const { state, aria, orc } = encounter();
    expect(attempt(state, alice, { type: "initiative.remove", tokenId: aria.id })).toMatchObject({ ok: false, code: "forbidden" });
    const ended = run(state, gm, { type: "initiative.end" }).state;
    expect(attempt(ended, gm, { type: "initiative.remove", tokenId: aria.id })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "initiative.remove", tokenId: orc.id })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("deleting a token takes it out of the turn order (FR-GM-21)", () => {
  it("follows the GM's delete with the token's exit, keeping the turn", () => {
    const { state, goblin, wolf } = encounter();
    let atWolf = run(state, gm, { type: "initiative.advance" }).state;
    atWolf = run(atWolf, gm, { type: "initiative.advance" }).state;
    const { state: next, events } = run(atWolf, gm, { type: "token.delete", tokenId: goblin.id });
    expect(types(events)).toEqual(["TokenDeleted", "InitiativeLeft"]);
    expect(events[1]).toMatchObject({ reason: "deleted" });
    expect(names(next)).toEqual(["Aria", "Wolf"]);
    expect(active(next)).toBe(wolf.id);
  });

  it("leaves a token outside the order alone", () => {
    const { state, orc } = encounter();
    expect(types(run(state, gm, { type: "token.delete", tokenId: orc.id }).events)).toEqual(["TokenDeleted"]);
  });

  it("takes out a departing player's deleted token", () => {
    const { state, aria } = encounter();
    const left = run(state, alice, { type: "participant.leave" }).state;
    const { state: next, events } = run(left, gm, {
      type: "participant.resolveDeparture",
      participantId: alice.id,
      actions: [{ tokenId: aria.id, action: "delete" }],
    });
    expect(types(events)).toEqual(["TokenDeleted", "InitiativeLeft"]);
    expect(next.initiative!.order).not.toContain(aria.id);
  });

  it("moves the turn on when a token is defeated on its own turn", () => {
    const { state, goblin, wolf } = encounter();
    const atGoblin = run(state, gm, { type: "initiative.advance" }).state;
    const { state: next, events } = run(atGoblin, gm, { type: "token.setStats", tokenId: goblin.id, stats: { hp: 0, maxHp: 7, ac: null } });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenDeleted", "InitiativeLeft"]);
    expect(active(next)).toBe(wolf.id);
  });

  it("chains several deletions in one action, each from the order the last one left", () => {
    const { state, aria, goblin, wolf } = encounter();
    let hurt = state;
    for (const t of [aria, goblin, wolf]) hurt = run(hurt, gm, { type: "token.setStats", tokenId: t.id, stats: { hp: 2, maxHp: 7, ac: null } }).state;
    const { state: next, events } = run(hurt, gm, { type: "nuke.detonate", amount: 3, origin: { x: 50, y: 50 } });
    const exits = events.filter((e) => e.type === "InitiativeLeft" || e.type === "InitiativeEnded");
    expect(types(exits)).toEqual(["InitiativeLeft", "InitiativeLeft", "InitiativeEnded"]);
    expect(exits[2]).toMatchObject({ reason: "deleted" });
    expect(next.initiative).toBeNull();
  });

  it("ends the encounter when its last token is defeated", () => {
    const { state, aria, goblin, wolf } = encounter();
    let next = run(state, gm, { type: "initiative.remove", tokenId: aria.id }).state;
    next = run(next, gm, { type: "initiative.remove", tokenId: goblin.id }).state;
    const { state: after, events } = run(next, gm, { type: "token.setStats", tokenId: wolf.id, stats: { hp: 0, maxHp: 7, ac: null } });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenDeleted", "InitiativeEnded"]);
    expect(after.initiative).toBeNull();
    expect(formatActivity(events[2]!, "Mara", next)).toBe("Initiative ended when its last token was deleted");
  });
});

describe("undoing a defeat removal leaves the turn order alone (FR-GM-21, ADR 0065)", () => {
  it("brings the token back but not into the order, in the same encounter", () => {
    const { state, goblin, wolf } = encounter();
    const atGoblin = act(state, gm, { type: "initiative.advance" }).state;
    const defeat = act(atGoblin, gm, { type: "token.setStats", tokenId: goblin.id, stats: { hp: 0, maxHp: 7, ac: null } });
    const later = act(defeat.state, gm, { type: "initiative.advance" }).state;
    const undone = act(later, gm, { type: "history.undo", commandId: defeat.commandId });
    expect(undone.state.tokens[goblin.id]).toMatchObject({ initiative: 15 });
    expect(undone.state.initiative).toEqual(later.initiative);
    expect(active(undone.state)).not.toBe(goblin.id);
    expect(undone.state.initiative!.order).toContain(wolf.id);
  });

  it("leaves a later encounter unchanged", () => {
    const { state, goblin, wolf } = encounter();
    const defeat = act(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: { hp: 0, maxHp: 7, ac: null } });
    let later = act(defeat.state, gm, { type: "initiative.end" }).state;
    later = act(later, gm, { type: "initiative.start", entries: [{ tokenId: wolf.id, score: 4 }] }).state;
    const undone = act(later, gm, { type: "history.undo", commandId: defeat.commandId });
    expect(undone.state.tokens[goblin.id]).toBeDefined();
    expect(undone.state.initiative).toEqual(later.initiative);
  });

  it("doesn't restart an encounter the removal ended", () => {
    const { state, aria, goblin, wolf } = encounter();
    let next = act(state, gm, { type: "initiative.remove", tokenId: aria.id }).state;
    next = act(next, gm, { type: "initiative.remove", tokenId: goblin.id }).state;
    const defeat = act(next, gm, { type: "token.setStats", tokenId: wolf.id, stats: { hp: 0, maxHp: 7, ac: null } });
    expect(defeat.state.initiative).toBeNull();
    const undone = act(defeat.state, gm, { type: "history.undo", commandId: defeat.commandId });
    expect(undone.state.tokens[wolf.id]).toBeDefined();
    expect(undone.state.initiative).toBeNull();
  });

  it("keeps End encounter and the GM's own add and remove off the undo list", () => {
    const { state, orc } = encounter();
    const added = act(state, gm, { type: "initiative.add", entries: [{ tokenId: orc.id, score: 5 }] });
    expect(attempt(added.state, gm, { type: "history.undo", commandId: added.commandId })).toMatchObject({ ok: false });
    const removed = act(added.state, gm, { type: "initiative.remove", tokenId: orc.id });
    expect(attempt(removed.state, gm, { type: "history.undo", commandId: removed.commandId })).toMatchObject({ ok: false });
    const ended = act(removed.state, gm, { type: "initiative.end" });
    expect(attempt(ended.state, gm, { type: "history.undo", commandId: ended.commandId })).toMatchObject({ ok: false });
  });
});

describe("turn order edits never reveal hidden tokens (FR-GM-23)", () => {
  it("sends players a filtered snapshot for a hidden token joining, leaving and being deleted", () => {
    const { state, assassin } = encounter();
    const joined = run(state, gm, { type: "initiative.add", entries: [{ tokenId: assassin.id, score: 30 }] });
    expect(filterEventForViewer(committed(joined.events[0]!), state, alice)).toEqual({ kind: "resync" });
    const playerView = filterStateForViewer(joined.state, alice).initiative!;
    expect(playerView.order).not.toContain(assassin.id);
    expect(playerView.order).toEqual(filterStateForViewer(state, alice).initiative!.order);

    const left = run(joined.state, gm, { type: "initiative.remove", tokenId: assassin.id });
    expect(filterEventForViewer(committed(left.events[0]!), joined.state, alice)).toEqual({ kind: "resync" });

    const rejoined = run(joined.state, gm, { type: "token.delete", tokenId: assassin.id });
    const exit = rejoined.events[1]!;
    expect(exit.type).toBe("InitiativeLeft");
    const before = reduce(joined.state, rejoined.events[0]!);
    expect(filterEventForViewer(committed(exit), before, alice)).toEqual({ kind: "resync" });
    expect(JSON.stringify(filterStateForViewer(rejoined.state, alice))).not.toContain(assassin.id);
  });
});

describe("an encounter ended by deleting a hidden last token (FR-GM-23, ADR 0065)", () => {
  it("doesn't tell players the last token was deleted", () => {
    const { state, aria, goblin, wolf, assassin } = encounter();
    let only = run(state, gm, { type: "initiative.add", entries: [{ tokenId: assassin.id, score: 30 }] }).state;
    for (const t of [aria, goblin, wolf]) only = run(only, gm, { type: "initiative.remove", tokenId: t.id }).state;
    expect(only.initiative!.order).toEqual([assassin.id]);
    const deleted = run(only, gm, { type: "token.delete", tokenId: assassin.id });
    const ended = deleted.events[1]!;
    expect(ended).toMatchObject({ type: "InitiativeEnded", reason: "deleted" });
    const filtered = filterEventForViewer(committed(ended), reduce(only, deleted.events[0]!), alice);
    expect(filtered.kind).toBe("event");
    const sent = JSON.stringify(filtered);
    expect(sent).not.toContain("deleted");
    expect(sent).not.toContain(assassin.id);
    // The GM still gets the reason.
    expect(filterEventForViewer(committed(ended), only, gm)).toMatchObject({ committed: { event: { reason: "deleted" } } });
  });
});

describe("the exit pass runs once per deletion (ADR 0065)", () => {
  it("adds no second exit to a batch that already holds one", () => {
    const { state, goblin } = encounter();
    const once = run(state, gm, { type: "token.delete", tokenId: goblin.id }).events;
    expect(types(once)).toEqual(["TokenDeleted", "InitiativeLeft"]);
    expect(withInitiativeExits(state, once)).toEqual(once);
  });
});
