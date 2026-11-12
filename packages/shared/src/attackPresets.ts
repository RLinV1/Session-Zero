import { z } from "zod";
import { sharedMsg, validationMessage } from "./i18n";
import { StrikeAnimationDef } from "./animation";
import { diceCount, MAX_ATTACK_LABEL, MAX_DICE, type AttackKind } from "./dice";

/** Named rolls copied from a creature into a placed token (KAN-70). */
export const MAX_TOKEN_ATTACKS = 8;
/** Most targets one multi-target attack may be rolled at together. */
export const MAX_ATTACK_TARGETS = 10;
/** The dice the app's builder offers, and a named attack may hold (ADR 0061). */
export const STANDARD_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export const MAX_ATTACK_MODIFIER = 99;

/**
 * Attacks saved before mixed dice were one die type: `{ count, sides, modifier }`. They are read
 * as one term, so stored creatures, token attacks in events and AI drafts need no migration.
 */
export function upgradeAttackDice(value: unknown): unknown {
  if (value && typeof value === "object" && !("terms" in value) && "sides" in value) {
    const { count, sides, ...rest } = value as { count?: unknown; sides?: unknown };
    return { ...rest, terms: [{ count, sides }] };
  }
  return value;
}

const AttackDiceTerm = z.object({
  count: z.number().int().min(1).max(MAX_DICE),
  sides: z.number().int().refine((s) => (STANDARD_DIE_SIDES as readonly number[]).includes(s), { message: validationMessage(sharedMsg("valid.supportedDie")) }),
});

/** Checks every shape of named-attack dice shares: each die type once, at most 20 dice. */
export function attackDiceProblems(dice: { terms: readonly { count: number; sides: number }[] }): "repeated" | "tooMany" | null {
  if (new Set(dice.terms.map((t) => t.sides)).size !== dice.terms.length) return "repeated";
  if (diceCount(dice.terms) > MAX_DICE) return "tooMany";
  return null;
}

/**
 * A named attack's roll (ADR 0061): die terms in the order added, each die type once, at most
 * 20 dice in all, and a modifier. The old one-term shape is read through `upgradeAttackDice`.
 */
export const AttackDice = z.preprocess(upgradeAttackDice, z.object({
  terms: z.array(AttackDiceTerm).min(1).max(STANDARD_DIE_SIDES.length),
  modifier: z.number().int().min(-MAX_ATTACK_MODIFIER).max(MAX_ATTACK_MODIFIER),
}).superRefine((dice, ctx) => {
  const problem = attackDiceProblems(dice);
  if (problem === "repeated") ctx.addIssue({ code: "custom", message: "Each die type at most once", path: ["terms"] });
  if (problem === "tooMany") ctx.addIssue({ code: "custom", message: `At most ${MAX_DICE} dice`, path: ["terms"] });
}));
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
