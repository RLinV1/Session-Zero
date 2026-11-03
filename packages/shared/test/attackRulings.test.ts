import { beforeEach, describe, expect, it } from "vitest";
import {
  attackLabel,
  Command,
  DomainEvent,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  formatAttackRoll,
  reduce,
  type CommandInput,
  type CommittedEvent,
  type DiceRoll,
  type RoomState,
  isDiceRoll
} from "../src";
import { alice, attempt, baseRoom, bob, gm, resetRandom, run, withToken } from "./fixtures";

const committed = (event: CommittedEvent["event"], seq = 10): CommittedEvent => ({ seq, at: "2026-09-27T00:00:00.000Z", actorId: gm.id, event });

/** Aria (Alice's), Goblin (15/15 HP, AC 13) and a hidden Shadow (20 HP). */
function table() {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  const shadow = withToken(goblin.state, { name: "Shadow", hidden: true });
  let state = shadow.state;
  state = run(state, gm, { type: "token.setStats", tokenId: goblin.token.id, stats: { hp: 15, maxHp: 15, ac: 13 } }).state;
  state = run(state, gm, { type: "token.setStats", tokenId: shadow.token.id, stats: { hp: 20, maxHp: 20, ac: 15 } }).state;
  return { state, aria: aria.token, goblin: goblin.token, shadow: shadow.token };
}

const attack = (actorTokenId: string, targetTokenId: string, kind: "toHit" | "damage", extra: Partial<Extract<CommandInput, { type: "dice.roll" }>> = {}): CommandInput => ({
  type: "dice.roll",
  expression: kind === "toHit" ? "1d20+5" : "1d8+3",
  attack: { actorTokenId, targetTokenId, label: kind === "toHit" ? "Longsword" : "Damage", kind },
  ...extra,
});

function rolled(state: RoomState, actor = alice, input: CommandInput): { state: RoomState; roll: DiceRoll } {
  const result = run(state, actor, input);
  const event = result.events[0];
  if (event?.type !== "DiceRolled") throw new Error("expected DiceRolled");
  return { state: result.state, roll: event.roll };
}

const rollIn = (state: RoomState, id: string) => state.rolls.filter(isDiceRoll).find((r) => r.id === id);

beforeEach(resetRandom);

describe("roll type (FR-TAC-09, ADR 0011)", () => {
  it("records the kind and reads older attack rolls as to hit", () => {
    const { state, aria, goblin } = table();
    expect(rolled(state, alice, attack(aria.id, goblin.id, "damage")).roll.attack?.kind).toBe("damage");

    const side = { tokenId: aria.id, name: "Aria", hidden: false };
    const old = DomainEvent.parse({ type: "DiceRolled", roll: { id: "r1", expression: "1d20", byParticipantId: alice.id, dice: [7], modifier: 0, total: 7, visibility: "public", attack: { actor: side, target: side, label: null } } });
    expect(old.type === "DiceRolled" && old.roll.attack?.kind).toBe("toHit");

    const command = Command.parse({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id } });
    expect(command.type === "dice.roll" && command.attack?.kind).toBe("toHit");
  });

  it("treats a stored attack roll without a kind as to hit on replay, where nothing parses it", () => {
    const { state, aria, goblin } = table();
    const side = (t: { id: string; name: string }) => ({ tokenId: t.id, name: t.name, hidden: false });
    // As the store hands it back: cast, not parsed, so the zod default never ran.
    const stored = { type: "DiceRolled", roll: { id: "old-1", expression: "1d20", byParticipantId: alice.id, dice: [12], modifier: 0, total: 12, visibility: "public", attack: { actor: side(aria), target: side(goblin), label: null } } } as unknown as DomainEvent;
    const replayed = reduce(state, stored);
    expect(rollIn(replayed, "old-1")?.attack?.kind).toBe("toHit");
    expect(run(replayed, gm, { type: "roll.rule", rollId: "old-1", verdict: "hit" }).events[0]).toMatchObject({ verdict: "hit" });
  });
});

describe("GM rulings (FR-TAC-09, FR-GM-22, ADR 0011)", () => {
  it("lets the GM rule, change and clear a verdict, each carrying the previous one", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "toHit"));

    const hit = run(s0, gm, { type: "roll.rule", rollId: roll.id, verdict: "hit" });
    expect(hit.events).toEqual([{ type: "RollRuled", rollId: roll.id, verdict: "hit", previous: null }]);
    expect(rollIn(hit.state, roll.id)?.verdict).toBe("hit");

    const miss = run(hit.state, gm, { type: "roll.rule", rollId: roll.id, verdict: "miss" });
    expect(miss.events[0]).toMatchObject({ verdict: "miss", previous: "hit" });

    const cleared = run(miss.state, gm, { type: "roll.rule", rollId: roll.id, verdict: null });
    expect(cleared.events[0]).toMatchObject({ verdict: null, previous: "miss" });
    expect(rollIn(cleared.state, roll.id)).not.toHaveProperty("verdict");
  });

  it("refuses players, old rolls, damage and plain rolls, and no-op verdicts", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "toHit"));
    expect(attempt(s0, alice, { type: "roll.rule", rollId: roll.id, verdict: "hit" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(s0, gm, { type: "roll.rule", rollId: roll.id, verdict: null })).toMatchObject({ ok: false, code: "invalid" });

    const damage = rolled(s0, alice, attack(aria.id, goblin.id, "damage"));
    expect(attempt(damage.state, gm, { type: "roll.rule", rollId: damage.roll.id, verdict: "hit" })).toMatchObject({ ok: false, code: "invalid" });
    const plain = rolled(s0, bob, { type: "dice.roll", expression: "2d6" });
    expect(attempt(plain.state, gm, { type: "roll.rule", rollId: plain.roll.id, verdict: "hit" })).toMatchObject({ ok: false, code: "invalid" });

    const ruled = run(s0, gm, { type: "roll.rule", rollId: roll.id, verdict: "hit" }).state;
    expect(attempt(ruled, gm, { type: "roll.rule", rollId: roll.id, verdict: "hit" })).toMatchObject({ ok: false, code: "invalid" });

    let later = s0;
    for (let i = 0; i < 30; i++) later = run(later, bob, { type: "dice.roll", expression: "1d4" }).state;
    expect(attempt(later, gm, { type: "roll.rule", rollId: roll.id, verdict: "hit" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("applying damage (FR-TAC-07, ADR 0011)", () => {
  it("lowers the target's current HP by the total, once", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "damage"));
    expect(roll.total).toBe(4);

    const applied = run(s0, gm, { type: "roll.applyDamage", rollId: roll.id });
    expect(applied.events).toEqual([
      { type: "TokenStatsSet", tokenId: goblin.id, stats: { hp: 11, maxHp: 15, ac: 13 }, previous: { hp: 15, maxHp: 15, ac: 13 } },
      { type: "RollDamageApplied", rollId: roll.id, amount: 4 },
    ]);
    expect(applied.state.tokens[goblin.id]?.stats.hp).toBe(11);
    expect(rollIn(applied.state, roll.id)?.damageApplied).toBe(true);
    expect(attempt(applied.state, gm, { type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("counts a negative total as zero and never goes below the lowest HP", () => {
    const { state, aria, goblin } = table();
    const negative = rolled(state, alice, attack(aria.id, goblin.id, "damage", { expression: "1d4-9" }));
    // Nothing changes, so there is no stats event; the roll is still marked applied.
    const zero = run(negative.state, gm, { type: "roll.applyDamage", rollId: negative.roll.id });
    expect(zero.events).toEqual([{ type: "RollDamageApplied", rollId: negative.roll.id, amount: 0 }]);
    expect(rollIn(zero.state, negative.roll.id)?.damageApplied).toBe(true);

    const low = run(state, gm, { type: "token.setStats", tokenId: goblin.id, stats: { hp: -997, maxHp: 15, ac: 13 } }).state;
    const big = rolled(low, alice, attack(aria.id, goblin.id, "damage"));
    expect(run(big.state, gm, { type: "roll.applyDamage", rollId: big.roll.id }).state.tokens[goblin.id]?.stats.hp).toBe(-999);
  });

  it("refuses players, to-hit rolls, missing targets and targets without HP", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "damage"));
    expect(attempt(s0, alice, { type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ ok: false, code: "forbidden" });

    const toHit = rolled(s0, alice, attack(aria.id, goblin.id, "toHit"));
    expect(attempt(toHit.state, gm, { type: "roll.applyDamage", rollId: toHit.roll.id })).toMatchObject({ ok: false, code: "invalid" });

    const gone = run(s0, gm, { type: "token.delete", tokenId: goblin.id }).state;
    expect(attempt(gone, gm, { type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ ok: false, code: "not_found" });

    const noHp = rolled(s0, gm, attack(goblin.id, aria.id, "damage"));
    expect(attempt(noHp.state, gm, { type: "roll.applyDamage", rollId: noHp.roll.id })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("rulings never reveal hidden information (FR-GM-23, ADR 0011)", () => {
  it("withholds rulings on GM-only rolls and passes public ones without token details", () => {
    const { state, aria, goblin, shadow } = table();
    const secret = rolled(state, gm, attack(shadow.id, aria.id, "toHit", { visibility: "gm" }));
    const ruleSecret = run(secret.state, gm, { type: "roll.rule", rollId: secret.roll.id, verdict: "hit" });
    expect(filterEventForViewer(committed(ruleSecret.events[0]!, 21), secret.state, alice)).toEqual({ kind: "redacted", seq: 21 });

    const open = rolled(state, alice, attack(aria.id, goblin.id, "toHit"));
    const ruleOpen = run(open.state, gm, { type: "roll.rule", rollId: open.roll.id, verdict: "miss" });
    const event = committed(ruleOpen.events[0]!);
    expect(filterEventForViewer(event, open.state, bob)).toEqual({ kind: "event", committed: event });
    expect(JSON.stringify(event)).not.toContain(goblin.id);
    expect(filterEventForViewer(committed({ type: "RollRuled", rollId: "gone", verdict: "hit", previous: null }, 22), open.state, bob)).toEqual({ kind: "redacted", seq: 22 });
  });

  it("applying to a hidden target withholds its HP and that the roll was applied", () => {
    const { state, aria, shadow } = table();
    const { state: s0, roll } = rolled(state, gm, attack(aria.id, shadow.id, "damage"));
    const [statsSet, applied] = run(s0, gm, { type: "roll.applyDamage", rollId: roll.id }).events;
    expect(filterEventForViewer(committed(statsSet!, 30), s0, alice)).toEqual({ kind: "redacted", seq: 30 });
    const afterStats = reduce(s0, statsSet!);
    // "Applied" on an Unknown target would say the hidden token still exists with HP.
    expect(filterEventForViewer(committed(applied!, 31), afterStats, alice)).toEqual({ kind: "redacted", seq: 31 });

    const end = reduce(afterStats, applied!);
    const seen = filterStateForViewer(end, alice).rolls.filter(isDiceRoll).at(-1)!;
    expect(seen).not.toHaveProperty("damageApplied");
    expect(seen.attack?.target).toBeNull();
    expect(JSON.stringify(filterStateForViewer(end, alice))).not.toContain("Shadow");
    expect(filterStateForViewer(end, gm).rolls.filter(isDiceRoll).at(-1)?.damageApplied).toBe(true);
  });

  it("keeps an Unknown target unknown when it is revealed before damage is applied", () => {
    const { state, aria, shadow } = table();
    const { state: s0, roll } = rolled(state, gm, attack(aria.id, shadow.id, "damage"));
    const revealed = run(s0, gm, { type: "token.setHidden", tokenId: shadow.id, hidden: false }).state;
    const [statsSet, applied] = run(revealed, gm, { type: "roll.applyDamage", rollId: roll.id }).events;
    // Shadow is visible now, so its HP change passes; the roll must not be tied to it.
    expect(filterEventForViewer(committed(statsSet!, 40), revealed, alice)).toMatchObject({ kind: "event" });
    expect(filterEventForViewer(committed(applied!, 41), reduce(revealed, statsSet!), alice)).toEqual({ kind: "redacted", seq: 41 });
  });

  it("does not mark Applied on a target hidden after the roll", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "damage"));
    const hidden = run(s0, gm, { type: "token.setHidden", tokenId: goblin.id, hidden: true }).state;
    const result = run(hidden, gm, { type: "roll.applyDamage", rollId: roll.id });
    const afterStats = reduce(hidden, result.events[0]!);
    expect(filterEventForViewer(committed(result.events[1]!, 51), afterStats, alice)).toEqual({ kind: "redacted", seq: 51 });
    expect(filterStateForViewer(result.state, alice).rolls.filter(isDiceRoll).at(-1)).not.toHaveProperty("damageApplied");
  });

  it("still shows Applied to players when the target is visible", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "damage"));
    const result = run(s0, gm, { type: "roll.applyDamage", rollId: roll.id });
    const event = committed(result.events[1]!, 61);
    expect(filterEventForViewer(event, reduce(s0, result.events[0]!), bob)).toEqual({ kind: "event", committed: event });
    expect(filterStateForViewer(result.state, bob).rolls.filter(isDiceRoll).at(-1)?.damageApplied).toBe(true);
  });
});

describe("ruling text (FR-TAC-09, FR-REC-01)", () => {
  it("shows the GM's outcome on the roll and labels unlabelled damage", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attack(aria.id, goblin.id, "toHit"));
    expect(formatAttackRoll({ ...roll, verdict: "hit" })).toBe("Aria → Goblin · Longsword · 1d20+5 = 6 · Hit");
    expect(formatAttackRoll({ ...roll, verdict: "miss" })).toBe("Aria → Goblin · Longsword · 1d20+5 = 6 · Miss");
    expect(formatAttackRoll(roll)).toBe("Aria → Goblin · Longsword · 1d20+5 = 6");
    const damage = { ...roll, expression: "1d8+3", total: 7, attack: { ...roll.attack!, kind: "damage" as const, label: null }, damageApplied: true };
    expect(attackLabel(damage.attack)).toBe("damage");
    expect(formatAttackRoll(damage)).toBe("Aria → Goblin · damage · 1d8+3 = 7 · Applied");
  });

  it("describes rulings and applied damage in the activity log", () => {
    const { state, aria, goblin } = table();
    const { state: s0, roll } = rolled(state, alice, attack(aria.id, goblin.id, "toHit"));
    expect(formatActivity({ type: "RollRuled", rollId: roll.id, verdict: "hit", previous: null }, "Dana", s0)).toBe("Dana ruled Aria → Goblin (1d20+5: 6) a hit");
    expect(formatActivity({ type: "RollRuled", rollId: roll.id, verdict: "miss", previous: "hit" }, "Dana", s0)).toBe("Dana changed the ruling on Aria → Goblin (1d20+5: 6) from a hit to a miss");
    expect(formatActivity({ type: "RollRuled", rollId: roll.id, verdict: null, previous: "miss" }, "Dana", s0)).toBe("Dana cleared the ruling on Aria → Goblin (1d20+5: 6)");

    const damage = rolled(s0, alice, attack(aria.id, goblin.id, "damage"));
    expect(formatActivity({ type: "RollDamageApplied", rollId: damage.roll.id, amount: damage.roll.total }, "Dana", damage.state))
      .toBe(`Dana applied ${damage.roll.total} damage from Aria → Goblin (1d8+3: ${damage.roll.total})`);
  });
});
