import { z } from "zod";
import { MAX_ATTACK_LABEL, MAX_GROUP_ROLL_TOKENS, RolledDice } from "./dice";

/**
 * Area effects (ADR 0046): the GM rolls one formula for every token an effect catches, calls a
 * participant to roll the damage, and resolves each token's outcome in one undoable action.
 */

const EntityId = z.string().min(1).max(64);

/** One token an effect caught. `roll` is its save, the GM's alone: a player's copy has `null`. */
export const AreaEffectTarget = z.object({
  tokenId: EntityId,
  name: z.string().min(1).max(60),
  /** As rolled, like `AttackSide.hidden`: once concealed, the target stays concealed from players. */
  hidden: z.boolean(),
  roll: RolledDice.nullable(),
});
export type AreaEffectTarget = z.infer<typeof AreaEffectTarget>;

/** One roll for every target, or the same expression rolled once per target. */
export const DamageMode = z.enum(["single", "perTarget"]);
export type DamageMode = z.infer<typeof DamageMode>;

export const AreaEffectDamage = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), expression: z.string().min(1).max(32), byParticipantId: EntityId, ...RolledDice.shape }),
  z.object({
    mode: z.literal("perTarget"),
    expression: z.string().min(1).max(32),
    byParticipantId: EntityId,
    /** One per target that still existed when rolled; a player's copy holds only the targets they can see. */
    results: z.array(z.object({ tokenId: EntityId, ...RolledDice.shape })).max(MAX_GROUP_ROLL_TOKENS),
  }),
]);
export type AreaEffectDamage = z.infer<typeof AreaEffectDamage>;

export const AreaEffect = z.object({
  id: EntityId,
  label: z.string().min(1).max(MAX_ATTACK_LABEL).nullable(),
  /** The formula rolled for every target when the effect started. */
  expression: z.string().min(1).max(32),
  byParticipantId: EntityId,
  targets: z.array(AreaEffectTarget).max(MAX_GROUP_ROLL_TOKENS),
  /** Who is to roll the damage; null until the GM calls someone (themselves included). */
  call: z.object({ participantId: EntityId }).nullable(),
  damage: AreaEffectDamage.nullable(),
});
export type AreaEffect = z.infer<typeof AreaEffect>;

/** Where an effect is, derived from its data so the two can't disagree. */
export type AreaEffectStage = "started" | "called" | "rolled";
export function areaEffectStage(effect: Pick<AreaEffect, "call" | "damage">): AreaEffectStage {
  if (effect.damage) return "rolled";
  return effect.call ? "called" : "started";
}

/** The damage rolled for one target, or null when none was (or it was rolled after the target was gone). */
export function rolledDamageFor(effect: Pick<AreaEffect, "damage">, tokenId: string): number | null {
  const damage = effect.damage;
  if (!damage) return null;
  if (damage.mode === "single") return damage.total;
  return damage.results.find((r) => r.tokenId === tokenId)?.total ?? null;
}

/** Half of a rolled amount, rounded down: the Half button's value. */
export const halfDamage = (rolled: number) => Math.floor(rolled / 2);

/** Fixed bounds on a typed amount; negative heals. */
export const MAX_AREA_AMOUNT = 9999;
