import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec, type MapImage } from "@vtt/shared";
import { cellInMap, extendStroke, MAX_STROKE_CELLS, startStroke, strokePaint, strokeRuns } from "../src/board/terrainStroke";

const map: MapImage = { url: "/uploads/map.png", width: 700, height: 350 };
const grid: GridSpec = DEFAULT_GRID; // 70 px cells: 10 columns, 5 rows
const context = { boardEpoch: 0, revision: 0 };

describe("terrain strokes shared by the board and the map editor (FR-TAC-02)", () => {
  it("brushes a straight line of cells from the last cell", () => {
    const stroke = startStroke({ col: 0, row: 0 }, "difficult", "base", context);
    extendStroke(stroke, { col: 0, row: 0 }, { shape: "brush", paint: "difficult", grid, map });
    extendStroke(stroke, { col: 3, row: 0 }, { shape: "brush", paint: "difficult", grid, map });
    expect(strokeRuns(stroke)).toEqual([{ row: 0, start: 0, end: 3, kind: "difficult" }]);
    expect(strokePaint(stroke)).toEqual([{ row: 0, start: 0, end: 3, kind: "difficult" }]);
  });

  it("fills a rectangle from the first cell and refills as it moves", () => {
    const stroke = startStroke({ col: 1, row: 1 }, "blocked", "base", context);
    extendStroke(stroke, { col: 4, row: 4 }, { shape: "rect", paint: "blocked", grid, map });
    extendStroke(stroke, { col: 2, row: 2 }, { shape: "rect", paint: "blocked", grid, map });
    expect(strokeRuns(stroke)).toEqual([
      { row: 1, start: 1, end: 2, kind: "blocked" },
      { row: 2, start: 1, end: 2, kind: "blocked" },
    ]);
  });

  it("erases with null kinds", () => {
    const stroke = startStroke({ col: 0, row: 0 }, null, "layer-1", context);
    extendStroke(stroke, { col: 1, row: 0 }, { shape: "rect", paint: null, grid, map });
    expect(stroke.erase).toBe(true);
    expect(strokePaint(stroke)).toEqual([{ row: 0, start: 0, end: 1, kind: null }]);
  });

  it("paints only cells on the map", () => {
    expect(cellInMap(9, 4, grid, map)).toBe(true);
    expect(cellInMap(10, 0, grid, map)).toBe(false);
    expect(cellInMap(0, -1, grid, map)).toBe(false);
    const stroke = startStroke({ col: 8, row: 3 }, "difficult", "base", context);
    extendStroke(stroke, { col: 12, row: 7 }, { shape: "rect", paint: "difficult", grid, map });
    expect(stroke.cells.size).toBe(4);
  });

  it("refuses a rectangle over the cap and sends nothing for an oversized stroke", () => {
    const big: MapImage = { ...map, width: 70 * 200, height: 70 * 200 };
    const stroke = startStroke({ col: 0, row: 0 }, "difficult", "base", context);
    expect(extendStroke(stroke, { col: 199, row: 199 }, { shape: "rect", paint: "difficult", grid, map: big })).toBe("rectTooBig");
    expect(stroke.cells.size).toBe(0);
    for (let i = 0; i <= MAX_STROKE_CELLS; i++) stroke.cells.set(`x:${i}`, "difficult");
    expect(strokePaint(stroke)).toEqual([]);
  });
});
