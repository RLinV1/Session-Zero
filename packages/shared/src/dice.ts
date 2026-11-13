import { z } from "zod";
import { AttackStyle, StrikeAnimationDef } from "./animation";
import { englishText, sharedMsg, type MessageRef } from "./i18n";
import type { Locale } from "./i18n/core";
import { attackLabelZhTW, attackOutcomeZhTW, attackPartiesZhTW } from "./i18n/sentences.zh-TW";

/**
 * Dice formulas: one or more die terms and a modifier, `2d6+1d4+3` (FR-TAC-09, ADR 0061).
 *
 * Deliberately small: the tabletop rolls people actually make in an encounter are
 * `1d20+5`, `2d6+1d4+3`, `4d6-1`. Anything larger is a calculator, not a VTT feature.
 *
 * Parsing is pure and lives here so the client can check a formula before sending,
 * while the server re-parses and rolls — the client's parse is a hint, the server's
 * is authoritative (FR-GM-15).
 */

/** Most dice in one formula, across all its terms. */
export const MAX_DICE = 20;
export const MAX_SIDES = 1000;
/** Longest formula text a roll, command or drop carries (ADR 0061). */
export const MAX_EXPRESSION_LENGTH = 64;

/** One die term, `2d6`. */
export const DiceTerm = z.object({
  /** Number of dice; 1 when the formula omits it (`d20`). */
  count: z.number().int().min(1).max(MAX_DICE),
  /** Faces per die. */
  sides: z.number().int().min(2).max(MAX_SIDES),
});
export type DiceTerm = z.infer<typeof DiceTerm>;

/** Dice summed across a formula's terms. */
export const diceCount = (terms: readonly Pick<DiceTerm, "count">[]) => terms.reduce((n, t) => n + t.count, 0);

export const DiceExpression = z.object({
  /** In the order written; rolled in this order, so a roll's dice line up with them. */
  terms: z.array(DiceTerm).min(1).max(MAX_DICE),
  /** Flat modifier, may be negative or zero. */
  modifier: z.number().int().min(-999).max(999),
}).refine((e) => diceCount(e.terms) <= MAX_DICE, { message: `At most ${MAX_DICE} dice` });
export type DiceExpression = z.infer<typeof DiceExpression>;

export const DiceVisibility = z.enum(["public", "gm"]);
export type DiceVisibility = z.infer<typeof DiceVisibility>;

/** Longest label an attack roll may carry ("Longsword"). */
export const MAX_ATTACK_LABEL = 40;

/**
 * One token named by an attack roll (ADR 0010). `name` and `hidden` are as they were when
 * rolled, so the log still reads right after a rename or delete, and the filter knows about
 * a hidden token that no longer exists.
 */
export const AttackSide = z.object({
  tokenId: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  hidden: z.boolean(),
});
export type AttackSide = z.infer<typeof AttackSide>;

/** Whether an attack roll is to hit (the GM rules Hit or Miss) or damage (the GM applies it) (ADR 0011). */
export const AttackKind = z.enum(["toHit", "damage"]);
export type AttackKind = z.infer<typeof AttackKind>;

/** The GM's ruling on a to-hit roll (ADR 0011). */
export const Verdict = z.enum(["hit", "miss"]);
export type Verdict = z.infer<typeof Verdict>;

/**
 * What an attack roll was for. `decide` always fills both sides; a side is `null` only in a
 * player's copy, where it named a token hidden from them (FR-GM-23).
 */
/** A named attack's kind of range, as a roll carries it (ADR 0067). */
export const AttackRangeKind = z.enum(["melee", "ranged"]);
export type AttackRangeKind = z.infer<typeof AttackRangeKind>;

export const AttackContext = z.object({
  actor: AttackSide.nullable(),
  target: AttackSide.nullable(),
  label: z.string().min(1).max(MAX_ATTACK_LABEL).nullable(),
  /** Rolls made before ADR 0011 have none and count as to hit. */
  kind: AttackKind.default("toHit"),
  /** How the attack is drawn when it has no animation of its own (ADR 0038). Older rolls have none. */
  style: AttackStyle.optional(),
  /** The actor's named attack's animation, copied here by `decide`; a client cannot set it (ADR 0038). */
  animation: StrikeAnimationDef.optional(),
  /**
   * Whether the actor's named attack is melee or ranged, copied here by `decide`; never its reach or
   * distance, and a client cannot set it. Picks the Automatic animation the same on every board (ADR 0067).
   */
  range: AttackRangeKind.optional(),
});
export type AttackContext = z.infer<typeof AttackContext>;

export const DiceRoll = z.object({
  id: z.string().min(1).max(64),
  /** The expression as typed, echoed back so the log reads the way the roller wrote it. */
  expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
  /** Who rolled. */
  byParticipantId: z.string().min(1).max(64),
  /** Individual die results, in roll order. */
  dice: z.array(z.number().int().positive()).min(1).max(MAX_DICE),
  modifier: z.number().int(),
  total: z.number().int(),
  /** `gm` rolls are never sent to players (FR-GM-22). */
  visibility: DiceVisibility,
  /** Set when the roll is an attack (ADR 0010); plain rolls leave it out. */
  attack: AttackContext.optional(),
  /** The GM's ruling on a to-hit roll; absent until ruled (ADR 0011). */
  verdict: Verdict.optional(),
  /** Scene the roll was made in; absent on older rolls. Damage applies only in that scene (FR-GM-25). */
  sceneId: z.string().max(64).optional(),
  /** Set once the GM has applied a damage roll to its target (ADR 0011). */
  damageApplied: z.boolean().optional(),
  /** The GM took it off the Rulings list without ruling (ADR 0060). GM-only: never sent to players. */
  dismissed: z.literal(true).optional(),
});
export type DiceRoll = z.infer<typeof DiceRoll>;

/** Most tokens one group roll or area effect may name (ADR 0046). */
export const MAX_GROUP_ROLL_TOKENS = 30;

/** One die result set: the dice in roll order and their total with the modifier. */
export const RolledDice = z.object({
  dice: z.array(z.number().int().positive()).min(1).max(MAX_DICE),
  total: z.number().int(),
});
export type RolledDice = z.infer<typeof RolledDice>;

/**
 * One token's result in a group roll (ADR 0046). `name` and `hidden` are as they were when rolled,
 * like `AttackSide`, so the log reads right after a rename or delete and a concealed token stays so.
 */
export const GroupRollEntry = AttackSide.extend(RolledDice.shape);
export type GroupRollEntry = z.infer<typeof GroupRollEntry>;

/**
 * The same expression rolled once for each of several tokens, logged as one entry (ADR 0046).
 * `kind` tells it apart from a `DiceRoll`, which has none.
 */
export const GroupRoll = z.object({
  kind: z.literal("group"),
  id: z.string().min(1).max(64),
  expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
  label: z.string().min(1).max(MAX_ATTACK_LABEL).nullable(),
  byParticipantId: z.string().min(1).max(64),
  visibility: DiceVisibility,
  /** One per token, in the order the GM chose them. A player's copy holds only the tokens they can see. */
  entries: z.array(GroupRollEntry).max(MAX_GROUP_ROLL_TOKENS),
});
export type GroupRoll = z.infer<typeof GroupRoll>;

/** An entry in the roll log: a plain or attack roll, or a group roll (ADR 0046). */
export const LoggedRoll = z.union([GroupRoll, DiceRoll]);
export type LoggedRoll = DiceRoll | GroupRoll;

export const isGroupRoll = (roll: LoggedRoll): roll is GroupRoll => (roll as Partial<GroupRoll>).kind === "group";
export const isDiceRoll = (roll: LoggedRoll): roll is DiceRoll => !isGroupRoll(roll);

/** The plain and attack rolls in a log, leaving out group rolls. */
export const diceRollsOf = (rolls: readonly LoggedRoll[]): DiceRoll[] => rolls.filter(isDiceRoll);

/** The plain or attack roll with this id, if it is still in the log. Group rolls never match. */
export const findDiceRoll = (rolls: readonly LoggedRoll[], id: string): DiceRoll | undefined =>
  rolls.find((r): r is DiceRoll => !isGroupRoll(r) && r.id === id);

/** A die term at the start of the rest of the formula: `2d6`, `d20`. */
const TERM = /^(\d*)d(\d+)/;
/** The modifier, which ends the formula: `+3`, `-1`. */
const MODIFIER = /^([+-])(\d+)$/;

export type ParseResult =
  | { ok: true; expression: DiceExpression }
  /** `message` is `text` in English; `text` is for the reader's own language (ADR 0054). */
  | { ok: false; message: string; text: MessageRef };

const parseFailure = (text: MessageRef): ParseResult => ({ ok: false, message: englishText(text), text });

/**
 * One or more die terms joined by `+`, then at most one `+M` or `-M`: `2d6+1d4+3`, `d20`,
 * `1d8-1`. Whitespace and case are ignored. A repeated die type (`1d6+1d6`) stays two terms.
 */
export function parseDiceExpression(input: string): ParseResult {
  let rest = input.replace(/\s+/g, "").toLowerCase();
  const terms: DiceTerm[] = [];
  let modifier = 0;
  for (;;) {
    const term = TERM.exec(rest);
    if (!term) return parseFailure(sharedMsg("reject.diceSyntax"));
    const count = term[1] === "" ? 1 : Number(term[1]);
    const sides = Number(term[2]);
    if (count < 1 || count > MAX_DICE) return parseFailure(sharedMsg("reject.diceCount", { max: MAX_DICE }));
    if (sides < 2 || sides > MAX_SIDES) return parseFailure(sharedMsg("reject.diceSides", { max: MAX_SIDES }));
    terms.push({ count, sides });
    rest = rest.slice(term[0].length);
    if (rest === "") break;
    // `+` then a die term continues the dice; anything else must be the closing modifier.
    if (rest.startsWith("+") && TERM.test(rest.slice(1))) {
      rest = rest.slice(1);
      continue;
    }
    const mod = MODIFIER.exec(rest);
    if (!mod) return parseFailure(sharedMsg("reject.diceSyntax"));
    modifier = Number(mod[2]) * (mod[1] === "-" ? -1 : 1);
    break;
  }
  if (diceCount(terms) > MAX_DICE) return parseFailure(sharedMsg("reject.diceCount", { max: MAX_DICE }));
  const parsed = DiceExpression.safeParse({ terms, modifier });
  if (!parsed.success) return parseFailure(sharedMsg("reject.diceOutOfRange"));
  return { ok: true, expression: parsed.data };
}

/**
 * Rolls an expression, term by term in order. `random` must return a float in [0, 1) — it is
 * injected rather than taken from `Math.random` so `decide` stays deterministic and testable
 * (CLAUDE.md §2).
 */
export function rollDice(expression: DiceExpression, random: () => number): { dice: number[]; total: number } {
  const dice = expression.terms.flatMap((t) => Array.from({ length: t.count }, () => 1 + Math.floor(random() * t.sides)));
  const total = dice.reduce((sum, d) => sum + d, 0) + expression.modifier;
  return { dice, total };
}

/** The modifier as it is written after the dice: "+3", "-1", or nothing for 0. */
export const formatModifier = (modifier: number) => (modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`);

/** Canonical text form, for the roll log: `2d6+1d4+3`. */
export function formatExpression(e: Pick<DiceExpression, "terms" | "modifier">): string {
  return e.terms.map((t) => `${t.count}d${t.sides}`).join("+") + formatModifier(e.modifier);
}

/** A roll's dice for one term of its formula: its die type and each die's result. */
export interface DiceGroup {
  count: number;
  sides: number;
  values: number[];
}

/**
 * A roll's dice grouped by its formula's terms (ADR 0061): `rollDice` rolls terms in order, so
 * the first `count₀` dice are the first term's, and so on. Null when the formula doesn't parse
 * or doesn't account for exactly these dice (corrupted data); callers then show the plain dice.
 */
export function diceByTerm(expression: string, dice: readonly number[]): { groups: DiceGroup[]; modifier: number } | null {
  const parsed = parseDiceExpression(expression);
  if (!parsed.ok || diceCount(parsed.expression.terms) !== dice.length) return null;
  let at = 0;
  const groups = parsed.expression.terms.map((t) => {
    const values = dice.slice(at, at + t.count);
    at += t.count;
    return { count: t.count, sides: t.sides, values };
  });
  return { groups, modifier: parsed.expression.modifier };
}

/** Each die's number of sides, in roll order, from the roll's formula; null as for `diceByTerm`. */
export function sidesOfDice(expression: string, dice: readonly number[]): number[] | null {
  return diceByTerm(expression, dice)?.groups.flatMap((g) => g.values.map(() => g.sides)) ?? null;
}

/** "Aria → Goblin 2"; a side blanked for this viewer reads "Unknown" (ADR 0010). */
export function formatAttackParties(attack: AttackContext, locale: Locale = "en"): string {
  if (locale === "zh-TW") return attackPartiesZhTW(attack);
  return `${attack.actor?.name ?? "Unknown"} → ${attack.target?.name ?? "Unknown"}`;
}

/** The label an attack roll reads with: its own, or "damage" for an unlabelled damage roll (ADR 0011). */
export function attackLabel(attack: AttackContext, locale: Locale = "en"): string | null {
  if (locale === "zh-TW") return attackLabelZhTW(attack);
  return attack.label ?? (attack.kind === "damage" ? "damage" : null);
}

/** What the GM has done with an attack roll so far: "Hit", "Miss", "Applied", or nothing yet (ADR 0011). */
export function formatAttackOutcome(roll: Pick<DiceRoll, "verdict" | "damageApplied">, locale: Locale = "en"): string | null {
  if (locale === "zh-TW") return attackOutcomeZhTW(roll);
  if (roll.verdict) return roll.verdict === "hit" ? "Hit" : "Miss";
  return roll.damageApplied ? "Applied" : null;
}

/**
 * "Aria → Goblin 2 · Longsword · 1d20+5 = 17 · Hit", for the roll log. Plain rolls read "1d20+5 = 17".
 * The outcome is only ever what the GM decided; nothing here compares the roll to anything.
 */
export function formatAttackRoll(roll: Pick<DiceRoll, "expression" | "total" | "attack" | "verdict" | "damageApplied">, locale: Locale = "en"): string {
  const result = `${roll.expression} = ${roll.total}`;
  if (!roll.attack) return result;
  return [formatAttackParties(roll.attack, locale), attackLabel(roll.attack, locale), result, formatAttackOutcome(roll, locale)].filter(Boolean).join(" · ");
}
