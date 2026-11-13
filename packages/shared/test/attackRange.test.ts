import { describe, expect, it } from "vitest";
import {
  ANIMATION_SHAPES,
  AnimationDef,
  AttackPreset,
  Command,
  DraftCreature,
  TokenAttacks,
  DEFAULT_GRID,
  attackDistance,
  diagonalSteps,
  filterEventForViewer,
  filterStateForViewer,
  footprintSquares,
  inRange,
  isAdjacent,
  type AttackRange,
  type CommittedEvent,
  type DiagonalRule,
  type GridSpec,
  type RoomState,
} from "../src";
import { alice, baseRoom, bob, gm, run, withToken } from "./fixtures";

/** A 5 ft grid, 70 px squares, starting at 0. */
const grid: GridSpec = { ...DEFAULT_GRID, cellSize: 70, offsetX: 0, offsetY: 0 };
/** The centre of a token `size` squares wide whose top-left square is (col, row). */
const at = (col: number, row: number, size = 1) => ({ position: { x: (col + size / 2) * 70, y: (row + size / 2) * 70 }, size });
const dice = { terms: [{ count: 1, sides: 20 }], modifier: 0 };

describe("a named attack's range (attack-range)", () => {
  it.each<[string, AttackRange | undefined]>([
    ["melee with no reach", { kind: "melee" }],
    ["melee with a reach", { kind: "melee", reach: 10 }],
    ["ranged", { kind: "ranged", distance: 80 }],
    ["fractional ranged", { kind: "ranged", distance: 1.5 }],
    ["no range", undefined],
  ])("accepts %s", (_name, range) => {
    expect(AttackPreset.safeParse({ name: "Bow", toHit: dice, damage: null, ...(range && { range }) }).success).toBe(true);
  });

  it.each([
    ["a zero distance", { kind: "ranged", distance: 0 }],
    ["a negative distance", { kind: "ranged", distance: -10 }],
    ["a ranged attack with no distance", { kind: "ranged" }],
    ["a zero reach", { kind: "melee", reach: 0 }],
    ["more than 9999", { kind: "ranged", distance: 10000 }],
    ["an unknown kind", { kind: "thrown", distance: 20 }],
  ])("refuses %s", (_name, range) => {
    expect(AttackPreset.safeParse({ name: "Bow", toHit: dice, damage: null, range }).success).toBe(false);
  });

  it("reads attacks saved before ranges as having none", () => {
    const old = AttackPreset.parse({ name: "Longsword", toHit: dice, damage: dice });
    expect(old.range).toBeUndefined();
  });
});

describe("how range is measured (attack-range)", () => {
  it("counts diagonals by the room's rule, as the ruler does", () => {
    expect(diagonalSteps(2, 2, "equal")).toBe(2);
    expect(diagonalSteps(2, 2, "alternating")).toBe(3);
    expect(diagonalSteps(2, 2, "euclidean")).toBeCloseTo(2.828, 3);
    expect(diagonalSteps(3, 1, "alternating")).toBe(3);
  });

  it.each([
    ["a medium token", 1, [3, 3]],
    ["a large token", 2, [3, 4]],
    ["a huge token", 3, [3, 5]],
    ["a tiny token", 0.5, [3, 3]],
  ])("finds the squares %s stands on", (_name, size, [min, max]) => {
    const span = footprintSquares(at(3, 3, size as number), grid);
    expect(span).toEqual({ minCol: min, maxCol: max, minRow: min, maxRow: max });
  });

  it("gives a token of 1.5 squares the squares whose centres it covers", () => {
    // Snapped to the intersection at (4, 4) squares, it spans 3.25 to 4.75: centres 3.5 and 4.5.
    expect(footprintSquares({ position: { x: 4 * 70, y: 4 * 70 }, size: 1.5 }, grid)).toEqual({ minCol: 3, maxCol: 4, minRow: 3, maxRow: 4 });
  });

  it("measures to a large target's nearest square, not its centre", () => {
    // Aria at (0, 0); one empty square; a 2×2 ogre from (2, 0).
    expect(attackDistance(at(0, 0), at(2, 0, 2), grid, "equal")).toBe(10);
  });

  it("is in the room's units", () => {
    const metres = { ...grid, unitsPerCell: 1.5, unitLabel: "m" };
    expect(attackDistance(at(0, 0), at(3, 0), metres, "equal")).toBeCloseTo(4.5);
  });

  it("treats a diagonal neighbour as in melee reach under every rule", () => {
    for (const rule of ["equal", "alternating", "euclidean"] as DiagonalRule[]) {
      expect(isAdjacent(at(0, 0), at(1, 1), grid)).toBe(true);
      expect(inRange({ kind: "melee" }, at(0, 0), at(1, 1), grid, rule)).toBe(true);
    }
  });

  it("treats overlapping and side-touching tokens as adjacent, and a gap as not", () => {
    expect(isAdjacent(at(0, 0), at(0, 0), grid)).toBe(true);
    expect(isAdjacent(at(0, 0), at(1, 0), grid)).toBe(true);
    expect(isAdjacent(at(0, 0), at(2, 0), grid)).toBe(false);
    expect(isAdjacent(at(0, 0), at(2, 0, 2), grid)).toBe(false);
    expect(isAdjacent(at(0, 0), at(1, 0, 2), grid)).toBe(true);
  });

  it("reaches two squares diagonally with 10 ft under Equal cost only", () => {
    const glaive: AttackRange = { kind: "melee", reach: 10 };
    expect(inRange(glaive, at(0, 0), at(2, 2), grid, "equal")).toBe(true);
    expect(inRange(glaive, at(0, 0), at(2, 2), grid, "alternating")).toBe(false);
    expect(inRange(glaive, at(0, 0), at(2, 2), grid, "euclidean")).toBe(false);
  });

  it("gives a ranged attack no adjacency exception", () => {
    expect(inRange({ kind: "ranged", distance: 3 }, at(0, 0), at(1, 0), grid, "equal")).toBe(false);
    expect(inRange({ kind: "ranged", distance: 5 }, at(0, 0), at(1, 0), grid, "equal")).toBe(true);
  });

  it("keeps a melee attack with a short reach to adjacent targets", () => {
    expect(inRange({ kind: "melee", reach: 2 }, at(0, 0), at(1, 0), grid, "equal")).toBe(true);
    expect(inRange({ kind: "melee", reach: 2 }, at(0, 0), at(2, 0), grid, "equal")).toBe(false);
  });

  it("counts every target in range for an attack with no range", () => {
    expect(inRange(undefined, at(0, 0), at(40, 40), grid, "equal")).toBe(true);
  });
});

describe("the roll carries only melee or ranged (attack-range, ADR 0067)", () => {
  function armed(attacks: object[]) {
    let { state } = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
    const aria = Object.values(state.tokens)[0]!;
    const goblin = withToken(state, { name: "Goblin" });
    state = run(goblin.state, gm, { type: "token.configure", tokenId: aria.id, changes: { attacks: attacks as never } }).state;
    return { state, aria, goblin: goblin.token };
  }
  const roll = (state: RoomState, actorTokenId: string, targetTokenId: string, label: string, extra: object = {}) => {
    const rolled = run(state, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId, targetTokenId, label, kind: "toHit", ...extra } });
    return rolled.events[0]?.type === "DiceRolled" ? rolled.events[0] : undefined;
  };
  const attacks = [
    { name: "Longsword", toHit: dice, damage: null, range: { kind: "melee" } },
    { name: "Longbow", toHit: dice, damage: null, range: { kind: "ranged", distance: 80 } },
    { name: "Shove", toHit: dice, damage: null },
  ];

  it("copies the matched attack's kind of range, never its number", () => {
    const { state, aria, goblin } = armed(attacks);
    expect(roll(state, aria.id, goblin.id, "Longsword")?.roll.attack?.range).toBe("melee");
    const bow = roll(state, aria.id, goblin.id, "Longbow")!;
    expect(bow.roll.attack?.range).toBe("ranged");
    expect(JSON.stringify(bow)).not.toContain("80");
  });

  it("leaves it out for an attack with no range or an unmatched label", () => {
    const { state, aria, goblin } = armed(attacks);
    expect(roll(state, aria.id, goblin.id, "Shove")?.roll.attack?.range).toBeUndefined();
    expect(roll(state, aria.id, goblin.id, "Kick")?.roll.attack?.range).toBeUndefined();
  });

  it("ignores a kind the client sends", () => {
    const { state, aria, goblin } = armed(attacks);
    const parsed = Command.parse({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Longsword", range: "ranged" } });
    expect(parsed.type === "dice.roll" && parsed.attack && "range" in parsed.attack).toBe(false);
    expect(roll(state, aria.id, goblin.id, "Longsword", { range: "ranged" })?.roll.attack?.range).toBe("melee");
  });

  it("never gives another player the attack or its range, only the roll's kind", () => {
    const { state, aria, goblin } = armed(attacks);
    expect(JSON.stringify(filterStateForViewer(state, bob).tokens[aria.id])).not.toMatch(/Longbow|"distance"/);
    const event = roll(state, aria.id, goblin.id, "Longbow")!;
    const committed: CommittedEvent = { seq: 9, at: "2026-11-13T00:00:00Z", actorId: alice.id, event };
    const seen = filterEventForViewer(committed, state, bob);
    expect(seen).toMatchObject({ kind: "event", committed: { event: { roll: { attack: { range: "ranged" } } } } });
    expect(JSON.stringify(seen)).not.toContain("80");
  });
});

describe("the arrow and pierce shapes (board-attack-effects, library-animations)", () => {
  it.each(["arrow", "pierce"] as const)("accepts a definition with the %s shape", (shape) => {
    expect(ANIMATION_SHAPES).toContain(shape);
    expect(AnimationDef.safeParse({ shape, duration: 1, primary: "#9ca3af", secondary: "#e5e7eb", size: 1.8, particles: 10, glow: 0.4, shake: 0.2, flash: 0.2 }).success).toBe(true);
  });
});

describe("an AI-drafted creature keeps its attack ranges (attack-range)", () => {
  it("parses a draft's range and keeps it on the attacks a placed token takes", () => {
    const draft = DraftCreature.parse({
      key: "archer", name: "Archer", isPlayerCharacter: false,
      attacks: [{ name: "Longbow", toHit: dice, damage: null, range: { kind: "ranged", distance: 150 } }],
    });
    expect(draft.attacks[0]?.range).toEqual({ kind: "ranged", distance: 150 });
    expect(TokenAttacks.parse(draft.attacks)[0]?.range).toEqual({ kind: "ranged", distance: 150 });
  });
});
