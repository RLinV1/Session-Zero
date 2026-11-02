import { z } from "zod";

/**
 * A board animation as plain data (ADR 0038). Flat and bounded, so the server can validate it
 * from any client, a GM can edit it in a form, and one renderer plays every look. The built-in
 * attack styles and the nuke are values of this type too.
 */
export const ANIMATION_SHAPES = [
  "slash", "claw", "whirlwind", "slam", "shadow",
  "projectile", "volley", "dagger", "fireball", "meteor", "explosion",
  "bolt", "chain", "beam", "frost", "poison", "smite", "sonic", "tornado",
  "nuke",
] as const;
export const AnimationShape = z.enum(ANIMATION_SHAPES);
export type AnimationShape = z.infer<typeof AnimationShape>;

/** How the sparks of an animation are drawn. */
export const PARTICLE_SHAPES = ["spark", "star", "square", "shard", "ring"] as const;
export const ParticleShape = z.enum(PARTICLE_SHAPES);
export type ParticleShape = z.infer<typeof ParticleShape>;

/** How an attack is drawn when the attack names no animation of its own. */
export const AttackStyle = z.enum(["melee", "ranged", "magic"]);
export type AttackStyle = z.infer<typeof AttackStyle>;

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour like #ff8800");
const Unit = z.number().min(0).max(1);

export const MAX_ANIMATION_NAME = 60;
/** Animations one GM may keep in the library. */
export const MAX_LIBRARY_ANIMATIONS = 100;

export const AnimationDef = z.object({
  shape: AnimationShape,
  /** Seconds the effect plays for; up to 8 so the nuke's siren has time before its blast (ADR 0047). */
  duration: z.number().min(0.2).max(8),
  primary: HexColor,
  secondary: HexColor,
  /** Scales the effect against the token it is drawn on, 1 = a token's size. */
  size: z.number().min(0.5).max(3),
  /** Sparks thrown out on impact. */
  particles: z.number().int().min(0).max(120),
  glow: Unit,
  shake: Unit,
  flash: Unit,
  // Added after the first four shapes: every field below may be missing from an older stored
  // definition, which then reads with its shape's default preset.
  /** A third colour for the effect's palette; without one a tint of the primary is used. */
  accent: HexColor.optional(),
  /** How the sparks are drawn. */
  particleShape: ParticleShape.optional(),
  /** Hits: arrows, cuts, blades, chain jumps, spikes, puffs, arcs. */
  count: z.number().int().min(1).max(12).optional(),
  /** Fan, offset or width of the effect. */
  spread: Unit.optional(),
  /** Height of the flight curve. */
  arc: Unit.optional(),
  /** Length of trails and afterglow. */
  trail: Unit.optional(),
  /** Rotation speed. */
  spin: Unit.optional(),
  /** Particle gravity: -1 rises, 1 falls. */
  gravity: z.number().min(-1).max(1).optional(),
  /** Rings thrown out on impact. */
  rings: z.number().int().min(0).max(5).optional(),
});
export type AnimationDef = z.infer<typeof AnimationDef>;

/** A strike animation: anything but the map-wide nuke. */
export const StrikeAnimationDef = AnimationDef.refine((a) => a.shape !== "nuke", { message: "A nuke cannot be used for an attack" });
/** The blast animation of a nuke. */
export const NukeAnimationDef = AnimationDef.refine((a) => a.shape === "nuke", { message: "Only a nuke animation can be used for a nuke" });

/** The most damage one nuke may deal to each token. */
export const MAX_NUKE_DAMAGE = 999;

export const AnimationName = z.string().trim().min(1).max(MAX_ANIMATION_NAME);

/** A saved animation as the library API returns it (ADR 0038). The owner stays on the server. */
export interface LibraryAnimation {
  id: string;
  name: string;
  def: AnimationDef;
  createdAt: string;
  updatedAt: string;
}

export const CreateAnimationRequest = z.object({ name: AnimationName, def: AnimationDef });
export type CreateAnimationRequest = z.infer<typeof CreateAnimationRequest>;

export const UpdateAnimationRequest = z
  .object({ name: AnimationName.optional(), def: AnimationDef.optional() })
  .refine((p) => p.name !== undefined || p.def !== undefined, { message: "Nothing to change" });
export type UpdateAnimationRequest = z.infer<typeof UpdateAnimationRequest>;
