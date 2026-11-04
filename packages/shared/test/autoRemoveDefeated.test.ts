import { beforeEach, describe, expect, it } from "vitest";
import {
  Command,
  decide,
  emptyRoomState,
  reduceAll,
  describeUndo,
  filterEventForViewer,
  filterStateForViewer,
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
/** Like the server: decide, then reduce every event of the batch under one command id. */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}
const types = (events: DomainEvent[]) => events.map((e) => e.type);
const committed = (event: DomainEvent, seq = 1): CommittedEvent => ({ seq, at: "2026-11-04T12:00:00.000Z", actorId: gm.id, event });

/** Aria (Alice's, 20 HP), Goblin (3 HP), hidden Ogre (3 HP) and a Signpost with no HP. */
function table(on = true) {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  const ogre = withToken(goblin.state, { name: "Ogre", hidden: true });
  const sign = withToken(ogre.state, { name: "Signpost" });
  let state = sign.state;
  const hp = (id: string, value: number) => {
    state = run(state, gm, { type: "token.setStats", tokenId: id, stats: { hp: value, maxHp: 20, ac: null } }).state;
  };
  hp(aria.token.id, 20);
  hp(goblin.token.id, 3);
  hp(ogre.token.id, 3);
  if (on) state = run(state, gm, { type: "room.setAutoRemoveDefeated", enabled: true }).state;
  return { state, aria: aria.token, goblin: goblin.token, ogre: ogre.token, sign: sign.token };
}
const stats = (hp: number | null) => ({ hp, maxHp: 20, ac: null });

beforeEach(resetRandom);

describe("auto-remove defeated: the room option (FR-TAC-07, FR-GM-15)", () => {
  it("is on in a brand new room: a token dropped to 0 HP goes with no setup", () => {
    const fresh = reduceAll(emptyRoomState("room-1"), [
      { type: "RoomCreated", name: "Fresh" },
      { type: "ParticipantJoined", participant: gm },
    ]);
    expect(fresh.autoRemoveDefeated).toBe(true);
    const { state, token } = withToken(fresh, { name: "Goblin" });
    const hurt = run(state, gm, { type: "token.setStats", tokenId: token.id, stats: stats(0) });
    expect(types(hurt.events)).toEqual(["TokenStatsSet", "TokenDeleted"]);
    expect(hurt.state.tokens[token.id]).toBeUndefined();
  });

  it("reads a state without the field as on (old snapshots), and refuses an unchanged value against that", () => {
    const { state, goblin } = table(false);
    const { autoRemoveDefeated: _drop, ...old } = state;
    const absent = old as RoomState;
    const after = run(absent, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(-10) });
    expect(after.state.tokens[goblin.id]).toBeUndefined();
    expect(attempt(absent, gm, { type: "room.setAutoRemoveDefeated", enabled: true })).toMatchObject({ ok: false, code: "invalid" });
    expect(run(absent, gm, { type: "room.setAutoRemoveDefeated", enabled: false }).events).toEqual([
      { type: "AutoRemoveDefeatedSet", enabled: false, previous: true },
    ]);
  });

  it("lets only the GM change it, refuses an unchanged value, and shows it to everyone", () => {
    const { state } = table(false);
    expect(attempt(state, alice, { type: "room.setAutoRemoveDefeated", enabled: true })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(state, gm, { type: "room.setAutoRemoveDefeated", enabled: false })).toMatchObject({ ok: false, code: "invalid" });
    const on = run(state, gm, { type: "room.setAutoRemoveDefeated", enabled: true });
    expect(on.events).toEqual([{ type: "AutoRemoveDefeatedSet", enabled: true, previous: false }]);
    expect(on.state.autoRemoveDefeated).toBe(true);
    expect(filterEventForViewer(committed(on.events[0]!), state, alice).kind).toBe("event");
    expect(filterStateForViewer(on.state, alice).autoRemoveDefeated).toBe(true);
  });

  it("does not remove tokens already at 0 or below when turned on", () => {
    const { state, goblin } = table(false);
    const low = run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(-2) }).state;
    expect(run(low, gm, { type: "room.setAutoRemoveDefeated", enabled: true }).state.tokens[goblin.id]).toBeDefined();
  });
});

describe("auto-remove defeated: removal rule on every damage path (FR-TAC-07)", () => {
  it("token.setStats: stats first, then the defeat carrying the negative HP", () => {
    const { state, goblin } = table();
    const { state: after, events } = run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(-4) });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenDeleted"]);
    expect(events[1]).toMatchObject({ reason: "defeated", token: { id: goblin.id, stats: { hp: -4 } } });
    expect(after.tokens[goblin.id]).toBeUndefined();
  });

  it("removes a token landing exactly on 0; keeps 1 HP, healing, hp null, and everything while off", () => {
    const { state, goblin, sign } = table();
    expect(run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(0) }).state.tokens[goblin.id]).toBeUndefined();
    expect(run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(1) }).state.tokens[goblin.id]).toBeDefined();
    expect(run(state, gm, { type: "token.setStats", tokenId: sign.id, stats: stats(null) }).state.tokens[sign.id]).toBeDefined();
    expect(types(run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(15) }).events)).toEqual(["TokenStatsSet"]);
    const off = table(false);
    expect(run(off.state, gm, { type: "token.setStats", tokenId: off.goblin.id, stats: stats(0) }).state.tokens[off.goblin.id]).toBeDefined();
  });

  it("removes a player's own token on their own HP edit (decided on the server)", () => {
    const { state, aria } = table();
    expect(run(state, alice, { type: "token.setStats", tokenId: aria.id, stats: stats(0) }).state.tokens[aria.id]).toBeUndefined();
  });

  it("token.update: the delete comes after every other event for that token", () => {
    const { state, goblin } = table();
    const { events, state: after } = run(state, gm, {
      type: "token.configure", tokenId: goblin.id, changes: { stats: stats(-1), conditions: ["prone"] },
    });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenConditionsSet", "TokenDeleted"]);
    expect(after.tokens[goblin.id]).toBeUndefined();
  });

  it("roll.applyDamage: stats, delete, then the Applied mark", () => {
    const { state, aria, goblin } = table();
    const rolled = run(state, alice, {
      type: "dice.roll", expression: "1d8+3",
      attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Damage", kind: "damage" },
    });
    const roll = rolled.events.find((e) => e.type === "DiceRolled");
    if (roll?.type !== "DiceRolled") throw new Error("expected DiceRolled");
    const { events, state: after } = run(rolled.state, gm, { type: "roll.applyDamage", rollId: roll.roll.id });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenDeleted", "RollDamageApplied"]);
    expect(after.tokens[goblin.id]).toBeUndefined();
  });

  it("nuke.detonate: removes every token reaching 0 or below, skips hp null", () => {
    const { state, aria, goblin, ogre, sign } = table();
    const { events, state: after } = run(state, gm, { type: "nuke.detonate", amount: 3, origin: { x: 50, y: 50 } });
    expect(events[0]!.type).toBe("MapNuked");
    expect(events.filter((e) => e.type === "TokenDeleted")).toHaveLength(2);
    expect(after.tokens[goblin.id]).toBeUndefined();
    expect(after.tokens[ogre.id]).toBeUndefined();
    expect(after.tokens[aria.id]!.stats.hp).toBe(17);
    expect(after.tokens[sign.id]).toBeDefined();
  });

  it("areaEffect.resolve: no condition event after the delete; the other target stays", () => {
    const { state, goblin, ogre } = table();
    const started = run(state, gm, { type: "areaEffect.start", tokenIds: [goblin.id, ogre.id], expression: "1d20" }).state;
    const { events, state: after } = run(started, gm, {
      type: "areaEffect.resolve", effectId: started.areaEffect!.id,
      rows: [{ tokenId: goblin.id, amount: 5, addConditions: ["prone"] }, { tokenId: ogre.id, amount: 1, addConditions: [] }],
    });
    expect(types(events)).toEqual(["TokenStatsSet", "TokenConditionsSet", "TokenDeleted", "TokenStatsSet", "AreaEffectResolved"]);
    expect(after.tokens[goblin.id]).toBeUndefined();
    expect(after.tokens[ogre.id]!.stats.hp).toBe(2);
    expect(after.areaEffect).toBeNull();
  });
});

describe("auto-remove defeated: visibility (FR-GM-23)", () => {
  it("redacts a hidden token's stats and defeat for players; the GM sees both", () => {
    const { state, ogre } = table();
    const { events } = run(state, gm, { type: "token.setStats", tokenId: ogre.id, stats: stats(-1) });
    for (const e of events) {
      expect(filterEventForViewer(committed(e), state, alice).kind).toBe("redacted");
      expect(filterEventForViewer(committed(e), state, gm).kind).toBe("event");
    }
  });

  it("passes a visible defeat with its reason", () => {
    const { state, goblin } = table();
    const { events } = run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(-1) });
    expect(filterEventForViewer(committed(events[1]!), state, alice)).toMatchObject({
      kind: "event", committed: { event: { type: "TokenDeleted", reason: "defeated" } },
    });
  });

  it("with line of sight, an owner gets the defeat first, then a resync; a manual delete still resyncs", () => {
    const { state, aria } = table();
    const los = { ...state, scene: { ...state.scene, lineOfSight: true } };
    const defeat = run(los, gm, { type: "token.setStats", tokenId: aria.id, stats: stats(-1) }).events[1]!;
    expect(filterEventForViewer(committed(defeat), los, alice)).toMatchObject({ kind: "event", thenResync: true });
    const manual = run(los, gm, { type: "token.delete", tokenId: aria.id }).events[0]!;
    expect(filterEventForViewer(committed(manual), los, alice)).toEqual({ kind: "resync" });
  });
});

describe("auto-remove defeated: undo (FR-REC-02, FR-REC-03)", () => {
  it("undoes a plain HP edit that removed a token, restoring its previous HP in one action", () => {
    const { state, goblin } = table();
    const edit = act(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(-4) });
    const entry = undoableAction(edit.state.undo, edit.commandId)!;
    expect(entry).toBeDefined();
    expect(describeUndo(entry, edit.state.tokens).verb).toBe("Goblin defeated and removed");
    const undone = act(edit.state, gm, { type: "history.undo", commandId: edit.commandId });
    expect(types(undone.events)).toEqual(["TokenCreated", "TokenStatsSet", "ActionUndone"]);
    expect(undone.state.tokens[goblin.id]!.stats.hp).toBe(3);
  });

  it("undoes a nuke that removed tokens as one action", () => {
    const { state, goblin, aria } = table();
    const nuked = act(state, gm, { type: "nuke.detonate", amount: 3, origin: { x: 50, y: 50 } });
    const undone = act(nuked.state, gm, { type: "history.undo", commandId: nuked.commandId });
    expect(undone.state.tokens[goblin.id]!.stats.hp).toBe(3);
    expect(undone.state.tokens[aria.id]!.stats.hp).toBe(20);
  });

  it("keeps a manual token.delete non-undoable", () => {
    const { state, goblin } = table();
    const del = act(state, gm, { type: "token.delete", tokenId: goblin.id });
    expect(undoableAction(del.state.undo, del.commandId)).toBeUndefined();
  });

  it("refuses when another token has taken the name, or the token is already back", () => {
    const { state, goblin } = table();
    const edit = act(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: stats(0) });
    const taken = withToken(edit.state, { name: "Goblin" }).state;
    expect(attempt(taken, gm, { type: "history.undo", commandId: edit.commandId })).toMatchObject({ ok: false, code: "invalid" });
    const back = reduce(edit.state, { type: "TokenCreated", token: goblin });
    expect(attempt(back, gm, { type: "history.undo", commandId: edit.commandId })).toMatchObject({ ok: false, code: "invalid" });
  });
});
