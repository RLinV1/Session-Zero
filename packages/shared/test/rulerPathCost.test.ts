import { describe, expect, it } from "vitest";
import { effectiveTerrain, rulerPathCost, type TerrainRun } from "../src";

const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const at = (col: number, row: number) => ({ x: col * 10 + 5, y: row * 10 + 5 });
const run = (kind: "blocked" | "difficult", start: number, end = start, row = 0): TerrainRun => ({ row, start, end, kind });

describe("ruler terrain path cost (FR-TAC-03)", () => {
  it("is plain distance over Normal ground", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, "equal", [])).toEqual({ cells: 4, cost: 20, difficult: 0, blocked: false });
  });
  it("doubles each Difficult cell entered and not the origin cell", () => {
    const r = rulerPathCost(at(0, 0), at(4, 0), grid, "equal", [run("difficult", 0, 2)]);
    expect(r).toMatchObject({ cost: 30, difficult: 2, blocked: false });
  });
  it("flags a path through Blocked, wherever it is", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, "equal", [run("blocked", 2)]).blocked).toBe(true);
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, "equal", [run("blocked", 6)]).blocked).toBe(false);
  });
  it("follows the diagonal rule", () => {
    const d = [run("difficult", 1, 1, 1)];
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, "equal", []).cost).toBe(20);
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, "alternating", []).cost).toBe(30);
    expect(rulerPathCost(at(0, 0), at(4, 4), grid, "euclidean", []).cost).toBeCloseTo(20 * Math.SQRT2, 5);
    expect(rulerPathCost(at(0, 0), at(2, 2), grid, "equal", d)).toMatchObject({ cost: 15, difficult: 1 });
  });
  it("counts layered Difficult once and lets Blocked win via effective terrain", () => {
    const eff = effectiveTerrain({ base: [run("difficult", 1)], effects: [{ id: "e", name: "E", runs: [run("difficult", 1), run("blocked", 2)] }] });
    const r = rulerPathCost(at(0, 0), at(3, 0), grid, "equal", eff);
    expect(r).toMatchObject({ cost: 20, difficult: 1, blocked: true });
  });
  it("sees nothing in cells the viewer's filtered runs omit", () => {
    expect(rulerPathCost(at(0, 0), at(4, 0), grid, "equal", [])).toMatchObject({ difficult: 0, blocked: false });
  });
});
