import { describe, expect, it } from "vitest";
import { ISO_X, projectMap, projectedBounds, unprojectMap } from "../src/board/mapProjection";
import { boardCssTransform, throwLanding } from "../src/board/diceThrow";

describe("isometric map view (FR-GM-02, ADR 0048)", () => {
  it("raises geometry vertically without changing its ground position", () => {
    const floor = projectMap({ x: 300, y: 200 }, true);
    const roof = projectMap({ x: 300, y: 200, z: 140 }, true);
    expect(roof.x).toBe(floor.x);
    expect(roof.y).toBe(floor.y - 140);
  });
  it("round trips map coordinates, including outside the map while panning", () => {
    for (const isometric of [false, true]) for (const point of [{ x: 0, y: 0 }, { x: 800, y: 600 }, { x: -240, y: 1300 }]) {
      const back = unprojectMap(projectMap(point, isometric), isometric);
      expect(back.x).toBeCloseTo(point.x);
      expect(back.y).toBeCloseTo(point.y);
    }
  });

  it("fits every corner of a rectangular map, including its negative projected edge", () => {
    const bounds = projectedBounds(800, 600, true);
    expect(bounds).toEqual({ x: -600 * ISO_X, y: 0, width: 1400 * ISO_X, height: 700 });
    for (const point of [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 600 }, { x: 800, y: 600 }]) {
      const p = projectMap(point, true);
      expect(p.x).toBeGreaterThanOrEqual(bounds.x);
      expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(bounds.y);
      expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it("keeps DOM effects on the projected board plane", () => {
    expect(boardCssTransform({ scale: 2, x: 80, y: 50, isometric: true }))
      .toBe(`matrix(${ISO_X * 2},1,${-ISO_X * 2},1,80,50)`);
    expect(boardCssTransform({ scale: 2, x: 80, y: 50 })).toBe("translate(80px, 50px) scale(2)");
  });

  it("throws dice in the screen direction of a flick on the angled map", () => {
    const from = { x: 500, y: 500 };
    const to = throwLanding(from, { x: 1, y: 0 }, { scale: 1, isometric: true }, { cellSize: 70 }, { width: 1000, height: 1000 });
    const delta = projectMap({ x: to.x - from.x, y: to.y - from.y }, true);
    expect(delta.x).toBeGreaterThan(0);
    expect(delta.y).toBeCloseTo(0);
  });
});
