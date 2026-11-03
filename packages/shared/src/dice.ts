import { z } from "zod";
import { AttackStyle, StrikeAnimationDef } from "./animation";

/**
 * Dice expressions of the form `NdX + M` (FR-TAC-09).
 *
 * Deliberately small: the tabletop rolls people actually make in an encounter are
 * `1d20+5`, `2d6`, `4d6-1`. Anything larger is a calculator, not a VTT feature.
 *
 * Parsing is pure and lives here so the client can validate the input box before
 * sending, while the server re-parses and rolls — the client's parse is a hint, the
 * server's is authoritative (FR-GM-15).
 */

export const MAX_DICE = 20;
export const MAX_SIDES = 1000;

export const DiceExpression = z.object({
  /** Number of dice; 1 when the expression omits it (`d20`). */
  count: z.number().int().min(1).max(MAX_DICE),
  /** Faces per die. */
  sides: z.number().int().min(2).max(MAX_SIDES),
  /** Flat modifier, may be negative or zero. */
  modifier: z.number().int().min(-999).max(999),
});
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
});
export type AttackContext = z.infer<typeof AttackContext>;

export const DiceRoll = z.object({
  id: z.string().min(1).max(64),
  /** The expression as typed, echoed back so the log reads the way the roller wrote it. */
  expression: z.string().min(1).max(32),
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
  /** Set once the GM has applied a damage roll to its target (ADR 0011). */
  damageApplied: z.boolean().optional(),
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
  expression: z.string().min(1).max(32),
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

const PATTERN = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

export type ParseResult =
  | { ok: true; expression: DiceExpression }
  | { ok: false; message: string };

/** `NdX`, `NdX+M`, `NdX-M`, or `dX`. Whitespace and case are ignored. */
export function parseDiceExpression(input: string): ParseResult {
  const match = PATTERN.exec(input);
  if (!match) return { ok: false, message: "Use NdX, NdX+M or NdX-M, for example 1d20+5" };

  const count = match[1] === "" ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;

  if (count < 1 || count > MAX_DICE) return { ok: false, message: `Roll between 1 and ${MAX_DICE} dice` };
  if (sides < 2 || sides > MAX_SIDES) return { ok: false, message: `Dice need 2 to ${MAX_SIDES} sides` };

  const parsed = DiceExpression.safeParse({ count, sides, modifier });
  if (!parsed.success) return { ok: false, message: "That expression is out of range" };
  return { ok: true, expression: parsed.data };
}

/**
 * Rolls an expression. `random` must return a float in [0, 1) — it is injected rather than
 * taken from `Math.random` so `decide` stays deterministic and testable (CLAUDE.md §2).
 */
export function rollDice(expression: DiceExpression, random: () => number): { dice: number[]; total: number } {
  const dice = Array.from({ length: expression.count }, () => 1 + Math.floor(random() * expression.sides));
  const total = dice.reduce((sum, d) => sum + d, 0) + expression.modifier;
  return { dice, total };
}

/** Canonical text form, for the roll log. */
export function formatExpression(e: DiceExpression): string {
  const mod = e.modifier === 0 ? "" : e.modifier > 0 ? `+${e.modifier}` : `${e.modifier}`;
  return `${e.count}d${e.sides}${mod}`;
}

/** "Aria → Goblin 2"; a side blanked for this viewer reads "Unknown" (ADR 0010). */
export function formatAttackParties(attack: AttackContext): string {
  return `${attack.actor?.name ?? "Unknown"} → ${attack.target?.name ?? "Unknown"}`;
}

/** The label an attack roll reads with: its own, or "damage" for an unlabelled damage roll (ADR 0011). */
export function attackLabel(attack: AttackContext): string | null {
  return attack.label ?? (attack.kind === "damage" ? "damage" : null);
}

/** What the GM has done with an attack roll so far: "Hit", "Miss", "Applied", or nothing yet (ADR 0011). */
export function formatAttackOutcome(roll: Pick<DiceRoll, "verdict" | "damageApplied">): string | null {
  if (roll.verdict) return roll.verdict === "hit" ? "Hit" : "Miss";
  return roll.damageApplied ? "Applied" : null;
}

/**
 * "Aria → Goblin 2 · Longsword · 1d20+5 = 17 · Hit", for the roll log. Plain rolls read "1d20+5 = 17".
 * The outcome is only ever what the GM decided; nothing here compares the roll to anything.
 */
export function formatAttackRoll(roll: Pick<DiceRoll, "expression" | "total" | "attack" | "verdict" | "damageApplied">): string {
  const result = `${roll.expression} = ${roll.total}`;
  if (!roll.attack) return result;
  return [formatAttackParties(roll.attack), attackLabel(roll.attack), result, formatAttackOutcome(roll)].filter(Boolean).join(" · ");
}
