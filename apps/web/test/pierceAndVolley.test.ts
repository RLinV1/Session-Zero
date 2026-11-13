import { describe, expect, it } from "vitest";
import { burst, type Spark } from "../src/board/fxKit";
import { pierceStep, STRIKE_SHAPES, volleyLanding } from "../src/board/fxStrikes";
import { ART_ENDS, FX_ART } from "../src/board/fxTextures";
import { SHAPE_DEFAULTS } from "../src/board/effectPresets";

describe("the arrow volley lands in a rough circle (board-attack-effects)", () => {
  it("spreads the arrows round the target, not along a line", () => {
    const n = 12;
    const points = Array.from({ length: n }, (_, i) => volleyLanding(i, n, () => 0.5));
    for (const p of points) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1);
    // Some land on every side: a fan would put them all on one line through the centre.
    const quadrants = new Set(points.map((p) => `${p.x >= 0},${p.y >= 0}`));
    expect(quadrants.size).toBe(4);
  });

  it("lands a single arrow dead centre", () => {
    expect(volleyLanding(0, 1)).toEqual({ x: 0, y: 0 });
    expect(SHAPE_DEFAULTS.arrow.count).toBe(1);
  });
});

describe("the pierce (board-attack-effects, ADR 0067)", () => {
  it("draws its blade from the painted texture, end to point", () => {
    expect(FX_ART).toContain("pierce-blade");
    const ends = ART_ENDS["pierce-blade"]!;
    expect(ends.to.x).toBeGreaterThan(ends.from.x);
  });

  it("lands each thrust of a flurry soon after the last, all within the animation", () => {
    const { duration, count } = SHAPE_DEFAULTS.pierce;
    expect(count).toBe(1);
    for (const n of [2, 3, 6, 12]) {
      const lastHit = STRIKE_SHAPES.pierce.land * duration + (n - 1) * pierceStep(n, duration);
      expect(lastHit).toBeLessThan(duration * 0.9);
      expect(pierceStep(n, duration)).toBeGreaterThan(0);
    }
  });

  it("gets the light impact's flash and rings, but no round burst to spend its sparks", () => {
    expect(STRIKE_SHAPES.pierce.impact).toBe("light");
    expect(STRIKE_SHAPES.pierce.ownSparks).toBe(true);
  });

  it("throws its exit sparks in a cone along the thrust", () => {
    const sparks: Spark[] = [];
    burst(sparks, { x: 0, y: 0 }, 40, 100, 2, [0xffffff], 0.5, 0, 0, { angle: 0, cone: 0.4 });
    for (const s of sparks) expect(Math.abs(Math.atan2(s.vy, s.vx))).toBeLessThanOrEqual(0.4 + 1e-9);
  });
});
