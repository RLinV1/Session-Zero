// @vitest-environment jsdom
import { Container } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANIMATION_SHAPES } from "@vtt/shared";
import { SHAPE_DEFAULTS } from "../src/board/effectPresets";
import { playStrike, type FxHost } from "../src/board/fx";
import { SparkRenderer } from "../src/board/fxParticles";
import { DEFAULT_CLIENT_SETTINGS, QUALITY, setClientSettings } from "../src/ui/clientSettings";

function host(reducedMotion: boolean): FxHost {
  return { layer: new Container(), shakeTarget: new Container(), filterTarget: new Container(), screen: { width: 800, height: 600 }, reducedMotion };
}

// jsdom has no canvas; Pixi probes for one when it builds a blur filter, and copes with none.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

const strikeShapes = ANIMATION_SHAPES.filter((s) => s !== "nuke");

afterEach(() => {
  vi.restoreAllMocks();
  setClientSettings(DEFAULT_CLIENT_SETTINGS);
});

describe("live strike particle budgets (FR-TAC-06)", () => {
  for (const quality of ["low", "balanced", "high"] as const) {
    it(`keeps overlapping trails and impacts inside the ${quality} budget`, () => {
      setClientSettings({ graphicsQuality: quality });
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      let peak = 0;
      const draw = vi.spyOn(SparkRenderer.prototype, "draw").mockImplementation((sparks) => {
        peak = Math.max(peak, sparks.length);
      });
      for (const shape of strikeShapes) {
        const def = { ...SHAPE_DEFAULTS[shape], count: 12, particles: 120, trail: 1 };
        const fx = playStrike(host(false), { def, from: { x: 0, y: 0 }, to: { x: 400, y: 200 }, radius: 24 });
        try {
          for (let t = 0; t < def.duration; t += 1 / 30) fx.update(t);
        } finally {
          fx.destroy();
        }
      }
      expect(draw).toHaveBeenCalled();
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(QUALITY[quality].particles);
    });
  }
});

describe("the map shakes as a strike lands (FR-TAC-09, ADR 0038)", () => {
  /** How far the map moves from where it was, at most, over the whole strike. */
  const furthest = (shake: number) => {
    const h = host(false);
    const def = { ...SHAPE_DEFAULTS.slash, shake };
    const fx = playStrike(h, { def, from: { x: 100, y: 300 }, to: { x: 420, y: 260 }, radius: 24 });
    let most = 0;
    for (let t = 0; t < def.duration; t += 1 / 60) {
      fx.update(t);
      most = Math.max(most, Math.hypot(h.shakeTarget.position.x, h.shakeTarget.position.y));
    }
    fx.destroy();
    return most;
  };

  it("moves the map visibly at full shake, less at half, and not at all at zero", () => {
    expect(furthest(1)).toBeGreaterThan(8);
    expect(furthest(0.5)).toBeLessThan(furthest(1));
    expect(furthest(0)).toBe(0);
  });
});

describe("every strike shape plays and cleans up (library-animations, ADR 0038)", () => {
  for (const shape of strikeShapes) {
    it(`${shape} draws every frame, ends, and leaves nothing behind`, () => {
      const h = host(false);
      h.shakeTarget.position.set(10, 20);
      const def = SHAPE_DEFAULTS[shape];
      const fx = playStrike(h, { def, from: { x: 100, y: 300 }, to: { x: 420, y: 260 }, radius: 24 });
      expect(h.layer.children).toHaveLength(1);
      let t = 0;
      let alive = true;
      while (alive && t < def.duration + 1) {
        alive = fx.update(t);
        t += 1 / 30;
      }
      expect(alive).toBe(false);
      fx.destroy();
      fx.destroy();
      expect(h.layer.children).toHaveLength(0);
      expect(h.shakeTarget.position.x).toBe(10);
      expect(h.shakeTarget.position.y).toBe(20);
    });

    it(`${shape} copes with the extremes of every setting and with no distance`, () => {
      for (const extreme of [
        { count: 1, spread: 0, arc: 0, trail: 0, spin: 0, gravity: -1, rings: 0, particles: 0 },
        { count: 12, spread: 1, arc: 1, trail: 1, spin: 1, gravity: 1, rings: 5, particles: 120 },
      ]) {
        const h = host(false);
        const fx = playStrike(h, { def: { ...SHAPE_DEFAULTS[shape], ...extreme }, from: { x: 50, y: 50 }, to: { x: 50, y: 50 }, radius: 1 });
        for (let t = 0; t < SHAPE_DEFAULTS[shape].duration; t += 1 / 20) expect(fx.update(t)).toBe(true);
        fx.destroy();
        expect(h.layer.children).toHaveLength(0);
      }
    });

    it(`${shape} is a static ring under reduced motion`, () => {
      const h = host(true);
      h.shakeTarget.position.set(5, 5);
      const fx = playStrike(h, { def: SHAPE_DEFAULTS[shape], from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, radius: 20 });
      expect(fx.update(0.1)).toBe(true);
      expect(fx.update(5)).toBe(false);
      fx.destroy();
      expect(h.layer.children).toHaveLength(0);
      expect(h.shakeTarget.position.x).toBe(5);
    });
  }

  it("reads a definition without the later fields", () => {
    const { shape, duration, primary, secondary, size, particles, glow, shake, flash } = SHAPE_DEFAULTS.volley;
    const h = host(false);
    const fx = playStrike(h, { def: { shape, duration, primary, secondary, size, particles, glow, shake, flash }, from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, radius: 20 });
    for (let t = 0; t < duration; t += 0.05) fx.update(t);
    fx.destroy();
    expect(h.layer.children).toHaveLength(0);
  });
});

describe("the pierce throws its own sparks (board-attack-effects, ADR 0067)", () => {
  it("sends its sparks out behind the target along the thrust, with no round burst first", () => {
    const seen: { vx: number; vy: number }[][] = [];
    vi.spyOn(SparkRenderer.prototype, "draw").mockImplementation((sparks) => {
      seen.push(sparks.map((s) => ({ vx: s.vx, vy: s.vy })));
    });
    const def = SHAPE_DEFAULTS.pierce;
    // Thrusting straight right, so every spark of the cone moves right.
    const fx = playStrike(host(false), { def, from: { x: 0, y: 0 }, to: { x: 400, y: 0 }, radius: 24 });
    const landed = def.duration * 0.4;
    for (let t = 0; t <= landed + 0.1; t += 1 / 60) fx.update(t);
    fx.destroy();
    const after = seen.at(-1)!;
    expect(after.length).toBeGreaterThan(5);
    for (const s of after) expect(Math.abs(Math.atan2(s.vy, s.vx))).toBeLessThan(1.2);
  });
});
