import { describe, expect, it } from "vitest";
import type { FogRegion, Point } from "@vtt/shared";
import { AREA_MASK_MAX_PX, paintVisibleRegion, visibleRegionPlan, type MaskContext } from "../src/board/areaMask";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const fogRect = (id: string, x0: number, y0: number, x1: number, y1: number): FogRegion => ({ id, shape: "rect", points: rect(x0, y0, x1, y1) });

/**
 * A recording 2D context that rasterises onto a coarse grid of board points, so a test can ask
 * whether a point ends up opaque: filled shapes set it, destination-out shapes clear it.
 */
function raster(width: number, height: number, step = 10) {
  const opaque = new Set<string>();
  let path: Point[] = [];
  let scale = 1;
  const inside = (p: Point, poly: Point[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const each = (f: (p: Point, key: string) => void) => {
    for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) f({ x, y }, `${x},${y}`);
  };
  const ctx: MaskContext = {
    fillStyle: "", globalCompositeOperation: "source-over",
    scale: (s: number) => { scale = s; },
    fillRect: (_x: number, _y: number, w: number, h: number) => each((p, k) => { if (p.x <= w && p.y <= h) opaque.add(k); }),
    beginPath: () => { path = []; },
    moveTo: (x: number, y: number) => { path.push({ x, y }); },
    lineTo: (x: number, y: number) => { path.push({ x, y }); },
    closePath: () => {},
    fill: () => {
      const shape = path;
      each((p, k) => {
        if (!inside(p, shape)) return;
        if (ctx.globalCompositeOperation === "destination-out") opaque.delete(k);
        else opaque.add(k);
      });
    },
  } as unknown as MaskContext;
  const seen = (x: number, y: number) => opaque.has(`${x},${y}`);
  return { ctx, seen, scale: () => scale };
}

describe("the visible-region mask for areas (FR-GM-17, ADR 0059)", () => {
  it("is opaque everywhere with no sight limit and no fog", () => {
    const r = raster(200, 200);
    paintVisibleRegion(r.ctx, visibleRegionPlan({}, null, 200, 200));
    expect(r.seen(15, 15) && r.seen(185, 185)).toBe(true);
  });

  it("is clear under fog, even where fog regions overlap", () => {
    const r = raster(200, 200);
    paintVisibleRegion(r.ctx, visibleRegionPlan({ a: fogRect("a", 0, 0, 100, 100), b: fogRect("b", 50, 50, 150, 150) }, null, 200, 200));
    expect(r.seen(25, 25)).toBe(false);
    expect(r.seen(75, 75)).toBe(false);
    expect(r.seen(125, 125)).toBe(false);
    expect(r.seen(185, 15)).toBe(true);
  });

  it("is opaque only inside sight, and clear where fog lies inside sight", () => {
    const r = raster(200, 200);
    paintVisibleRegion(r.ctx, visibleRegionPlan({ f: fogRect("f", 0, 0, 50, 50) }, [rect(0, 0, 100, 100)], 200, 200));
    expect(r.seen(75, 75)).toBe(true);
    expect(r.seen(25, 25)).toBe(false);
    expect(r.seen(155, 155)).toBe(false);
  });

  it("is clear everywhere for an empty sight", () => {
    const r = raster(100, 100);
    paintVisibleRegion(r.ctx, visibleRegionPlan({}, [], 100, 100));
    expect(r.seen(55, 55)).toBe(false);
  });

  it("caps the canvas at 2048 px on its longer side", () => {
    const plan = visibleRegionPlan({}, null, 6000, 3000);
    expect(plan.width).toBe(AREA_MASK_MAX_PX);
    expect(plan.height).toBe(1024);
    expect(plan.scale).toBeCloseTo(AREA_MASK_MAX_PX / 6000);
    expect(visibleRegionPlan({}, null, 800, 600).scale).toBe(1);
  });
});
