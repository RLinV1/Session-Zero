import type { BuildFileView, BuildItemView, DraftCreatureState, DraftEncounterState } from "@vtt/shared";
import { creatureOf, encounterOf, mapOf } from "./buildProgress";

/**
 * One order for everything on the build page, so like things sit together wherever they appear
 * (FR-GM-27, build page layout 2026-11-11):
 *
 * - Creatures and tokens go by what they are: player characters, then other creatures, then
 *   pieces, which have no AC and no attacks (a clock, a marker, a cairn). Within that, tokens of
 *   the same creature stay together, and names sort as people count: "White-coat 2" before
 *   "White-coat 10".
 * - Encounters go by name, so "Scene 1" comes before "Scene 2".
 * - Maps go in the order of the first encounter that uses them, so they follow the adventure.
 *   Maps no encounter uses come last, by name.
 * - Files: maps first, then token art, by name, so "hauler-a" and "hauler-b" sit together.
 *
 * The order is only how the page shows things. What's saved keeps the order the AI gave it.
 */

export type Role = "character" | "creature" | "piece";
export const ROLE_RANK: Record<Role, number> = { character: 0, creature: 1, piece: 2 };

/** Names compared as people read them: numbers by value, and case ignored. */
export const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

/** A piece is a token with no AC and no attacks: it is on the board to be read, not fought. */
export function roleOf(creature: Pick<DraftCreatureState, "isPlayerCharacter" | "ac" | "attacks"> | undefined): Role {
  if (!creature) return "creature";
  if (creature.isPlayerCharacter) return "character";
  return creature.ac === null && creature.attacks.length === 0 ? "piece" : "creature";
}

const flagged = (item: BuildItemView) => (item.flags.length > 0 ? 0 : 1);

/** Player characters, then creatures, then pieces. Within each, what has flags first, then by name. */
export function sortCreatures(creatures: readonly BuildItemView[]): BuildItemView[] {
  return [...creatures].sort((a, b) =>
    ROLE_RANK[roleOf(creatureOf(a))] - ROLE_RANK[roleOf(creatureOf(b))]
    || flagged(a) - flagged(b)
    || byName(creatureOf(a).name, creatureOf(b).name));
}

export function sortEncounters(encounters: readonly BuildItemView[]): BuildItemView[] {
  return [...encounters].sort((a, b) => byName(encounterOf(a).name, encounterOf(b).name));
}

/** In the order the encounters use them; maps no encounter uses come last, by name. */
export function sortMaps(maps: readonly BuildItemView[], encounters: readonly BuildItemView[]): BuildItemView[] {
  const firstUse = new Map<string, number>();
  sortEncounters(encounters).forEach((e, i) => { if (!firstUse.has(encounterOf(e).mapKey)) firstUse.set(encounterOf(e).mapKey, i); });
  const rank = (m: BuildItemView) => firstUse.get(m.key) ?? Number.MAX_SAFE_INTEGER;
  return [...maps].sort((a, b) => rank(a) - rank(b) || byName(mapOf(a).name, mapOf(b).name));
}

export function sortFiles(files: readonly BuildFileView[]): BuildFileView[] {
  const kindRank = (f: BuildFileView) => (f.kind === "token" ? 1 : 0);
  return [...files].sort((a, b) => kindRank(a) - kindRank(b) || byName(a.name, b.name));
}

/**
 * The order to show an encounter's tokens in, as indexes into its list: by what each one is, then
 * by creature, then by its own name. `creature` finds the creature a token is of.
 */
export function tokenOrder(
  tokens: readonly Pick<DraftEncounterState["tokens"][number], "creatureKey" | "name">[],
  creature: (key: string) => DraftCreatureState | undefined,
): number[] {
  const nameOf = (key: string) => creature(key)?.name ?? key;
  return tokens.map((_, i) => i).sort((i, j) => {
    const a = tokens[i]!, b = tokens[j]!;
    return ROLE_RANK[roleOf(creature(a.creatureKey))] - ROLE_RANK[roleOf(creature(b.creatureKey))]
      || byName(nameOf(a.creatureKey), nameOf(b.creatureKey))
      || byName(a.name ?? "", b.name ?? "")
      || i - j;
  });
}

/** Where each item sits on the page, so fixes and notes about it are listed in the same order. */
export function pageRank(order: { maps: readonly BuildItemView[]; creatures: readonly BuildItemView[]; encounters: readonly BuildItemView[] }) {
  const rank = new Map<string, number>();
  [...order.maps, ...order.creatures, ...order.encounters].forEach((item, i) => rank.set(`${item.kind}/${item.key}`, i));
  return (target: Pick<BuildItemView, "kind" | "key"> | null) => (target ? rank.get(`${target.kind}/${target.key}`) ?? Number.MAX_SAFE_INTEGER : -1);
}
