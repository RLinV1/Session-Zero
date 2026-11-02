import type { ISourceOptions } from "@tsparticles/engine";
import { ANIMATION_SHAPES, type AnimationDef, type AnimationShape, type AttackStyle, type ConditionId, type Point } from "@vtt/shared";

/**
 * The look of every effect the overlay draws (board-effects-overlay). Pure data and arithmetic: no
 * React, no DOM, no Pixi, so the presets can be unit-tested. `EffectsOverlay` turns them into
 * framer-motion elements and tsparticles canvases. Sizes are in board pixels; the overlay's world
 * element carries the board's zoom and pan.
 */

/** Tokens that show condition particles at once; the rest keep their badges only. */
export const MAX_CONDITION_EMITTERS = 12;

/** Include a small margin so glows do not pop out as their token leaves the view. */
export function conditionTokenInView(token: { position: Point; size: number }, view: { x: number; y: number; halfWidth: number; halfHeight: number }, cell: number): boolean {
  return Math.abs(token.position.x - view.x) <= view.halfWidth + token.size * cell * 2
    && Math.abs(token.position.y - view.y) <= view.halfHeight + token.size * cell * 2;
}

/** How the overlay draws a condition on top of the token's own art change. */
export type ConditionVisual =
  | { kind: "particles" }
  | { kind: "ring"; color: string; dashed: boolean; pulse: boolean }
  | { kind: "text"; text: string; color: string }
  | { kind: "veil" };

/** Total record: a new ConditionId without a look fails typecheck. */
export const CONDITION_VISUALS: Record<ConditionId, ConditionVisual> = {
  blinded: { kind: "veil" },
  charmed: { kind: "particles" },
  frightened: { kind: "particles" },
  grappled: { kind: "ring", color: "#22d3ee", dashed: true, pulse: true },
  invisible: { kind: "particles" },
  paralyzed: { kind: "particles" },
  poisoned: { kind: "particles" },
  // The token art lies flattened on the canvas; the overlay adds a steady amber ring so the overlay has its own mark.
  prone: { kind: "ring", color: "#f97316", dashed: false, pulse: false },
  restrained: { kind: "ring", color: "#a78bfa", dashed: true, pulse: false },
  stunned: { kind: "particles" },
  unconscious: { kind: "text", text: "Zz", color: "#ffffff" },
  concentrating: { kind: "ring", color: "#3b82f6", dashed: false, pulse: true },
};

/** Particle conditions only: the colour of the glow behind the token's particles. */
export const CONDITION_GLOW: Partial<Record<ConditionId, string>> = {
  poisoned: "rgba(74, 222, 128, 0.35)",
  charmed: "rgba(244, 114, 182, 0.3)",
  paralyzed: "rgba(250, 204, 21, 0.3)",
};

/** The box a token's particles are drawn in: the token plus room for them to rise out of it. */
export function particleBox(radius: number): { width: number; height: number; offsetX: number; offsetY: number } {
  const width = radius * 3;
  const height = radius * 3.2;
  return { width, height, offsetX: -width / 2, offsetY: -radius * 2.2 };
}

type Particles = NonNullable<ISourceOptions["particles"]>;

const BASE = {
  fullScreen: { enable: false },
  fpsLimit: 30,
  detectRetina: false,
  pauseOnBlur: true,
  pauseOnOutsideViewport: true,
  background: { color: { value: "transparent" } },
} satisfies ISourceOptions;

function emitter(radius: number, particles: Particles): ISourceOptions {
  return { ...BASE, particles };
}

/**
 * The tsparticles options for a particle condition, or null for the others. Looks the same for
 * every viewer; `reduced` gives no options at all, because reduced motion draws no particles.
 */
export function conditionParticleOptions(id: ConditionId, radius: number, reduced: boolean): ISourceOptions | null {
  if (reduced || CONDITION_VISUALS[id].kind !== "particles") return null;
  const r = Math.max(radius, 8);
  const move = (direction: "top" | "bottom" | "none", speed: number) => ({
    enable: true,
    direction,
    speed,
    straight: false,
    outModes: { default: "destroy" as const },
  });
  switch (id) {
    case "poisoned":
      // Bubbles that swell as they rise and burst.
      return emitter(r, {
        number: { value: 14, limit: { value: 18, mode: "delete" } },
        color: { value: ["#4ade80", "#86efac", "#22c55e", "#bef264"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.35, max: 0.9 }, animation: { enable: true, speed: 0.9, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.05, max: r * 0.14 }, animation: { enable: true, speed: r * 0.12, startValue: "min", destroy: "none", sync: false } },
        stroke: { width: 1, color: "#14532d", opacity: 0.6 },
        move: move("top", r * 0.1),
      });
    case "charmed":
      return emitter(r, {
        number: { value: 8, limit: { value: 10, mode: "delete" } },
        color: { value: ["#f472b6", "#fb7185", "#f9a8d4"] },
        shape: { type: "star", options: { star: { sides: 5 } } },
        opacity: { value: { min: 0.4, max: 1 }, animation: { enable: true, speed: 0.7, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.08, max: r * 0.17 } },
        move: move("top", r * 0.07),
      });
    case "frightened":
      // Cold sweat drops running down.
      return emitter(r, {
        number: { value: 6, limit: { value: 8, mode: "delete" } },
        color: { value: ["#93c5fd", "#bfdbfe"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.5, max: 0.9 }, animation: { enable: true, speed: 0.9, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.04, max: r * 0.09 } },
        move: move("bottom", r * 0.12),
      });
    case "paralyzed":
      // Short, fast yellow crackles.
      return emitter(r, {
        number: { value: 16, limit: { value: 20, mode: "delete" } },
        color: { value: ["#facc15", "#fde047", "#ffffff"] },
        shape: { type: "star", options: { star: { sides: 4 } } },
        opacity: { value: { min: 0.5, max: 1 }, animation: { enable: true, speed: 4, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.04, max: r * 0.1 } },
        move: { ...move("none", r * 0.5), random: true },
      });
    case "stunned":
      return emitter(r, {
        number: { value: 6, limit: { value: 8, mode: "delete" } },
        color: { value: ["#fde047", "#fbbf24"] },
        shape: { type: "star", options: { star: { sides: 5 } } },
        opacity: { value: { min: 0.6, max: 1 }, animation: { enable: true, speed: 0.6, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.08, max: r * 0.15 } },
        rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
        move: { ...move("top", r * 0.06), random: true },
      });
    case "invisible":
      // Faint shimmer.
      return emitter(r, {
        number: { value: 10, limit: { value: 12, mode: "delete" } },
        color: { value: ["#e2e8f0", "#ffffff"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.1, max: 0.6 }, animation: { enable: true, speed: 1.2, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.03, max: r * 0.07 } },
        move: { ...move("none", r * 0.08), random: true },
      });
    default:
      return null;
  }
}

/** The condition ids on `conditions` the overlay draws as particles. */
export function particleConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_VISUALS[id].kind === "particles");
}

/**
 * Which tokens get condition particles: the `limit` nearest `centre`, so a crowded board keeps the
 * effects the viewer is looking at. Ties keep input order.
 */
export function pickEmitterTokens<T extends { position: Point }>(tokens: readonly T[], centre: Point, limit = MAX_CONDITION_EMITTERS): T[] {
  const dist = (t: T) => Math.hypot(t.position.x - centre.x, t.position.y - centre.y);
  return tokens
    .map((token, index) => ({ token, index, d: dist(token) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.token);
}

/** Unit vectors for `count` sparks, spread evenly and nudged by `seed` so bursts differ. */
export function sparkVectors(count: number, seed: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (seed % 7) * 0.31;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/** Spark distance multipliers, so a burst has long and short rays. */
export const SPARK_REACH = [1, 0.7, 1.15, 0.8, 1.05, 0.65, 1.2, 0.75];

/** Seconds of the strike's flight and of the burst that follows, for the full-motion version. */
export const STRIKE_FLIGHT_S = 0.5;
export const IMPACT_S = 0.5;

// ---------- built-in attack and nuke animations (ADR 0038) ----------

/** A definition with every optional field filled in. */
export type FullAnimationDef = Required<AnimationDef>;

type Look = Pick<FullAnimationDef, "duration" | "primary" | "secondary" | "accent" | "size" | "particles" | "glow" | "shake" | "flash">;
type Tuning = Pick<FullAnimationDef, "count" | "spread" | "arc" | "trail" | "spin" | "gravity" | "rings" | "particleShape">;

function preset(shape: AnimationShape, look: Look, tuning: Tuning): FullAnimationDef {
  return { shape, ...look, ...tuning };
}

/**
 * One tuned default preset per shape: the look a shape has when nobody has edited it. Choosing a
 * shape in the library editor loads its preset, an attack style with no animation plays one, and a
 * stored definition that lacks the later fields reads with the missing ones from here.
 */
export const SHAPE_DEFAULTS: Record<AnimationShape, FullAnimationDef> = {
  slash: preset("slash", { duration: 0.9, primary: "#ff8a1f", secondary: "#ffd24a", accent: "#fff1b8", size: 1.4, particles: 28, glow: 0.7, shake: 0.5, flash: 0.45 },
    { count: 1, spread: 0.3, arc: 0.45, trail: 0.6, spin: 0.3, gravity: 0.5, rings: 2, particleShape: "spark" }),
  claw: preset("claw", { duration: 0.9, primary: "#e11d48", secondary: "#fda4af", accent: "#fff1f2", size: 1.3, particles: 30, glow: 0.6, shake: 0.55, flash: 0.35 },
    { count: 3, spread: 0.35, arc: 0.45, trail: 0.55, spin: 0.3, gravity: 0.5, rings: 1, particleShape: "shard" }),
  whirlwind: preset("whirlwind", { duration: 1.4, primary: "#38bdf8", secondary: "#e0f2fe", accent: "#a7f3d0", size: 1.3, particles: 30, glow: 0.7, shake: 0.4, flash: 0.3 },
    { count: 4, spread: 0.45, arc: 0.5, trail: 0.6, spin: 0.7, gravity: 0.2, rings: 2, particleShape: "shard" }),
  slam: preset("slam", { duration: 1.2, primary: "#b45309", secondary: "#fcd34d", accent: "#fef3c7", size: 1.4, particles: 40, glow: 0.55, shake: 0.9, flash: 0.5 },
    { count: 8, spread: 0.6, arc: 0.6, trail: 0.5, spin: 0.3, gravity: 0.7, rings: 3, particleShape: "square" }),
  shadow: preset("shadow", { duration: 1.4, primary: "#7c3aed", secondary: "#c4b5fd", accent: "#f0abfc", size: 1.2, particles: 30, glow: 0.8, shake: 0.35, flash: 0.35 },
    { count: 5, spread: 0.5, arc: 0.5, trail: 0.7, spin: 0.2, gravity: -0.1, rings: 1, particleShape: "shard" }),
  projectile: preset("projectile", { duration: 1, primary: "#9ad7ff", secondary: "#e8f6ff", accent: "#ffffff", size: 1.1, particles: 22, glow: 0.65, shake: 0.25, flash: 0.35 },
    { count: 1, spread: 0.3, arc: 0.4, trail: 0.55, spin: 0.4, gravity: 0.4, rings: 2, particleShape: "spark" }),
  volley: preset("volley", { duration: 1.3, primary: "#a3e635", secondary: "#ecfccb", accent: "#fef08a", size: 1.1, particles: 24, glow: 0.5, shake: 0.3, flash: 0.25 },
    { count: 7, spread: 0.6, arc: 0.7, trail: 0.5, spin: 0.2, gravity: 0.5, rings: 1, particleShape: "square" }),
  dagger: preset("dagger", { duration: 1, primary: "#cbd5e1", secondary: "#f8fafc", accent: "#fb7185", size: 1.1, particles: 24, glow: 0.55, shake: 0.3, flash: 0.3 },
    { count: 3, spread: 0.5, arc: 0.4, trail: 0.5, spin: 0.7, gravity: 0.4, rings: 1, particleShape: "shard" }),
  fireball: preset("fireball", { duration: 1.4, primary: "#f97316", secondary: "#fde68a", accent: "#fff7ed", size: 1.4, particles: 70, glow: 0.9, shake: 0.6, flash: 0.7 },
    { count: 1, spread: 0.3, arc: 0.35, trail: 0.7, spin: 0.5, gravity: -0.3, rings: 2, particleShape: "spark" }),
  meteor: preset("meteor", { duration: 1.5, primary: "#ea580c", secondary: "#fcd34d", accent: "#fef9c3", size: 1.6, particles: 80, glow: 0.85, shake: 0.85, flash: 0.75 },
    { count: 1, spread: 0.4, arc: 0.45, trail: 0.75, spin: 0.6, gravity: 0.6, rings: 3, particleShape: "square" }),
  explosion: preset("explosion", { duration: 2, primary: "#ef4444", secondary: "#fde047", accent: "#f97316", size: 1.5, particles: 70, glow: 0.9, shake: 0.8, flash: 0.8 },
    { count: 6, spread: 0.6, arc: 0.5, trail: 0.5, spin: 0.5, gravity: 0.6, rings: 3, particleShape: "spark" }),
  bolt: preset("bolt", { duration: 1.3, primary: "#a855f7", secondary: "#e9b8ff", accent: "#ffffff", size: 1.3, particles: 44, glow: 0.9, shake: 0.4, flash: 0.55 },
    { count: 1, spread: 0.3, arc: 0.55, trail: 0.5, spin: 0.3, gravity: 0, rings: 2, particleShape: "star" }),
  chain: preset("chain", { duration: 1.5, primary: "#facc15", secondary: "#fef9c3", accent: "#60a5fa", size: 1.1, particles: 40, glow: 0.95, shake: 0.35, flash: 0.5 },
    { count: 4, spread: 0.6, arc: 0.5, trail: 0.5, spin: 0.3, gravity: 0, rings: 1, particleShape: "star" }),
  beam: preset("beam", { duration: 1.4, primary: "#22d3ee", secondary: "#cffafe", accent: "#ffffff", size: 1.2, particles: 40, glow: 0.95, shake: 0.3, flash: 0.4 },
    { count: 1, spread: 0.3, arc: 0.2, trail: 0.67, spin: 0.5, gravity: -0.2, rings: 2, particleShape: "spark" }),
  frost: preset("frost", { duration: 1.4, primary: "#38bdf8", secondary: "#e0f2fe", accent: "#ffffff", size: 1.3, particles: 50, glow: 0.7, shake: 0.4, flash: 0.4 },
    { count: 7, spread: 0.55, arc: 0.3, trail: 0.6, spin: 0.4, gravity: 0.1, rings: 2, particleShape: "shard" }),
  poison: preset("poison", { duration: 1.6, primary: "#22c55e", secondary: "#bef264", accent: "#a3e635", size: 1.3, particles: 40, glow: 0.7, shake: 0.15, flash: 0.2 },
    { count: 8, spread: 0.5, arc: 0.5, trail: 0.6, spin: 0.4, gravity: -0.5, rings: 1, particleShape: "ring" }),
  smite: preset("smite", { duration: 2.5, primary: "#fbbf24", secondary: "#fffbeb", accent: "#fde68a", size: 1.4, particles: 50, glow: 1, shake: 0.5, flash: 0.8 },
    { count: 1, spread: 0.4, arc: 0.2, trail: 0.6, spin: 0.5, gravity: -0.7, rings: 3, particleShape: "star" }),
  sonic: preset("sonic", { duration: 1.2, primary: "#2dd4bf", secondary: "#ccfbf1", accent: "#ffffff", size: 1.2, particles: 24, glow: 0.7, shake: 0.7, flash: 0.3 },
    { count: 4, spread: 0.6, arc: 0.3, trail: 0.5, spin: 0.5, gravity: 0, rings: 2, particleShape: "ring" }),
  tornado: preset("tornado", { duration: 1.7, primary: "#94a3b8", secondary: "#e2e8f0", accent: "#4ade80", size: 1.4, particles: 40, glow: 0.5, shake: 0.6, flash: 0.2 },
    { count: 3, spread: 0.5, arc: 0.5, trail: 0.6, spin: 0.8, gravity: -0.2, rings: 1, particleShape: "square" }),
  nuke: preset("nuke", { duration: 6.5, primary: "#ff6a00", secondary: "#fff4d6", accent: "#ffd24a", size: 3, particles: 120, glow: 0.9, shake: 0.9, flash: 0.9 },
    { count: 1, spread: 0.5, arc: 0.5, trail: 0.5, spin: 0.5, gravity: 0.3, rings: 3, particleShape: "spark" }),
};

/** A definition ready to draw: every field filled; the accent stays missing when the definition has none (a tint of the primary is used). */
export type ResolvedAnimation = Omit<FullAnimationDef, "accent"> & { accent?: string };

/** `def` with every field it leaves out taken from the default preset of its shape. */
export function withDefaults(def: AnimationDef): ResolvedAnimation {
  const base = SHAPE_DEFAULTS[def.shape];
  return {
    ...def,
    particleShape: def.particleShape ?? base.particleShape,
    count: def.count ?? base.count,
    spread: def.spread ?? base.spread,
    arc: def.arc ?? base.arc,
    trail: def.trail ?? base.trail,
    spin: def.spin ?? base.spin,
    gravity: def.gravity ?? base.gravity,
    rings: def.rings ?? base.rings,
  };
}

/** Built-in look of each attack style, used when an attack names no animation of its own. */
export const ATTACK_STYLE_PRESETS: Record<AttackStyle, AnimationDef> = {
  melee: SHAPE_DEFAULTS.slash,
  ranged: SHAPE_DEFAULTS.projectile,
  magic: SHAPE_DEFAULTS.bolt,
};

/** The nuke's built-in blast: orange fire with a white flash and a heavy shake. */
export const NUKE_PRESET: AnimationDef = SHAPE_DEFAULTS.nuke;

/** Display name of each shape's built-in, for the library's "Start from built-in" and the nuke picker. */
const BUILTIN_NAMES: Record<AnimationShape, string> = {
  slash: "Melee slash",
  claw: "Claw rake",
  whirlwind: "Whirlwind blades",
  slam: "Ground slam",
  shadow: "Shadow strike",
  projectile: "Ranged projectile",
  volley: "Arrow volley",
  dagger: "Thrown daggers",
  fireball: "Fireball",
  meteor: "Meteor",
  explosion: "Explosion",
  bolt: "Magic bolt",
  chain: "Chain lightning",
  beam: "Arcane beam",
  frost: "Frost spikes",
  poison: "Poison cloud",
  smite: "Holy smite",
  sonic: "Sonic wave",
  tornado: "Tornado",
  nuke: "Nuke",
};

/** Ids the first built-ins had before every shape got one; saved links and tests use them. */
const BUILTIN_IDS: Partial<Record<AnimationShape, string>> = { slash: "builtin-melee", projectile: "builtin-ranged", bolt: "builtin-magic" };

/** Every shape's default preset with a display name, in shape order. */
export const BUILTIN_ANIMATIONS: ReadonlyArray<{ id: string; name: string; def: AnimationDef }> = ANIMATION_SHAPES.map((shape) => ({
  id: BUILTIN_IDS[shape] ?? `builtin-${shape}`,
  name: BUILTIN_NAMES[shape],
  def: SHAPE_DEFAULTS[shape],
}));
