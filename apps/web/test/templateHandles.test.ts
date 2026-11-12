import { describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { defaultAreaSize, editedGeometry, templateHandles, type EditableArea } from "../src/board/tools";

// 70 px cells, 5 ft each.
const grid = DEFAULT_GRID;
const cell = grid.cellSize;
const near = (p: { x: number; y: number }) => ({ x: expect.closeTo(p.x, 6), y: expect.closeTo(p.y, 6) });

describe("handles on a placed area (FR-TAC-06, ADR 0058)", () => {
  const circle: EditableArea = { shape: "circle", origin: { x: 700, y: 700 }, toward: { x: 701, y: 700 }, size: 10 };
  const cone: EditableArea = { shape: "cone", origin: { x: 700, y: 700 }, toward: { x: 700, y: 0 }, size: 15 };
  const line: EditableArea = { shape: "line", origin: { x: 700, y: 700 }, toward: { x: 1400, y: 700 }, size: 30 };
  const box: EditableArea = { shape: "box", origin: { x: 700, y: 700 }, toward: { x: 1400, y: 700 }, size: 10 };

  it("puts the aim handle on the rim, the far end or the front corner, and width handles on a line's long edges", () => {
    expect(templateHandles(circle, grid)).toEqual([{ kind: "aim", at: near({ x: 700 + 2 * cell, y: 700 }) }]);
    expect(templateHandles(cone, grid)).toEqual([{ kind: "aim", at: near({ x: 700, y: 700 - 3 * cell }) }]);
    expect(templateHandles(box, grid)).toEqual([{ kind: "aim", at: near({ x: 700 + cell, y: 700 + cell }) }]);
    expect(templateHandles(line, grid)).toEqual([
      { kind: "aim", at: near({ x: 700 + 6 * cell, y: 700 }) },
      { kind: "width", at: near({ x: 700 + 3 * cell, y: 700 - cell / 2 }) },
      { kind: "width", at: near({ x: 700 + 3 * cell, y: 700 + cell / 2 }) },
    ]);
  });

  it("grows a circle from its rim and keeps its centre", () => {
    const grown = editedGeometry(circle, { kind: "aim" }, { x: 700 + 4 * cell, y: 700 }, grid, false);
    expect(grown).toMatchObject({ origin: circle.origin, toward: circle.toward, size: 20 });
  });

  it("lengthens a cone and turns it to face the tip handle", () => {
    const east = { x: 700 + 6 * cell, y: 700 };
    expect(editedGeometry(cone, { kind: "aim" }, east, grid, false)).toEqual({ origin: cone.origin, toward: east, size: 30 });
  });

  it("turns a square around its centre from its corner, keeping its side", () => {
    // The corner of a 10 ft square is √2 cells from its centre. Dragged straight below it, the square faces 45° down-right.
    const below = { x: 700, y: 700 + Math.SQRT2 * cell };
    const turned = editedGeometry(box, { kind: "aim" }, below, grid, false);
    expect(turned.size).toBe(10);
    expect(turned.origin).toEqual(box.origin);
    const facing = Math.atan2(turned.toward.y - 700, turned.toward.x - 700);
    expect(facing).toBeCloseTo(Math.PI / 4, 6);
  });

  it("widens a line to twice the pointer's distance from its centre line, within 1 to 10 cells", () => {
    expect(editedGeometry(line, { kind: "width" }, { x: 900, y: 700 + 1.5 * cell }, grid, false)).toMatchObject({ width: 15, size: 30, origin: line.origin, toward: line.toward });
    expect(editedGeometry(line, { kind: "width" }, { x: 900, y: 700 - 8 * cell }, grid, false).width).toBe(50);
    expect(editedGeometry(line, { kind: "width" }, { x: 900, y: 700 + 2 }, grid, true).width).toBe(5);
  });

  it("moves an area by its body, snapped to half cells, keeping its facing; Alt places it freely", () => {
    const moved = editedGeometry(cone, { kind: "body", grab: { x: 700, y: 650 } }, { x: 700 + 2 * cell + 10, y: 650 + cell - 5 }, grid, false);
    expect(moved).toEqual({ origin: { x: 700 + 2 * cell, y: 700 + cell }, toward: { x: 700 + 2 * cell, y: cell }, size: 15 });
    const free = editedGeometry(cone, { kind: "body", grab: { x: 700, y: 650 } }, { x: 713, y: 657 }, grid, true);
    expect(free.origin).toEqual({ x: 713, y: 707 });
  });

  it("never makes an area smaller than one cell without Alt", () => {
    expect(editedGeometry(circle, { kind: "aim" }, { x: 702, y: 700 }, grid, false).size).toBe(5);
    expect(editedGeometry(box, { kind: "aim" }, { x: 702, y: 701 }, grid, false).size).toBe(5);
  });

  it("places a clicked area 2 cells in size, in the room's unit", () => {
    expect(defaultAreaSize(grid)).toBe(10);
    expect(defaultAreaSize({ ...grid, unitsPerCell: 1.5, unitLabel: "m" })).toBe(3);
  });
});
