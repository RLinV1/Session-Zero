import { z } from "zod";
import type { Locale } from "./i18n/core";
import { CONDITION_LABELS_ZH_TW } from "./i18n/sentences.zh-TW";

/**
 * Status conditions (FR-TAC-07) and how they are drawn (FR-TAC-08).
 *
 * Every condition carries a short `abbr` and a distinct `shape`. Colour is decoration:
 * the marker is identifiable in greyscale, and the abbreviation is real text so a screen
 * reader and a colour-blind player get the same information as everyone else. Nothing in
 * the renderer or the roster may distinguish two conditions by colour alone.
 */

export const ConditionShape = z.enum(["circle", "square", "triangle", "diamond", "hexagon", "heart"]);
export type ConditionShape = z.infer<typeof ConditionShape>;

export const ConditionId = z.enum([
  "blinded",
  "charmed",
  "frightened",
  "grappled",
  "invisible",
  "paralyzed",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
  "concentrating",
]);
export type ConditionId = z.infer<typeof ConditionId>;

export interface ConditionSpec {
  id: ConditionId;
  label: string;
  /** Two or three characters; drawn inside the marker and read out as text. */
  abbr: string;
  /** Distinct per adjacent entry so shape alone separates them. */
  shape: ConditionShape;
  /** Decoration only — never the sole carrier of meaning. */
  color: string;
}

export const CONDITIONS: readonly ConditionSpec[] = [
  { id: "blinded", label: "Blinded", abbr: "BL", shape: "circle", color: "#6b7280" },
  { id: "charmed", label: "Charmed", abbr: "CH", shape: "heart", color: "#db2777" },
  { id: "frightened", label: "Frightened", abbr: "FR", shape: "triangle", color: "#a855f7" },
  { id: "grappled", label: "Grappled", abbr: "GR", shape: "square", color: "#0891b2" },
  { id: "invisible", label: "Invisible", abbr: "IN", shape: "diamond", color: "#94a3b8" },
  { id: "paralyzed", label: "Paralyzed", abbr: "PA", shape: "hexagon", color: "#eab308" },
  { id: "poisoned", label: "Poisoned", abbr: "PO", shape: "triangle", color: "#16a34a" },
  { id: "prone", label: "Prone", abbr: "PR", shape: "square", color: "#f97316" },
  { id: "restrained", label: "Restrained", abbr: "RE", shape: "hexagon", color: "#7c3aed" },
  { id: "stunned", label: "Stunned", abbr: "ST", shape: "diamond", color: "#facc15" },
  { id: "unconscious", label: "Unconscious", abbr: "UN", shape: "circle", color: "#dc2626" },
  { id: "concentrating", label: "Concentrating", abbr: "CO", shape: "circle", color: "#2563eb" },
];

const BY_ID = new Map(CONDITIONS.map((c) => [c.id, c]));
export const conditionSpec = (id: ConditionId): ConditionSpec => BY_ID.get(id)!;

/** A condition's name in `locale`: "Prone", "倒地" (docs/GLOSSARY-zh-TW.md). */
export const conditionLabel = (id: ConditionId, locale: Locale = "en"): string =>
  locale === "zh-TW" ? CONDITION_LABELS_ZH_TW[id].label : conditionSpec(id).label;
/** The marker's short text in `locale`: two letters in English, one character in Chinese ("PR", "倒"). */
export const conditionAbbr = (id: ConditionId, locale: Locale = "en"): string =>
  locale === "zh-TW" ? CONDITION_LABELS_ZH_TW[id].abbr : conditionSpec(id).abbr;

/** Numeric resources shown on a token (FR-TAC-07). */
/** The lowest HP a token can hold; applying damage stops here (ADR 0011). */
export const MIN_HP = -999;

export const TokenStats = z.object({
  /** Current hit points, or null when this token does not track them. */
  hp: z.number().int().min(MIN_HP).max(9999).nullable(),
  /** Maximum hit points; drives the resource bar when both are set. */
  maxHp: z.number().int().min(1).max(9999).nullable(),
  /** Armour class or equivalent defence number. */
  ac: z.number().int().min(0).max(99).nullable(),
});
export type TokenStats = z.infer<typeof TokenStats>;

export const EMPTY_STATS: TokenStats = { hp: null, maxHp: null, ac: null };

/** Fraction in [0, 1] for the resource bar, or null when HP is not tracked. */
export function hpFraction(stats: TokenStats): number | null {
  if (stats.hp === null || stats.maxHp === null || stats.maxHp <= 0) return null;
  return Math.max(0, Math.min(1, stats.hp / stats.maxHp));
}
