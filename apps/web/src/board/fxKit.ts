import type { Graphics } from "pixi.js";
import type { ParticleShape, Point } from "@vtt/shared";

/**
 * Small drawing helpers shared by every effect in `fx.ts` and `fxStrikes.ts`: colours, easing,
 * sparks and glowing primitives. Pure Pixi `Graphics` calls and arithmetic; no display object is
 * created here, so nothing in this file needs destroying.
 */

export const WHITE = 0xffffff;
export const hex = (color: string) => parseInt(color.slice(1), 16);
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t: number) => clamp01(t) ** 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPoint = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ---------- particles ----------

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: number;
  /** Pixels per second squared, downwards. */
  gravity: number;
  rot: number;
  spin: number;
}

/** Sparks alive at once, however many bursts overlap. */
const MAX_LIVE_SPARKS = 160;

/** Sparks thrown within `cone` radians either side of `angle`, not all round. */
export interface BurstAim {
  angle: number;
  cone: number;
}

export function burst(list: Spark[], at: Point, count: number, speed: number, size: number, colors: number[], life = 0.7, gravity = 0, spin = 6, aim?: BurstAim) {
  for (let i = 0; i < count; i++) {
    if (list.length >= MAX_LIVE_SPARKS) return;
    const angle = aim ? aim.angle + (Math.random() * 2 - 1) * aim.cone : Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    list.push({
      x: at.x, y: at.y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, age: 0,
      life: life * (0.6 + Math.random() * 0.6), size: size * (0.5 + Math.random()), color: colors[i % colors.length]!, gravity,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2 * spin,
    });
  }
}

export function stepSparks(list: Spark[], dt: number) {
  let live = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    s.age += dt;
    if (s.age >= s.life) {
      continue;
    }
    s.vy += s.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.spin * dt;
    list[live++] = s;
  }
  list.length = live;
}

/** The corners of a star with four points, `outer` from the centre, turned by `rot`. */
function starPoints(x: number, y: number, outer: number, rot: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? outer : outer * 0.38;
    pts.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  return pts;
}

/** A diamond `len` long and `wid` wide, pointing along `angle`. */
function diamondPoints(x: number, y: number, angle: number, len: number, wid: number, tail = 1): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x + c * len, y + s * len, x - s * wid, y + c * wid, x - c * len * tail, y - s * len * tail, x + s * wid, y - c * wid];
}

/** Each spark is a hot core with a soft halo, drawn the way `look` says; the blurred halo copy of the layer does the rest. */
export function drawSparks(g: Graphics, list: readonly Spark[], look: ParticleShape = "spark") {
  for (const s of list) {
    const a = 1 - s.age / s.life;
    const core = mix(s.color, WHITE, 0.5);
    switch (look) {
      case "star":
        g.circle(s.x, s.y, s.size * 2).fill({ color: s.color, alpha: a * 0.2 });
        g.poly(starPoints(s.x, s.y, s.size * 2.6, s.rot)).fill({ color: core, alpha: a });
        break;
      case "square": {
        const h = s.size * 1.1;
        const c = Math.cos(s.rot) * h;
        const n = Math.sin(s.rot) * h;
        g.poly([s.x + c - n, s.y + n + c, s.x - c - n, s.y - n + c, s.x - c + n, s.y - n - c, s.x + c + n, s.y + n - c]).fill({ color: core, alpha: a });
        g.circle(s.x, s.y, s.size * 2).fill({ color: s.color, alpha: a * 0.15 });
        break;
      }
      case "shard":
        g.poly(diamondPoints(s.x, s.y, Math.atan2(s.vy, s.vx), s.size * 3, s.size * 0.7, 0.5)).fill({ color: core, alpha: a });
        break;
      case "ring":
        g.circle(s.x, s.y, s.size * 1.7).stroke({ width: Math.max(1, s.size * 0.5), color: core, alpha: a });
        break;
      default:
        g.circle(s.x, s.y, s.size * 2.4).fill({ color: s.color, alpha: a * 0.22 });
        g.circle(s.x, s.y, s.size).fill({ color: core, alpha: a });
    }
  }
}

// ---------- shared drawing ----------

export function ring(g: Graphics, at: Point, radius: number, width: number, color: number, alpha: number) {
  if (alpha <= 0 || radius <= 0) return;
  g.circle(at.x, at.y, radius).stroke({ width, color, alpha });
}

/** A soft glowing disc: halo, body, white core. */
export function orb(g: Graphics, at: Point, radius: number, primary: number, secondary: number, alpha = 1) {
  g.circle(at.x, at.y, radius * 2.3).fill({ color: secondary, alpha: alpha * 0.25 });
  g.circle(at.x, at.y, radius * 1.4).fill({ color: primary, alpha: alpha * 0.55 });
  g.circle(at.x, at.y, radius).fill({ color: primary, alpha });
  g.circle(at.x, at.y, radius * 0.5).fill({ color: WHITE, alpha });
}

/** A trail or bolt segment drawn three times: wide halo, body, white core. */
export function streak(g: Graphics, a: Point, b: Point, width: number, primary: number, secondary: number, alpha: number) {
  if (alpha <= 0) return;
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: width * 2.4, color: secondary, alpha: alpha * 0.3, cap: "round" });
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color: primary, alpha: alpha * 0.8, cap: "round" });
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: width * 0.4, color: WHITE, alpha, cap: "round" });
}

/** A lightning line between two points: `pieces` jagged segments, each off the line by up to `jitter`. */
export function lightning(g: Graphics, a: Point, b: Point, pieces: number, jitter: number, width: number, primary: number, secondary: number, alpha: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let last = a;
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces;
    const off = i === pieces ? 0 : (Math.random() - 0.5) * 2 * jitter;
    const next = { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
    streak(g, last, next, width, primary, secondary, alpha);
    last = next;
  }
}

/** Points along an arc of a circle, from angle `a0` to `a1`. */
export function arcPoints(centre: Point, radius: number, a0: number, a1: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / segments);
    return { x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius };
  });
}

/** A line through `pts` that thickens towards its end (`taper`) and fades in towards it. */
export function polyline(g: Graphics, pts: readonly Point[], width: number, primary: number, secondary: number, alpha: number, taper = true) {
  const last = pts.length - 1;
  for (let i = 0; i < last; i++) {
    const f = taper ? (i + 1) / last : 1;
    streak(g, pts[i]!, pts[i + 1]!, Math.max(2, width * f), primary, secondary, alpha * (taper ? f : 1));
  }
}

/** A blade: a long diamond pointing along `angle`, with a bright edge down its middle. */
export function blade(g: Graphics, at: Point, angle: number, len: number, wid: number, color: number, alpha: number) {
  g.poly(diamondPoints(at.x, at.y, angle, len, wid * 1.8, 0.45)).fill({ color, alpha: alpha * 0.35 });
  g.poly(diamondPoints(at.x, at.y, angle, len, wid, 0.45)).fill({ color, alpha });
  g.poly(diamondPoints(at.x, at.y, angle, len * 0.9, wid * 0.35, 0.4)).fill({ color: WHITE, alpha });
}
