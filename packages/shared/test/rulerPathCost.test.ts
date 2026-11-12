import { describe, expect, it } from "vitest";
import { effectiveTerrain, routeCost, rulerPathCost, type DiagonalRule, type DifficultTerrainMode, type TerrainRun } from "../src";

const rules = (diagonal: DiagonalRule, difficult: DifficultTerrainMode = "entry") => ({ diagonal, difficult });

const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const at = (col: number, row: number) => ({ x: col * 10 + 5, y: row * 10 + 5 });
const run = (kind: "blocked" | "difficult", start: number, end = start, row = 0): TerrainRun => ({ row, start, end, kind });

describe("ruler terrain path cost (FR-TAC-03)", () => {
  it("is plain distance over Normal ground", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), [])).toEqual({ cells: 4, cost: 20, difficult: 0, blocked: false });
  });
  it("doubles each Difficult cell entered and not the origin cell", () => {
    const r = rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), [run("difficult", 0, 2)]);
    expect(r).toMatchObject({ cost: 30, difficult: 2, blocked: false });
  });
  it("flags a path through Blocked, wherever it is", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), [run("blocked", 2)]).blocked).toBe(true);
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), [run("blocked", 6)]).blocked).toBe(false);
  });
  it("follows the diagonal rule", () => {
    const d = [run("difficult", 1, 1, 1)];
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, rules("equal"), []).cost).toBe(20);
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, rules("alternating"), []).cost).toBe(30);
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, rules("euclidean"), []).cost).toBeCloseTo(20 * Math.SQRT2, 5);
    expect(rulerPathCost(at(0, 0), at(2, 2), grid, rules("equal"), d)).toMatchObject({ cost: 15, difficult: 1 });
  });
  it("counts layered Difficult once and lets Blocked win via effective terrain", () => {
    const eff = effectiveTerrain({ base: [run("difficult", 1)], effects: [{ id: "e", name: "E", runs: [run("difficult", 1), run("blocked", 2)] }] });
    const r = rulerPathCost(at(0, 0), at(3, 0), grid, rules("equal"), eff);
    expect(r).toMatchObject({ cost: 20, difficult: 1, blocked: true });
  });
  it("sees nothing in cells the viewer's filtered runs omit", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), [])).toMatchObject({ difficult: 0, blocked: false });
  });
});

describe("ruler cost under the Difficult terrain rule (FR-TAC-03, ADR 0055)", () => {
  // A (0) -> D1 (1) -> D2 (2) -> B (3): two Difficult squares crossed.
  const crossing = [run("difficult", 1, 2)];
  it("costs A to B 25 / 25 / 30 ft on entry, on exit and both", () => {
    expect(rulerPathCost(at(0, 0), at(3, 0), grid, rules("equal", "entry"), crossing)).toMatchObject({ cost: 25, difficult: 2 });
    expect(rulerPathCost(at(0, 0), at(3, 0), grid, rules("equal", "exit"), crossing)).toMatchObject({ cost: 25, difficult: 2 });
    expect(rulerPathCost(at(0, 0), at(3, 0), grid, rules("equal", "both"), crossing)).toMatchObject({ cost: 30, difficult: 3 });
  });
});

describe("route cost over placed points (FR-TAC-03, ruler Movement mode)", () => {
  it("sums two runs of three squares", () => {
    expect(routeCost([at(0, 0), at(3, 0), at(3, 3)], grid, rules("equal"), [])).toEqual({ cells: 6, cost: 30, difficult: 0, blocked: false });
  });
  it("continues Alternating diagonals across a turn", () => {
    expect(routeCost([at(0, 0), at(1, 1), at(2, 0)], grid, rules("alternating"), []).cost).toBe(15);
  });
  it("counts Difficult and Blocked squares on the second run", () => {
    const terrain = [run("difficult", 1, 1, 3), run("difficult", 2, 2, 3), run("blocked", 3, 3, 3)];
    const r = routeCost([at(0, 0), at(0, 3), at(3, 3)], grid, rules("equal"), terrain);
    expect(r).toMatchObject({ difficult: 2, blocked: true });
  });
  it("matches rulerPathCost for a single run", () => {
    const terrain = [run("difficult", 0, 2)];
    expect(routeCost([at(0, 0), at(4, 0)], grid, rules("equal"), terrain)).toEqual(rulerPathCost(at(0, 0), at(4, 0), grid, rules("equal"), terrain));
  });
});
