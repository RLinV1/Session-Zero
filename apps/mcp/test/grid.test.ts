import { isSnapped, type GridSpec } from "@vtt/shared";
import { describe, expect, it } from "vitest";
import { boardPointForSquare, isOnMap, squareOfToken } from "../src/grid";

const grid = (cellSize: number, offsetX = 0, offsetY = 0): GridSpec => ({ cellSize, offsetX, offsetY, unitsPerCell: 5, unitLabel: "ft" });

describe("grid squares (FR-PL-08)", () => {
  const grids = [grid(70), grid(70, 13, 41), grid(69.73, 0.5, 69.2), grid(33.333), grid(50, 49.9, 0)];

  it.each(grids.flatMap((g) => [1, 2, 3, 4].map((size) => [g, size] as const)))("round-trips on %o at size %i", (g, size) => {
    for (let column = -1; column < 40; column++) {
      for (let row = -1; row < 40; row++) {
        const point = boardPointForSquare({ column, row }, size, g);
        expect(isSnapped(point, size, g)).toBe(true);
        expect(squareOfToken(point, size, g)).toEqual({ column, row });
      }
    }
  });

  it("puts odd-sized tokens on a square's center and even-sized ones on its top-left corner", () => {
    expect(boardPointForSquare({ column: 2, row: 3 }, 1, grid(70))).toEqual({ x: 175, y: 245 });
    expect(boardPointForSquare({ column: 2, row: 3 }, 3, grid(70))).toEqual({ x: 175, y: 245 });
    expect(boardPointForSquare({ column: 2, row: 3 }, 2, grid(70))).toEqual({ x: 140, y: 210 });
    expect(boardPointForSquare({ column: 0, row: 0 }, 1, grid(70, 10, 20))).toEqual({ x: 45, y: 55 });
  });

  it("knows the map's edge, and that no map has none", () => {
    const map = { url: "/uploads/m.png", width: 700, height: 350 };
    expect(isOnMap({ x: 35, y: 35 }, map)).toBe(true);
    expect(isOnMap({ x: 700, y: 350 }, map)).toBe(true);
    expect(isOnMap({ x: 701, y: 35 }, map)).toBe(false);
    expect(isOnMap({ x: 35, y: -1 }, map)).toBe(false);
    expect(isOnMap({ x: 9999, y: 9999 }, null)).toBe(true);
  });
});
