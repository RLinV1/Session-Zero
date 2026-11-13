import { describe, expect, it } from "vitest";
import { FOG_FEATHER_CELLS, fogDistanceField, fogEdgeAlpha, type FogDistanceField } from "../src/board/fogTexture";
import { fogFragment } from "../src/board/fogShader";

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

describe("fog edge fade (flowing-fog, fog-inner-fade-and-shared-dice, FR-GM-17)", () => {
  const noises = Array.from({ length: 41 }, (_, i) => i / 40);

  it("is fully opaque at and inside a region's edge whatever the noise, so it hides everything inside", () => {
    for (const d of [0, 0.01, 1, 5]) for (const n of noises) expect(fogEdgeAlpha(d, n)).toBe(1);
  });

  it("is gone a quarter cell outside, whatever the noise, so the dragged area is the hidden area", () => {
    expect(FOG_FEATHER_CELLS).toBe(0.25);
    for (const d of [-0.25, -0.3, -1, -5]) for (const n of noises) expect(fogEdgeAlpha(d, n)).toBe(0);
  });

  it("falls evenly with distance, so the edge has no step or ring", () => {
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      let last = 1;
      for (let d = 0; d >= -FOG_FEATHER_CELLS; d -= FOG_FEATHER_CELLS / 40) {
        const a = fogEdgeAlpha(d, n);
        expect(a).toBeLessThanOrEqual(last + 1e-9);
        expect(last - a).toBeLessThan(0.1);
        last = a;
      }
    }
  });

  it("lets the noise move the edge in and out, so a straight border isn't a ruled line", () => {
    const mid = -FOG_FEATHER_CELLS / 2;
    expect(fogEdgeAlpha(mid, 1)).toBeGreaterThan(fogEdgeAlpha(mid, 0) + 0.3);
    expect(Math.abs(fogEdgeAlpha(-0.003, 0) - fogEdgeAlpha(-0.003, 1))).toBeLessThan(0.05);
  });
});

describe("fog shader edge fade matches fogEdgeAlpha (fog-inner-fade-and-shared-dice)", () => {
  // Run the shader's edgeAlpha as JavaScript: its body is plain arithmetic once `float` is dropped.
  const body = /float edgeAlpha\(float d, float n\) \{([\s\S]*?)\n\}/.exec(fogFragment)![1]!.replace(/\bfloat\b/g, "const");
  const feather = Number(/const float FEATHER = ([\d.]+);/.exec(fogFragment)![1]);
  const billow = Number(/const float BILLOW = ([\d.]+);/.exec(fogFragment)![1]);
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const glsl = new Function("d", "n", "clamp", "FEATHER", "BILLOW", body) as (d: number, n: number, c: typeof clamp, f: number, b: number) => number;

  it("gives the same opacity for every distance and noise", () => {
    for (let d = -0.2; d <= 0.5; d += 0.01) for (const n of [0, 0.2, 0.5, 0.8, 1]) {
      expect(glsl(d, n, clamp, feather, billow)).toBeCloseTo(fogEdgeAlpha(d, n), 6);
    }
  });

  it("discards everything past the end of the fade", () => {
    expect(fogFragment).toContain("if (d <= -FEATHER) discard;");
  });
});
