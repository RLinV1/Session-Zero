import { diceByTerm, formatExpression, MAX_ATTACK_MODIFIER, MAX_DICE, STANDARD_DIE_SIDES, upgradeAttackDice, type AttackDice } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * Pure helpers for the dice builder (dice-pool, ADR 0061). A pool is the same shape as a named
 * attack's dice: die terms in the order added, each standard die type once, at most 20 dice, and
 * a modifier from −99 to 99. Rolls send it as text with `formatExpression`.
 */
export type DicePool = AttackDice;

export const poolOf = (sides: number, count = 1, modifier = 0): DicePool => ({ terms: [{ count, sides }], modifier });

export const poolDice = (pool: DicePool) => pool.terms.reduce((n, term) => n + term.count, 0);

/** The text a roll command sends: `2d6+1d4+3`. */
export const poolExpression = (pool: DicePool) => formatExpression(pool);

/** The formula as the builder reads it out: "2d6 + 1d4 + 3", "1d20 − 1". */
export function poolReadout(pool: DicePool): string {
  const dice = pool.terms.map((term) => `${term.count}d${term.sides}`).join(" + ");
  if (pool.modifier === 0) return dice;
  return `${dice} ${pool.modifier > 0 ? "+" : "−"} ${Math.abs(pool.modifier)}`;
}

/** A stored pool, in today's shape or the one-die shape stored before mixed dice; null if neither. */
export function readPool(value: unknown): DicePool | null {
  const upgraded = upgradeAttackDice(value);
  if (!upgraded || typeof upgraded !== "object") return null;
  const { terms, modifier } = upgraded as { terms?: unknown; modifier?: unknown };
  if (!Array.isArray(terms) || terms.length === 0 || !Number.isInteger(modifier) || Math.abs(modifier as number) > MAX_ATTACK_MODIFIER) return null;
  const seen = new Set<number>();
  for (const term of terms as unknown[]) {
    const { count, sides } = (term ?? {}) as { count?: unknown; sides?: unknown };
    if (!Number.isInteger(count) || (count as number) < 1 || !(STANDARD_DIE_SIDES as readonly unknown[]).includes(sides) || seen.has(sides as number)) return null;
    seen.add(sides as number);
  }
  const pool = { terms: (terms as { count: number; sides: number }[]).map(({ count, sides }) => ({ count, sides })), modifier: modifier as number };
  return poolDice(pool) <= MAX_DICE ? pool : null;
}

/** Die types not yet in the pool, in the builder's order. */
export const unusedSides = (pool: DicePool) => STANDARD_DIE_SIDES.filter((s) => !pool.terms.some((t) => t.sides === s));

/** The most dice one row may hold, keeping the pool at 20 or fewer. */
export const maxCountFor = (pool: DicePool, index: number) => MAX_DICE - (poolDice(pool) - (pool.terms[index]?.count ?? 0));

/** "+ Die": a row of 1 die of the first type not yet used; unchanged when none is left or at 20 dice. */
export function addDie(pool: DicePool): DicePool {
  const sides = unusedSides(pool)[0];
  if (sides === undefined || poolDice(pool) >= MAX_DICE) return pool;
  return { ...pool, terms: [...pool.terms, { count: 1, sides }] };
}

export function removeDie(pool: DicePool, index: number): DicePool {
  if (pool.terms.length <= 1) return pool;
  return { ...pool, terms: pool.terms.filter((_, i) => i !== index) };
}

export function setCount(pool: DicePool, index: number, count: number): DicePool {
  const max = maxCountFor(pool, index);
  const next = Number.isFinite(count) ? Math.min(max, Math.max(1, Math.trunc(count))) : 1;
  return { ...pool, terms: pool.terms.map((term, i) => (i === index ? { ...term, count: next } : term)) };
}

export function setSides(pool: DicePool, index: number, sides: number): DicePool {
  if (pool.terms.some((term, i) => i !== index && term.sides === sides)) return pool;
  return { ...pool, terms: pool.terms.map((term, i) => (i === index ? { ...term, sides } : term)) };
}

export const clampPoolModifier = (value: number) =>
  Number.isFinite(value) ? Math.min(MAX_ATTACK_MODIFIER, Math.max(-MAX_ATTACK_MODIFIER, Math.trunc(value))) : 0;

/**
 * A roll's dice grouped by die type, as the roll log and pop-up show them: "2d6 (4, 2) + 1d4 (3) + 3".
 * A roll whose formula doesn't account for its dice shows the plain dice and modifier instead.
 */
export function diceBreakdown(roll: { expression: string; dice: readonly number[]; total: number }): string {
  const grouped = diceByTerm(roll.expression, roll.dice);
  if (!grouped) return t("dice.breakdownPlain", { dice: roll.dice.join(", ") });
  const parts = grouped.groups.map((g) => t("dice.breakdownGroup", { die: `${g.count}d${g.sides}`, values: g.values.join(", ") }));
  const dice = parts.join(" + ");
  if (grouped.modifier === 0) return dice;
  return `${dice} ${grouped.modifier > 0 ? "+" : "−"} ${Math.abs(grouped.modifier)}`;
}
