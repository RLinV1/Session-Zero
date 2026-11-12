import { describe, expect, it } from "vitest";
import { anchorOf, centerOf, stepCost, terrainCells, type DiagonalRule, type DifficultTerrainMode, type TerrainRun } from "../src";

const rules = (diagonal: DiagonalRule, difficult: DifficultTerrainMode = "entry") => ({ diagonal, difficult });
const run = (kind: "blocked" | "difficult", start: number, end = start, row = 0): TerrainRun => ({ row, start, end, kind });
const step = (from: [number, number], to: [number, number], diagonalIndex = 0) => ({ from: { col: from[0], row: from[1] }, to: { col: to[0], row: to[1] }, diagonalIndex });
/** The cost in squares of a straight walk through `cells`, as a move would add it up. */
const walk = (cells: [number, number][], r: ReturnType<typeof rules>, runs: TerrainRun[], size = 1) => {
  const kinds = terrainCells(runs);
  let total = 0, diagonals = 0;
  for (let i = 1; i < cells.length; i++) {
    const [a, b] = [cells[i - 1]!, cells[i]!];
    if (a[0] !== b[0] && a[1] !== b[1]) diagonals++;
    total += stepCost(step(a, b, diagonals), size, r, kinds)!;
  }
  return total;
};

describe("step cost (FR-TAC-03, ADR 0055)", () => {
  const line: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const crossing = [run("difficult", 1, 2)];

  it("costs A, D1, D2, B as 5 / 5 / 6 squares on entry, on exit and both", () => {
    expect(walk(line, rules("equal", "entry"), crossing)).toBe(5);
    expect(walk(line, rules("equal", "exit"), crossing)).toBe(5);
    expect(walk(line, rules("equal", "both"), crossing)).toBe(6);
  });

  it("doubles a Difficult-to-Difficult step once under Both", () => {
    expect(stepCost(step([1, 0], [2, 0]), 1, rules("equal", "both"), terrainCells(crossing))).toBe(2);
  });

  it("doubles the first step off a Difficult start under On exit, and not under On entry", () => {
    const start = terrainCells([run("difficult", 0)]);
    expect(stepCost(step([0, 0], [1, 0]), 1, rules("equal", "exit"), start)).toBe(2);
    expect(stepCost(step([0, 0], [1, 0]), 1, rules("equal", "entry"), start)).toBe(1);
  });

  it("costs diagonals 1, 1, 1 equal; 1, 2, 1 alternating; root 2 euclidean", () => {
    const diagonal: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3]];
    expect(walk(diagonal, rules("equal"), [])).toBe(3);
    expect(walk(diagonal, rules("alternating"), [])).toBe(4);
    expect(walk(diagonal, rules("euclidean"), [])).toBeCloseTo(3 * Math.SQRT2);
  });

  it("charges a two-square token for Difficult under any square it lands on", () => {
    const kinds = terrainCells([run("difficult", 2, 2, 1)]);
    // Anchor (0,0) covers cols 0-1, rows 0-1; stepping right lands on cols 1-2, including (2, 1).
    expect(stepCost(step([0, 0], [1, 0]), 2, rules("equal"), kinds)).toBe(2);
    expect(stepCost(step([0, 0], [0, 1]), 2, rules("equal"), kinds)).toBe(1);
  });

  it("counts layered Difficult once and refuses a Blocked landing", () => {
    expect(stepCost(step([0, 0], [1, 0]), 1, rules("equal"), terrainCells([run("difficult", 1), run("difficult", 1)]))).toBe(2);
    expect(stepCost(step([0, 0], [1, 0]), 1, rules("equal"), terrainCells([run("blocked", 1)]))).toBeNull();
  });

  it("finds a token's top-left square from its centre and back", () => {
    const grid = { cellSize: 10, offsetX: 3, offsetY: 7, unitsPerCell: 5, unitLabel: "ft" };
    for (const size of [1, 2, 3]) {
      const anchor = { col: 4, row: 2 };
      expect(anchorOf(centerOf(anchor, size, grid), size, grid)).toEqual(anchor);
    }
  });
});
