import { beforeEach, describe, expect, it } from "vitest";
import { formatExpression, parseDiceExpression, rollDice, isDiceRoll } from "../src";
import { alice, attempt, baseRoom, gm, resetRandom, run } from "./fixtures";

describe("dice expressions (FR-TAC-09)", () => {
  it.each([
    ["1d20+5", { count: 1, sides: 20, modifier: 5 }],
    ["2d6", { count: 2, sides: 6, modifier: 0 }],
    ["4d6-1", { count: 4, sides: 6, modifier: -1 }],
    ["d20", { count: 1, sides: 20, modifier: 0 }],
    ["  3 D 8 + 2 ", { count: 3, sides: 8, modifier: 2 }],
  ])("parses %s", (input, expected) => {
    const result = parseDiceExpression(input);
    expect(result.ok && result.expression).toEqual(expected);
  });

  it.each(["", "d", "20", "1d", "1d20+", "abc", "1d20+5+3", "0d6", "1d1", "99d6"])(
    "rejects %s with a message the input box can show",
    (input) => {
      const result = parseDiceExpression(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    },
  );

  it("rolls within range and applies the modifier", () => {
    // random() = 0 is the lowest face, 0.999 the highest.
    expect(rollDice({ count: 2, sides: 6, modifier: 3 }, () => 0)).toEqual({ dice: [1, 1], total: 5 });
    expect(rollDice({ count: 2, sides: 6, modifier: 3 }, () => 0.999)).toEqual({ dice: [6, 6], total: 15 });
  });

  it("never produces a face outside 1..sides across the whole unit interval", () => {
    for (let i = 0; i <= 1000; i++) {
      const { dice } = rollDice({ count: 1, sides: 20, modifier: 0 }, () => i / 1001);
      expect(dice[0]).toBeGreaterThanOrEqual(1);
      expect(dice[0]).toBeLessThanOrEqual(20);
    }
  });

  it("formats back to a canonical expression", () => {
    expect(formatExpression({ count: 1, sides: 20, modifier: 5 })).toBe("1d20+5");
    expect(formatExpression({ count: 2, sides: 6, modifier: 0 })).toBe("2d6");
    expect(formatExpression({ count: 4, sides: 6, modifier: -1 })).toBe("4d6-1");
  });
});

describe("rolling in a room (FR-GM-22)", () => {
  beforeEach(resetRandom);

  it("records a public roll in the log with the roller's id", () => {
    const { state } = run(baseRoom(), alice, { type: "dice.roll", expression: "2d6+1" });
    expect(state.rolls).toHaveLength(1);
    expect(state.rolls[0]).toMatchObject({
      expression: "2d6+1",
      byParticipantId: alice.id,
      visibility: "public",
    });
    expect(state.rolls.filter(isDiceRoll)[0]!.total).toBe(state.rolls.filter(isDiceRoll)[0]!.dice.reduce((a, b) => a + b, 0) + 1);
  });

  it("lets the GM roll privately", () => {
    const { state } = run(baseRoom(), gm, { type: "dice.roll", expression: "1d20", visibility: "gm" });
    expect(state.rolls.filter(isDiceRoll)[0]!.visibility).toBe("gm");
  });

  it("refuses a player a GM-only roll", () => {
    const result = attempt(baseRoom(), alice, {
      type: "dice.roll",
      expression: "1d20",
      visibility: "gm",
    });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects an unparseable expression rather than rolling something arbitrary", () => {
    const result = attempt(baseRoom(), alice, { type: "dice.roll", expression: "not dice" });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
  });

  it("caps the log, keeping the newest rolls", () => {
    let state = baseRoom();
    for (let i = 0; i < 35; i++) {
      state = run(state, alice, { type: "dice.roll", expression: "1d6" }).state;
    }
    expect(state.rolls).toHaveLength(30);
    // The full history is still in the event log; state keeps only the tail.
    expect(state.rolls.filter(isDiceRoll).at(-1)!.id).not.toEqual(state.rolls.filter(isDiceRoll)[0]!.id);
  });
});
