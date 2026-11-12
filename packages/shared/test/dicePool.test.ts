import { describe, expect, it } from "vitest";
import {
  AreaEffect,
  AttackDice,
  AttackPreset,
  ClientMessage,
  Command,
  DiceRoll,
  diceByTerm,
  DraftCreature,
  formatExpression,
  GroupRoll,
  parseDiceExpression,
  rollDice,
  sidesOfDice,
  TokenAttacks,
} from "../src";
import { attempt, baseRoom, gm, resetRandom, run, withToken } from "./fixtures";

describe("dice pool (FR-TAC-09)", () => {
  it.each([
    ["2d6+1d4+3", { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }], modifier: 3 }],
    ["d20", { terms: [{ count: 1, sides: 20 }], modifier: 0 }],
    ["1d20-1", { terms: [{ count: 1, sides: 20 }], modifier: -1 }],
    [" 1D8 + 2d6 - 2 ", { terms: [{ count: 1, sides: 8 }, { count: 2, sides: 6 }], modifier: -2 }],
    // From text a repeated die type is accepted and kept as two terms; the builder never writes it.
    ["1d6+1d6", { terms: [{ count: 1, sides: 6 }, { count: 1, sides: 6 }], modifier: 0 }],
  ])("parses %s", (input, expected) => {
    const result = parseDiceExpression(input);
    expect(result.ok && result.expression).toEqual(expected);
  });

  it.each([
    ["15d6+6d8", "21 dice"],
    ["1d20+banana", "not a formula"],
    ["1d1", "a one-sided die"],
    ["1d1001", "a 1001-sided die"],
    ["1d6+2d1001", "a bad second term"],
    ["3+1d6", "a modifier first"],
    ["1d6+3+1d4", "dice after the modifier"],
    ["1d6-1d4", "subtracted dice"],
    ["1d6++1d4", "an empty term"],
  ])("refuses %s (%s)", (input) => {
    const result = parseDiceExpression(input);
    expect(result.ok).toBe(false);
  });

  it("writes the canonical form, terms in order then the modifier", () => {
    expect(formatExpression({ terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }], modifier: 3 })).toBe("2d6+1d4+3");
    expect(formatExpression({ terms: [{ count: 1, sides: 8 }], modifier: -1 })).toBe("1d8-1");
    const reparsed = parseDiceExpression("d20 + 1d4");
    expect(reparsed.ok && formatExpression(reparsed.expression)).toBe("1d20+1d4");
  });

  it("rolls terms in order, so diceByTerm lines a roll's dice up with its formula", () => {
    const parsed = parseDiceExpression("2d6+1d4+3");
    if (!parsed.ok) throw new Error("parse");
    // 0.0 → 1, 0.5 → 4 on a d6; 0.99 → 4 on a d4.
    const seq = [0.0, 0.5, 0.99];
    let i = 0;
    const roll = rollDice(parsed.expression, () => seq[i++]!);
    expect(roll).toEqual({ dice: [1, 4, 4], total: 12 });
    expect(diceByTerm("2d6+1d4+3", roll.dice)).toEqual({
      groups: [{ count: 2, sides: 6, values: [1, 4] }, { count: 1, sides: 4, values: [4] }],
      modifier: 3,
    });
    expect(sidesOfDice("2d6+1d4+3", roll.dice)).toEqual([6, 6, 4]);
  });

  it("gives up on dice its formula doesn't account for", () => {
    expect(diceByTerm("2d6", [3])).toBeNull();
    expect(diceByTerm("banana", [3])).toBeNull();
    expect(diceByTerm("1d20+5", [12])).toEqual({ groups: [{ count: 1, sides: 20, values: [12] }], modifier: 5 });
  });
});

describe("formula lengths (FR-TAC-09, ADR 0061)", () => {
  const formula = "1d4+1d6+1d8+1d10+1d12+1d20+14d100-99";
  it("parses the longest builder formula, and carries it in every roll, command and drop", () => {
    expect(formula.length).toBeGreaterThan(32);
    expect(parseDiceExpression(formula).ok).toBe(true);
    const side = { tokenId: "t", name: "T", hidden: false };
    expect(DiceRoll.safeParse({ id: "r", expression: formula, byParticipantId: "p", dice: [1], modifier: 0, total: 1, visibility: "public" }).success).toBe(true);
    expect(GroupRoll.safeParse({ kind: "group", id: "g", expression: formula, label: null, byParticipantId: "p", visibility: "public", entries: [{ ...side, dice: [1], total: 1 }] }).success).toBe(true);
    expect(AreaEffect.safeParse({ id: "e", label: null, expression: formula, byParticipantId: "p", targets: [{ ...side, roll: { dice: [1], total: 1 } }], call: null, damage: { mode: "single", expression: formula, byParticipantId: "p", dice: [1], total: 1 } }).success).toBe(true);
    for (const command of [
      { type: "dice.roll", expression: formula },
      { type: "dice.rollGroup", tokenIds: ["t"], expression: formula },
      { type: "areaEffect.start", tokenIds: ["t"], expression: formula },
      { type: "areaEffect.rollDamage", effectId: "e", expression: formula, mode: "single" },
    ]) expect(Command.safeParse(command).success, command.type).toBe(true);
    expect(ClientMessage.safeParse({ type: "ephemeral", payload: { type: "diceDrop", expression: formula, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } }).success).toBe(true);
  });
});

describe("named attacks hold mixed dice (FR-TAC-09, ADR 0061)", () => {
  it("reads an attack saved in the one-die shape as one term", () => {
    expect(AttackDice.parse({ count: 1, sides: 8, modifier: 3 })).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 3 });
    const stored = TokenAttacks.parse([{ name: "Longsword", toHit: { count: 1, sides: 20, modifier: 5 }, damage: { count: 1, sides: 8, modifier: 3 } }]);
    expect(stored[0]!.damage).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 3 });
  });

  it("holds mixed dice, and refuses a repeated die type, 21 dice, or a non-standard die", () => {
    expect(AttackPreset.safeParse({ name: "Flame tongue", toHit: null, damage: { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 3 } }).success).toBe(true);
    expect(AttackDice.safeParse({ terms: [{ count: 1, sides: 6 }, { count: 1, sides: 6 }], modifier: 0 }).success).toBe(false);
    expect(AttackDice.safeParse({ terms: [{ count: 15, sides: 6 }, { count: 6, sides: 8 }], modifier: 0 }).success).toBe(false);
    expect(AttackDice.safeParse({ terms: [{ count: 1, sides: 3 }], modifier: 0 }).success).toBe(false);
  });

  it("reads an old AI draft's dice as one term and refuses a repeated die type", () => {
    const base = { key: "goblin", name: "Goblin", isPlayerCharacter: false };
    const old = DraftCreature.parse({ ...base, attacks: [{ name: "Scimitar", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }] });
    expect(old.attacks[0]!.toHit).toEqual({ terms: [{ count: 1, sides: 20 }], modifier: 4 });
    const repeated = { terms: [{ count: 1, sides: 6 }, { count: 1, sides: 6 }], modifier: 0 };
    expect(DraftCreature.safeParse({ ...base, attacks: [{ name: "Twin", toHit: null, damage: repeated }] }).success).toBe(false);
  });
});

describe("mixed dice in rooms (FR-TAC-09, FR-GM-22)", () => {
  it("rolls 1d20+1d4 for each token in a group roll", () => {
    resetRandom();
    const one = withToken(baseRoom(), { name: "Goblin 1" });
    const two = withToken(one.state, { name: "Goblin 2" });
    const { events } = run(two.state, gm, { type: "dice.rollGroup", tokenIds: [one.token.id, two.token.id], expression: "1d20 + 1d4" });
    const roll = events[0]!.type === "GroupRolled" ? events[0]!.roll : null;
    expect(roll?.expression).toBe("1d20+1d4");
    for (const entry of roll!.entries) {
      expect(entry.dice).toHaveLength(2);
      expect(sidesOfDice(roll!.expression, entry.dice)).toEqual([20, 4]);
      expect(entry.total).toBe(entry.dice[0]! + entry.dice[1]!);
    }
  });

  it("refuses a roll of 21 dice", () => {
    expect(attempt(baseRoom(), gm, { type: "dice.roll", expression: "15d6+6d8" })).toMatchObject({ ok: false, code: "invalid" });
  });
});
