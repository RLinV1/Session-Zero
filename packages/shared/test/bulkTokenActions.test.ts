import { beforeEach, describe, expect, it } from "vitest";
import {
  Command,
  decide,
  describeUndo,
  filterEventForViewer,
  isReversible,
  isScenePreparationCommand,
  MAX_TOKENS_PER_BULK,
  reduce,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
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
const committed = (event: DomainEvent): CommittedEvent => ({ seq: 9, at: "2026-11-16T00:00:00.000Z", actorId: gm.id, event });
const names = (state: RoomState) => state.initiative?.order.map((id) => state.tokens[id]?.name ?? id) ?? null;
const activeName = (state: RoomState) => {
  const init = state.initiative!;
  return state.tokens[init.order[init.activeIndex]!]!.name;
};

/**
 * Aria (Alice's), Goblin, Wolf, Moth 1, Moth 2 and a hidden Assassin, with the first five in the
 * order Aria, Goblin, Wolf, Moth 1, Moth 2 and Wolf's turn in round 2.
 */
function table() {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  const wolf = withToken(goblin.state, { name: "Wolf" });
  const moth1 = withToken(wolf.state, { name: "Moth 1" });
  const moth2 = withToken(moth1.state, { name: "Moth 2" });
  const assassin = withToken(moth2.state, { name: "Assassin", hidden: true });
  let state = run(assassin.state, gm, {
    type: "initiative.start",
    entries: [
      { tokenId: aria.token.id, score: 20 },
      { tokenId: goblin.token.id, score: 15 },
      { tokenId: wolf.token.id, score: 12 },
      { tokenId: moth1.token.id, score: 8 },
      { tokenId: moth2.token.id, score: 5 },
    ],
  }).state;
  for (let i = 0; i < 7; i++) state = run(state, gm, { type: "initiative.advance" }).state;
  return { state, aria: aria.token, goblin: goblin.token, wolf: wolf.token, moth1: moth1.token, moth2: moth2.token, assassin: assassin.token };
}

beforeEach(resetRandom);

describe("removing several tokens from the encounter (FR-GM-21, ADR 0074)", () => {
  it("starts from Wolf's turn in round 2", () => {
    const { state } = table();
    expect(names(state)).toEqual(["Aria", "Goblin", "Wolf", "Moth 1", "Moth 2"]);
    expect(activeName(state)).toBe("Wolf");
    expect(state.initiative!.round).toBe(2);
  });

  it("takes the selection out in one step and keeps the active turn", () => {
    const { state, goblin, moth2 } = table();
    const removed = act(state, gm, { type: "initiative.removeSeveral", tokenIds: [moth2.id, goblin.id] });
    expect(types(removed.events)).toEqual(["InitiativeLeft", "InitiativeLeft"]);
    expect(names(removed.state)).toEqual(["Aria", "Wolf", "Moth 1"]);
    expect(activeName(removed.state)).toBe("Wolf");
    expect(removed.state.initiative!.round).toBe(2);
    // Every exit carries the order it replaced (invariant 6).
    expect(removed.events.every((e) => e.type === "InitiativeLeft" && e.previous.order.length === e.initiative.order.length + 1)).toBe(true);
  });

  it("moves the turn past every removed token when the active one goes", () => {
    const { state, wolf, moth1 } = table();
    const removed = act(state, gm, { type: "initiative.removeSeveral", tokenIds: [wolf.id, moth1.id] });
    expect(names(removed.state)).toEqual(["Aria", "Goblin", "Moth 2"]);
    expect(activeName(removed.state)).toBe("Moth 2");
  });

  it("decides the same whatever order the ids come in", () => {
    const { state, wolf, moth1, moth2, aria } = table();
    const one = attempt(state, gm, { type: "initiative.removeSeveral", tokenIds: [wolf.id, moth1.id, moth2.id, aria.id] });
    const other = attempt(state, gm, { type: "initiative.removeSeveral", tokenIds: [aria.id, moth2.id, moth1.id, wolf.id] });
    expect(one).toEqual(other);
    // Wolf, Moth 1 and Moth 2 gone from the end of the round: the turn wraps to Goblin in round 3.
    const removed = act(state, gm, { type: "initiative.removeSeveral", tokenIds: [wolf.id, moth1.id, moth2.id, aria.id] });
    expect(names(removed.state)).toEqual(["Goblin"]);
    expect(activeName(removed.state)).toBe("Goblin");
    expect(removed.state.initiative!.round).toBe(3);
  });

  it("ends the encounter when the selection is the whole order", () => {
    const { state, aria, goblin, wolf, moth1, moth2 } = table();
    const removed = act(state, gm, { type: "initiative.removeSeveral", tokenIds: [aria.id, goblin.id, wolf.id, moth1.id, moth2.id] });
    expect(types(removed.events)).toEqual(["InitiativeLeft", "InitiativeLeft", "InitiativeLeft", "InitiativeLeft", "InitiativeEnded"]);
    expect(removed.state.initiative).toBeNull();
    // Every token is still on the board: this is the encounter, not the board.
    expect(Object.keys(removed.state.tokens)).toHaveLength(6);
  });

  it("refuses the whole command when one token is not in the order, or with no encounter", () => {
    const { state, goblin, assassin } = table();
    expect(attempt(state, gm, { type: "initiative.removeSeveral", tokenIds: [goblin.id, assassin.id] })).toMatchObject({ ok: false, code: "invalid" });
    const ended = run(state, gm, { type: "initiative.end" }).state;
    expect(attempt(ended, gm, { type: "initiative.removeSeveral", tokenIds: [goblin.id] })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("is the GM's alone, even for a player's own token", () => {
    const { state, aria } = table();
    expect(attempt(state, alice, { type: "initiative.removeSeveral", tokenIds: [aria.id] })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("is not undoable, like Remove (ADR 0065): the GM adds them back instead", () => {
    const { state, goblin, moth2 } = table();
    const removed = act(state, gm, { type: "initiative.removeSeveral", tokenIds: [moth2.id, goblin.id] });
    expect(undoableAction(removed.state.undo, removed.commandId)).toBeUndefined();
  });

  it("names at most MAX_TOKENS_PER_BULK tokens", () => {
    const ids = Array.from({ length: MAX_TOKENS_PER_BULK + 1 }, (_, i) => `t-${i}`);
    expect(Command.safeParse({ type: "initiative.removeSeveral", tokenIds: ids }).success).toBe(false);
    expect(Command.safeParse({ type: "initiative.removeSeveral", tokenIds: [] }).success).toBe(false);
  });
});

describe("deleting several tokens at once (FR-GM-10, FR-TAC-07, ADR 0074)", () => {
  it("deletes the selection in one action, each carrying the whole token", () => {
    const { state, goblin, assassin } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, assassin.id] });
    expect(deleted.events[0]).toEqual({ type: "TokenDeleted", token: state.tokens[goblin.id], reason: "manual" });
    expect(deleted.state.tokens[goblin.id]).toBeUndefined();
    expect(deleted.state.tokens[assassin.id]).toBeUndefined();
  });

  it("takes each deleted token out of the turn order in the same action (ADR 0065)", () => {
    const { state, goblin, wolf, assassin } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [wolf.id, assassin.id, goblin.id] });
    expect(types(deleted.events)).toEqual(["TokenDeleted", "InitiativeLeft", "TokenDeleted", "TokenDeleted", "InitiativeLeft"]);
    expect(names(deleted.state)).toEqual(["Aria", "Moth 1", "Moth 2"]);
    expect(activeName(deleted.state)).toBe("Moth 1");
  });

  it("refuses the whole command when one token is missing, deleting nothing", () => {
    const { state, goblin } = table();
    expect(attempt(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, "gone"] })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("deletes a token named twice once", () => {
    const { state, goblin } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, goblin.id] });
    expect(types(deleted.events)).toEqual(["TokenDeleted", "InitiativeLeft"]);
  });

  it("is the GM's alone, even for a player's own token", () => {
    const { state, aria } = table();
    expect(attempt(state, alice, { type: "token.deleteSeveral", tokenIds: [aria.id] })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("can be prepared on a scene the players aren't on", () => {
    expect(isScenePreparationCommand({ type: "token.deleteSeveral" })).toBe(true);
    expect(isScenePreparationCommand({ type: "initiative.removeSeveral" })).toBe(false);
  });

  it("never sends a hidden token's deletion to players; the owner resyncs (FR-GM-23)", () => {
    const { state, aria, assassin } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [assassin.id] });
    expect(filterEventForViewer(committed(deleted.events[0]!), state, alice)).toEqual({ kind: "redacted", seq: 9 });
    expect(filterEventForViewer(committed(deleted.events[0]!), state, gm).kind).toBe("event");
    // Alice's own token: line of sight on, her sight origin is gone, so she gets a fresh snapshot.
    const sighted = { ...state, scene: { ...state.scene, lineOfSight: true } };
    const own = act(sighted, gm, { type: "token.deleteSeveral", tokenIds: [aria.id] });
    expect(filterEventForViewer(committed(own.events[0]!), sighted, alice)).toEqual({ kind: "resync" });
  });
});

describe("undoing a deletion (FR-REC-02, FR-REC-03, ADR 0074)", () => {
  it("puts every deleted token back with one undo, as it was, but not into the turn order", () => {
    const { state, goblin, assassin } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, assassin.id] });
    const entry = undoableAction(deleted.state.undo, deleted.commandId);
    expect(entry).toBeDefined();
    const undone = act(deleted.state, gm, { type: "history.undo", commandId: deleted.commandId });
    expect(types(undone.events)).toEqual(["TokenCreated", "TokenCreated", "ActionUndone"]);
    expect(undone.state.tokens[goblin.id]).toEqual(state.tokens[goblin.id]);
    expect(undone.state.tokens[assassin.id]).toEqual(state.tokens[assassin.id]);
    // Undo never touches the turn order (ADR 0065): the GM adds Goblin back with Add to encounter.
    expect(names(undone.state)).toEqual(["Aria", "Wolf", "Moth 1", "Moth 2"]);
  });

  it("brings a token back into its group", () => {
    const { state: start, goblin, wolf } = table();
    let state = run(start, gm, { type: "group.create", name: "Pack" }).state;
    const pack = Object.values(state.groups)[0]!;
    state = run(state, gm, { type: "group.assign", groupId: pack.id, tokenIds: [goblin.id, wolf.id] }).state;
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, wolf.id] });
    const undone = act(deleted.state, gm, { type: "history.undo", commandId: deleted.commandId });
    expect(undone.state.tokenGroups[goblin.id]).toBe(pack.id);
    expect(undone.state.tokenGroups[wolf.id]).toBe(pack.id);
  });

  it("names the deletion in the activity log, in English and zh-TW", () => {
    const { state, goblin, wolf, moth1 } = table();
    const several = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, wolf.id, moth1.id] });
    const entry = undoableAction(several.state.undo, several.commandId)!;
    expect(describeUndo(entry, several.state.tokens)).toEqual({ verb: "delete of 3 tokens", noun: "deleting Goblin and 2 more" });
    expect(describeUndo(entry, several.state.tokens, "zh-TW").verb).toContain("刪除");
    const one = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id] });
    expect(describeUndo(undoableAction(one.state.undo, one.commandId)!, one.state.tokens)).toEqual({ verb: "delete Goblin", noun: "deleting Goblin" });
  });

  it("refuses while another token has taken a deleted one's name", () => {
    const { state, goblin, wolf } = table();
    const deleted = act(state, gm, { type: "token.deleteSeveral", tokenIds: [goblin.id, wolf.id] });
    const renamed = withToken(deleted.state, { name: "Wolf" }).state;
    expect(attempt(renamed, gm, { type: "history.undo", commandId: deleted.commandId })).toMatchObject({ ok: false, message: expect.stringContaining("Wolf") });
  });

  it("keeps a deletion from before ADR 0074, which has no reason, irreversible", () => {
    const { state, goblin } = table();
    expect(isReversible({ type: "TokenDeleted", token: state.tokens[goblin.id]! })).toBe(false);
    expect(isReversible({ type: "TokenDeleted", token: state.tokens[goblin.id]!, reason: "manual" })).toBe(true);
  });
});
