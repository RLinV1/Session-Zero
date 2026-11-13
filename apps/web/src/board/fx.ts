import { BlurFilter, Container, Graphics } from "pixi.js";
import type { AnimationDef, Point } from "@vtt/shared";
import { withDefaults } from "./effectPresets";
import { WHITE, burst, clamp01, easeOut, hex, mix, ring, stepSparks, type Spark } from "./fxKit";
import { SparkRenderer } from "./fxParticles";
import { RING_RADIUS, StampLayer, stamp } from "./fxTextures";
import { graphicsBudget } from "../ui/clientSettings";
import { STRIKE_SHAPES, type StrikeCtx, type StrikeShape } from "./fxStrikes";

/**
 * The one renderer for every `AnimationDef` (ADR 0038): the board and the library editor's preview
 * both play through here. Pure Pixi: it knows nothing of `BoardView`, rooms or React, only a
 * `FxHost` (where to draw and what to shake). Strikes are drawn in board
 * coordinates, scaled by the animation's `size` and the token radius, and never touches a token.
 * Each running effect owns display objects and filters; `destroy()` removes every one of them.
 */

export interface FxHost {
  /** Effects are added here: world space for strikes, screen space for a nuke. */
  layer: Container;
  /** Moved by screen shake and put back exactly afterwards (the world container). */
  shakeTarget: Container;
  /** Untransformed parent reserved for screen effects; the nuke leaves it unfiltered. */
  filterTarget: Container;
  /** The visible area, in `filterTarget` pixels. */
  screen: { width: number; height: number };
  /** Reduced motion: a static marker or tint, no travel, shake or shockwave. */
  reducedMotion: boolean;
}

/** A playing effect. `update` takes seconds since it started and returns false once it is over. */
export interface RunningFx {
  /** Static markers need one paint and a removal timer, rather than a render loop. */
  readonly animated?: boolean;
  readonly duration?: number;
  update(elapsed: number): boolean;
  /** Removes every filter and destroys every display object. Safe to call twice. */
  destroy(): void;
}

export interface StrikeFxParams {
  def: AnimationDef;
  from: Point;
  to: Point;
  /** The target token's radius, in board pixels. */
  radius: number;
}

export interface NukeFxParams {
  /** Called once, on the first frame showing impact (immediately for a still marker). */
  onImpact?: () => void;
  def: AnimationDef;
  origin: Point;
  /** Base marker size in the host layer's coordinates. */
  unit: number;
  /** Half the viewport diagonal, in the host layer's coordinates. */
  extent: number;
}

/** Seconds a reduced-motion marker stays. */
export const REDUCED_FX_S = 0.6;

// ---------- screen shake ----------

interface ShakeState {
  base: Point;
  shown: Point;
  sources: Map<object, Point>;
}
const shakes = new WeakMap<Container, ShakeState>();

/**
 * Offsets `target` by the sum of every source's offset; a null offset drops the source. When the last
 * source goes, the target is set back to its base position exactly. A pan or zoom that moves the
 * target while it shakes is kept: the base follows it.
 */
function setShake(target: Container, key: object, offset: Point | null) {
  if (target.destroyed) return;
  let state = shakes.get(target);
  if (!state) {
    if (!offset) return;
    state = { base: { x: target.position.x, y: target.position.y }, shown: { x: target.position.x, y: target.position.y }, sources: new Map() };
    shakes.set(target, state);
  }
  state.base.x += target.position.x - state.shown.x;
  state.base.y += target.position.y - state.shown.y;
  if (offset) state.sources.set(key, offset);
  else state.sources.delete(key);
  let ox = 0;
  let oy = 0;
  for (const o of state.sources.values()) {
    ox += o.x;
    oy += o.y;
  }
  if (state.sources.size === 0) {
    target.position.set(state.base.x, state.base.y);
    shakes.delete(target);
    return;
  }
  state.shown = { x: state.base.x + ox, y: state.base.y + oy };
  target.position.set(state.shown.x, state.shown.y);
}

/** The display objects and filters one effect owns, so ending it can remove them all. */
interface FxScene {
  root: Container;
  /** Drawn additively, with a blurred copy underneath for glow. */
  g: Graphics;
  /** Drawn plainly, over `g`. */
  top: Graphics;
  /** Textured sprites over `g`, additive like it (`fxTextures.ts`). */
  stamps: StampLayer;
  /** Coloured pictures with transparency, drawn plainly over everything. */
  props: StampLayer;
  dispose(): void;
}

function makeScene(host: FxHost, def: Pick<AnimationDef, "glow">, bloomed: boolean): FxScene {
  const root = new Container();
  root.eventMode = "none";
  const glowLayer = new Container();
  const g = new Graphics();
  g.blendMode = "add";
  const top = new Graphics();
  // Glow: a blurred, additive copy of `g` drawn under it. It shares `g`'s geometry, so every frame
  // drawn into `g` glows too. A blur of transparent pixels stays transparent, so unlike a bloom
  // filter it never leaves a grey box around the effect.
  let blur: BlurFilter | null = null;
  let halo: Graphics | null = null;
  if (bloomed && graphicsBudget().glow && def.glow > 0.05) {
    halo = new Graphics(g.context);
    halo.blendMode = "add";
    halo.alpha = 0.5 + def.glow * 0.5;
    blur = new BlurFilter({ strength: 4 + def.glow * 10, quality: graphicsBudget().blurQuality, resolution: 0.5 });
    halo.filters = [blur];
    glowLayer.addChild(halo);
  }
  const stamps = new StampLayer();
  const props = new StampLayer("normal");
  glowLayer.addChild(g, stamps.container);
  root.addChild(glowLayer, top, props.container);
  host.layer.addChild(root);
  let disposed = false;
  return {
    root, g, top, stamps, props,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (halo) halo.filters = null;
      blur?.destroy();
      // The halo borrows `g`'s context, so only `g` (its owner) destroys it.
      root.destroy({ children: true });
    },
  };
}

// ---------- strikes ----------

/** Plays any strike shape from `from` onto `to`. A nuke shape is drawn as a projectile. */
export function playStrike(host: FxHost, params: StrikeFxParams): RunningFx {
  const { from, to } = params;
  const def = withDefaults(params.def);
  const primary = hex(def.primary);
  const secondary = hex(def.secondary);
  const reduced = host.reducedMotion;
  const r = Math.max(8, params.radius) * def.size;
  const scene = makeScene(host, def, !reduced);
  const { g, top, stamps, props } = scene;
  const key = {};

  if (reduced) {
    // A still ring on the target, no travel and no shake.
    g.circle(to.x, to.y, r * 1.1).stroke({ width: Math.max(3, r * 0.12), color: primary, alpha: 0.9 });
    return {
      animated: false,
      duration: REDUCED_FX_S,
      update: (elapsed) => elapsed < REDUCED_FX_S,
      destroy: scene.dispose,
    };
  }

  const duration = def.duration;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
  const normal = { x: -dir.y, y: dir.x };
  const sparkCount = Math.min(def.particles, graphicsBudget().particles);
  const sparks: Spark[] = [];
  const particles = new SparkRenderer();
  scene.root.addChildAt(particles.container, 1);
  const accent = def.accent ? hex(def.accent) : mix(primary, WHITE, 0.6);
  const palette = [primary, secondary, accent];
  const shape: StrikeShape = def.shape === "nuke" ? "projectile" : def.shape;
  const spec = STRIKE_SHAPES[shape];
  const landAt = spec.land * duration;
  const impactLen = Math.max(0.1, duration - landAt);
  const spinRate = 3 + def.spin * 25;
  const gravity = def.gravity * r * 5;

  const c: StrikeCtx = {
    d: def, g, top, stamps, props, from, to, dir, normal, dist, r,
    side: Math.random() < 0.5 ? -1 : 1,
    D: duration, L: landAt, impactLen,
    primary, secondary, accent, palette,
    n: def.count, spread: def.spread, arc: def.arc, trail: def.trail, spin: def.spin, spinRate, G: gravity,
    sparks, sparkCount, landed: false,
    along: (u, off = 0) => ({ x: from.x + dx * u + normal.x * off, y: from.y + dy * u + normal.y * off }),
    emit(at, count, speed, life = 0.6, aim) {
      // Trails and impacts share one live-particle allowance, not one allowance per burst.
      const available = Math.max(0, sparkCount - sparks.length);
      burst(sparks, at, Math.min(count, available), speed, Math.max(1.5, r * 0.05), palette, life, gravity, spinRate * 0.3, aim);
    },
  };
  const drawing = spec.make(c);
  let last = 0;
  // Each play turns the impact burst its own way.
  const burstTurn = Math.random() * Math.PI;
  const flashTint = mix(secondary, WHITE, 0.6);

  /**
   * Flash, disc and rings at the target; `k` runs 0 -> 1 across the impact phase. Each is the
   * painted texture when it has loaded, else the vector circle it replaces.
   */
  const drawImpact = (k: number) => {
    const e = easeOut(k);
    const fade = 1 - k;
    const big = spec.big;
    const full = spec.impact === "full";
    if (def.flash > 0) {
      const flash = full ? { size: r * (1 + e) * big, alpha: def.flash * 0.8 * fade * fade } : { size: r * (0.8 + e * 0.6), alpha: def.flash * 0.6 * fade * fade };
      // The burst's rays reach a third of its picture: three radii across covers the flash.
      if (!stamp(stamps, "impact-burst", to, flash.size * 3, flashTint, flash.alpha * 1.4, burstTurn + k * 0.5)) {
        top.circle(to.x, to.y, flash.size).fill({ color: WHITE, alpha: flash.alpha });
      }
    }
    if (full) {
      const disc = r * (0.6 + e * 0.8) * big;
      if (!stamp(stamps, "glow", to, disc * 4, primary, fade * 0.55)) g.circle(to.x, to.y, disc).fill({ color: primary, alpha: fade * 0.5 });
    }
    const ringColors = [secondary, WHITE, accent];
    for (let i = 0; i < def.rings; i++) {
      const kk = clamp01((k - i * 0.1) / (1 - i * 0.1));
      const radius = r * (0.3 + easeOut(kk) * 1.5) * big * (full ? 1 : 0.8) * (1 + i * 0.2);
      const alpha = (1 - kk) * (0.95 - i * 0.08);
      if (!stamp(stamps, "shockwave-ring", to, radius / RING_RADIUS, ringColors[i % 3]!, alpha, burstTurn * (i + 1))) {
        ring(g, to, radius, Math.max(2, r * 0.14 * (1 - kk)), ringColors[i % 3]!, alpha);
      }
    }
  };

  return {
    update(elapsed) {
      if (elapsed >= duration) return false;
      const dt = Math.max(0, elapsed - last);
      last = elapsed;
      g.clear();
      top.clear();
      stamps.begin();
      props.begin();
      if (!c.landed && elapsed >= landAt) {
        c.landed = true;
        if (!spec.ownSparks) burst(sparks, to, Math.max(0, sparkCount - sparks.length), r * 4 * spec.big, Math.max(1.5, r * 0.06), palette, 0.9, gravity, spinRate * 0.3);
      }
      drawing.draw(elapsed);
      if (c.landed) {
        const k = clamp01((elapsed - landAt) / impactLen);
        if (spec.impact !== "none") drawImpact(k);
        drawing.after?.(k, elapsed);
      }
      stamps.end();
      props.end();
      stepSparks(sparks, dt);
      particles.draw(sparks, def.particleShape);
      // The map shakes as the strike lands (the whole page shakes only for a nuke).
      if (c.landed && def.shake > 0) {
        const k = clamp01((elapsed - landAt) / Math.min(impactLen, 0.5));
        const amp = def.shake * 16 * spec.big ** 0.5 * (1 - k) ** 1.5;
        setShake(host.shakeTarget, key, k >= 1 ? null : { x: Math.sin(elapsed * 95) * amp, y: Math.cos(elapsed * 83) * amp });
      }
      return true;
    },
    destroy() {
      setShake(host.shakeTarget, key, null);
      scene.dispose();
    },
  };
}

// The nuke uses cached sprite billows instead of full-screen filter passes.
export { playNuke } from "./nukeFx";
