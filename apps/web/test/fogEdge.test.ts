import { describe, expect, it } from "vitest";
import { FOG_FEATHER_CELLS, fogDistanceField, fogEdgeAlpha, type FogDistanceField } from "../src/board/fogTexture";

/** The field's value at the sample nearest a board point. */
const at = (field: FogDistanceField, x: number, y: number) =>
  field.cells[Math.min(field.rows - 1, Math.floor(y * field.scale)) * field.cols + Math.min(field.cols - 1, Math.floor(x * field.scale))]!;

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

describe("fog distance field (flowing-fog, FR-GM-17)", () => {
  // A 400x300 board with 50 px cells and one region from (100, 100) to (300, 200).
  const field = fogDistanceField([rect(100, 100, 300, 200)], 400, 300, 50);
  // Samples are a few board pixels apart, so distances are good to about a tenth of a cell.
  const near = 0.12;

  it("measures in grid cells, positive inside and negative outside", () => {
    expect(Math.abs(at(field, 200, 150) - 1)).toBeLessThan(near);
    expect(Math.abs(at(field, 50, 150) - -1)).toBeLessThan(near);
    expect(Math.abs(at(field, 200, 250) - -1)).toBeLessThan(near);
  });

  it("is zero at the region's edge", () => {
    expect(Math.abs(at(field, 100, 150))).toBeLessThan(near);
    expect(Math.abs(at(field, 300, 150))).toBeLessThan(near);
  });

  it("measures past a corner to the corner itself", () => {
    // (40, 40) is 60 px left of and above the corner (100, 100): about 1.7 cells away.
    expect(Math.abs(at(field, 40, 40) - -Math.hypot(60, 60) / 50)).toBeLessThan(near);
  });

  it("treats overlapping regions as one", () => {
    const union = fogDistanceField([rect(100, 100, 220, 200), rect(180, 100, 300, 200)], 400, 300, 50);
    // In the overlap, and where one region's edge lies inside the other.
    expect(at(union, 200, 150)).toBeGreaterThan(0.85);
    expect(Math.abs(at(union, 200, 150) - at(field, 200, 150))).toBeLessThan(near);
  });

  it("is far outside everywhere when there is no fog", () => {
    const empty = fogDistanceField([], 400, 300, 50);
    expect(Math.max(...empty.cells)).toBeLessThan(-FOG_FEATHER_CELLS);
  });

  it("keeps the texture small on a huge map", () => {
    const big = fogDistanceField([rect(0, 0, 100, 100)], 20000, 12000, 20);
    expect(Math.max(big.cols, big.rows)).toBeLessThanOrEqual(1024);
  });
});

describe("fog edge fade (flowing-fog, FR-GM-17)", () => {
  it("is fully opaque inside a region whatever the noise", () => {
    for (const d of [0, 0.01, 1, 5]) for (const n of [0, 0.3, 0.5, 1]) expect(fogEdgeAlpha(d, n)).toBe(1);
  });

  it("fades to nothing about two cells out, whatever the noise", () => {
    for (const n of [0, 0.5, 1]) {
      expect(fogEdgeAlpha(-FOG_FEATHER_CELLS, n)).toBe(0);
      expect(fogEdgeAlpha(-FOG_FEATHER_CELLS - 1, n)).toBe(0);
    }
    expect(FOG_FEATHER_CELLS).toBe(2);
  });

  it("falls evenly with distance, so the edge has no step or ring", () => {
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      let last = 1;
      for (let d = 0; d >= -FOG_FEATHER_CELLS; d -= 0.05) {
        const a = fogEdgeAlpha(d, n);
        expect(a).toBeLessThanOrEqual(last + 1e-9);
        expect(last - a).toBeLessThan(0.1);
        last = a;
      }
    }
  });

  it("lets the noise move the fade in and out between the edge and its end", () => {
    expect(fogEdgeAlpha(-1, 1)).toBeGreaterThan(fogEdgeAlpha(-1, 0) + 0.3);
    expect(Math.abs(fogEdgeAlpha(-0.02, 0) - fogEdgeAlpha(-0.02, 1))).toBeLessThan(0.05);
  });
});
