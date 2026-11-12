import {
  checkBuild,
  type BuildCheckIssue,
  type BuildDetail,
  type BuildItemView,
  type DraftCreatureState,
  type DraftEncounterState,
  type DraftMapState,
} from "@vtt/shared";
import { t, type TextId } from "../../i18n/locale";

/**
 * Where a build's draft stands, worked out the same way for its own page and for its card in
 * the library's AI builds tab, so the two never disagree (FR-GM-26, FR-GM-27).
 */

export const creatureOf = (item: BuildItemView) => item.data as unknown as DraftCreatureState;
export const mapOf = (item: BuildItemView) => item.data as unknown as DraftMapState;
export const encounterOf = (item: BuildItemView) => item.data as unknown as DraftEncounterState;
/** Items with flags come first, so what needs a person is what they see first. */
export const flaggedFirst = (a: BuildItemView, b: BuildItemView) => Number(b.flags.length > 0) - Number(a.flags.length > 0);
/** What each kind of draft item is called. Shown with `t()`. */
export const KIND_WORD: Record<BuildItemView["kind"], TextId> = { creature: "build.kind.creature", map: "build.kind.map", encounter: "build.kind.encounter" };

/** "1 map, 2 creatures and 1 encounter", in the current language. */
export function counted(items: readonly BuildItemView[]): string {
  const parts = (["map", "creature", "encounter"] as const).map((kind) => {
    const n = items.filter((i) => i.kind === kind).length;
    return n === 0 ? null : t(`build.count.${kind}`, { n });
  }).filter((p): p is string => p !== null);
  return parts.length <= 1 ? parts.join("") : t("build.count.list", { list: parts.slice(0, -1).join(t("build.count.sep")), last: parts.at(-1)! });
}

/**
 * The check, in the owner's words, over the draft in the order its page lists it. Each issue
 * carries its words as catalog refs, so the page shows them in the reader's language (ADR 0055).
 */
export function ownerIssues(detail: BuildDetail): BuildCheckIssue[] {
  const ofKind = (kind: BuildItemView["kind"]) => detail.items.filter((i) => i.kind === kind).sort(flaggedFirst);
  return checkBuild({
    profile: detail.profile,
    audience: "owner",
    aiWalls: detail.build.choices.aiWalls,
    files: detail.files,
    creatures: ofKind("creature").map((i) => ({ key: i.key, data: creatureOf(i), flags: i.flags })),
    maps: ofKind("map").map((i) => ({ key: i.key, data: mapOf(i), flags: i.flags })),
    encounters: ofKind("encounter").map((i) => ({ key: i.key, data: encounterOf(i), flags: i.flags })),
  });
}

export interface BuildProgress {
  /** Saved by the AI and not yet published. */
  draft: readonly BuildItemView[];
  published: number;
  /** Things to fix before they can be published. */
  problems: number;
  /** Notes the AI left for the owner. */
  notes: number;
}

export function buildProgress(detail: BuildDetail): BuildProgress {
  const issues = ownerIssues(detail);
  return {
    draft: detail.items.filter((i) => !i.published),
    published: detail.items.filter((i) => i.published).length,
    problems: issues.filter((i) => i.type === "problem").length,
    notes: issues.filter((i) => i.type === "flag").length,
  };
}

/** A new build's draft: nothing saved yet. */
export const EMPTY_PROGRESS: BuildProgress = { draft: [], published: 0, problems: 0, notes: 0 };
