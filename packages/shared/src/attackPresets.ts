import { z } from "zod";
import { sharedMsg, validationMessage } from "./i18n";
import { StrikeAnimationDef } from "./animation";
import { MAX_ATTACK_LABEL, type AttackKind } from "./dice";

/** Named rolls copied from a creature into a placed token (KAN-70). */
export const MAX_TOKEN_ATTACKS = 8;
/** Most targets one multi-target attack may be rolled at together. */
export const MAX_ATTACK_TARGETS = 10;
export const AttackDice = z.object({
  count: z.number().int().min(1).max(20),
  sides: z.number().int().refine((s) => [4, 6, 8, 10, 12, 20, 100].includes(s), { message: validationMessage(sharedMsg("valid.supportedDie")) }),
  modifier: z.number().int().min(-99).max(99),
});
export type AttackDice = z.infer<typeof AttackDice>;
export const AttackPreset = z.object({
  name: z.string().trim().min(1).max(MAX_ATTACK_LABEL),
  toHit: AttackDice.nullable(),
  damage: AttackDice.nullable(),
  /** A library animation copied in when the attack was set up; plays instead of the built-in style (ADR 0038). */
  animation: StrikeAnimationDef.optional(),
  /** Set when the attack may hit several tokens at once: how many at most. Absent means one target. The panel rolls it once per chosen target. */
  maxTargets: z.number().int().min(2).max(MAX_ATTACK_TARGETS).optional(),
}).refine((a) => a.toHit !== null || a.damage !== null, { message: validationMessage(sharedMsg("valid.attackNeedsRoll")) });
export type AttackPreset = z.infer<typeof AttackPreset>;
export const TokenAttacks = z.array(AttackPreset).max(MAX_TOKEN_ATTACKS).refine(
  (attacks) => new Set(attacks.map((a) => a.name.toLowerCase())).size === attacks.length,
  { message: validationMessage(sharedMsg("valid.attackNamesUnique")) },
);

const DAMAGE_SUFFIX = " damage";

/** The label a named attack's roll carries: "Longsword", or "Longsword damage", within the label limit. */
export function namedAttackLabel(name: string, kind: AttackKind): string {
  if (kind === "toHit") return name.slice(0, MAX_ATTACK_LABEL);
  return name.slice(0, MAX_ATTACK_LABEL - DAMAGE_SUFFIX.length).trimEnd() + DAMAGE_SUFFIX;
}

/** The attack a roll labelled `label` was made with, if the actor has such a named attack. */
export function namedAttackFor(attacks: readonly AttackPreset[] | undefined, label: string | undefined, kind: AttackKind): AttackPreset | undefined {
  if (!label) return undefined;
  const wanted = label.toLowerCase();
  return attacks?.find((a) => namedAttackLabel(a.name, kind).toLowerCase() === wanted);
}
