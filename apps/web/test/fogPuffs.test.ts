import { describe, expect, it } from "vitest";
import { FOG_FEATHER_CELLS } from "../src/board/fogTexture";
import { PUFF_REACH, WISP_ANCHOR, layoutFogPuffs, puffPose, type FogPuff } from "../src/board/fogPuffs";

const CELL = 50;
const BOARD = { width: 1000, height: 800 };
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];
/** How far a point lies outside a rectangle, in cells (0 inside). */
const outside = (r: [number, number, number, number], x: number, y: number) =>
  Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3])) / CELL;

/** The farthest point a puff or wisp reaches at a pose: a puff's rim, a wisp's thin tip. */
function reach(p: FogPuff, pose: ReturnType<typeof puffPose>): { x: number; y: number; radius: number } {
  if (p.kind === "puff") return { x: pose.x, y: pose.y, radius: PUFF_REACH * p.size * pose.scale };
  const length = p.size * pose.scale * (1 - WISP_ANCHOR);
  return { x: pose.x + Math.cos(pose.rotation) * length, y: pose.y + Math.sin(pose.rotation) * length, radius: 0 };
}

describe("fog puffs and wisps (flowing-fog, FR-GM-17)", () => {
  const box: [number, number, number, number] = [300, 200, 700, 600];
  const puffs = layoutFogPuffs([rect(...box)], BOARD, CELL, 1000);

  it("lays out the same particles for the same fog", () => {
    expect(layoutFogPuffs([rect(...box)], BOARD, CELL, 1000)).toEqual(puffs);
  });

  it("covers the body with puffs and the border with puffs and outward wisps", () => {
    const body = puffs.filter((p) => p.kind === "puff" && outside([box[0] + CELL, box[1] + CELL, box[2] - CELL, box[3] - CELL], p.x, p.y) === 0);
    const wisps = puffs.filter((p) => p.kind === "wisp");
    expect(body.length).toBeGreaterThan(5);
    expect(wisps.length).toBeGreaterThan(8);
    for (const w of wisps) {
      // Each wisp's thin end points away from the region.
      const tip = { x: w.x + Math.cos(w.angle) * CELL, y: w.y + Math.sin(w.angle) * CELL };
      expect(outside(box, tip.x, tip.y)).toBeGreaterThan(outside(box, w.x, w.y));
    }
  });

  it("never reaches past the border's fade, at any moment", () => {
    for (const p of puffs) {
      for (let t = 0; t < 40; t += 0.37) {
        const r = reach(p, puffPose(p, t));
        expect(outside(box, r.x, r.y) + r.radius / CELL).toBeLessThanOrEqual(FOG_FEATHER_CELLS + 0.05);
      }
    }
  });

  it("keeps every puff on the board, with no clip to cut it off there", () => {
    const corner = layoutFogPuffs([rect(0, 0, 400, 300), rect(700, 500, 1000, 800)], BOARD, CELL, 1000);
    const puffs = corner.filter((p) => p.kind === "puff");
    expect(puffs.length).toBeGreaterThan(10);
    for (const p of puffs) {
      for (let t = 0; t < 30; t += 0.9) {
        const r = reach(p, puffPose(p, t));
        expect(r.x - r.radius).toBeGreaterThanOrEqual(-0.5);
        expect(r.y - r.radius).toBeGreaterThanOrEqual(-0.5);
        expect(r.x + r.radius).toBeLessThanOrEqual(BOARD.width + 0.5);
        expect(r.y + r.radius).toBeLessThanOrEqual(BOARD.height + 0.5);
      }
    }
  });

  it("stays on the board where a region meets the board's edge", () => {
    const corner = layoutFogPuffs([rect(0, 0, 400, 300)], BOARD, CELL, 1000);
    expect(corner.some((p) => p.kind === "wisp")).toBe(true);
    for (const p of corner.filter((q) => q.kind === "wisp")) {
      for (let t = 0; t < 30; t += 0.9) {
        const r = reach(p, puffPose(p, t));
        expect(r.x >= -1 && r.y >= -1).toBe(true);
      }
      // Only the edges facing the board (right and bottom) get wisps; none point off its border.
      expect(Math.cos(p.angle) > 0.5 || Math.sin(p.angle) > 0.5).toBe(true);
    }
  });

  it("keeps to the particle budget on a big fogged map", () => {
    const huge = layoutFogPuffs([rect(0, 0, 8000, 6000)], { width: 8000, height: 6000 }, 40, 300);
    expect(huge.length).toBeLessThanOrEqual(300);
    expect(huge.length).toBeGreaterThan(150);
  });

  it("lays out nothing without fog", () => {
    expect(layoutFogPuffs([], BOARD, CELL, 1000)).toEqual([]);
  });

  it("fades out before moving to a new seat, so nothing jumps in view", () => {
    for (const p of puffs.slice(0, 40)) {
      let last = puffPose(p, 0);
      for (let t = 0.02; t < 40; t += 0.02) {
        const pose = puffPose(p, t);
        const moved = Math.hypot(pose.x - last.x, pose.y - last.y);
        if (moved > CELL * 0.05) expect(Math.max(pose.alpha, last.alpha)).toBeLessThan(0.02);
        expect(Math.abs(pose.alpha - last.alpha)).toBeLessThan(0.02);
        last = pose;
      }
    }
  });

  it("changes over time: alpha rises and falls, puffs drift", () => {
    const p = puffs.find((q) => q.kind === "puff")!;
    const alphas = Array.from({ length: 200 }, (_, i) => puffPose(p, i * 0.1).alpha);
    expect(Math.max(...alphas)).toBeGreaterThan(p.peak * 0.9);
    expect(Math.min(...alphas)).toBeLessThan(p.peak * 0.1);
    const a = puffPose(p, 1), b = puffPose(p, 3);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
  });
});
