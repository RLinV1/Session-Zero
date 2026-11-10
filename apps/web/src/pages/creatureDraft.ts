import type { AttackPreset, ConditionId, LibraryAsset, LibraryCreature, Token, TokenStats } from "@vtt/shared";
import { t } from "../i18n/locale";

/** What "From creature" fills into Add Token (library-creatures, ADR 0012). */
export interface CreatureDraft {
  name: string;
  size: number;
  /** A placed creature copies starting HP, or defaults to full health. */
  stats: TokenStats;
  color: string;
  conditions: ConditionId[];
  attacks: AttackPreset[];
  /** Null for a creature drawn as a plain colour disc. */
  image: { url: string; assetId: string | null } | null;
}

export function creatureDraft(creature: LibraryCreature): CreatureDraft {
  return {
    name: creature.name,
    size: creature.size,
    stats: { hp: creature.hp ?? creature.maxHp, maxHp: creature.maxHp, ac: creature.ac },
    color: creature.color,
    conditions: creature.conditions,
    attacks: structuredClone(creature.attacks ?? []),
    image: creature.imageUrl ? { url: creature.imageUrl, assetId: creature.imageAssetId } : null,
  };
}

/** "Size 1 · AC 15 · 7 HP", leaving out what the creature doesn't track. */
export function creatureSummary(creature: Pick<LibraryCreature, "size" | "hp" | "maxHp" | "ac" | "attacks">): string {
  const hp = creature.hp ?? creature.maxHp;
  return [
    t("creature.summary.size", { size: creature.size }),
    creature.ac !== null && t("creature.summary.ac", { ac: creature.ac }),
    hp !== null && t("creature.summary.hp", { hp: `${hp}${creature.maxHp !== null && hp !== creature.maxHp ? `/${creature.maxHp}` : ""}` }),
    (creature.attacks?.length ?? 0) > 0 && t("creature.summary.attacks", { n: creature.attacks!.length }),
  ].filter(Boolean).join(" · ");
}

/** What Save as creature fills into a new creature form (KAN-70). */
export type CreaturePrefill = Pick<LibraryCreature, "name" | "size" | "hp" | "attacks" | "maxHp" | "ac" | "color" | "conditions" | "imageAssetId" | "imageUrl">;

/**
 * A token on the board as a new creature's starting values (KAN-70). The image comes along only
 * when it is the GM's own library token art (`ownArt`); built-in art and direct uploads can't be
 * linked to a creature, so the form starts without one.
 */
export function creatureFromToken(token: Token, ownArt: readonly Pick<LibraryAsset, "id" | "url" | "kind">[], attacks: AttackPreset[] = token.attacks ?? []): CreaturePrefill {
  const art = token.assetId ? ownArt.find((a) => a.id === token.assetId && a.kind === "token") : undefined;
  return {
    name: token.name,
    size: token.size,
    hp: token.stats.hp,
    attacks: structuredClone(attacks),
    maxHp: token.stats.maxHp,
    ac: token.stats.ac,
    color: token.color,
    conditions: token.conditions,
    imageAssetId: art?.id ?? null,
    imageUrl: art?.url ?? null,
  };
}
