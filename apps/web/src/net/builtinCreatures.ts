import type { AttackPreset, LibraryCreature } from "@vtt/shared";

/**
 * Creatures that ship with the app (builtin-default-creatures, FR-TAC-07), one per piece of
 * shipped enemy token art (builtinAssets.ts). Like built-in token art they are not library rows:
 * no owner, no server storage, never edited or deleted. A GM places one from "From creature" or
 * adds it to their own library to change it. Stat lines are original.
 */

const SHIPPED = "2026-11-03T00:00:00.000Z";

const hit = (modifier: number) => ({ count: 1, sides: 20, modifier });
const dmg = (count: number, sides: number, modifier = 0) => ({ count, sides, modifier });
const attack = (name: string, toHit: number, damage: ReturnType<typeof dmg>): AttackPreset => ({ name, toHit: hit(toHit), damage });

/** `slug` is also the art file name under /img/tokens/enemies/. */
function creature(
  slug: string, name: string, maxHp: number, ac: number, color: string, attacks: AttackPreset[],
): LibraryCreature {
  return {
    id: `builtin:${slug}`, name, size: 1, hp: null, attacks, maxHp, ac, color, conditions: [],
    imageAssetId: null, imageUrl: `/img/tokens/enemies/${slug}.svg`, createdAt: SHIPPED,
  };
}

export const BUILTIN_CREATURES: readonly LibraryCreature[] = [
  creature("goblin-guard", "Goblin Guard", 11, 15, "#689f38", [attack("Scimitar", 4, dmg(1, 6, 2)), attack("Shortbow", 4, dmg(1, 6, 2))]),
  creature("goblin-spearman", "Goblin Spearman", 9, 13, "#7cb342", [attack("Spear", 4, dmg(1, 6, 2)), attack("Thrown Spear", 4, dmg(1, 6, 2))]),
  creature("human-mage", "Human Mage", 22, 12, "#5c6bc0", [attack("Staff", 2, dmg(1, 6)), attack("Firebolt", 5, dmg(2, 10))]),
  creature("human-swordsman", "Human Swordsman", 32, 16, "#78909c", [attack("Longsword", 5, dmg(1, 8, 3)), attack("Dagger", 5, dmg(1, 4, 3))]),
];

export const isBuiltinCreature = (creature: Pick<LibraryCreature, "id">): boolean => creature.id.startsWith("builtin:");
