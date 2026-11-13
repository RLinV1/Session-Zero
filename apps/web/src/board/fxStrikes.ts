import type { Graphics } from "pixi.js";
import type { AnimationShape, Point } from "@vtt/shared";
import type { ResolvedAnimation } from "./effectPresets";
import { graphicsBudget } from "../ui/clientSettings";
import {
  WHITE, arcPoints, blade, clamp01, easeIn, easeOut, lerp, lerpPoint, lightning, mix, orb, polyline, ring, streak, type BurstAim, type Spark,
} from "./fxKit";
import { ART_ENDS, DEBRIS, PIERCE_BLADE_ASPECT, HOLY_PILLAR, HOLY_SIGIL_RADIUS, POISON_DROP, POISON_VIAL, RING_RADIUS, SKULL_WISP, TNT, TORNADO_TIP, arc, fxTexture, oval, span, stamp, type StampLayer } from "./fxTextures";

/**
 * The look of every strike shape (ADR 0038). `fx.ts` owns the scene, the clock, the landing burst
 * and the shake; each shape here only draws one frame into `c.g` (additive, glows), `c.stamps`
 * (painted textures, additive), `c.top` (plain, over it) and `c.props` (coloured pictures, over
 * everything) and emits sparks. Every setting of the
 * definition reaches the drawing through the context: count, spread, arc, trail, spin, gravity
 * (via `c.G`), rings, accent and the spark look. A texture that has not loaded is drawn as the
 * vector look it replaces.
 */

export type StrikeShape = Exclude<AnimationShape, "nuke">;

/** Everything a shape needs to draw a frame. Positions are board pixels. */
export interface StrikeCtx {
  d: ResolvedAnimation;
  g: Graphics;
  top: Graphics;
  stamps: StampLayer;
  props: StampLayer;
  from: Point;
  to: Point;
  /** Unit vector from attacker to target, and its left normal. */
  dir: Point;
  normal: Point;
  /** -1 or 1: which way arcs bow, chosen at random per play. */
  side: number;
  dist: number;
  /** Target radius times the animation's size. */
  r: number;
  /** Duration, landing time and the seconds after landing, all in seconds. */
  D: number;
  L: number;
  impactLen: number;
  primary: number;
  secondary: number;
  accent: number;
  palette: number[];
  n: number;
  spread: number;
  arc: number;
  trail: number;
  spin: number;
  /** Radians per second for anything that turns. */
  spinRate: number;
  /** Spark gravity in pixels per second squared (positive falls, negative rises). */
  G: number;
  sparks: Spark[];
  sparkCount: number;
  landed: boolean;
  /** A point on the line from attacker to target, `off` to the side. */
  along(u: number, off?: number): Point;
  /** Throws `count` sparks from `at`, if the animation has any particles; all round, or within `aim`'s cone. */
  emit(at: Point, count: number, speed: number, life?: number, aim?: BurstAim): void;
}

interface ShapeDraw {
  /** Called every frame, before and after the landing. */
  draw(e: number): void;
  /** Called every frame after the landing; `k` runs 0 to 1 over the impact. */
  after?(k: number, e: number): void;
}

export interface ShapeSpec {
  /** When the strike lands, as a share of the duration. */
  land: number;
  /** How big the impact is against the target token. */
  big: number;
  /** "full": flash, disc and rings. "light": flash and rings. "none": the shape draws all of it. */
  impact: "full" | "light" | "none";
  /**
   * The shape throws all of its own sparks: no round burst at the target as it lands, which would
   * otherwise spend the whole spark allowance before the shape's own burst (the pierce's cone).
   */
  ownSparks?: boolean;
  make(c: StrikeCtx): ShapeDraw;
}

const TAU = Math.PI * 2;
const rnd = Math.random;

/** A dot circling `at`, for shapes that spin. */
function satellites(c: StrikeCtx, at: Point, rad: number, e: number, count: number, size: number) {
  if (c.spin < 0.05) return;
  for (let i = 0; i < count; i++) {
    const a = e * c.spinRate + (i / count) * TAU;
    c.g.circle(at.x + Math.cos(a) * rad, at.y + Math.sin(a) * rad, size).fill({ color: c.palette[i % c.palette.length]!, alpha: 0.9 });
  }
}


/** `orb` painted with the glow texture: a wide halo, a coloured body and a white-hot core. */
function glowOrb(c: StrikeCtx, at: Point, radius: number, primary: number, secondary: number, alpha = 1) {
  if (!stamp(c.stamps, "glow", at, radius * 7, secondary, alpha * 0.5)) return orb(c.g, at, radius, primary, secondary, alpha);
  stamp(c.stamps, "glow", at, radius * 4.4, primary, alpha);
  stamp(c.stamps, "glow", at, radius * 2.2, WHITE, alpha);
}

/**
 * A crackling orb of arcane energy (the bolt's head and its charge), turned and mirrored at random
 * every frame so its tendrils flicker; `glowOrb` until the picture loads.
 */
function arcaneOrb(c: StrikeCtx, at: Point, radius: number, alpha = 1) {
  if (!stamp(c.stamps, "glow", at, radius * 7, c.secondary, alpha * 0.4)) return glowOrb(c, at, radius, c.primary, c.secondary, alpha);
  const size = radius * 5.5;
  if (!oval(c.stamps, "arcane-orb", at, size, rnd() < 0.5 ? size : -size, mix(c.primary, WHITE, 0.25), alpha, rnd() * TAU)) {
    stamp(c.stamps, "glow", at, radius * 4.4, c.primary, alpha);
    stamp(c.stamps, "glow", at, radius * 2.2, WHITE, alpha);
  }
}

/** The arrow picture, `c.r * 1.8` long, its tip on `tip`, pointing the way `from` -> `tip` goes; false until it loads. */
function arrowArt(c: StrikeCtx, from: Point, tip: Point, alpha: number): boolean {
  const ends = ART_ENDS.arrow!;
  const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const len = c.r * 1.8;
  const tail = { x: tip.x - ((tip.x - from.x) / d) * len, y: tip.y - ((tip.y - from.y) / d) * len };
  // As tall as it is wide, so the picture keeps its proportions.
  return span(c.stamps, "arrow", tail, tip, len / (ends.to.x - ends.from.x), mix(c.primary, WHITE, 0.35), alpha);
}

/** A smoke puff's billows reach 0.4 of its picture: this many radii across covers a cloud. */
const PUFF = 2.5;
/** The fire billow's flames reach 0.45 of its picture. */
const FIRE = 2.2;
/**
 * The shadow wraith: its hood is about half its picture wide, so this many target radii across
 * makes the hood a token wide. Its face sits at `WRAITH_FACE`, its eyes `WRAITH_EYES` from it.
 */
const WRAITH_SIZE = 2.6;
const WRAITH_FACE = { x: 0.5, y: 0.38 };
const WRAITH_EYES = { x: 0.05, y: -0.08 };

/** `ring` painted with the shockwave texture: hazier, and turned by `turn`. */
function glowRing(c: StrikeCtx, at: Point, radius: number, width: number, color: number, alpha: number, turn = 0) {
  if (!stamp(c.stamps, "shockwave-ring", at, radius / RING_RADIUS, color, alpha, turn)) ring(c.g, at, radius, width, color, alpha);
}

/**
 * `blade` painted as a dagger. A blade runs about 1.45 lengths and the dagger 0.92 of its picture,
 * but the dagger is slimmer, so it is drawn half as long again to read as well.
 */
function daggerBlade(c: StrikeCtx, at: Point, angle: number, len: number, wid: number, color: number, alpha: number) {
  if (!stamp(c.stamps, "dagger", at, len * 2.4, mix(color, WHITE, 0.5), alpha, angle)) blade(c.g, at, angle, len, wid, color, alpha);
}

/** A burning ball: two billows of flame turning against each other round a white-hot core. False until the art loads. */
function fireBall(c: StrikeCtx, at: Point, radius: number, alpha: number, e: number): boolean {
  if (!stamp(c.stamps, "fire-billow", at, radius * FIRE * 1.3, c.secondary, alpha * 0.7, e * 5)) return false;
  stamp(c.stamps, "fire-billow", at, radius * FIRE, mix(c.primary, WHITE, 0.25), alpha, 1 - e * 7);
  stamp(c.stamps, "glow", at, radius * 2.4, mix(c.primary, WHITE, 0.6), alpha * 0.5);
  return true;
}

/** In the flying-fireball picture, the ball's centre and radius (shares of its side); its flames stream to the left. */
const FIREBALL_BALL = { x: 0.76, y: 0.52, radius: 0.19 };

/**
 * The painted fireball in flight, its ball on `at` and its flames streaming back the way it came
 * from `behind`, mirrored every few frames so they flicker. False until the art loads.
 */
function flyingFireball(c: StrikeCtx, at: Point, behind: Point, radius: number, e: number): boolean {
  const heading = Math.atan2(at.y - behind.y, at.x - behind.x);
  const size = radius / FIREBALL_BALL.radius;
  const flicker = Math.sin(e * 40) > 0 ? 1 : -1;
  // Wind-swept: a longer, fainter copy of the flames streams out behind the ball, bent up the way
  // rising flames go (whichever way it is thrown) and fluttering, under the ball itself.
  const bend = 0.16 * Math.sign(Math.cos(heading) || 1) + Math.sin(e * 14) * 0.05;
  if (!oval(c.stamps, "fireball-flight", at, size * 2.1, size * 0.85 * -flicker, c.primary, 0.75, heading + bend, FIREBALL_BALL)) return false;
  oval(c.stamps, "fireball-flight", at, size * 1.45, size * 0.95 * flicker, mix(c.primary, WHITE, 0.1), 0.6, heading + bend * 0.5, FIREBALL_BALL);
  oval(c.stamps, "fireball-flight", at, size, size * flicker, mix(c.primary, WHITE, 0.15), 1, heading, FIREBALL_BALL);
  stamp(c.stamps, "glow", at, radius * 2.2, mix(c.secondary, WHITE, 0.5), 0.6);
  return true;
}

/** A ball of fire rolling out of the impact. */
function rollingBall(c: StrikeCtx, k: number, big: number) {
  const e = easeOut(k);
  const fade = 1 - k;
  const outer = c.r * (0.8 + e * 1.4) * big;
  const inner = c.r * (0.5 + e * 0.9) * big;
  if (stamp(c.stamps, "fire-billow", c.to, outer * FIRE, c.secondary, fade * 0.45, k * 0.8)) {
    stamp(c.stamps, "fire-billow", c.to, inner * FIRE, mix(c.primary, WHITE, 0.4), fade * 0.6, 1 - k * 1.1);
    return;
  }
  c.g.circle(c.to.x, c.to.y, outer).fill({ color: c.secondary, alpha: fade * 0.35 });
  c.g.circle(c.to.x, c.to.y, inner).fill({ color: mix(c.primary, WHITE, 0.4), alpha: fade * 0.6 });
}

// ---------- cuts ----------

/** One glowing arc sweeping across the target, `offset` to one side, starting `delay` seconds late. */
function cutArc(c: StrikeCtx, e: number, offset: number, delay: number, scale: number, side: number) {
  const t = e - delay;
  if (t <= 0) return;
  const sweep = clamp01(t / (0.4 * c.D));
  const fadeOut = t > 0.55 * c.D ? clamp01(1 - (t - 0.55 * c.D) / (0.45 * c.D)) : 1;
  const R = c.r * 1.5 * scale;
  const centre = { x: c.to.x - c.dir.x * R + c.normal.x * offset, y: c.to.y - c.dir.y * R + c.normal.y * offset };
  const mid = Math.atan2(c.dir.y, c.dir.x);
  const span = 0.5 + c.arc * 1.5;
  const segments = graphicsBudget().arcSegments;
  const head = Math.floor(sweep * segments);
  const point = (i: number): Point => {
    const phi = mid + side * (-span + (2 * span * i) / segments);
    return { x: centre.x + Math.cos(phi) * R, y: centre.y + Math.sin(phi) * R };
  };
  // Painted: the crescent swings into place behind the moving head, then fades with the cut.
  const shown = easeOut(sweep) * fadeOut;
  const toward = mid - (1 - easeOut(sweep)) * 0.9 * side;
  if (arc(c.stamps, "slash-arc", centre, R, toward, side, c.secondary, shown * 0.55)) {
    arc(c.stamps, "slash-arc", centre, R * 0.98, toward, side, mix(c.primary, WHITE, 0.3), shown);
  } else {
    const tailFade = 2.6 - 2 * c.trail;
    for (let i = 0; i < head; i++) {
      const age = (head - i) / segments;
      const taper = Math.sin((Math.PI * (i + 0.5)) / segments);
      streak(c.g, point(i), point(i + 1), Math.max(2, c.r * 0.42 * taper * scale), c.primary, c.secondary, Math.max(0, 1 - age * tailFade) * fadeOut);
    }
  }
  if (head > 0 && fadeOut > 0) glowOrb(c, point(head), c.r * 0.22 * scale, WHITE, c.primary, fadeOut);
}

/** `count` cuts side by side (spread apart), a beat after each other; a slash crosses them over. */
function cuts(scale: number, cross: boolean): ShapeSpec["make"] {
  return (c) => ({
    draw(e) {
      const step = Math.min(0.06, 0.35 / c.n) * c.D;
      for (let i = 0; i < c.n; i++) {
        const offset = (i - (c.n - 1) / 2) * c.r * (0.2 + c.spread * 1.2);
        cutArc(c, e, offset, i * step, scale, cross && i % 2 === 1 ? -c.side : c.side);
      }
    },
  });
}

// ---------- things that fly ----------

type FlyKind = "projectile" | "fireball" | "meteor" | "bolt";

/** Projectile, fireball, meteor and bolt: `count` of them, fanned by spread, all landing together. */
function flyer(kind: FlyKind): ShapeSpec["make"] {
  return (c) => {
    // A bolt charges at the caster; a fireball flares up in the thrower's hand before it flies.
    const charge = kind === "bolt" ? 0.25 * c.D : kind === "fireball" ? 0.2 * c.L : 0;
    const stagger = c.n > 1 ? Math.min(0.04 * c.D, ((c.L - charge) * 0.6) / (c.n - 1)) : 0;
    const lanes = Array.from({ length: c.n }, (_, i) => ({ off: c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 3 : 0, delay: i * stagger }));
    const lift = c.arc * Math.min(c.dist * 0.45, c.r * 7);
    const pathAt = (u: number, off: number): Point => {
      if (kind === "meteor") {
        // A meteor falls from high above the target, whoever cast it.
        const end = { x: c.to.x + c.normal.x * off, y: c.to.y + c.normal.y * off };
        return lerpPoint({ x: end.x - c.arc * c.r * 10, y: end.y - c.r * 11 }, end, u);
      }
      const p = c.along(u, off * u);
      // A thrown fireball is lobbed: it rises and falls on the screen, whichever way it is thrown.
      if (kind === "fireball") return { x: p.x, y: p.y - Math.sin(Math.PI * u) * lift };
      const l = kind === "bolt" ? Math.sin(u * 22) * c.r * 0.32 * (1 - u * 0.4) * Math.sin(Math.PI * Math.min(1, u * 1.2)) : Math.sin(Math.PI * u) * lift * c.side;
      return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
    };
    return {
      draw(e) {
        if (kind === "bolt" && e < charge) {
          // A charging orb gathers at the attacker, with sparks spiralling in.
          const k = e / charge;
          arcaneOrb(c, c.from, c.r * (0.15 + k * 0.4) * (1 + Math.sin(e * 45) * 0.12), 0.7 + k * 0.3);
          for (let i = 0; i < 6; i++) {
            const a = e * (6 + c.spinRate * 0.6) + (i / 6) * TAU;
            const rad = c.r * (1.6 - k * 0.9);
            c.g.circle(c.from.x + Math.cos(a) * rad, c.from.y + Math.sin(a) * rad, Math.max(2, c.r * 0.07)).fill({ color: c.palette[i % 3]!, alpha: 0.9 });
          }
          return;
        }
        if (kind === "fireball" && e < charge) {
          // The fireball flares up in the thrower's hand, drawn back over the shoulder.
          const k = easeOut(e / charge);
          const hand = { x: c.from.x - c.dir.x * c.r * 0.6 * k, y: c.from.y - c.r * 0.5 * k };
          if (!fireBall(c, hand, c.r * 0.5 * (0.3 + 0.7 * k), 0.6 + 0.4 * k, e)) glowOrb(c, hand, c.r * 0.5 * k, c.primary, c.secondary, k);
          if (rnd() < 0.6) c.emit(hand, 1, c.r * 0.8, 0.4);
          return;
        }
        for (const lane of lanes) {
          const t0 = charge + lane.delay;
          if (e < t0) continue;
          const raw = (e - t0) / (c.L - t0);
          if (raw >= 1) continue;
          // A thrown fireball leaves fast and slows a little as it drops; the rest speed up.
          const u = kind === "fireball" ? raw * 0.7 + easeOut(raw) * 0.3 : easeIn(raw) * 0.6 + raw * 0.4;
          const head = pathAt(u, lane.off);
          // A fireball and a falling meteor fly as the painted flaming ball, pointing down their path.
          const ball = c.r * (kind === "meteor" ? 0.6 : 0.5);
          const flying = kind === "fireball" || kind === "meteor" ? flyingFireball(c, head, pathAt(Math.max(0, u - 0.02), lane.off), ball, e) : false;
          if (flying || (kind === "fireball" && fireBall(c, head, ball, 1, e))) {
            // Painted, it trails puffs of flame that rise, swell, cool and fade, shedding embers;
            // fewer behind the painted ball, whose own flames stream back.
            const puffs = flying ? 2 + Math.round(c.trail * 4) : 4 + Math.round(c.trail * 8);
            for (let k = 1; k <= puffs; k++) {
              const f = k / puffs;
              const at = pathAt(Math.max(0, u - k * 0.035), lane.off);
              const size = ball * FIRE * (0.8 + f * 0.9);
              stamp(c.stamps, "fire-billow", { x: at.x, y: at.y - f * c.r * 0.4 }, size, mix(c.primary, WHITE, 0.3 * (1 - f)), 0.7 * (1 - f) ** 1.5, e * 3 + k * 1.7);
            }
            if (rnd() < 0.9) c.emit(head, 2, c.r * 1.2, 0.6);
            continue;
          }
          if (kind === "bolt") {
            // A jagged line from the attacker to the head, redrawn every frame, with ghosts of the head behind it.
            // Painted, it flips at random each frame so it crackles.
            const reach = Math.hypot(head.x - c.from.x, head.y - c.from.y);
            if (!span(c.stamps, "lightning", c.from, head, Math.min(reach * 0.5, c.r * (2 + 2 * c.arc)), mix(c.primary, WHITE, 0.3), 0.95, rnd() < 0.5)) {
              lightning(c.g, c.from, head, 9, c.r * (0.1 + 0.6 * c.arc), Math.max(2, c.r * 0.13), c.primary, c.secondary, 0.9);
            }
            const ghosts = Math.round(c.trail * 5);
            for (let k = 1; k <= ghosts; k++) {
              const f = 1 - k / (ghosts + 1);
              glowOrb(c, pathAt(Math.max(0, u - k * 0.07), lane.off), c.r * 0.3 * f, c.primary, c.secondary, 0.55 * f);
            }
            arcaneOrb(c, head, c.r * 0.42);
            satellites(c, head, c.r * 0.7, e, 3, Math.max(2, c.r * 0.06));
            if (rnd() < 0.8) c.emit(head, 1, c.r * 1.6, 0.45);
          } else {
            // Fireballs and meteors are fatter and leave a longer, hotter tail.
            const heavy = kind !== "projectile";
            const steps = 4 + Math.round(c.trail * (heavy ? 30 : 24));
            const width = c.r * (heavy ? 0.55 : 0.3);
            // Painted, a fraying flare runs back from the head and the vector tail behind it thins.
            const flareEnd = pathAt(Math.max(0, u - 0.08 - c.trail * 0.16), lane.off);
            const flared = span(c.stamps, "energy-streak", head, flareEnd, width * 7, mix(c.primary, WHITE, 0.2), 1);
            for (let k = 0; k < steps; k++) {
              streak(c.g, pathAt(Math.max(0, u - k * 0.03), lane.off), pathAt(Math.max(0, u - (k + 1) * 0.03), lane.off), Math.max(2, width * (flared ? 0.6 : 1) * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
            }
            const radius = c.r * (kind === "meteor" ? 0.6 : heavy ? 0.5 : 0.3);
            glowOrb(c, head, radius, c.primary, c.secondary);
            satellites(c, head, radius * 1.9, e, 3, Math.max(2, radius * 0.22));
            if (rnd() < 0.7) c.emit(head, 1, c.r * 1.2, 0.5);
          }
        }
      },
      after(k) {
        if (kind === "fireball" || kind === "meteor") rollingBall(c, k, kind === "fireball" ? 2.2 : 1.8);
        if (kind === "meteor") {
          // Debris thrown out of the crater.
          const e = easeOut(k);
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU + 0.3;
            const d = c.r * (0.6 + e * 2.4);
            c.g.circle(c.to.x + Math.cos(a) * d, c.to.y + Math.sin(a) * d * 0.6 - Math.sin(Math.PI * e) * c.r, Math.max(2, c.r * 0.12 * (1 - k))).fill({ color: c.primary, alpha: 1 - k });
          }
        }
        if (kind === "bolt") {
          const e = easeOut(k);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + 0.4 + c.spin * k;
            const tip = { x: c.to.x + Math.cos(a) * c.r * 1.8 * e, y: c.to.y + Math.sin(a) * c.r * 1.8 * e };
            if (!span(c.stamps, "lightning", c.to, tip, c.r * 0.9 * e, c.primary, 1 - k, i % 2 === 1)) {
              lightning(c.g, c.to, tip, 4, c.r * 0.25, Math.max(2, c.r * 0.07), c.primary, c.secondary, 1 - k);
            }
          }
        }
      },
    };
  };
}

/** `count` beams, fanned by spread and bowed by arc, that shoot out, hold and burn, then thin away. */
const beam: ShapeSpec["make"] = (c) => {
  const holdEnd = 0.4 + 0.45 * c.trail;
  const lift = c.arc * Math.min(c.dist * 0.3, c.r * 5);
  return {
    draw(e) {
      const reach = easeOut(clamp01(e / c.L));
      const hold = e < holdEnd * c.D ? 1 : clamp01(1 - (e - holdEnd * c.D) / ((1 - holdEnd) * c.D));
      if (hold <= 0) return;
      const flicker = 0.85 + 0.15 * Math.sin(e * 55);
      const width = Math.max(3, (c.r * 0.5 * flicker * hold) / (1 + (c.n - 1) * 0.3));
      for (let i = 0; i < c.n; i++) {
        const off = c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 2.5 : 0;
        const pts = Array.from({ length: 13 }, (_, j) => {
          const u = (reach * j) / 12;
          const p = c.along(u, off * u);
          const l = Math.sin(Math.PI * u) * lift * c.side;
          return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
        });
        // Painted, the beam picture is laid in two pieces along the bow; it is even along its
        // length, so the pieces read as one beam.
        let painted = false;
        for (let j = 0; j < 12; j += 6) painted = span(c.stamps, "beam", pts[j]!, pts[j + 6]!, width * 20, mix(c.primary, WHITE, 0.15), hold) || painted;
        if (!painted) {
          // Without it, soft glows stretched along the beam, overlapping, make a column of light
          // round a thin hot core. A glow's bright part is about half its picture across.
          let glowing = false;
          for (let j = 0; j < 12; j += 2) {
            const a = pts[j]!;
            const b = pts[j + 2]!;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            glowing = oval(c.stamps, "glow", mid, len * 2.2 + width * 2, width * 4.5, c.primary, 0.5 * hold, Math.atan2(b.y - a.y, b.x - a.x)) || glowing;
          }
          polyline(c.g, pts, glowing ? Math.max(2, width * 0.45) : width, c.primary, c.secondary, hold, false);
        }
        glowOrb(c, c.from, c.r * 0.32 * hold, c.primary, c.secondary, hold);
        if (c.spin > 0.05) {
          // A sparkling helix winds along the beam.
          for (let j = 1; j < 9; j++) {
            const p = pts[Math.round((j / 9) * 12)]!;
            const o = Math.sin(j * 1.3 - e * c.spinRate) * c.r * 0.4;
            c.g.circle(p.x + c.normal.x * o, p.y + c.normal.y * o, Math.max(1.5, c.r * 0.07)).fill({ color: c.accent, alpha: 0.8 * hold });
          }
        }
        if (c.landed) {
          glowOrb(c, pts[12]!, c.r * 0.45 * flicker * hold, c.primary, c.secondary, hold);
          if (rnd() < 0.9) c.emit(pts[12]!, 2, c.r * 2.5, 0.4);
        }
      }
    },
  };
};

// ---------- melee extras ----------

/** Spinning blades orbit a point that travels to the target, then keep sweeping it. */
const whirlwind: ShapeSpec["make"] = (c) => ({
  draw(e) {
    const t = clamp01(e / c.L);
    const k = c.landed ? clamp01((e - c.L) / c.impactLen) : 0;
    const centre = c.landed ? c.to : c.along(easeIn(t) * 0.7 + t * 0.3);
    const grow = c.landed ? 1 - easeIn(k) * 0.5 : 0.5 + 0.5 * t;
    const fade = c.landed ? 1 - k ** 1.5 : 1;
    const R = c.r * (0.9 + c.spread * 1.8) * grow;
    const phase = e * c.spinRate;
    const sweep = 0.35 + c.trail * 1.1;
    glowRing(c, centre, R, Math.max(1.5, c.r * 0.05), c.secondary, 0.3 * fade, phase * 0.3);
    for (let i = 0; i < c.n; i++) {
      const head = phase + (i / c.n) * TAU;
      const pts = arcPoints(centre, R, head - sweep, head, 8);
      // Painted, each blade drags a fraying streak over the near part of its sweep, and the vector
      // arc behind it thins.
      const streaked = span(c.stamps, "energy-streak", pts[8]!, pts[3]!, c.r * 1.8, mix(c.primary, WHITE, 0.2), fade);
      polyline(c.g, pts, c.r * (streaked ? 0.22 : 0.4), c.primary, c.secondary, fade);
      daggerBlade(c, pts[8]!, head + Math.PI / 2 + 0.3, c.r * 0.45, c.r * 0.12, c.accent, fade);
    }
    if (rnd() < 0.4) c.emit({ x: centre.x + Math.cos(phase) * R, y: centre.y + Math.sin(phase) * R }, 1, c.r * 1.5, 0.4);
  },
});

/** The attacker leaps, lands, and cracks radiate across the ground. */
const slam: ShapeSpec["make"] = (c) => {
  const cracks = Array.from({ length: c.n }, (_, i) => ({ a: (i / c.n) * TAU + (rnd() - 0.5) * 0.5, len: 0.7 + rnd() * 0.6, jit: Array.from({ length: 7 }, () => (rnd() - 0.5) * 2) }));
  const air = (u: number): Point => {
    const p = c.along(u);
    return { x: p.x, y: p.y - Math.sin(Math.PI * u) * c.r * (2 + c.arc * 6) };
  };
  return {
    draw(e) {
      if (c.landed) return;
      const u = clamp01(e / c.L);
      const ground = c.along(u);
      const lift = Math.sin(Math.PI * u);
      c.top.ellipse(ground.x, ground.y, c.r * 0.7 * (1 - 0.35 * lift), c.r * 0.28 * (1 - 0.35 * lift)).fill({ color: 0x000000, alpha: 0.35 });
      const steps = 3 + Math.round(c.trail * 10);
      // Painted, a fraying flare follows the leap and the vector trail behind it thins.
      const flared = span(c.stamps, "energy-streak", air(u), air(Math.max(0, u - 0.12 - c.trail * 0.1)), c.r * 3, mix(c.primary, WHITE, 0.25), 1);
      for (let k = 0; k < steps; k++) {
        streak(c.g, air(Math.max(0, u - k * 0.035)), air(Math.max(0, u - (k + 1) * 0.035)), Math.max(2, c.r * 0.5 * (flared ? 0.6 : 1) * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
      }
      glowOrb(c, air(u), c.r * 0.55, c.primary, c.secondary);
    },
    after(k) {
      const grow = easeOut(clamp01(k * 2.5));
      const fade = 1 - clamp01((k - 0.45) / 0.55);
      const reach = c.r * (1.2 + c.spread * 3.2) * grow;
      // Painted, a cloud of dust rolls out under the cracks.
      stamp(c.stamps, "smoke-puff", c.to, reach * 2.2, c.secondary, 0.35 * fade, k * 0.7);
      glowRing(c, c.to, reach * 0.9, Math.max(2, c.r * 0.2), c.secondary, 0.4 * fade, k);
      for (const crack of cracks) {
        const a = crack.a + c.spin * k * 0.6;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const pts = crack.jit.concat(0).map((j, idx) => {
          const along = (reach * crack.len * idx) / 7;
          const side = idx === 0 ? 0 : j * c.r * 0.22;
          return { x: c.to.x + dx * along - dy * side, y: c.to.y + dy * along + dx * side };
        });
        // Painted, each crack is a jagged fissure of light.
        if (!span(c.stamps, "lightning", c.to, pts[7]!, c.r * 0.9 * grow, c.primary, fade, crack.jit[0]! > 0)) {
          polyline(c.g, pts, Math.max(2, c.r * 0.12), c.primary, c.secondary, fade, false);
        }
      }
    },
  };
};

/**
 * The attacker's shadow glides at the target as a wraith, floating, and stops a stride short;
 * hovers there and rears back with its eyes flaring; then lunges in, crosses the target with two
 * cuts and bursts into smoke. `count` is the wraith and the ghosts it smears behind it, which show
 * only while it moves: they gather into it while it hovers and stretch out when it lunges.
 */
const shadow: ShapeSpec["make"] = (c) => {
  // It stops about a token and a half short of the target, or half way on a short reach, and
  // rears back a little further from there.
  const reach = Math.max(1, c.dist);
  const stopU = 1 - Math.min(c.r * 1.8, c.dist * 0.5) / reach;
  const backU = Math.min(c.r * 0.5, c.dist * 0.15) / reach;
  const glideEnd = 0.6 * c.L;
  const holdEnd = 0.84 * c.L;
  const smooth = (t: number) => {
    const k = clamp01(t);
    return k * k * (3 - 2 * k);
  };
  /** Where the wraith is at `t` seconds, and how far it has reared back (0 to 1). */
  const pose = (t: number): { at: Point; rear: number } => {
    let u: number;
    let rear = 0;
    if (t <= glideEnd) u = smooth(t / glideEnd) * stopU;
    else if (t <= holdEnd) {
      rear = easeOut((t - glideEnd) / (holdEnd - glideEnd));
      u = stopU - rear * backU;
    } else {
      const k = easeIn((t - holdEnd) / (c.L - holdEnd));
      rear = 1 - k;
      u = lerp(stopU - backU, 1, k);
    }
    const p = c.along(clamp01(u));
    // One gentle curve (arc) on the way, and a slow float that lifts as it rears back.
    const curve = Math.sin(Math.PI * clamp01(u)) * c.arc * c.r * 0.8 * c.side;
    const float = Math.sin(t * 7) * c.r * 0.1 + rear * c.r * 0.3;
    return { at: { x: p.x + c.normal.x * curve, y: p.y + c.normal.y * curve - float }, rear };
  };
  /** One wraith: the newest (`i` 0) brightest, its eyes flaring as it rears, swelling as it dissolves. */
  const wraith = (at: Point, i: number, a: number, rear: number, e: number, dissolve: number) => {
    // Painted, a smoky hooded wraith, its face on `at`.
    const size = c.r * WRAITH_SIZE * (1 + rear * 0.15 + dissolve * 0.4);
    const tint = i === 0 ? mix(c.primary, WHITE, 0.35 + rear * 0.3) : i % 2 ? c.accent : c.primary;
    if (oval(c.stamps, "shadow-wraith", at, size, size, tint, a, Math.sin(e * 3 + i) * 0.05, WRAITH_FACE)) {
      // The flare stays under the eyes' spacing, so they read as two eyes, not a bar.
      const eye = c.r * (i === 0 ? 0.45 + rear * 0.25 : 0.4);
      for (const side of [-1, 1]) {
        stamp(c.stamps, "glow", { x: at.x + side * WRAITH_EYES.x * size, y: at.y + WRAITH_EYES.y * size }, eye, WHITE, a * (i === 0 ? 1 : 0.4));
      }
      return;
    }
    // Without it, a dark disc with a glowing rim and two eyes, a spirit flame rising off it (its
    // picture stands upright), or smoke without that.
    if (!stamp(c.stamps, "shadow-wisp", { x: at.x, y: at.y - c.r * 0.5 }, c.r * 2.6, c.primary, a * 0.7, Math.sin(e * 5 + i) * 0.2)) {
      stamp(c.stamps, "smoke-puff", at, c.r * 2.4, c.primary, a * 0.45, e * 2 + i);
    }
    c.top.circle(at.x, at.y, c.r * 0.58).fill({ color: 0x07030f, alpha: a * 0.85 });
    ring(c.g, at, c.r * 0.6, 2.5, i % 2 ? c.accent : c.primary, a);
    c.top.circle(at.x - c.r * 0.2, at.y - c.r * 0.1, c.r * 0.07).fill({ color: WHITE, alpha: a });
    c.top.circle(at.x + c.r * 0.2, at.y - c.r * 0.1, c.r * 0.07).fill({ color: WHITE, alpha: a });
  };
  return {
    draw(e) {
      const t = Math.min(e, c.L);
      const dissolve = c.landed ? clamp01((e - c.L) / (c.impactLen * 0.6)) : 0;
      const gap = (0.03 + c.trail * 0.05) * c.D;
      const now = pose(t);
      for (let i = c.n - 1; i >= 0; i--) {
        const then = i === 0 ? now : pose(Math.max(0, t - i * gap));
        let a = 1 - dissolve;
        if (i > 0) {
          // A ghost shows as far as the wraith moved in the gap behind it.
          const ahead = pose(Math.max(0, t - (i - 1) * gap)).at;
          a *= (1 - i / c.n) * 0.6 * clamp01((Math.hypot(ahead.x - then.at.x, ahead.y - then.at.y) / c.r) * 3);
        }
        if (a > 0.01) wraith(then.at, i, a, i === 0 ? now.rear : 0, e, dissolve);
      }
      // On the hit it bursts into smoke over the target.
      if (c.landed) stamp(c.stamps, "smoke-puff", c.to, c.r * (2 + dissolve * 3), c.primary, (1 - dissolve) * 0.6, e);
      if (!c.landed && rnd() < 0.5) c.emit(now.at, 1, c.r * 0.8, 0.4);
    },
    after(k) {
      const s = easeOut(clamp01(k * 3));
      const a = 1 - clamp01((k - 0.35) / 0.65);
      const len = c.r * (1.6 + c.spread * 1.6);
      for (const ang of [-0.8 + c.spin * k, 0.8 - c.spin * k]) {
        const d = { x: Math.cos(ang), y: Math.sin(ang) };
        const A = { x: c.to.x - d.x * len, y: c.to.y - d.y * len };
        const B = { x: c.to.x + d.x * len, y: c.to.y + d.y * len };
        // Painted, each cut is a streak whose bright head runs across.
        if (!span(c.stamps, "energy-streak", lerpPoint(A, B, s), A, c.r * 1.3, mix(c.primary, WHITE, 0.3), a)) {
          streak(c.g, A, lerpPoint(A, B, s), c.r * 0.22, c.primary, c.secondary, a);
        }
      }
    },
  };
};

// ---------- ranged extras ----------

/** `count` arrows fanned by spread, arcing high and coming down together. */
/** Where arrow i of n lands, as a share of the volley's radius: spread over a disc, roughly evenly, never in a line. */
export function volleyLanding(i: number, n: number, jitter: () => number = Math.random): Point {
  if (n <= 1) return { x: 0, y: 0 };
  // The golden angle spreads them round; the square root spreads them out evenly over the area.
  const angle = i * 2.39996 + (jitter() - 0.5) * 0.9;
  const radius = Math.sqrt((i + 0.5) / n) * (0.75 + jitter() * 0.4);
  return { x: Math.cos(angle) * Math.min(1, radius), y: Math.sin(angle) * Math.min(1, radius) };
}

const volley: ShapeSpec["make"] = (c) => {
  const stagger = c.n > 1 ? Math.min(0.035 * c.D, (c.L * 0.5) / (c.n - 1)) : 0;
  // The arrows come down in a rough circle round the target, as wide as `spread` makes it (the arrow: one, dead centre).
  const radius = c.spread * c.r * 2.4;
  const arrows = Array.from({ length: c.n }, (_, i) => {
    const land = volleyLanding(i, c.n);
    return { end: { x: c.to.x + land.x * radius, y: c.to.y + land.y * radius }, delay: i * stagger, hit: false };
  });
  const liftH = c.arc * Math.min(c.dist * 0.6, c.r * 10) + c.r * 1.5;
  const pos = (end: Point, u: number): Point => {
    const p = lerpPoint(c.from, end, u);
    return { x: p.x, y: p.y - Math.sin(Math.PI * u) * liftH };
  };
  return {
    draw(e) {
      const tail = 0.04 + c.trail * 0.2;
      for (const a of arrows) {
        const raw = (e - a.delay) / (c.L - a.delay);
        if (raw < 0) continue;
        if (raw >= 1) {
          const end = pos(a.end, 1);
          if (!a.hit) {
            a.hit = true;
            c.emit(end, 3, c.r * 2, 0.4);
          }
          // The arrow stays stuck in the ground until the end.
          const before = pos(a.end, 0.96);
          const stuck = 1 - clamp01((e - c.L) / c.impactLen);
          if (arrowArt(c, before, end, stuck)) continue;
          const len = Math.hypot(end.x - before.x, end.y - before.y) || 1;
          const shaft = { x: end.x - ((end.x - before.x) / len) * c.r * 1.3, y: end.y - ((end.y - before.y) / len) * c.r * 1.3 };
          streak(c.g, end, shaft, Math.max(2, c.r * 0.1), c.primary, c.secondary, stuck);
          continue;
        }
        const head = pos(a.end, raw);
        // Painted, each arrow is the arrow picture pointing along its flight, a faint fraying streak
        // behind it.
        if (arrowArt(c, pos(a.end, Math.max(0, raw - 0.03)), head, 1)) {
          span(c.stamps, "energy-streak", head, pos(a.end, Math.max(0, raw - tail * 1.4)), c.r * 0.9, mix(c.primary, WHITE, 0.2), 0.5);
          continue;
        }
        // Without it, a streak that frays behind a glowing head.
        if (!span(c.stamps, "energy-streak", head, pos(a.end, Math.max(0, raw - tail * 1.4)), c.r * 0.9, mix(c.primary, WHITE, 0.2), 1)) {
          streak(c.g, pos(a.end, Math.max(0, raw - tail)), head, Math.max(2, c.r * 0.12), c.primary, c.secondary, 1);
        }
        glowOrb(c, head, c.r * 0.14, c.accent, c.secondary);
      }
    },
  };
};

/** `count` thrown blades, spinning, on curved paths that fan out and meet at the target. */
/** How much thicker than its picture's 3:1 shape the pierce blade is drawn, across the blade. */
const PIERCE_BLADE_THICKEN = 1.4;

/** Thrust i of a flurry lands this long after the one before: quick, and all of them in the first half after the landing. */
export const pierceStep = (count: number, duration: number) => Math.min(0.12, 0.45 / Math.max(1, count)) * duration;

/**
 * A melee thrust (ADR 0067). Each thrust: a glint on the attacker's edge as it winds up, then the
 * blade lunges into the target with fading afterimages behind it and a glowing point, punches out
 * of the far side in a cone of sparks, and draws back as it fades. `count` above 1 is a flurry:
 * that many thrusts in quick succession, each a little to the side of the last. The blade is the
 * painted `pierce-blade` (with its own speed streaks), or a drawn blade until that has loaded.
 */
const pierce: ShapeSpec["make"] = (c) => {
  const step = pierceStep(c.n, c.D);
  const length = c.r * (1.5 + c.trail * 0.6);
  const ghosts = 1 + Math.round(c.trail * 4);
  const tipGlow = c.r * (0.08 + c.d.glow * 0.1);
  const thrusts = Array.from({ length: c.n }, (_, i) => {
    // Alternate sides and widen outwards, so a flurry reads as several stabs, not one repeated.
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    const off = side * c.r * (0.18 + c.spread * 0.35);
    const hit = c.L + i * step;
    // The first winds up from the start; the rest from just after the one before landed.
    const start = i === 0 ? 0 : hit - Math.min(c.L, step * 1.6);
    const at = (u: number) => {
      const begin = c.along(Math.min(0.45, (c.r * 0.7) / Math.max(1, c.dist)), off);
      const end = { x: c.to.x + c.normal.x * off * 0.5, y: c.to.y + c.normal.y * off * 0.5 };
      return lerpPoint(begin, end, u);
    };
    const through = c.r * (0.9 + c.spread * 0.6);
    const exit = { x: c.to.x + c.dir.x * through + c.normal.x * off * 0.5, y: c.to.y + c.dir.y * through + c.normal.y * off * 0.5 };
    return { start, hit, at, exit, burst: false };
  });

  const bladeArt = (tip: Point, alpha: number) => {
    const ends = ART_ENDS["pierce-blade"]!;
    const tail = { x: tip.x - c.dir.x * length, y: tip.y - c.dir.y * length };
    // Drawn a little thicker than the picture's own shape, so the blade reads at token size.
    const height = (length / (ends.to.x - ends.from.x) / PIERCE_BLADE_ASPECT) * PIERCE_BLADE_THICKEN;
    return span(c.stamps, "pierce-blade", tail, tip, height, mix(c.primary, WHITE, 0.35), alpha);
  };
  /** The drawn stand-in: a narrow tapering blade with a bright ridge, a crossguard and a grip. */
  const bladeDrawn = (tip: Point, alpha: number) => {
    const w = c.r * 0.11;
    const at = (k: number, side: number) => ({ x: tip.x - c.dir.x * length * k + c.normal.x * w * side, y: tip.y - c.dir.y * length * k + c.normal.y * w * side });
    const guard = 0.8;
    const shoulder = [at(guard, 1), at(guard * 0.7, 0.9), at(0, 0), at(guard * 0.7, -0.9), at(guard, -1)];
    c.g.poly(shoulder.flatMap((p) => [p.x, p.y])).fill({ color: c.primary, alpha: alpha * 0.9 });
    const ridgeEnd = at(guard, 0);
    c.g.moveTo(ridgeEnd.x, ridgeEnd.y).lineTo(tip.x, tip.y).stroke({ width: Math.max(1, w * 0.35), color: c.secondary, alpha });
    const [g1, g2] = [at(guard, 2.4), at(guard, -2.4)];
    c.g.moveTo(g1.x, g1.y).lineTo(g2.x, g2.y).stroke({ width: Math.max(1.5, w * 0.6), color: c.secondary, alpha });
    const grip = at(1, 0);
    c.g.moveTo(ridgeEnd.x, ridgeEnd.y).lineTo(grip.x, grip.y).stroke({ width: Math.max(1.5, w * 0.8), color: mix(c.primary, 0x000000, 0.35), alpha });
  };
  const drawBlade = (tip: Point, alpha: number) => {
    if (!bladeArt(tip, alpha)) bladeDrawn(tip, alpha);
  };

  return {
    draw(e) {
      for (const t of thrusts) {
        if (e < t.start) continue;
        const windUp = t.start + (t.hit - t.start) * 0.3;
        // The glint: a star of light on the attacker's edge, swelling then gone as the thrust fires.
        if (e < windUp + (t.hit - t.start) * 0.15) {
          const k = clamp01((e - t.start) / (windUp - t.start || 1));
          const fade = e < windUp ? 1 : 1 - clamp01((e - windUp) / ((t.hit - t.start) * 0.15));
          const glint = t.at(0);
          if (!stamp(c.stamps, "particle-star", glint, c.r * (0.4 + k * 0.9), mix(c.accent, WHITE, 0.4), fade * (0.4 + k * 0.6), e * 2)) {
            orb(c.g, glint, c.r * 0.1 * (0.5 + k), c.accent, WHITE, fade);
          }
        }
        if (e < windUp) continue;
        if (e < t.hit) {
          const u = 1 - (1 - clamp01((e - windUp) / (t.hit - windUp))) ** 3;
          // Afterimages, fainter the further back, then the blade and its glowing point.
          for (let k = ghosts; k >= 1; k--) drawBlade(t.at(Math.max(0, u - k * 0.07 * (1 + c.trail))), 0.3 * (1 - k / (ghosts + 1)));
          const tip = t.at(u);
          drawBlade(tip, 1);
          glowOrb(c, tip, tipGlow, c.accent, c.secondary);
          continue;
        }
        const k = clamp01((e - t.hit) / c.impactLen);
        if (!t.burst) {
          t.burst = true;
          // Out of the far side, in a cone along the thrust: more sparks the more the animation has.
          c.emit(t.exit, 4 + Math.round(c.d.particles * 0.35), c.r * 5.5, 0.55, { angle: Math.atan2(c.dir.y, c.dir.x), cone: 0.35 + c.spread * 0.4 });
        }
        // Through in the first fifth, then a short recoil while it fades.
        const tip = k < 0.2 ? lerpPoint(c.to, t.exit, k / 0.2) : lerpPoint(t.exit, c.to, Math.min(1, (k - 0.2) / 0.5) * 0.6);
        const alpha = 1 - clamp01((k - 0.35) / 0.65);
        drawBlade(tip, alpha);
        if (k < 0.3) glowOrb(c, t.exit, tipGlow * (1.6 - k * 2), c.accent, c.secondary, 1 - k / 0.3);
      }
    },
  };
};

const dagger: ShapeSpec["make"] = (c) => {
  const stagger = c.n > 1 ? Math.min(0.03 * c.D, (c.L * 0.4) / (c.n - 1)) : 0;
  const daggers = Array.from({ length: c.n }, (_, i) => {
    const f = c.n > 1 ? i / (c.n - 1) - 0.5 : 0;
    return { bend: f * 2 * c.spread, off: f * c.r * 0.6, delay: i * stagger, turn: i % 2 ? -1 : 1, index: i, hit: false };
  });
  const pos = (d: (typeof daggers)[number], u: number): Point => {
    const end = c.along(1, d.off);
    const mid = c.along(0.5);
    const bow = d.bend * c.dist * 0.9 + c.side * c.arc * c.dist * 0.2;
    const ctrl = { x: mid.x + c.normal.x * bow, y: mid.y + c.normal.y * bow };
    const o = 1 - u;
    return { x: o * o * c.from.x + 2 * o * u * ctrl.x + u * u * end.x, y: o * o * c.from.y + 2 * o * u * ctrl.y + u * u * end.y };
  };
  return {
    draw(e) {
      for (const d of daggers) {
        const raw = (e - d.delay) / (c.L - d.delay);
        if (raw < 0) continue;
        if (raw >= 1) {
          const end = pos(d, 1);
          if (!d.hit) {
            d.hit = true;
            c.emit(end, 4, c.r * 2, 0.4);
          }
          // The blade stays stuck in the target and fades.
          daggerBlade(c, end, Math.atan2(c.dir.y, c.dir.x) + d.index * 0.3, c.r * 0.6, c.r * 0.14, c.primary, 1 - clamp01((e - c.L) / c.impactLen));
          continue;
        }
        const rot = e * c.spinRate * d.turn + d.index * 1.7;
        const head = pos(d, raw);
        const ghosts = 2 + Math.round(c.trail * 6);
        for (let k = ghosts; k >= 1; k--) {
          daggerBlade(c, pos(d, Math.max(0, raw - k * 0.025 * (1 + c.trail))), rot - k * 0.5 * d.turn, c.r * 0.55, c.r * 0.14, c.primary, 0.35 * (1 - k / (ghosts + 1)));
        }
        const tail = pos(d, Math.max(0, raw - 0.05 - c.trail * 0.15));
        if (!span(c.stamps, "energy-streak", head, tail, c.r * 0.9, mix(c.primary, WHITE, 0.2), 0.7)) {
          streak(c.g, tail, head, Math.max(2, c.r * 0.1), c.primary, c.secondary, 0.6);
        }
        daggerBlade(c, head, rot, c.r * 0.7, c.r * 0.17, c.primary, 1);
      }
    },
  };
};

/**
 * A bundle of TNT is lobbed high, spinning end over end, its shadow racing along the ground; it
 * lands short, bounces once onto the target, comes to rest upright and rocks while its fuse spits
 * sparks and a warning glow blinks faster and faster. Then it goes off: a painted blast of flame and smoke, a shockwave racing out, burning
 * debris flung on arcs with ember trails, and smoke rising in a column.
 */
const explosion: ShapeSpec["make"] = (c) => {
  const debris = Array.from({ length: c.n * 2 }, () => ({
    a: rnd() * TAU, v: c.r * (5 + rnd() * 9) * (0.5 + c.spread), lift: c.r * (6 + rnd() * 10), size: c.r * (0.12 + rnd() * 0.12), color: c.palette[Math.floor(rnd() * 3)]!,
  }));
  const smoke = Array.from({ length: 7 }, (_, i) => ({ a: rnd() * TAU, d: c.r * (0.2 + rnd() * 0.7), s: 0.8 + rnd() * 0.7, rise: i / 6 }));
  const lobEnd = 0.5;
  const bounceEnd = 0.68;
  // It first lands about a token and a half short, then bounces the rest of the way.
  const shortU = 1 - Math.min(c.r * 1.6, c.dist * 0.25) / Math.max(1, c.dist);
  const lobH = c.arc * Math.min(c.dist * 0.3, c.r * 4) + c.r;
  const bomb = c.r * 0.45;
  /** The bomb's spot on the ground at `t`, and how high above it the bomb is. */
  const flight = (t: number): { ground: Point; h: number } => {
    if (t <= lobEnd * c.L) {
      const k = t / (lobEnd * c.L);
      return { ground: c.along(k * shortU), h: Math.sin(Math.PI * k) * lobH };
    }
    if (t <= bounceEnd * c.L) {
      const k = (t - lobEnd * c.L) / ((bounceEnd - lobEnd) * c.L);
      return { ground: c.along(lerp(shortU, 1, k)), h: Math.sin(Math.PI * k) * lobH * 0.3 };
    }
    return { ground: c.to, h: 0 };
  };
  // The painted bundle stands about a token and a quarter tall.
  const tnt = (c.r * 1.25) / TNT.height;
  /**
   * The bomb at `at`, turned by `spin`; its fuse tip spits sparks, and `warn` glows round it.
   * Painted, it is the TNT bundle; without the picture, an iron ball with a fuse.
   */
  const drawBomb = (at: Point, spin: number, warn: number, e: number) => {
    if (warn > 0 && !stamp(c.stamps, "glow", at, bomb * 7, c.primary, warn)) c.g.circle(at.x, at.y, bomb * 2).fill({ color: c.primary, alpha: warn * 0.5 });
    let tip: Point;
    if (oval(c.props, "tnt", at, tnt, tnt, WHITE, 1, spin, TNT.centre)) {
      const fx = (TNT.fuse.x - TNT.centre.x) * tnt;
      const fy = (TNT.fuse.y - TNT.centre.y) * tnt;
      tip = { x: at.x + fx * Math.cos(spin) - fy * Math.sin(spin), y: at.y + fx * Math.sin(spin) + fy * Math.cos(spin) };
    } else {
      const up = spin - Math.PI / 2;
      const base = { x: at.x + Math.cos(up) * bomb, y: at.y + Math.sin(up) * bomb };
      tip = { x: at.x + Math.cos(up + 0.45) * bomb * 1.7, y: at.y + Math.sin(up + 0.45) * bomb * 1.7 };
      c.top.moveTo(base.x, base.y).lineTo(tip.x, tip.y).stroke({ width: Math.max(1.5, bomb * 0.18), color: 0x8b6b4a });
      c.top.circle(at.x, at.y, bomb).fill({ color: 0x1f2329 }).stroke({ width: Math.max(1, bomb * 0.14), color: mix(c.primary, 0x1f2329, 0.55) });
      c.top.circle(at.x - bomb * 0.35, at.y - bomb * 0.35, bomb * 0.28).fill({ color: WHITE, alpha: 0.28 });
    }
    if (!stamp(c.stamps, "glow", tip, bomb * (1.8 + Math.sin(e * 50) * 0.5), mix(c.secondary, WHITE, 0.5), 1)) {
      c.g.circle(tip.x, tip.y, bomb * 0.4).fill({ color: c.secondary, alpha: 1 });
    }
    if (rnd() < 0.8) c.emit(tip, 1, c.r * 0.9, 0.3);
  };
  return {
    draw(e) {
      if (c.landed) return;
      const { ground, h } = flight(e);
      const lift = clamp01(h / lobH);
      // Its shadow stays on the ground, smaller and fainter the higher it flies.
      c.top.ellipse(ground.x, ground.y + bomb * 0.7, bomb * (1.1 - lift * 0.5), bomb * 0.4 * (1 - lift * 0.5)).fill({ color: 0x000000, alpha: 0.35 * (1 - lift * 0.5) });
      const flying = e < bounceEnd * c.L;
      // Where it first lands, a puff of dust.
      const thud = (e - lobEnd * c.L) / (0.2 * c.L);
      if (thud > 0 && thud < 1) stamp(c.stamps, "smoke-puff", c.along(shortU), c.r * (0.8 + thud * 1.4), mix(c.secondary, WHITE, 0.3), 0.4 * (1 - thud), thud);
      // It spins end over end through the lob and the bounce, turning the way it was thrown and
      // slowing to land upright, then rocks once it settles; the warning blinks faster as the fuse
      // burns down.
      const settle = clamp01((e - bounceEnd * c.L) / ((1 - bounceEnd) * c.L));
      const turns = 1.5 + c.spin;
      const airborne = clamp01(e / (bounceEnd * c.L));
      const spun = airborne * 0.6 + easeOut(airborne) * 0.4;
      const spin = flying ? -(c.dir.x < 0 ? -1 : 1) * (1 - spun) * turns * TAU : Math.sin(e * 18) * 0.25 * (1 - settle * 0.5);
      const warn = flying ? 0 : (0.3 + 0.7 * settle) * (0.5 + 0.5 * Math.sin(e * (8 + 40 * settle * settle)));
      drawBomb({ x: ground.x, y: ground.y - h }, spin, warn, e);
      if (!flying) glowRing(c, c.to, c.r * (2.6 - 1.8 * settle), Math.max(2, c.r * 0.07), c.accent, 0.25 + 0.6 * settle, e);
    },
    after(k) {
      const t = k * c.impactLen;
      const e = easeOut(k);
      const fade = 1 - k;
      // Painted, the blast itself erupts out of the bomb and spreads, turning slowly: orange flame
      // and smoke, a smaller yellow copy turned the other way for its hot heart.
      const blast = c.r * (2 + e * 4.5) * (0.8 + c.spread * 0.4);
      if (stamp(c.stamps, "explosion-blast", c.to, blast, c.accent, fade ** 1.2 * 0.9, k * 0.4)) {
        stamp(c.stamps, "explosion-blast", c.to, blast * 0.6, c.secondary, fade ** 2 * 0.55, 1 - k * 0.6);
        // A brief fire flash under it as it goes off; the painted blast carries the rest.
        const flash = clamp01(1 - k * 3);
        stamp(c.stamps, "fire-billow", c.to, c.r * (0.6 + e * 1.6) * FIRE, c.secondary, flash * 0.45, k);
        stamp(c.stamps, "glow", c.to, c.r * (1.2 + e * 2), WHITE, flash ** 2 * 0.6);
      } else {
        // Without it, roiling fire round a white-hot glow.
        const outer = c.r * (0.6 + e * 2.8);
        const middle = c.r * (0.4 + e * 1.9);
        const core = c.r * (0.3 + e * 1.0);
        if (stamp(c.stamps, "fire-billow", c.to, outer * FIRE, c.secondary, fade * 0.6, k)) {
          stamp(c.stamps, "fire-billow", c.to, middle * FIRE, c.accent, fade * 0.75, 1.7 - k * 1.3);
          stamp(c.stamps, "glow", c.to, core * 4.4, WHITE, fade ** 2 * 0.9);
        } else {
          c.g.circle(c.to.x, c.to.y, outer).fill({ color: c.secondary, alpha: fade * 0.4 });
          c.g.circle(c.to.x, c.to.y, middle).fill({ color: c.accent, alpha: fade * 0.6 });
          c.g.circle(c.to.x, c.to.y, core).fill({ color: WHITE, alpha: fade });
        }
      }
      // A shockwave races out well past the fire and the impact's own rings.
      const wave = clamp01(k / 0.55);
      if (wave < 1) glowRing(c, c.to, c.r * (1 + easeOut(wave) * (6 + c.spread * 4)), Math.max(2, c.r * 0.1 * (1 - wave)), mix(c.secondary, WHITE, 0.4), (1 - wave) * 0.8, 0);
      // Smoke rises in a column over the blast, swelling as it climbs.
      for (const s of smoke) {
        const kk = clamp01(k * 1.3 - s.rise * 0.25);
        if (kk <= 0) continue;
        const at = { x: c.to.x + Math.cos(s.a) * s.d * (1 + k), y: c.to.y + Math.sin(s.a) * s.d * 0.5 - kk * c.r * (1.5 + s.rise * 2.5) };
        stamp(c.stamps, "smoke-puff", at, c.r * s.s * (1.2 + kk * 2.4), mix(c.accent, 0x8a8178, 0.6), 0.35 * Math.min(1, kk * 4) * fade, s.a + kk);
      }
      // Burning debris is flung out on arcs, trailing embers.
      const fall = c.r * 40;
      for (const d of debris) {
        const pos = (tt: number): Point => ({ x: c.to.x + Math.cos(d.a) * d.v * tt, y: c.to.y + Math.sin(d.a) * d.v * tt * 0.6 - d.lift * tt + 0.5 * fall * tt * tt });
        const head = pos(t);
        const tail = pos(Math.max(0, t - 0.08));
        if (!span(c.stamps, "energy-streak", head, tail, d.size * 7, mix(d.color, WHITE, 0.2), fade)) streak(c.g, tail, head, Math.max(2, d.size), d.color, c.secondary, fade);
        if (!stamp(c.stamps, "glow", head, d.size * 6, mix(d.color, WHITE, 0.4), fade)) c.g.circle(head.x, head.y, d.size * 1.4).fill({ color: d.color, alpha: fade });
        if (rnd() < 0.12) c.emit(head, 1, c.r * 0.5, 0.4);
      }
    },
  };
};

// ---------- magic extras ----------

/** Lightning from the attacker to the target, then jumping `count` times to random spots nearby. */
const chain: ShapeSpec["make"] = (c) => {
  const nodes: Point[] = [c.from, c.to];
  const base = rnd() * TAU;
  for (let i = 0; i < c.n; i++) {
    const a = base + i * 2.4;
    const d = c.r * (1.8 + rnd() * 2.2) * (0.5 + c.spread * 1.5);
    nodes.push({ x: c.to.x + Math.cos(a) * d, y: c.to.y + Math.sin(a) * d });
  }
  const segs = nodes.length - 1;
  const stepT = Math.max(0.05, (0.85 * c.D - c.L) / Math.max(1, segs - 1));
  const linger = stepT * 0.6 + c.trail * 0.3 * c.D;
  const arrived = new Array<boolean>(segs).fill(false);
  return {
    draw(e) {
      for (let i = 0; i < segs; i++) {
        const t0 = i === 0 ? 0 : c.L + (i - 1) * stepT;
        const dur = i === 0 ? c.L : stepT * 0.6;
        const age = e - t0;
        if (age < 0) break;
        const a = nodes[i]!;
        const b = nodes[i + 1]!;
        const alpha = age < dur ? 1 : 1 - clamp01((age - dur) / linger);
        if (alpha <= 0) continue;
        const prog = clamp01(age / dur);
        const end = lerpPoint(a, b, prog);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const reach = len * prog;
        if (!span(c.stamps, "lightning", a, end, Math.min(reach * 0.45, c.r * (1.5 + 2 * c.arc)), mix(c.primary, WHITE, 0.3), alpha * 0.95, rnd() < 0.5)) {
          lightning(c.g, a, end, Math.max(4, Math.round(len / (c.r * 0.7))), c.r * (0.1 + 0.5 * c.arc), Math.max(2, c.r * 0.1), c.primary, c.secondary, alpha * 0.95);
        }
        if (prog >= 1) {
          if (!arrived[i]) {
            arrived[i] = true;
            c.emit(b, 4, c.r * 2, 0.4);
          }
          glowOrb(c, b, c.r * 0.3 * alpha, c.primary, c.secondary, alpha);
          ring(c.g, b, c.r * (0.3 + 0.8 * clamp01((age - dur) / 0.3)), 2, c.accent, alpha * 0.7);
        } else {
          glowOrb(c, end, c.r * 0.22, c.primary, c.secondary);
        }
      }
    },
  };
};

/** An icy orb flies in, and `count` ice spikes burst out of the ground around the target, then shatter. */
const frost: ShapeSpec["make"] = (c) => {
  const spikes = Array.from({ length: c.n }, (_, i) => {
    const a = (i / c.n) * TAU + (rnd() - 0.5) * 0.4;
    const d = c.r * (0.4 + c.spread * 1.2) * (0.75 + rnd() * 0.5);
    return { base: { x: c.to.x + Math.cos(a) * d, y: c.to.y + Math.sin(a) * d * 0.6 }, h: c.r * (1.4 + rnd() * 1.3), w: c.r * (0.2 + rnd() * 0.12), lean: Math.cos(a) };
  }).sort((p, q) => p.base.y - q.base.y);
  let shattered = false;
  const lift = c.arc * Math.min(c.dist * 0.45, c.r * 7);
  const pos = (u: number): Point => {
    const p = c.along(u);
    const l = Math.sin(Math.PI * u) * lift * c.side;
    return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
  };
  return {
    draw(e) {
      if (c.landed) return;
      const raw = clamp01(e / c.L);
      const u = easeIn(raw) * 0.6 + raw * 0.4;
      const steps = 3 + Math.round(c.trail * 14);
      for (let k = 0; k < steps; k++) {
        streak(c.g, pos(Math.max(0, u - k * 0.03)), pos(Math.max(0, u - (k + 1) * 0.03)), Math.max(2, c.r * 0.28 * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
      }
      const head = pos(u);
      glowOrb(c, head, c.r * 0.38, c.primary, c.secondary);
      satellites(c, head, c.r * 0.8, e, 4, Math.max(2, c.r * 0.07));
      if (rnd() < 0.6) c.emit(head, 1, c.r, 0.5);
    },
    after(k) {
      const grow = easeOut(clamp01(k * 4));
      const shatter = clamp01((k - 0.7) / 0.3);
      const a = 1 - shatter;
      c.g.circle(c.to.x, c.to.y, c.r * (1 + c.spread * 1.4) * grow).fill({ color: c.primary, alpha: 0.14 * a });
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 + c.spin * k * 3;
        const len = c.r * (1.1 + c.spread * 1.4) * grow;
        streak(c.g, c.to, { x: c.to.x + Math.cos(ang) * len, y: c.to.y + Math.sin(ang) * len }, Math.max(2, c.r * 0.06), c.secondary, c.accent, 0.55 * a);
      }
      for (const s of spikes) {
        const tip = { x: s.base.x + s.lean * s.h * 0.25 * grow, y: s.base.y - s.h * grow * (1 - shatter * 0.4) };
        if (span(c.stamps, "ice-shard", s.base, tip, s.w * 4.5, mix(c.primary, WHITE, 0.35), 0.95 * a)) continue;
        c.top.poly([s.base.x - s.w, s.base.y, tip.x, tip.y, s.base.x + s.w, s.base.y]).fill({ color: mix(c.primary, WHITE, 0.25), alpha: 0.85 * a });
        streak(c.g, { x: s.base.x - s.w * 0.3, y: s.base.y }, tip, Math.max(1.5, s.w * 0.5), c.secondary, c.accent, 0.7 * a);
      }
      if (shatter > 0 && !shattered) {
        shattered = true;
        for (const s of spikes) c.emit({ x: s.base.x, y: s.base.y - s.h * 0.7 }, 3, c.r * 3, 0.7);
      }
    },
  };
};

/**
 * A poison bottle (to a timing ChatGPT designed): lobbed on a high arc, wobbling and turning
 * clockwise (fast, slower over the top, fast again), stretching as it drops, its shadow shrinking
 * under it, shedding drips, vapour and bubbles. It shatters on the target into glass shards, a
 * radial splash of venom and flung drops, leaving a corrosive puddle; a toxic cloud blooms over it,
 * bubbles rise and burst, two skulls form in the vapour and dissolve, and drops fall from the cloud
 * before it all fades. Without the pictures, the glowing orb, rings and bubbles it replaces.
 */
const poison: ShapeSpec["make"] = (c) => {
  // The vector look's bubbles.
  const puffs = Array.from({ length: c.n }, () => ({ a: rnd() * TAU, d: c.r * (0.1 + rnd() * (0.5 + c.spread * 1.3)), start: rnd() * 0.45, max: c.r * (0.4 + rnd() * 0.45), popped: false }));
  // Drips shed in flight every tenth of the throw, two or three at a time, falling where they left.
  const drips = Array.from({ length: Math.round(8 + c.trail * 10) }, (_, i) => ({ at: 0.15 + (i / (8 + c.trail * 10)) * 0.85, dx: (rnd() - 0.5) * c.r * 0.4, size: 0.25 + rnd() * 0.15 }));
  const trailBubbles = Array.from({ length: 5 }, (_, i) => ({ at: 0.2 + i * 0.15, dx: (rnd() - 0.5) * c.r * 0.6, size: 0.18 + rnd() * 0.12 }));
  const shards = Array.from({ length: 5 + Math.floor(rnd() * 4) }, () => ({ a: rnd() * TAU, v: c.r * (2.2 + rnd() * 2), turn: (rnd() - 0.5) * 14, size: 0.3 + rnd() * 0.25 }));
  const drops = Array.from({ length: 8 + Math.floor(rnd() * 5) }, () => ({ a: rnd() * TAU, v: c.r * (2 + rnd() * 2.5) * (0.6 + c.spread), size: 0.3 + rnd() * 0.25 }));
  const bubbles = Array.from({ length: Math.min(7, Math.max(4, c.n)) }, (_, i) => ({ x: (rnd() - 0.5) * c.r * 2.4 * (0.6 + c.spread), start: 0.15 + i * 0.09 + rnd() * 0.05, size: 0.3 + rnd() * 0.25, wobble: rnd() * TAU, popped: false }));
  const skulls = [
    { x: -c.r * 0.7, from: 0.22, to: 0.62, size: 3 },
    { x: c.r * 0.8, from: 0.42, to: 0.86, size: 2.6 },
  ];
  const cloudDrips = Array.from({ length: 4 }, (_, i) => ({ x: (rnd() - 0.5) * c.r * 2.2, at: 0.3 + i * 0.13 }));
  const lift = c.arc * Math.min(c.dist * 0.5, c.r * 10);
  const sign = c.dir.x < 0 ? -1 : 1;
  const vial = (c.r * 2) / POISON_VIAL.height;
  const glass = mix(c.primary, WHITE, 0.35);
  // The bottle itself is lighter, so its dark glass still reads over a dark map.
  const bottle = mix(c.primary, WHITE, 0.7);
  /** Where the bottle is over the ground at `u` (0..1 of the throw), how high above it, and so where it is drawn. */
  const flight = (u: number) => {
    const ground = c.along(u * 0.85 + easeIn(u) * 0.15);
    const h = Math.sin(Math.PI * u) * lift;
    return { ground, h, at: { x: ground.x, y: ground.y - h } };
  };
  /** A drop of venom at `at` moving along `angle`, `len` long: the picture hangs down, so it is turned to point its round end the way it moves. */
  const drop = (at: Point, angle: number, len: number, alpha: number) =>
    oval(c.stamps, "poison-drop", at, len / POISON_DROP.length * 0.45, len / POISON_DROP.length, glass, alpha, angle - Math.PI / 2, POISON_DROP.bulb);
  return {
    draw(e) {
      if (c.landed) return;
      const u = clamp01(e / c.L);
      const { ground, h, at } = flight(u);
      // Its shadow shrinks and fades the higher it flies.
      const up = clamp01(h / Math.max(1, lift));
      c.top.ellipse(ground.x, ground.y + c.r * 0.35, c.r * 0.5 * (1 - up * 0.5), c.r * 0.18 * (1 - up * 0.5)).fill({ color: 0x000000, alpha: 0.35 * (1 - up * 0.6) });
      // Clockwise about 300 degrees (mirrored when thrown left), fast, slow over the top, fast again, wobbling a little.
      const turn = sign * ((300 * Math.PI) / 180) * (u + 0.12 * Math.sin(TAU * u)) + Math.sin(e * 23) * 0.05;
      const stretch = 1 + 0.08 * clamp01((u - 0.5) * 2);
      if (oval(c.props, "poison-vial", at, vial, vial * stretch, bottle, 1, turn, POISON_VIAL.centre)) {
        stamp(c.stamps, "glow", at, c.r * 1.8, c.primary, 0.45);
        // Drips fall from where the bottle was when they left it.
        for (const d of drips) {
          if (u < d.at) continue;
          const age = (e - d.at * c.L) / (0.25 * c.D);
          if (age >= 1) continue;
          const from = flight(d.at).at;
          const p = { x: from.x + d.dx, y: from.y + c.r * 3 * age * age };
          drop(p, Math.PI / 2, c.r * d.size * 1.6, 1 - age);
        }
        // A thin ribbon of vapour behind it, and glowing bubbles that swell and fade.
        for (let k = 1; k <= 6; k++) {
          const back = flight(Math.max(0, u - k * 0.035)).at;
          stamp(c.stamps, "smoke-puff", back, c.r * (0.5 + k * 0.12), c.primary, 0.22 * (1 - k / 7), e * 2 + k);
        }
        for (const b of trailBubbles) {
          const age = (u - b.at) / 0.2;
          if (age <= 0 || age >= 1) continue;
          const p = flight(b.at).at;
          stamp(c.stamps, "poison-bubble", { x: p.x + b.dx, y: p.y - c.r * age * 0.6 }, c.r * b.size * (1 + age), glass, 1 - age);
        }
        return;
      }
      // Without the pictures, a glowing orb with a streak and satellites.
      const steps = 3 + Math.round(c.trail * 12);
      for (let k = 0; k < steps; k++) {
        streak(c.g, flight(Math.max(0, u - k * 0.03)).at, flight(Math.max(0, u - (k + 1) * 0.03)).at, Math.max(2, c.r * 0.3 * (1 - k / steps)), c.primary, c.secondary, 0.8 * (1 - k / steps));
      }
      glowOrb(c, at, c.r * 0.35, c.primary, c.secondary);
      satellites(c, at, c.r * 0.7, e, 3, Math.max(2, c.r * 0.08));
      if (rnd() < 0.5) c.emit(at, 1, c.r * 0.6, 0.5);
    },
    after(k) {
      const t = k * c.impactLen;
      // On the ground: a corrosive puddle spreads under it all and stays until the end.
      const pool = easeOut(clamp01(k / 0.35));
      const painted = oval(c.stamps, "poison-puddle", { x: c.to.x, y: c.to.y + c.r * 0.2 }, c.r * 3.4 * pool, c.r * 2.4 * pool, c.primary, 0.55 * (1 - clamp01((k - 0.8) / 0.2)));
      if (painted) {
        // The shatter: a white flash, glass shards spinning out, and a radial splash about the token's width.
        const hit = clamp01(k / 0.33);
        if (hit < 1) {
          stamp(c.stamps, "glow", c.to, c.r * 2.5 * (1 - hit), WHITE, (1 - hit) ** 2 * 0.8);
          stamp(c.stamps, "poison-splash", c.to, (c.r * 2.4 * easeOut(Math.min(1, hit * 1.6))) / 0.85, glass, 1 - hit, hit * 0.3);
          for (const sh of shards) {
            const d = sh.v * (t - 0.5 * t * t);
            stamp(c.stamps, "particle-shard", { x: c.to.x + Math.cos(sh.a) * d, y: c.to.y + Math.sin(sh.a) * d * 0.7 }, c.r * sh.size * 1.8, WHITE, 1 - hit, sh.a + sh.turn * t);
          }
          for (const dr of drops) {
            const d = dr.v * (t - 0.6 * t * t);
            const angle = Math.atan2(Math.sin(dr.a) * 0.7, Math.cos(dr.a));
            drop({ x: c.to.x + Math.cos(dr.a) * d, y: c.to.y + Math.sin(dr.a) * d * 0.7 }, angle, c.r * dr.size * 1.8, 1 - hit);
          }
        }
        // The cloud blooms to about one and a half token widths, drifts and thins out.
        const bloom = easeOut(clamp01((k - 0.11) / 0.4));
        const cloud = (k < 0.11 ? 0 : 1) * (1 - clamp01((k - 0.51) / 0.49));
        const drift = c.r * 0.4 * k;
        stamp(c.stamps, "toxic-cloud", { x: c.to.x + drift, y: c.to.y - c.r * 0.3 }, c.r * 3 * bloom * PUFF * 0.75, c.primary, 0.45 * cloud, k * 0.4);
        stamp(c.stamps, "toxic-cloud", { x: c.to.x - drift * 0.5, y: c.to.y - c.r * 0.4 }, c.r * 2 * bloom * PUFF * 0.75, c.secondary, 0.25 * cloud, 2 - k * 0.6);
        // Bubbles rise from the puddle, wobble and burst.
        for (const b of bubbles) {
          const kk = (k - b.start) / 0.35;
          if (kk <= 0) continue;
          const at = { x: c.to.x + b.x + Math.sin(b.wobble + kk * 9) * c.r * 0.12, y: c.to.y - c.r * 1.6 * kk + c.d.gravity * c.r * kk };
          if (kk >= 1) {
            if (!b.popped) {
              b.popped = true;
              c.emit(at, 3, c.r * 1.2, 0.45);
            }
            continue;
          }
          stamp(c.stamps, "poison-bubble", at, c.r * b.size * (0.6 + kk), glass, Math.min(1, kk * 4));
        }
        // Two skulls take shape in the vapour, rise a little and dissolve.
        for (const sk of skulls) {
          const kk = (k - sk.from) / (sk.to - sk.from);
          if (kk <= 0 || kk >= 1) continue;
          const size = (c.r * sk.size) / SKULL_WISP.height;
          oval(c.stamps, "skull-wisp", { x: c.to.x + sk.x, y: c.to.y - c.r * (1.7 + kk * 0.8) }, size, size * (1 + kk * 0.15), mix(c.secondary, WHITE, 0.6), Math.min(1, Math.sin(Math.PI * kk) * 1.4), Math.sin(kk * 4) * 0.08, SKULL_WISP.face);
        }
        // Heavy drops fall from the cloud's lower edge.
        for (const cd of cloudDrips) {
          const kk = (k - cd.at) / 0.18;
          if (kk <= 0 || kk >= 1) continue;
          drop({ x: c.to.x + cd.x, y: c.to.y + c.r * (0.1 + kk * kk * 0.9) }, Math.PI / 2, c.r * 0.5, cloud * (1 - kk));
        }
        return;
      }
      // Without the pictures: two puffs of smoke and the old bubbles.
      const cloud = Math.min(1, k * 3) * (1 - clamp01((k - 0.78) / 0.22));
      const outer = c.r * (1 + c.spread * 1.6) * easeOut(k * 2);
      const inner = c.r * (0.6 + c.spread) * easeOut(k * 2);
      if (stamp(c.stamps, "toxic-cloud", c.to, outer * PUFF, c.primary, 0.6 * cloud, k * 0.4)) {
        stamp(c.stamps, "toxic-cloud", c.to, inner * PUFF, c.secondary, 0.4 * cloud, 2 - k * 0.6);
      } else if (stamp(c.stamps, "smoke-puff", c.to, outer * PUFF, c.primary, 0.5 * cloud, k * 0.6)) {
        stamp(c.stamps, "smoke-puff", c.to, inner * PUFF, c.secondary, 0.35 * cloud, 2 - k * 0.9);
      } else {
        c.g.circle(c.to.x, c.to.y, outer).fill({ color: c.primary, alpha: 0.2 * cloud });
        c.g.circle(c.to.x, c.to.y, inner).fill({ color: c.secondary, alpha: 0.12 * cloud });
      }
      for (const pf of puffs) {
        const kk = (k - pf.start) / 0.5;
        if (kk <= 0) continue;
        const at = { x: c.to.x + Math.cos(pf.a) * pf.d, y: c.to.y + Math.sin(pf.a) * pf.d * 0.7 + c.d.gravity * c.r * 2.5 * Math.min(1, kk) };
        if (kk >= 1) {
          if (!pf.popped) {
            pf.popped = true;
            c.emit(at, 3, c.r * 1.5, 0.5);
          }
          continue;
        }
        const rad = pf.max * easeOut(kk);
        c.g.circle(at.x, at.y, rad).fill({ color: c.primary, alpha: 0.3 * (1 - kk * 0.5) });
        ring(c.g, at, rad, Math.max(1.5, c.r * 0.06), c.secondary, 1 - kk * 0.4);
        c.g.circle(at.x - rad * 0.35, at.y - rad * 0.35, rad * 0.18).fill({ color: WHITE, alpha: 0.7 * (1 - kk) });
      }
    },
  };
};

/**
 * Holy smite. Painted, a holy circle first glows up on the ground under the target, turning slowly
 * with a counter-turning star inside it while motes of light rise from it; a thin shaft of light
 * gathers from above; then a pillar of light (`count` of them, spread apart) crashes down onto it
 * and the circle flares out and fades. Without the pictures, a pillar of streaks over a closing ring.
 */
const smite: ShapeSpec["make"] = (c) => {
  const topY = c.to.y - c.r * 22;
  const xs = Array.from({ length: c.n }, (_, i) => (c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 3.5 : 0));
  /** Four slices, brighter towards the ground. Painted, a streak of light whose bright end is on the ground. */
  const pillar = (x: number, width: number, alpha: number) => {
    const base = { x: c.to.x + x, y: c.to.y };
    const top = { x: c.to.x + x, y: topY };
    if (span(c.stamps, "energy-streak", base, top, width * 4, c.secondary, alpha * 0.6)) {
      span(c.stamps, "energy-streak", base, top, width * 2, mix(c.primary, WHITE, 0.4), alpha);
      return;
    }
    for (let s = 0; s < 4; s++) {
      const y0 = lerp(topY, c.to.y, s / 4);
      const y1 = lerp(topY, c.to.y, (s + 1) / 4);
      streak(c.g, { x: c.to.x + x, y: y0 }, { x: c.to.x + x, y: y1 }, width, c.primary, c.secondary, (alpha * (s + 1)) / 4);
    }
  };
  // The circle spans the target and a little more; its picture is sized so its outer ring lands there.
  const circle = c.r * (1.7 + c.spread * 0.8);
  const sigilSize = circle / HOLY_SIGIL_RADIUS;
  const pillarTall = (c.r * 18) / HOLY_PILLAR.height;
  const holy = mix(c.primary, WHITE, 0.35);
  /** The circle at `size`, turned `turn`, with its inner star turning the other way. False when not painted. */
  const sigil = (size: number, turn: number, alpha: number) => {
    if (!stamp(c.stamps, "holy-sigil", c.to, size, holy, alpha, turn)) return false;
    stamp(c.stamps, "holy-sigil", c.to, size * 0.56, mix(c.secondary, WHITE, 0.4), alpha * 0.45, -turn * 1.6);
    stamp(c.stamps, "glow", c.to, size * 0.9, c.primary, alpha * 0.2);
    return true;
  };
  /** A pillar of holy light standing on the ground at `x`, `width` across. False when not painted. */
  const shaft = (x: number, width: number, alpha: number, flip = 1) =>
    oval(c.stamps, "holy-pillar", { x: c.to.x + x, y: c.to.y }, width * flip, pillarTall, mix(c.secondary, WHITE, 0.3), alpha, 0, HOLY_PILLAR.foot);
  // The circle turns a little faster as the strike nears; its angle is the integral of that speed.
  const turnAt = (u: number) => (0.25 + c.spin * 0.5) * TAU * (u + u * u);
  return {
    draw(e) {
      if (c.landed) return;
      const u = clamp01(e / c.L);
      const k = e / c.L;
      glowOrb(c, c.from, c.r * 0.3 * k, c.primary, c.secondary, k);
      // The circle draws itself out from the middle, then holds and brightens.
      const grow = easeOut(clamp01(u / 0.3));
      if (sigil(sigilSize * (0.35 + 0.65 * grow), turnAt(u), grow * (0.55 + 0.45 * u))) {
        // Motes of light rise off the ring.
        if (rnd() < 0.6) {
          const a = rnd() * TAU;
          c.emit({ x: c.to.x + Math.cos(a) * circle * 0.9, y: c.to.y + Math.sin(a) * circle * 0.9 }, 1, c.r * 0.5, 0.9);
        }
        // Then a thin shaft of light gathers from above.
        const gather = clamp01((u - 0.55) / 0.45);
        if (gather > 0) for (const x of xs) shaft(x, c.r * (0.35 + 0.5 * gather), gather * 0.7, Math.sin(e * 30) < 0 ? -1 : 1);
        return;
      }
      for (const x of xs) {
        pillar(x, c.r * (0.06 + 0.5 * easeIn(k)), 0.25 + 0.6 * k);
        glowRing(c, { x: c.to.x + x, y: c.to.y }, c.r * (2.2 - 1.4 * k), 2.5, c.accent, k, k * 2);
      }
    },
    after(k, e) {
      const f = 1 - clamp01(k / (0.3 + 0.7 * c.trail));
      // The circle flares outward and fades as the light strikes, still turning.
      const flare = sigil(sigilSize * (1 + easeOut(k) * 0.5), turnAt(1) + k * TAU * 0.6, (1 - k) ** 1.5);
      if (flare) {
        if (f <= 0) return;
        for (const x of xs) {
          const width = c.r * (2.6 + c.spread) * (0.45 + 0.55 * f) * (1 + 0.06 * Math.sin(e * 40));
          shaft(x, width * 1.8, f * 0.25);
          shaft(x, width, f * 0.8, Math.sin(e * 25) < 0 ? -1 : 1);
          if (rnd() < 0.8) c.emit({ x: c.to.x + x + (rnd() - 0.5) * c.r * 1.6, y: c.to.y }, 1, c.r * 0.8, 0.8);
        }
        return;
      }
      if (f <= 0) return;
      for (const x of xs) {
        const base = { x: c.to.x + x, y: c.to.y };
        pillar(x, c.r * (0.9 + 0.2 * Math.sin(e * 40)) * (0.4 + 0.6 * f), f);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + k * c.spin * 4;
          const len = c.r * (1.4 + easeOut(k) * 1.6);
          streak(c.g, base, { x: base.x + Math.cos(a) * len, y: base.y + Math.sin(a) * len }, Math.max(2, c.r * 0.08), c.accent, c.secondary, 0.6 * f);
        }
        if (rnd() < 0.8) c.emit({ x: base.x + (rnd() - 0.5) * c.r * 1.6, y: base.y }, 1, c.r * 0.8, 0.8);
      }
    },
  };
};

/** `count` expanding arcs from the attacker, fanning out as a cone towards the target. */
const sonic: ShapeSpec["make"] = (c) => ({
  draw(e) {
    const mid = Math.atan2(c.dir.y, c.dir.x);
    const half = 0.25 + c.spread * 0.9;
    const gap = (0.04 + c.trail * 0.07) * c.D;
    const R0 = c.r * 0.6;
    const segs = 22;
    glowRing(c, c.from, c.r * (0.5 + 0.4 * Math.sin(e * 20)), 2, c.accent, 0.6 * (1 - clamp01(e / c.L)), e * 3);
    for (let i = 0; i < c.n; i++) {
      const t = e - i * gap;
      if (t <= 0) continue;
      const R = R0 + (c.dist - R0) * (t / c.L);
      const alpha = (1 - clamp01((R - c.dist) / (c.r * 3))) * (1 - (i / c.n) * 0.5);
      if (alpha <= 0) continue;
      // Painted, the leading wave is a faint haze of the shockwave picture with its echoes, narrowed
      // to the cone (its arc spans about 74 degrees each side of its crest), under a thinner drawn
      // crest. The picture covers the wave's whole circle, so the waves behind it are crests alone:
      // a haze on every wave layered several screen-sized pictures each frame.
      const hazed = i === 0
        ? arc(c.stamps, "sonic-wave", c.from, R, mid, 1, c.primary, alpha * 0.3, clamp01(half / 1.29))
        : fxTexture("sonic-wave") !== null;
      const pts = Array.from({ length: segs + 1 }, (_, j) => {
        const ang = mid - half + (2 * half * j) / segs;
        const rad = R + Math.sin(j * 1.7 + e * c.spinRate) * c.r * 0.18 * c.spin;
        return { x: c.from.x + Math.cos(ang) * rad, y: c.from.y + Math.sin(ang) * rad };
      });
      // Without the haze, soft glows ride each wave so it shimmers like pressure in the air; with
      // either, the drawn line thins.
      let shimmer = hazed;
      for (let j = 2; j < segs && !hazed; j += 4) {
        const size = c.r * 1.6 * Math.sin((Math.PI * j) / segs);
        shimmer = stamp(c.stamps, "glow", pts[j]!, size, c.primary, alpha * 0.5) || shimmer;
      }
      for (let j = 0; j < segs; j++) {
        const w = Math.max(2, c.r * 0.38 * Math.sin((Math.PI * (j + 0.5)) / segs) * (1 - (i / c.n) * 0.4));
        streak(c.g, pts[j]!, pts[j + 1]!, shimmer ? Math.max(1.5, w * 0.6) : w, c.primary, c.secondary, alpha);
      }
    }
  },
});

/**
 * A funnel travels to the target, then unwinds there. Painted, it churns over a spinning swirl of
 * dust; chunks of rubble are dragged in along the ground, lifted up and round the funnel, tumbling
 * (dimmer and smaller while behind it), and thrown off near the top; when it reaches the target
 * everything it holds is flung outward and falls. Without the pictures, turning rings with dots.
 */
const tornado: ShapeSpec["make"] = (c) => {
  const height = c.r * 4.5;
  const layers = 10;
  const centreAt = (u: number): Point => {
    const p = c.along(u);
    const w = Math.sin(u * 9) * Math.sin(Math.PI * u) * c.arc * c.r * 1.2;
    return { x: p.x + c.normal.x * w, y: p.y + c.normal.y * w };
  };
  // Each chunk climbs the funnel once a lap, starting at its own point in the lap and angle.
  const lap = 0.9;
  const debris = Array.from({ length: 6 + c.n * 3 }, (_, i) => ({
    art: DEBRIS[i % DEBRIS.length]!, phase: rnd(), angle: rnd() * TAU, size: 0.38 + rnd() * 0.3, tumble: (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 8), shade: 0.5 + rnd() * 0.35,
  }));
  /** Where a chunk is, `f` of the way up, at `e`, round a funnel standing on `foot`; and whether it is in front. */
  const lifted = (d: (typeof debris)[number], foot: Point, f: number, e: number, scale: number) => {
    const ang = d.angle + e * c.spinRate * (1.3 - f * 0.5);
    const funnel = c.r * (0.35 + f * (0.7 + c.spread * 1.1)) * scale;
    // Near the ground it is still being dragged in from further out.
    const reach = f < 0.15 ? funnel + c.r * 1.4 * (1 - f / 0.15) : funnel;
    const at = { x: foot.x + Math.cos(ang) * reach, y: foot.y - f * height * scale + Math.sin(ang) * reach * 0.3 };
    return { at, front: Math.sin(ang) > 0, ang };
  };
  const rubble = (d: (typeof debris)[number], at: Point, size: number, front: boolean, alpha: number, e: number) =>
    stamp(c.props, d.art, at, size * (front ? 1 : 0.8), mix(mix(c.primary, WHITE, d.shade), 0x000000, front ? 0 : 0.25), alpha * (front ? 1 : 0.75), e * d.tumble);
  // Where each chunk was when the tornado reached the target, for flinging it.
  const released = new Map<number, { at: Point; ang: number }>();
  return {
    draw(e) {
      const t = clamp01(e / c.L);
      const k = c.landed ? clamp01((e - c.L) / c.impactLen) : 0;
      const foot = c.landed ? c.to : centreAt(easeIn(t) * 0.5 + t * 0.5);
      const scale = 1 - easeIn(k) * 0.85;
      const a = (1 - k * k) * easeOut(e / (0.2 * c.L));
      // Painted, the funnel is one picture standing on its tip (0.89 of its picture wide, 0.93
      // tall), churning as it fades into its own mirror image.
      const top = c.r * (0.8 + c.spread * 0.9) * scale * 1.4;
      const sway = Math.sin(e * 3) * 0.06;
      const churn = 0.5 + 0.5 * Math.sin(e * (2 + c.spinRate * 0.5));
      const funnel = mix(c.primary, c.secondary, 0.5);
      // A swirl of dust spins round its foot.
      stamp(c.stamps, "dust-swirl", { x: foot.x, y: foot.y + c.r * 0.1 }, c.r * (2.6 + c.spread) * (0.6 + 0.4 * scale), c.secondary, a * 0.55, -e * c.spinRate * 0.5);
      const painted = oval(c.stamps, "tornado", foot, (top * 2) / 0.89, (height * scale) / 0.93, funnel, a * (0.35 + 0.65 * churn), sway, TORNADO_TIP);
      if (painted) oval(c.stamps, "tornado", foot, (-top * 2) / 0.89, (height * scale) / 0.93, funnel, a * (0.35 + 0.65 * (1 - churn)), -sway, TORNADO_TIP);
      // Rubble rides the funnel until it reaches the target, then is flung out and falls.
      const carried = fxTexture(DEBRIS[0]!) !== null;
      if (carried) {
        debris.forEach((d, i) => {
          if (!c.landed) {
            const f = (e / lap + d.phase) % 1;
            // Fades in as it is picked up, and out as it is thrown off the top.
            const vis = Math.min(1, f / 0.08) * (1 - clamp01((f - 0.85) / 0.15));
            const { at, front } = lifted(d, foot, f, e, 1);
            const off = clamp01((f - 0.85) / 0.15);
            const thrown = { x: at.x + (at.x - foot.x) * off * 1.5, y: at.y - off * c.r * 0.5 };
            rubble(d, thrown, c.r * d.size, front, a * vis, e);
            return;
          }
          let from = released.get(i);
          if (!from) {
            const f = (c.L / lap + d.phase) % 1;
            const l = lifted(d, c.to, f, c.L, 1);
            from = { at: l.at, ang: l.ang };
            released.set(i, from);
          }
          const tt = e - c.L;
          const out = c.r * (3 + c.spread * 4);
          const at = { x: from.at.x + Math.cos(from.ang) * out * tt, y: from.at.y + Math.sin(from.ang) * out * 0.4 * tt - c.r * 3 * tt + c.r * 14 * tt * tt };
          rubble(d, at, c.r * d.size, true, 1 - k * k, e);
        });
      }
      for (let j = 0; j < layers; j++) {
        const f = j / (layers - 1);
        const x = foot.x + Math.sin(e * 8 + f * 5) * c.r * 0.15;
        const y = foot.y - f * height * scale;
        const rad = c.r * (0.25 + f * (0.55 + c.spread * 0.9)) * scale;
        // Without the funnel picture, each turn is a flattened puff of smoke, mirrored every other layer.
        const flip = j % 2 ? -1 : 1;
        if (!painted && !oval(c.stamps, "smoke-puff", { x, y }, rad * PUFF * flip, rad * 0.32 * PUFF * 1.4, mix(c.primary, c.secondary, f), a * (0.65 + 0.35 * f))) {
          c.g.ellipse(x, y, rad, rad * 0.32).stroke({ width: Math.max(2, c.r * 0.1), color: mix(c.primary, c.secondary, f), alpha: a * (0.3 + 0.4 * f) });
        }
        // Without the rubble pictures, dots orbit each turn.
        if (carried) continue;
        for (let q = 0; q < c.n; q++) {
          const ang = e * c.spinRate * (1 + f * 0.3) + (q / c.n) * TAU + f * 2;
          const front = Math.sin(ang) > 0;
          c.g.circle(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.32, c.r * (front ? 0.11 : 0.07)).fill({ color: front ? c.accent : c.secondary, alpha: a * (front ? 0.9 : 0.45) });
        }
      }
      if (rnd() < 0.2 + c.trail * 0.7) c.emit({ x: foot.x + (rnd() - 0.5) * c.r, y: foot.y }, 1, c.r * 1.5, 0.5);
    },
  };
};

/** When each shape lands, how big its impact is, and how it is drawn. */
export const STRIKE_SHAPES: Record<StrikeShape, ShapeSpec> = {
  slash: { land: 0.3, big: 1, impact: "light", make: cuts(1, true) },
  // The light impact's flash and rings, but no round burst: its sparks all go to its own cone.
  pierce: { land: 0.4, big: 1, impact: "light", ownSparks: true, make: pierce },
  claw: { land: 0.3, big: 1, impact: "light", make: cuts(1.15, false) },
  whirlwind: { land: 0.5, big: 1.3, impact: "full", make: whirlwind },
  slam: { land: 0.45, big: 1.8, impact: "full", make: slam },
  shadow: { land: 0.65, big: 1, impact: "light", make: shadow },
  projectile: { land: 0.55, big: 1, impact: "full", make: flyer("projectile") },
  // One heavy arrow: the volley's drawing with one arrow, down the middle (ADR 0067).
  arrow: { land: 0.6, big: 1, impact: "light", make: volley },
  volley: { land: 0.6, big: 1, impact: "light", make: volley },
  dagger: { land: 0.5, big: 1, impact: "light", make: dagger },
  fireball: { land: 0.5, big: 2.2, impact: "full", make: flyer("fireball") },
  meteor: { land: 0.55, big: 1.8, impact: "full", make: flyer("meteor") },
  explosion: { land: 0.6, big: 2.4, impact: "full", make: explosion },
  bolt: { land: 0.6, big: 1.5, impact: "full", make: flyer("bolt") },
  chain: { land: 0.3, big: 1.2, impact: "full", make: chain },
  beam: { land: 0.25, big: 1, impact: "light", make: beam },
  frost: { land: 0.45, big: 1.3, impact: "light", make: frost },
  poison: { land: 0.55, big: 1.2, impact: "light", make: poison },
  smite: { land: 0.62, big: 1.4, impact: "light", make: smite },
  sonic: { land: 0.45, big: 1.3, impact: "full", make: sonic },
  tornado: { land: 0.55, big: 1.6, impact: "light", make: tornado },
};
