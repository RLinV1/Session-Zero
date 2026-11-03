// @vitest-environment jsdom
import { Container, Graphics } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { playNuke, type FxHost } from "../src/board/fx";
import { NUKE_DROP_SHARE, NUKE_FALL_SHARE, nukeLayout } from "../src/board/fxBudget";
import { NUKE_PRESET } from "../src/board/effectPresets";

vi.hoisted(() => { HTMLCanvasElement.prototype.getContext = () => null; });

function host(reducedMotion = false): FxHost {
  return { layer: new Container(), shakeTarget: new Container(), filterTarget: new Container(), screen: { width: 1200, height: 800 }, reducedMotion };
}

describe("nuke fire and render budget (FR-TAC-06, ADR 0038)", () => {
  it("reports impact only on the first frame after the falling bomb lands", () => {
    const onImpact = vi.fn();
    const fx = playNuke(host(), { def: NUKE_PRESET, origin: { x: 600, y: 400 }, unit: 60, extent: 720, onImpact });
    const impact = NUKE_PRESET.duration * NUKE_DROP_SHARE;
    fx.update(impact - 0.04);
    expect(onImpact).not.toHaveBeenCalled();
    fx.update(impact + 0.01);
    expect(onImpact).toHaveBeenCalledTimes(1);
    fx.update(impact + 0.1);
    expect(onImpact).toHaveBeenCalledTimes(1);
    fx.destroy();
  });
  it("holds the bomb above the screen through the siren, then drops it in 0.88 s", () => {
    const h = host();
    const fx = playNuke(h, { def: NUKE_PRESET, origin: { x: 600, y: 400 }, unit: 60, extent: 720 });
    const bomb = (h.layer.children[0] as Container).children.find((c) => c.label === "nuke-bomb")!;
    const impact = NUKE_PRESET.duration * NUKE_DROP_SHARE;
    const fall = NUKE_PRESET.duration * NUKE_FALL_SHARE;
    expect(fall).toBeCloseTo(0.88, 2);
    fx.update(0.1);
    const waiting = bomb.position.y;
    expect(waiting).toBeLessThan(0);
    fx.update(impact - fall - 0.05);
    expect(bomb.position.y).toBe(waiting);
    fx.update(impact - fall / 2);
    expect(bomb.position.y).toBeGreaterThan(waiting);
    expect(bomb.position.y).toBeLessThan(400);
    fx.update(impact - 0.04);
    expect(bomb.position.y).toBeGreaterThan(300);
    fx.destroy();
  });

  it("keeps the mushroom cap inside wide and narrow viewports", () => {
    for (const [width, height] of [[1600, 900], [390, 844], [800, 300]]) {
      for (const size of [0.25, 3, 6]) {
        const layout = nukeLayout(width!, height!, size);
        expect(layout.origin).toEqual({ x: width! / 2, y: height! / 2 });
        expect(layout.origin.y + layout.baseDrop - layout.cloudHeight - layout.capWidth * 0.22).toBeGreaterThan(0);
        expect(layout.capWidth).toBeLessThan(width!);
        if (size === 3) expect(layout.capWidth).toBeGreaterThan(Math.min(width! * 0.65, height! * 0.9));
        if (width! > height! && size === 3) expect(layout.cloudHeight).toBeGreaterThan(height! * 0.36);
      }
    }
  });

  it("does not filter the map, caps billows, throttles drawing, and releases everything", () => {
    const h = host();
    const existingFilterArea = h.filterTarget.filterArea;
    const fx = playNuke(h, { def: NUKE_PRESET, origin: { x: 600, y: 400 }, unit: 60, extent: 720 });
    const root = h.layer.children[0] as Container;
    expect((root.children.find(c => c.label === "nuke-cloud") as Container).children.length).toBeLessThanOrEqual(52);
    expect((root.children.find(c => c.label === "nuke-surge") as Container).children.length).toBe(24);
    const clear = vi.spyOn(root.children.find(c => c.label === "nuke-waves") as Graphics, "clear");
    fx.update(1);
    fx.update(1.005);
    expect(clear).toHaveBeenCalledTimes(1);
    for (let t = 1.04; t < NUKE_PRESET.duration; t += 1 / 30) expect(fx.update(t)).toBe(true);
    expect(fx.update(NUKE_PRESET.duration)).toBe(false);
    expect(h.filterTarget.filters).toBeFalsy();
    expect(h.filterTarget.filterArea).toBe(existingFilterArea);
    expect(h.shakeTarget.position.x).toBe(0);
    fx.destroy();
    fx.destroy();
    expect(h.layer.children).toHaveLength(0);
    expect(fx.update(0)).toBe(false);
  });

  it("uses only a static marker under reduced motion", () => {
    const h = host(true);
    const fx = playNuke(h, { def: NUKE_PRESET, origin: { x: 600, y: 400 }, unit: 60, extent: 720 });
    expect((h.layer.children[0] as Container).children).toHaveLength(1);
    expect(fx.animated).toBe(false);
    expect(fx.duration).toBe(0.8);
    expect(fx.update(0.2)).toBe(true);
    expect(fx.update(1)).toBe(false);
    fx.destroy();
    expect(h.layer.children).toHaveLength(0);
  });
});
