import { describe, expect, it } from "vitest";
import {
  Command,
  decide,
  describeUndo,
  emptyRoomState,
  eventMeta,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  undoableAction,
  reduce,
  reduceCommitted,
  UNDO_HISTORY_LIMIT,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type RoomState,
  isDiceRoll
} from "../src";
import { alice, baseRoom, ctx, gm, withToken } from "./fixtures";

/** Like the server: decide, then reduce every event of the batch under one command id. */
let batch = 0;
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}

/** The newest action the activity log would offer an Undo for, or "none". */
function newest(state: RoomState) {
  return [...state.undo].reverse().find((e) => undoableAction(state.undo, e.commandId))?.commandId ?? "none";
}

/** Decides an undo without applying it, so a test can inspect a refusal. */
function attemptUndo(state: RoomState, actor: Participant = gm, commandId = newest(state)) {
  return decide(state, actor, Command.parse({ type: "history.undo", commandId }), ctx);
}

/** A room with Goblin, owned by Alice, at (35, 35). */
function setup() {
  const { state, token } = withToken(baseRoom(), { name: "Goblin", ownerIds: [alice.id] });
  return { state, id: token.id };
}

const at = (state: RoomState, id: string) => state.tokens[id]!.position;

describe("history.undo command (FR-REC-02)", () => {
  it("names the action to undo and nothing else", () => {
    expect(Command.safeParse({ type: "history.undo", commandId: "x" }).success).toBe(true);
    expect(Command.safeParse({ type: "history.undo" }).success).toBe(false);
    expect(Command.safeParse({ type: "history.undo", commandId: "x", extra: 1 }).success).toBe(false);
  });
});

describe("undo history in reduce (FR-REC-02)", () => {
  it("records one entry per reversible command", () => {
    const { state, id } = setup();
    const { state: moved, commandId } = act(state, gm, { type: "token.move", tokenId: id, to: { x: 105, y: 35 } });
    expect(moved.undo).toHaveLength(1);
    expect(moved.undo[0]).toMatchObject({ commandId, actorId: gm.id, undoable: true });
    expect(moved.undo[0]!.events).toHaveLength(1);
  });

  it("groups a multi-event editor save into one entry", () => {
    const { state, id } = setup();
    const { state: saved, events } = act(state, gm, {
      type: "token.configure", tokenId: id, changes: { position: { x: 200, y: 35 }, hidden: true, conditions: ["prone"] },
    });
    expect(events.map((e) => e.type)).toEqual(["TokenHiddenSet", "TokenMoved", "TokenConditionsSet"]);
    expect(saved.undo).toHaveLength(1);
    expect(saved.undo[0]!.events).toHaveLength(3);
  });

  it("does not make a mixed batch undoable, whatever its event order", () => {
    const { state, id } = setup();
    const { state: saved } = act(state, gm, {
      type: "token.configure", tokenId: id, changes: { name: "Ogre", position: { x: 200, y: 35 } },
    });
    expect(newest(saved)).toBe("none");
  });

  it("keeps only the newest undoable actions", () => {
    const { state: start, id } = setup();
    let state = start;
    for (let i = 1; i <= UNDO_HISTORY_LIMIT + 5; i++) {
      state = act(state, gm, { type: "token.move", tokenId: id, to: { x: i, y: 0 } }).state;
    }
    // The newest UNDO_HISTORY_LIMIT closed actions, plus the one still open.
    expect(state.undo).toHaveLength(UNDO_HISTORY_LIMIT + 1);
    expect(state.undo.at(0)!.events[0]).toMatchObject({ to: { x: 5, y: 0 } });
    expect(state.undo.at(-1)!.events[0]).toMatchObject({ to: { x: UNDO_HISTORY_LIMIT + 5, y: 0 } });
  });

  it("does not count a standalone stats edit toward the limit", () => {
    const { state: start, id } = setup();
    let state = start;
    for (let i = 1; i <= UNDO_HISTORY_LIMIT; i++) {
      state = act(state, gm, { type: "token.move", tokenId: id, to: { x: i, y: 0 } }).state;
    }
    state = act(state, gm, { type: "token.setStats", tokenId: id, stats: { hp: 5, maxHp: 10, ac: 12 } }).state;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 99, y: 0 } }).state;
    // The first move is still kept: the stats edit took no slot.
    expect(state.undo.at(0)!.events[0]).toMatchObject({ to: { x: 1, y: 0 } });
    expect(state.undo.some((e) => e.events.some((ev) => ev.type === "TokenStatsSet"))).toBe(false);
  });

  it("does not evict an unrelated action when undoing with a full history", () => {
    const { state: start, id } = setup();
    let state = start;
    for (let i = 1; i <= UNDO_HISTORY_LIMIT + 5; i++) {
      state = act(state, gm, { type: "token.move", tokenId: id, to: { x: i, y: 0 } }).state;
    }
    state = act(state, gm, { type: "history.undo", commandId: newest(state) }).state;
    // The 20 newest actions minus the one undone. The undo's own brief entry costs no slot.
    expect(state.undo).toHaveLength(UNDO_HISTORY_LIMIT - 1);
    expect(state.undo.at(0)!.events[0]).toMatchObject({ to: { x: 6, y: 0 } });
  });

  it("passes over a non-undoable action without losing earlier ones", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 1, y: 0 } }).state;
    state = act(state, alice, { type: "dice.roll", expression: "1d20" }).state;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 2, y: 0 } }).state;
    expect(state.undo.filter((e) => e.undoable)).toHaveLength(2);
    // A closed non-undoable entry is dropped once the next batch starts.
    expect(state.undo.every((e) => e.undoable)).toBe(true);
  });

  it("leaves the history alone without grouping metadata", () => {
    const { state, id } = setup();
    const next = reduce(state, { type: "TokenMoved", tokenId: id, from: { x: 35, y: 35 }, to: { x: 1, y: 1 } });
    expect(next.undo).toEqual([]);
  });

  it("never offers events from before undo existed", () => {
    const events: DomainEvent[] = [
      { type: "RoomCreated", name: "Old room" },
      { type: "ParticipantJoined", participant: gm },
      { type: "TokenCreated", token: { id: "t1", name: "Goblin", position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#000", ownerIds: [], hidden: false, imageUrl: null, stats: { hp: null, maxHp: null, ac: null }, conditions: [] } },
      { type: "TokenMoved", tokenId: "t1", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: "TokenHiddenSet", tokenId: "t1", hidden: true, previous: false },
    ];
    const legacy: CommittedEvent[] = events.map((event, i) => ({ seq: i + 1, at: "2026-01-01T00:00:00.000Z", actorId: gm.id, event }));
    const state = legacy.reduce(reduceCommitted, emptyRoomState("old"));
    // Their batch boundaries are unknown, so undoing one could split an old Apply or editor save.
    expect(newest(state)).toBe("none");
    expect(attemptUndo(state, gm, "seq:4")).toMatchObject({ ok: false, message: "That action can no longer be undone." });
    expect(eventMeta(legacy[0]!)).toMatchObject({ commandId: "seq:1", legacy: true });
  });
});

describe("undo in decide (FR-REC-02, FR-REC-03)", () => {
  it("is GM-only", () => {
    const { state, id } = setup();
    const { state: moved } = act(state, alice, { type: "token.move", tokenId: id, to: { x: 105, y: 35 } });
    expect(attemptUndo(moved, alice)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses when there is nothing to undo", () => {
    const { state } = setup();
    expect(attemptUndo(state)).toMatchObject({ ok: false, code: "invalid", message: "That action can no longer be undone." });
  });

  it("undoes a player's move for the GM with a compensating event", () => {
    const { state, id } = setup();
    const { state: moved, commandId } = act(state, alice, { type: "token.move", tokenId: id, to: { x: 300, y: 35 } });
    const { state: undone, events } = act(moved, gm, { type: "history.undo", commandId: newest(moved) });
    expect(events).toEqual([
      { type: "TokenMoved", tokenId: id, from: { x: 300, y: 35 }, to: { x: 35, y: 35 } },
      { type: "ActionUndone", commandId },
    ]);
    expect(at(undone, id)).toEqual({ x: 35, y: 35 });
    expect(undone.undo).toEqual([]);
  });

  it("restores hidden flags and conditions", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.setConditions", tokenId: id, conditions: ["prone", "blinded"] }).state;
    state = act(state, gm, { type: "token.setHidden", tokenId: id, hidden: true }).state;
    state = act(state, gm, { type: "history.undo", commandId: newest(state) }).state;
    expect(state.tokens[id]!.hidden).toBe(false);
    state = act(state, gm, { type: "history.undo", commandId: newest(state) }).state;
    expect(state.tokens[id]!.conditions).toEqual([]);
    expect(attemptUndo(state)).toMatchObject({ ok: false, message: "That action can no longer be undone." });
  });

  it("undoes an editor save as one unit, reveal first reversed to hide first", () => {
    const { state, id } = setup();
    const { state: saved } = act(state, gm, {
      type: "token.configure", tokenId: id, changes: { position: { x: 200, y: 35 }, hidden: true },
    });
    const { state: undone, events } = act(saved, gm, { type: "history.undo", commandId: newest(saved) });
    expect(events.map((e) => e.type)).toEqual(["TokenMoved", "TokenHiddenSet", "ActionUndone"]);
    expect({ ...undone, undo: [] }).toEqual({ ...state, undo: [] });

    // A save that reveals last is undone by hiding first, before anything else is broadcast.
    const { state: revealed } = act(undone, gm, { type: "token.setHidden", tokenId: id, hidden: true });
    const { state: shown } = act(revealed, gm, {
      type: "token.configure", tokenId: id, changes: { position: { x: 50, y: 50 }, hidden: false },
    });
    const { events: reversed } = act(shown, gm, { type: "history.undo", commandId: newest(shown) });
    expect(reversed.map((e) => e.type)).toEqual(["TokenHiddenSet", "TokenMoved", "ActionUndone"]);
  });

  it("steps back through earlier actions and never records the undo itself", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 1, y: 0 } }).state;
    const orc = withToken(state, { name: "Orc" });
    state = act(orc.state, gm, { type: "token.setHidden", tokenId: orc.token.id, hidden: true }).state;
    state = act(state, gm, { type: "history.undo", commandId: newest(state) }).state;
    expect(state.tokens[orc.token.id]!.hidden).toBe(false);
    state = act(state, gm, { type: "history.undo", commandId: newest(state) }).state;
    expect(at(state, id)).toEqual({ x: 35, y: 35 });
    expect(state.undo).toEqual([]);
  });

  it("refuses when the token has changed since, and keeps the action", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 300, y: 100 } }).state;
    // A mixed save is not undoable, so undo targets the move and finds Goblin elsewhere.
    state = act(state, gm, { type: "token.configure", tokenId: id, changes: { name: "Goblin", size: 2, position: { x: 500, y: 100 } } }).state;
    expect(attemptUndo(state)).toMatchObject({ ok: false, code: "invalid", message: "Can't undo: Goblin has changed since." });
    expect(newest(state)).not.toBe("none");
  });

  it("refuses when the token no longer exists, naming it", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.setHidden", tokenId: id, hidden: true }).state;
    state = act(state, gm, { type: "token.delete", tokenId: id }).state;
    expect(attemptUndo(state)).toMatchObject({ ok: false, message: "Can't undo: Goblin no longer exists." });
  });

  it("compares conditions as a set", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.setConditions", tokenId: id, conditions: ["prone", "blinded"] }).state;
    const token = state.tokens[id]!;
    const reordered = { ...state, tokens: { ...state.tokens, [id]: { ...token, conditions: ["blinded", "prone"] as typeof token.conditions } } };
    expect(attemptUndo(reordered).ok).toBe(true);
  });
});

describe("undo visibility (FR-GM-23, ADR 0013)", () => {
  const committed = (event: DomainEvent, seq: number, commandId = "cmd-x"): CommittedEvent =>
    ({ seq, at: "2026-09-30T00:00:00.000Z", actorId: gm.id, commandId, event });

  it("gives players no undo history", () => {
    const { state, id } = setup();
    const { state: moved } = act(state, gm, { type: "token.move", tokenId: id, to: { x: 1, y: 1 } });
    expect(filterStateForViewer(moved, alice).undo).toEqual([]);
    expect(filterStateForViewer(moved, gm).undo).toHaveLength(1);
  });

  it("redacts ActionUndone for players and strips commandId", () => {
    const { state, id } = setup();
    const undone = filterEventForViewer(committed({ type: "ActionUndone", commandId: "cmd-1" }, 9), state, alice);
    expect(undone).toEqual({ kind: "redacted", seq: 9 });
    const move = filterEventForViewer(committed({ type: "TokenMoved", tokenId: id, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, 10), state, alice);
    expect(move.kind === "event" && "commandId" in move.committed).toBe(false);
    const forGm = filterEventForViewer(committed({ type: "ActionUndone", commandId: "cmd-1" }, 9), state, gm);
    expect(forGm).toMatchObject({ kind: "event", committed: { commandId: "cmd-x" } });
  });

  it("sends players only redacted seqs when a hidden token's move is undone", () => {
    const { state, token } = withToken(baseRoom(), { name: "Orc", hidden: true });
    const { state: moved } = act(state, gm, { type: "token.move", tokenId: token.id, to: { x: 9, y: 9 } });
    const { events } = act(moved, gm, { type: "history.undo", commandId: newest(moved) });
    let before = moved;
    events.forEach((event, i) => {
      expect(filterEventForViewer(committed(event, 20 + i), before, alice).kind).toBe("redacted");
      before = reduce(before, event);
    });
  });

  it("removes a token from players when its reveal is undone", () => {
    const { state, token } = withToken(baseRoom(), { name: "Orc", hidden: true });
    const { state: revealed } = act(state, gm, { type: "token.setHidden", tokenId: token.id, hidden: false });
    expect(filterStateForViewer(revealed, alice).tokens[token.id]).toBeDefined();
    const { state: undone } = act(revealed, gm, { type: "history.undo", commandId: newest(revealed) });
    expect(filterStateForViewer(undone, alice).tokens[token.id]).toBeUndefined();
  });
});

describe("undo in the activity log (FR-REC-01, ADR 0013)", () => {
  it("names the undone action from the history just before", () => {
    const { state, id } = setup();
    const { state: moved } = act(state, alice, { type: "token.move", tokenId: id, to: { x: 300, y: 35 } });
    const decision = decide(moved, gm, Command.parse({ type: "history.undo", commandId: newest(moved) }), ctx);
    if (!decision.ok) throw new Error(decision.message);
    const [inverse, marker] = decision.events as [DomainEvent, DomainEvent];
    const beforeMarker = reduce(moved, inverse, { commandId: "cmd-undo", actorId: gm.id });
    expect(formatActivity(marker, "Raymond", beforeMarker)).toBe("Raymond undid the move of Goblin");
  });

  it("labels each reversible action for the Undo button", () => {
    const { state: start, id } = setup();
    let state = start;
    state = act(state, gm, { type: "token.move", tokenId: id, to: { x: 1, y: 1 } }).state;
    expect(describeUndo(state.undo.at(-1)!, state.tokens).verb).toBe("move Goblin");
    state = act(state, gm, { type: "token.setHidden", tokenId: id, hidden: true }).state;
    expect(describeUndo(state.undo.at(-1)!, state.tokens).verb).toBe("hide Goblin");
    state = act(state, gm, { type: "token.setConditions", tokenId: id, conditions: ["prone"] }).state;
    expect(describeUndo(state.undo.at(-1)!, state.tokens).verb).toBe("conditions on Goblin");
  });
});

describe("picking an action from the activity log (FR-REC-02)", () => {
  it("undoes an older action and leaves newer ones in place", () => {
    const { state: start, id } = setup();
    let state = start;
    const moved = act(state, gm, { type: "token.move", tokenId: id, to: { x: 300, y: 35 } });
    state = act(moved.state, gm, { type: "token.setConditions", tokenId: id, conditions: ["prone"] }).state;
    state = act(state, gm, { type: "history.undo", commandId: moved.commandId }).state;
    expect(at(state, id)).toEqual({ x: 35, y: 35 });
    expect(state.tokens[id]!.conditions).toEqual(["prone"]);
    // The conditions change is still there to undo; the move is not.
    expect(undoableAction(state.undo, moved.commandId)).toBeUndefined();
    expect(newest(state)).not.toBe("none");
  });

  it("refuses an action that is unknown or already undone", () => {
    const { state, id } = setup();
    const moved = act(state, gm, { type: "token.move", tokenId: id, to: { x: 300, y: 35 } });
    const undone = act(moved.state, gm, { type: "history.undo", commandId: moved.commandId }).state;
    expect(attemptUndo(undone, gm, moved.commandId)).toMatchObject({ ok: false, message: "That action can no longer be undone." });
    expect(attemptUndo(undone, gm, "never-existed")).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("undoing combat actions (FR-REC-02, ADR 0011)", () => {
  /** Aria (Alice's) attacks Goblin (15/15 HP). */
  function fight() {
    const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
    const goblin = withToken(aria.state, { name: "Goblin" });
    const state = act(goblin.state, gm, { type: "token.setStats", tokenId: goblin.token.id, stats: { hp: 15, maxHp: 15, ac: 13 } }).state;
    const roll = (s: RoomState, kind: "toHit" | "damage") => {
      const result = act(s, alice, {
        type: "dice.roll", expression: kind === "toHit" ? "1d20+5" : "1d8+3",
        attack: { actorTokenId: aria.token.id, targetTokenId: goblin.token.id, label: "Longsword", kind },
      });
      const event = result.events[0];
      if (event?.type !== "DiceRolled") throw new Error("expected DiceRolled");
      return { state: result.state, rollId: event.roll.id };
    };
    return { state, goblin: goblin.token.id, roll };
  }

  it("does not offer a manual HP or AC edit for undo", () => {
    const { state, goblin } = fight();
    const edited = act(state, gm, { type: "token.setStats", tokenId: goblin, stats: { hp: 3, maxHp: 15, ac: 13 } });
    expect(undoableAction(edited.state.undo, edited.commandId)).toBeUndefined();
    expect(attemptUndo(edited.state, gm, edited.commandId)).toMatchObject({ ok: false, message: "That action can no longer be undone." });
  });

  it("undoes a hit or miss ruling", () => {
    const { state: start, roll } = fight();
    const hit = roll(start, "toHit");
    const ruled = act(hit.state, gm, { type: "roll.rule", rollId: hit.rollId, verdict: "hit" });
    expect(describeUndo(undoableAction(ruled.state.undo, ruled.commandId)!, ruled.state.tokens).verb).toBe("ruling on Aria → Goblin");
    const undone = act(ruled.state, gm, { type: "history.undo", commandId: ruled.commandId });
    expect(undone.events[0]).toEqual({ type: "RollRuled", rollId: hit.rollId, verdict: null, previous: "hit" });
    expect(undone.state.rolls.filter(isDiceRoll).find((r) => r.id === hit.rollId)!.verdict).toBeUndefined();
  });

  it("refuses to undo a ruling that has been changed since", () => {
    const { state: start, roll } = fight();
    const hit = roll(start, "toHit");
    const ruled = act(hit.state, gm, { type: "roll.rule", rollId: hit.rollId, verdict: "hit" });
    const changed = act(ruled.state, gm, { type: "roll.rule", rollId: hit.rollId, verdict: "miss" });
    expect(attemptUndo(changed.state, gm, ruled.commandId)).toMatchObject({
      ok: false, message: "Can't undo: Aria → Goblin has changed since.",
    });
  });

  it("undoes an applied damage roll as one unit: HP back and no longer Applied", () => {
    const { state: start, goblin, roll } = fight();
    const damage = roll(start, "damage");
    const applied = act(damage.state, gm, { type: "roll.applyDamage", rollId: damage.rollId });
    expect(applied.state.tokens[goblin]!.stats.hp).toBeLessThan(15);
    const action = undoableAction(applied.state.undo, applied.commandId)!;
    expect(describeUndo(action, applied.state.tokens).noun).toMatch(/^the \d+ damage applied from Aria → Goblin$/);

    const undone = act(applied.state, gm, { type: "history.undo", commandId: applied.commandId });
    expect(undone.events.map((e) => e.type)).toEqual(["RollDamageUnapplied", "TokenStatsSet", "ActionUndone"]);
    expect(undone.state.tokens[goblin]!.stats.hp).toBe(15);
    expect(undone.state.rolls.filter(isDiceRoll).find((r) => r.id === damage.rollId)!.damageApplied).toBeUndefined();
    // The roll can be applied again afterwards.
    expect(decide(undone.state, gm, Command.parse({ type: "roll.applyDamage", rollId: damage.rollId }), ctx).ok).toBe(true);
  });

  it("refuses to undo an apply once HP has been edited since", () => {
    const { state: start, goblin, roll } = fight();
    const damage = roll(start, "damage");
    const applied = act(damage.state, gm, { type: "roll.applyDamage", rollId: damage.rollId });
    const healed = act(applied.state, gm, { type: "token.setStats", tokenId: goblin, stats: { hp: 15, maxHp: 15, ac: 13 } });
    expect(attemptUndo(healed.state, gm, applied.commandId)).toMatchObject({ ok: false, message: "Can't undo: Goblin has changed since." });
  });

  it("keeps the dice roll itself out of undo", () => {
    const { state: start, roll } = fight();
    const hit = roll(start, "toHit");
    expect(undoableAction(hit.state.undo, hit.state.undo.at(-1)?.commandId ?? "")).toBeUndefined();
  });
});

describe("combat undo visibility (FR-GM-22, FR-GM-23)", () => {
  it("withholds taking back a GM-only damage roll from players", () => {
    const wolf = withToken(baseRoom(), { name: "Wolf" });
    const goblin = withToken(wolf.state, { name: "Goblin" });
    let state = act(goblin.state, gm, { type: "token.setStats", tokenId: goblin.token.id, stats: { hp: 15, maxHp: 15, ac: 13 } }).state;
    const rolled = act(state, gm, {
      type: "dice.roll", expression: "1d8", visibility: "gm",
      attack: { actorTokenId: wolf.token.id, targetTokenId: goblin.token.id, label: "Bite", kind: "damage" },
    });
    const rollId = rolled.events[0]!.type === "DiceRolled" ? rolled.events[0]!.roll.id : "";
    state = act(rolled.state, gm, { type: "roll.applyDamage", rollId }).state;
    const unapplied: DomainEvent = { type: "RollDamageUnapplied", rollId, amount: 3 };
    expect(filterEventForViewer({ seq: 50, at: "2026-09-30T00:00:00.000Z", actorId: gm.id, event: unapplied }, state, alice).kind).toBe("redacted");
  });
});

describe("combat undo visibility with a hidden target (FR-GM-23, ADR 0011)", () => {
  /** Aria (Alice's) attacks the hidden Shadow (20 HP) with a public roll. */
  function hiddenTarget() {
    const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
    const shadow = withToken(aria.state, { name: "Shadow", hidden: true });
    const state = act(shadow.state, gm, { type: "token.setStats", tokenId: shadow.token.id, stats: { hp: 20, maxHp: 20, ac: 12 } }).state;
    const roll = (s: RoomState, kind: "toHit" | "damage") => {
      const result = act(s, gm, {
        type: "dice.roll", expression: kind === "toHit" ? "1d20" : "1d8",
        attack: { actorTokenId: aria.token.id, targetTokenId: shadow.token.id, label: "Bow", kind },
      });
      const event = result.events[0];
      if (event?.type !== "DiceRolled") throw new Error("expected DiceRolled");
      return { state: result.state, rollId: event.roll.id };
    };
    return { state, roll };
  }
  const deliver = (events: DomainEvent[], before: RoomState) => {
    let state = before;
    return events.map((event, i) => {
      const filtered = filterEventForViewer({ seq: 100 + i, at: "2026-09-30T00:00:00.000Z", actorId: gm.id, commandId: "cmd-u", event }, state, alice);
      state = reduce(state, event);
      return filtered;
    });
  };

  it("withholds every event of an undone Apply against a hidden target", () => {
    const { state: start, roll } = hiddenTarget();
    const damage = roll(start, "damage");
    const applied = act(damage.state, gm, { type: "roll.applyDamage", rollId: damage.rollId });
    const undo = decide(applied.state, gm, Command.parse({ type: "history.undo", commandId: applied.commandId }), ctx);
    if (!undo.ok) throw new Error(undo.message);
    expect(deliver(undo.events, applied.state).map((f) => f.kind)).toEqual(["redacted", "redacted", "redacted"]);
  });

  it("passes an undone ruling on a public roll without its token names", () => {
    const { state: start, roll } = hiddenTarget();
    const hit = roll(start, "toHit");
    const ruled = act(hit.state, gm, { type: "roll.rule", rollId: hit.rollId, verdict: "hit" });
    const undo = decide(ruled.state, gm, Command.parse({ type: "history.undo", commandId: ruled.commandId }), ctx);
    if (!undo.ok) throw new Error(undo.message);
    const [ruling, marker] = deliver(undo.events, ruled.state);
    // The original ruling passed the same way; it carries only the roll id and the verdict.
    expect(ruling).toMatchObject({ kind: "event", committed: { event: { type: "RollRuled", verdict: null } } });
    expect(JSON.stringify(ruling)).not.toContain("Shadow");
    expect(marker!.kind).toBe("redacted");
  });

  it("withholds an undone ruling on a GM-only roll", () => {
    const { state: start } = hiddenTarget();
    const aria = Object.values(start.tokens).find((t) => t.name === "Aria")!;
    const shadow = Object.values(start.tokens).find((t) => t.name === "Shadow")!;
    const rolled = act(start, gm, {
      type: "dice.roll", expression: "1d20", visibility: "gm",
      attack: { actorTokenId: shadow.id, targetTokenId: aria.id, label: "Claw", kind: "toHit" },
    });
    const rollId = rolled.events[0]!.type === "DiceRolled" ? rolled.events[0]!.roll.id : "";
    const ruled = act(rolled.state, gm, { type: "roll.rule", rollId, verdict: "miss" });
    const undo = decide(ruled.state, gm, Command.parse({ type: "history.undo", commandId: ruled.commandId }), ctx);
    if (!undo.ok) throw new Error(undo.message);
    expect(deliver(undo.events, ruled.state).map((f) => f.kind)).toEqual(["redacted", "redacted"]);
  });
});
