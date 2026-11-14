import { describe, expect, it } from "vitest";
import {
  cellAt, ClientMessage, DEFAULT_GRID, footprintsOverlap, GridSpec, LibraryPatchRequest, normalizeGridOffsets, normalizeLegacyGridForBoard, snapTokenCenter, type GridSpec as GridSpecType,
} from "../src";

const grid: GridSpecType = { cellSize: 50, offsetX: 10, offsetY: 20, unitsPerCell: 5, unitLabel: "ft" };

describe("grid geometry", () => {
  it("rejects noncanonical offsets at shared command and library boundaries", () => {
    const valid = { ...DEFAULT_GRID, offsetX: DEFAULT_GRID.cellSize - 0.01 };
    expect(GridSpec.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...DEFAULT_GRID, offsetX: DEFAULT_GRID.cellSize },
      { ...DEFAULT_GRID, offsetY: DEFAULT_GRID.cellSize + 1 },
    ]) {
      expect(GridSpec.safeParse(invalid).success).toBe(false);
      expect(ClientMessage.safeParse({
        type: "command", clientCommandId: "c1", command: { type: "scene.setGrid", grid: invalid },
      }).success).toBe(false);
      expect(ClientMessage.safeParse({
        type: "command", clientCommandId: "c2", command: {
          type: "scene.setMap", map: { url: "/uploads/map.png", width: 500, height: 500 }, grid: invalid,
        },
      }).success).toBe(false);
      expect(LibraryPatchRequest.safeParse({ grid: invalid }).success).toBe(false);
    }
  });

  it("normalizes legacy library offsets before placing their map", () => {
    const legacy = { ...DEFAULT_GRID, offsetX: 2 * DEFAULT_GRID.cellSize, offsetY: DEFAULT_GRID.cellSize + 12, lineColor: "#abcdef" };
    const normalized = normalizeGridOffsets(legacy);

    expect(normalized).toEqual({ ...legacy, offsetX: 0, offsetY: 12 });
    expect(legacy.offsetX).toBe(140);
    expect(ClientMessage.safeParse({
      type: "command", clientCommandId: "c3", command: {
        type: "scene.setMap", map: { url: "/uploads/map.png", width: 500, height: 500 }, grid: normalized,
      },
    }).success).toBe(true);
  });

  it("preserves legacy alignment when increasing cell size for a large map (FR-GM-04)", () => {
    const map = { url: "/uploads/large.png", width: 40_000, height: 40_000 };
    const legacy = { ...DEFAULT_GRID, cellSize: 1, offsetX: 2, offsetY: 1.5 };
    const normalized = normalizeLegacyGridForBoard(legacy, map);

    expect(normalized).toMatchObject({ cellSize: 1.61, offsetX: 0, offsetY: 0.5 });
    expect(ClientMessage.safeParse({
      type: "command", clientCommandId: "c4", command: { type: "scene.setMap", map, grid: normalized },
    }).success).toBe(true);
  });

  it("finds the containing cell, respecting offset", () => {
    expect(cellAt({ x: 10, y: 20 }, grid)).toEqual({ col: 0, row: 0 });
    expect(cellAt({ x: 9, y: 19 }, grid)).toEqual({ col: -1, row: -1 });
    expect(cellAt({ x: 60, y: 70 }, grid)).toEqual({ col: 1, row: 1 });
  });

  it("snaps odd-sized tokens to cell centers", () => {
    expect(snapTokenCenter({ x: 44, y: 51 }, 1, grid)).toEqual({ x: 35, y: 45 });
    expect(snapTokenCenter({ x: 61, y: 71 }, 1, grid)).toEqual({ x: 85, y: 95 });
  });

  it("snaps even-sized tokens to grid intersections", () => {
    expect(snapTokenCenter({ x: 66, y: 64 }, 2, grid)).toEqual({ x: 60, y: 70 });
  });
});

describe("footprint overlap on fractional grids (token-no-stacking)", () => {
  it("treats squares that only share an edge as not overlapping, despite float rounding", () => {
    const grid = { ...DEFAULT_GRID, cellSize: 70.3, offsetX: 54, offsetY: 43 };
    const at = (col: number, row: number) => ({ x: grid.offsetX + grid.cellSize * (col + 0.5), y: grid.offsetY + grid.cellSize * (row + 0.5) });
    for (let col = 0; col < 30; col++) {
      expect(footprintsOverlap({ position: at(col, 13), size: 1 }, { position: at(col + 1, 13), size: 1 }, grid)).toBe(false);
      expect(footprintsOverlap({ position: at(col, 13), size: 1 }, { position: at(col, 13), size: 1 }, grid)).toBe(true);
    }
  });
});
