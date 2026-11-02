import { beforeEach, describe, expect, it } from "vitest";
import {
  areaEffectStage,
  Command,
  decide,
  describeUndo,
  emptyRoomState,
  filterEventForViewer,
  filterStateForViewer,
  GAME_PRESETS,
  halfDamage,
  reduce,
  reduceAll,
  rolledDamageFor,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, bob, ctx, gm, resetRandom, run, withToken } from "./fixtures";

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

/** Mira's wizard (owned by Alice), Goblin 1 (7/7 HP), Goblin 2 (7/7 HP), Ogre (59/59) and a hidden Assassin (20/20). */
function table() {
  const created = withToken(baseRoom(), { name: "Wizard", ownerIds: [alice.id] });
  const wizard = created.token;
  const one = withToken(created.state, { name: "Goblin 1" });
  const two = withToken(one.state, { name: "Goblin 2" });
  const ogre = withToken(two.state, { name: "Ogre" });
  const assassin = withToken(ogre.state, { name: "Assassin", hidden: true });
  let state = assassin.state;
  const hp = (id: string, value: number, max = value) => {
    state = run(state, gm, { type: "token.setStats", tokenId: id, stats: { hp: value, maxHp: max, ac: null } }).state;
  };
  hp(one.token.id, 7);
  hp(two.token.id, 7);
  hp(ogre.token.id, 59);
  hp(assassin.token.id, 20);
  return { state, wizard, one: one.token, two: two.token, ogre: ogre.token, assassin: assassin.token };
}

function started(tokenIds?: (t: ReturnType<typeof table>) => string[]) {
  const t = table();
  const ids = tokenIds ? tokenIds(t) : [t.one.id, t.two.id, t.ogre.id];
  const { state } = run(t.state, gm, { type: "areaEffect.start", tokenIds: ids, expression: "1d20+2", label: "Fireball" });
  return { ...t, state, effectId: state.areaEffect!.id };
}

const committed = (event: DomainEvent, seq = 1): CommittedEvent => ({ seq, at: "2026-10-28T12:00:00.000Z", actorId: gm.id, event });
const hpOf = (state: RoomState, id: string) => state.tokens[id]!.stats.hp;

beforeEach(resetRandom);

describe("Starting an Area Effect (FR-TAC-06, ADR 0046)", () => {
  it("rolls the formula for each target and opens the effect", () => {
    const { state, one, two, ogre } = started();
    const effect = state.areaEffect!;
    expect(effect).toMatchObject({ label: "Fireball", expression: "1d20+2", call: null, damage: null });
    expect(effect.targets.map((t) => t.tokenId)).toEqual([one.id, two.id, ogre.id]);
    for (const target of effect.targets) expect(target.roll?.total).toBe(target.roll!.dice[0]! + 2);
    expect(areaEffectStage(effect)).toBe("started");
    // The saves live in the effect, not the roll log.
    expect(state.rolls).toHaveLength(0);
  });

  it("allows one open effect at a time", () => {
    const { state, one } = started();
    expect(attempt(state, gm, { type: "areaEffect.start", tokenIds: [one.id], expression: "1d20" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("is GM only and refuses what a group roll refuses", () => {
    const { state, one } = table();
    expect(attempt(state, alice, { type: "areaEffect.start", tokenIds: [one.id], expression: "1d20" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(state, gm, { type: "areaEffect.start", tokenIds: [one.id, one.id], expression: "1d20" })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "areaEffect.start", tokenIds: ["gone"], expression: "1d20" })).toMatchObject({ ok: false, code: "not_found" });
    expect(attempt(state, gm, { type: "areaEffect.start", tokenIds: [one.id], expression: "fire" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("is refused while attacks are off in the preset", () => {
    const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
    registry.push({ ...GAME_PRESETS[0], id: "limited", name: "Limited", features: { attacks: false, conditions: false, armorClass: false }, conditions: [] });
    try {
      const state = reduceAll(emptyRoomState("r"), [
        { type: "RoomCreated", name: "Room", preset: "limited" },
        { type: "ParticipantJoined", participant: gm },
      ]);
      const { state: withGoblin, token } = withToken(state);
      expect(attempt(withGoblin, gm, { type: "areaEffect.start", tokenIds: [token.id], expression: "1d20" })).toMatchObject({ ok: false, code: "invalid" });
    } finally {
      registry.pop();
    }
  });
});

describe("Calling for damage (ADR 0046)", () => {
  it("calls, reassigns and takes over, each carrying who held it before", () => {
    const { state, effectId } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: bob.id });
    expect(called.events).toEqual([{ type: "AreaEffectCalled", effectId, participantId: bob.id, previous: null }]);
    const moved = run(called.state, gm, { type: "areaEffect.call", effectId, participantId: alice.id });
    expect(moved.events[0]).toMatchObject({ participantId: alice.id, previous: bob.id });
    const taken = run(moved.state, gm, { type: "areaEffect.call", effectId, participantId: gm.id });
    expect(taken.events[0]).toMatchObject({ participantId: gm.id, previous: alice.id });
    expect(taken.state.areaEffect!.call).toEqual({ participantId: gm.id });
    expect(areaEffectStage(taken.state.areaEffect!)).toBe("called");
  });

  it("refuses a player, the same caller, an unknown or departed participant, and a call after the roll", () => {
    const { state, effectId } = started();
    expect(attempt(state, alice, { type: "areaEffect.call", effectId, participantId: alice.id })).toMatchObject({ ok: false, code: "forbidden" });
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    expect(attempt(called, gm, { type: "areaEffect.call", effectId, participantId: alice.id })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(called, gm, { type: "areaEffect.call", effectId, participantId: "p-nobody" })).toMatchObject({ ok: false, code: "not_found" });
    const left = run(called, bob, { type: "participant.leave" }).state;
    expect(attempt(left, gm, { type: "areaEffect.call", effectId, participantId: bob.id })).toMatchObject({ ok: false, code: "invalid" });
    const rolled = run(called, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" }).state;
    expect(attempt(rolled, gm, { type: "areaEffect.call", effectId, participantId: gm.id })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("keeps the call with a player who leaves until the GM moves it", () => {
    const { state, effectId } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: bob.id }).state;
    const left = run(called, bob, { type: "participant.leave" }).state;
    expect(left.areaEffect!.call).toEqual({ participantId: bob.id });
    expect(run(left, gm, { type: "areaEffect.call", effectId, participantId: gm.id }).state.areaEffect!.call).toEqual({ participantId: gm.id });
  });
});

describe("Rolling the damage (ADR 0046)", () => {
  it("rolls once for all targets", () => {
    const { state, effectId, one, ogre } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    const { state: rolled } = run(called, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" });
    const damage = rolled.areaEffect!.damage!;
    expect(damage).toMatchObject({ mode: "single", expression: "8d6", byParticipantId: alice.id });
    expect(rolledDamageFor(rolled.areaEffect!, one.id)).toBe(rolledDamageFor(rolled.areaEffect!, ogre.id));
    expect(areaEffectStage(rolled.areaEffect!)).toBe("rolled");
  });

  it("rolls the same formula once per target, skipping deleted ones", () => {
    const { state, effectId, two } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    const deleted = run(called, gm, { type: "token.delete", tokenId: two.id }).state;
    const { state: rolled } = run(deleted, alice, { type: "areaEffect.rollDamage", effectId, expression: "2d6", mode: "perTarget" });
    const damage = rolled.areaEffect!.damage!;
    if (damage.mode !== "perTarget") throw new Error("expected per-target damage");
    expect(damage.results).toHaveLength(2);
    expect(damage.results.some((r) => r.tokenId === two.id)).toBe(false);
    expect(rolledDamageFor(rolled.areaEffect!, two.id)).toBeNull();
  });

  it("is refused for anyone but the caller, without a pending call, and for bad expressions", () => {
    const { state, effectId } = started();
    expect(attempt(state, gm, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ ok: false, code: "forbidden" });
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    expect(attempt(called, bob, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ ok: false, code: "forbidden" });
    // The GM writes nothing into a call that is someone else's.
    expect(attempt(called, gm, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(called, alice, { type: "areaEffect.rollDamage", effectId, expression: "eight", mode: "single" })).toMatchObject({ ok: false, code: "invalid" });
    const rolled = run(called, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" }).state;
    expect(attempt(rolled, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("lets only one of a takeover and the caller's roll through, whichever comes first", () => {
    const { state, effectId } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    const rolledFirst = run(called, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" }).state;
    expect(attempt(rolledFirst, gm, { type: "areaEffect.call", effectId, participantId: gm.id })).toMatchObject({ ok: false, code: "invalid" });
    const takenFirst = run(called, gm, { type: "areaEffect.call", effectId, participantId: gm.id }).state;
    expect(attempt(takenFirst, alice, { type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("Resolving the effect (ADR 0046)", () => {
  function rolledFor28() {
    const t = started();
    const called = run(t.state, gm, { type: "areaEffect.call", effectId: t.effectId, participantId: gm.id }).state;
    // Rolls 8d6 once; pin the total by resolving with explicit amounts below.
    const rolled = run(called, gm, { type: "areaEffect.rollDamage", effectId: t.effectId, expression: "8d6", mode: "single" }).state;
    return { ...t, state: rolled };
  }

  it("applies each row's amount from current HP, with full, half and none", () => {
    const { state, effectId, one, two, ogre } = rolledFor28();
    const rolled = rolledDamageFor(state.areaEffect!, one.id)!;
    const { state: after, events } = run(state, gm, {
      type: "areaEffect.resolve",
      effectId,
      rows: [
        { tokenId: one.id, amount: rolled, addConditions: [] },
        { tokenId: ogre.id, amount: halfDamage(rolled), addConditions: [] },
        { tokenId: two.id, amount: 0, addConditions: [] },
      ],
    });
    expect(hpOf(after, one.id)).toBe(7 - rolled);
    expect(hpOf(after, ogre.id)).toBe(59 - Math.floor(rolled / 2));
    expect(hpOf(after, two.id)).toBe(7);
    expect(after.areaEffect).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "AreaEffectResolved", effect: { id: effectId } });
    expect(events.filter((e) => e.type === "TokenStatsSet")).toHaveLength(2);
    expect(events.find((e) => e.type === "TokenStatsSet" && e.tokenId === one.id)).toMatchObject({ previous: { hp: 7 } });
  });

  it("heals with a negative amount, capped at max HP and never lowering HP", () => {
    const t = started();
    let state = run(t.state, gm, { type: "token.setStats", tokenId: t.ogre.id, stats: { hp: 30, maxHp: 35, ac: null } }).state;
    state = run(state, gm, { type: "token.setStats", tokenId: t.one.id, stats: { hp: 3, maxHp: null, ac: null } }).state;
    const { state: after, events } = run(state, gm, {
      type: "areaEffect.resolve",
      effectId: t.effectId,
      rows: [
        { tokenId: t.ogre.id, amount: -10, addConditions: [] },
        { tokenId: t.one.id, amount: -5, addConditions: [] },
        { tokenId: t.two.id, amount: -5, addConditions: [] },
      ],
    });
    expect(hpOf(after, t.ogre.id)).toBe(35);
    // No max HP: nothing caps the healing.
    expect(hpOf(after, t.one.id)).toBe(8);
    // Already at max: nothing changes.
    expect(hpOf(after, t.two.id)).toBe(7);
    expect(events.some((e) => e.type === "TokenStatsSet" && e.tokenId === t.two.id)).toBe(false);
  });

  it("adds conditions to what each target already has", () => {
    const t = started();
    const poisoned = run(t.state, gm, { type: "token.setConditions", tokenId: t.one.id, conditions: ["poisoned"] }).state;
    const { state: after, events } = run(poisoned, gm, {
      type: "areaEffect.resolve",
      effectId: t.effectId,
      rows: [
        { tokenId: t.one.id, amount: null, addConditions: ["prone"] },
        { tokenId: t.two.id, amount: null, addConditions: ["prone", "prone"] },
      ],
    });
    expect(after.tokens[t.one.id]!.conditions).toEqual(["poisoned", "prone"]);
    expect(after.tokens[t.two.id]!.conditions).toEqual(["prone"]);
    expect(events.find((e) => e.type === "TokenConditionsSet" && e.tokenId === t.one.id)).toMatchObject({ previous: ["poisoned"] });
  });

  it("lets the GM skip the call and type the amounts", () => {
    const { state, effectId, one } = started();
    const { state: after } = run(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: one.id, amount: 4, addConditions: [] }] });
    expect(hpOf(after, one.id)).toBe(3);
  });

  it("refuses a second resolve, a pending call, a non-target, a repeated row and a player", () => {
    const { state, effectId, one, wizard } = started();
    expect(attempt(state, alice, { type: "areaEffect.resolve", effectId, rows: [] })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: wizard.id, amount: 3, addConditions: [] }] })).toMatchObject({ ok: false, code: "invalid" });
    const twice = [{ tokenId: one.id, amount: 1, addConditions: [] }, { tokenId: one.id, amount: 1, addConditions: [] }];
    expect(attempt(state, gm, { type: "areaEffect.resolve", effectId, rows: twice })).toMatchObject({ ok: false, code: "invalid" });
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    expect(attempt(called, gm, { type: "areaEffect.resolve", effectId, rows: [] })).toMatchObject({ ok: false, code: "invalid" });
    const resolved = run(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: one.id, amount: 1, addConditions: [] }] }).state;
    expect(attempt(resolved, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: one.id, amount: 1, addConditions: [] }] })).toMatchObject({ ok: false, code: "not_found" });
    expect(hpOf(resolved, one.id)).toBe(6);
  });

  it("refuses to add conditions while conditions are off in the preset", () => {
    const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
    registry.push({ ...GAME_PRESETS[0], id: "no-conditions", name: "No Conditions", features: { attacks: true, conditions: false, armorClass: true }, conditions: [] });
    try {
      let state = reduceAll(emptyRoomState("r"), [
        { type: "RoomCreated", name: "Room", preset: "no-conditions" },
        { type: "ParticipantJoined", participant: gm },
      ]);
      const created = withToken(state);
      state = run(created.state, gm, { type: "areaEffect.start", tokenIds: [created.token.id], expression: "1d20" }).state;
      const effectId = state.areaEffect!.id;
      expect(attempt(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: created.token.id, amount: null, addConditions: ["prone"] }] }))
        .toMatchObject({ ok: false, code: "invalid" });
      expect(attempt(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: created.token.id, amount: null, addConditions: [] }] }))
        .toMatchObject({ ok: true });
    } finally {
      registry.pop();
    }
  });

  it("skips targets deleted since the effect started", () => {
    const { state, effectId, one, two } = started();
    const deleted = run(state, gm, { type: "token.delete", tokenId: two.id }).state;
    const { state: after } = run(deleted, gm, {
      type: "areaEffect.resolve",
      effectId,
      rows: [{ tokenId: one.id, amount: 2, addConditions: [] }, { tokenId: two.id, amount: 2, addConditions: [] }],
    });
    expect(hpOf(after, one.id)).toBe(5);
    expect(after.areaEffect).toBeNull();
  });
});

describe("Closing and undoing (FR-REC-02, ADR 0046)", () => {
  it("closes at any stage without changing a token", () => {
    const { state, effectId } = started();
    const called = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    const { state: closed, events } = run(called, gm, { type: "areaEffect.close", effectId });
    expect(events).toEqual([{ type: "AreaEffectClosed", effect: called.areaEffect }]);
    expect(closed.areaEffect).toBeNull();
    expect(closed.tokens).toEqual(called.tokens);
    expect(attempt(closed, gm, { type: "areaEffect.close", effectId })).toMatchObject({ ok: false, code: "not_found" });
    expect(attempt(called, alice, { type: "areaEffect.close", effectId })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("undoes HP and conditions in one action and leaves the effect closed", () => {
    const { state, effectId, one, two } = started();
    const resolved = act(state, gm, {
      type: "areaEffect.resolve",
      effectId,
      rows: [{ tokenId: one.id, amount: 5, addConditions: ["prone"] }, { tokenId: two.id, amount: 3, addConditions: [] }],
    });
    const entry = undoableAction(resolved.state.undo, resolved.commandId)!;
    expect(entry).toBeDefined();
    expect(describeUndo(entry, resolved.state.tokens).verb).toBe('"Fireball" (3 targets)');
    const undone = act(resolved.state, gm, { type: "history.undo", commandId: resolved.commandId });
    expect(hpOf(undone.state, one.id)).toBe(7);
    expect(hpOf(undone.state, two.id)).toBe(7);
    expect(undone.state.tokens[one.id]!.conditions).toEqual([]);
    expect(undone.state.areaEffect).toBeNull();
  });

  it("refuses the undo after a later HP change", () => {
    const { state, effectId, one } = started();
    const resolved = act(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: one.id, amount: 5, addConditions: [] }] });
    const edited = act(resolved.state, gm, { type: "token.setStats", tokenId: one.id, stats: { hp: 1, maxHp: 7, ac: null } });
    const refused = decide(edited.state, gm, Command.parse({ type: "history.undo", commandId: resolved.commandId }), ctx);
    expect(refused).toMatchObject({ ok: false, code: "invalid" });
  });

  it("has nothing to undo when the resolve changed no token", () => {
    const { state, effectId, one } = started();
    const resolved = act(state, gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: one.id, amount: 0, addConditions: [] }] });
    expect(undoableAction(resolved.state.undo, resolved.commandId)).toBeUndefined();
  });
});

describe("What players see of an Area Effect (FR-GM-23, ADR 0046)", () => {
  it("hides every save and every concealed target, in snapshots and live events", () => {
    const t = table();
    const { state, events } = run(t.state, gm, { type: "areaEffect.start", tokenIds: [t.one.id, t.assassin.id], expression: "1d20+2", label: "Fireball" });
    const view = filterStateForViewer(state, alice).areaEffect!;
    expect(view.targets.map((x) => x.name)).toEqual(["Goblin 1"]);
    expect(view.targets.every((x) => x.roll === null)).toBe(true);
    expect(filterStateForViewer(state, gm).areaEffect!.targets[0]!.roll).not.toBeNull();

    const live = filterEventForViewer(committed(events[0]!), t.state, alice);
    expect(live.kind).toBe("event");
    expect(JSON.stringify(live)).not.toContain(t.assassin.id);
    expect(JSON.stringify(live)).not.toContain('"total"');
  });

  it("filters per-target damage and the resolve for concealed targets", () => {
    const t = table();
    let state = run(t.state, gm, { type: "areaEffect.start", tokenIds: [t.one.id, t.assassin.id], expression: "1d20" }).state;
    const effectId = state.areaEffect!.id;
    state = run(state, gm, { type: "areaEffect.call", effectId, participantId: alice.id }).state;
    const rolled = run(state, alice, { type: "areaEffect.rollDamage", effectId, expression: "2d6", mode: "perTarget" });
    const live = filterEventForViewer(committed(rolled.events[0]!), state, alice);
    expect(JSON.stringify(live)).not.toContain(t.assassin.id);
    expect(JSON.stringify(filterStateForViewer(rolled.state, alice))).not.toContain(t.assassin.id);

    const resolved = run(rolled.state, gm, {
      type: "areaEffect.resolve",
      effectId,
      rows: [{ tokenId: t.one.id, amount: 3, addConditions: [] }, { tokenId: t.assassin.id, amount: 4, addConditions: ["prone"] }],
    });
    let before = rolled.state;
    for (const [i, event] of resolved.events.entries()) {
      const filtered = filterEventForViewer(committed(event, i + 1), before, alice);
      expect(JSON.stringify(filtered)).not.toContain(t.assassin.id);
      // The visible target's amount comes through, for its damage number.
      if (event.type === "AreaEffectResolved" && filtered.kind === "event" && filtered.committed.event.type === "AreaEffectResolved") {
        expect(filtered.committed.event.amounts).toEqual([{ tokenId: t.one.id, amount: 3 }]);
      }
      before = reduce(before, event);
    }
  });

  it("withholds an effect whose every target is concealed, unless the player holds its call", () => {
    const t = table();
    const started = run(t.state, gm, { type: "areaEffect.start", tokenIds: [t.assassin.id], expression: "1d20", label: "Poison gas" });
    expect(filterStateForViewer(started.state, alice).areaEffect).toBeNull();
    expect(filterEventForViewer(committed(started.events[0]!), t.state, alice)).toEqual({ kind: "redacted", seq: 1 });
    const effectId = started.state.areaEffect!.id;

    // Calling Alice shows it to her (a snapshot), and Bob still learns nothing.
    const called = run(started.state, gm, { type: "areaEffect.call", effectId, participantId: alice.id });
    expect(filterEventForViewer(committed(called.events[0]!), started.state, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(committed(called.events[0]!), started.state, bob)).toEqual({ kind: "redacted", seq: 1 });
    expect(filterStateForViewer(called.state, alice).areaEffect).toMatchObject({ id: effectId, targets: [] });
    expect(filterStateForViewer(called.state, bob).areaEffect).toBeNull();

    // Moving the call away hides it from her again.
    const moved = run(called.state, gm, { type: "areaEffect.call", effectId, participantId: gm.id });
    expect(filterEventForViewer(committed(moved.events[0]!), called.state, alice)).toEqual({ kind: "resync" });
    const closed = run(moved.state, gm, { type: "areaEffect.close", effectId });
    expect(filterEventForViewer(committed(closed.events[0]!), moved.state, alice)).toEqual({ kind: "redacted", seq: 1 });
  });

  it("lets a player's copy follow the whole flow", () => {
    const t = table();
    const gmEvents: DomainEvent[] = [];
    let state = t.state;
    let player = filterStateForViewer(state, alice);
    const step = (actor: Participant, input: CommandInput) => {
      const { state: next, events } = run(state, actor, input);
      let before = state;
      for (const [i, event] of events.entries()) {
        const filtered = filterEventForViewer(committed(event, i + 1), before, alice);
        if (filtered.kind === "event") player = reduce(player, filtered.committed.event);
        if (filtered.kind === "resync") player = filterStateForViewer(reduce(before, event), alice);
        before = reduce(before, event);
      }
      gmEvents.push(...events);
      state = next;
    };
    step(gm, { type: "areaEffect.start", tokenIds: [t.one.id, t.assassin.id], expression: "1d20" });
    const effectId = state.areaEffect!.id;
    step(gm, { type: "areaEffect.call", effectId, participantId: alice.id });
    expect(player.areaEffect!.call).toEqual({ participantId: alice.id });
    step(alice, { type: "areaEffect.rollDamage", effectId, expression: "2d6", mode: "single" });
    expect(player.areaEffect!.damage).toMatchObject({ mode: "single" });
    step(gm, { type: "areaEffect.resolve", effectId, rows: [{ tokenId: t.one.id, amount: 2, addConditions: [] }] });
    expect(player.areaEffect).toBeNull();
    expect(player.tokens[t.one.id]!.stats.hp).toBe(5);
    expect(player).toEqual(filterStateForViewer(state, alice));
  });
});
