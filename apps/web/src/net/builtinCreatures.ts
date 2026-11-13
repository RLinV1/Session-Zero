import type { AnimationDef, AttackPreset, AttackRange, LibraryCreature } from "@vtt/shared";
import { SHAPE_DEFAULTS } from "../board/effectPresets";
import { t } from "../i18n/locale";

/**
 * Creatures that ship with the app (builtin-default-creatures, FR-TAC-07), one per piece of
 * shipped enemy token art (builtinAssets.ts). Like built-in token art they are not library rows:
 * no owner, no server storage, never edited or deleted. A GM places one from "From creature" or
 * adds it to their own library to change it. Stat lines are original.
 */

const SHIPPED = "2026-11-03T00:00:00.000Z";

const hit = (modifier: number) => ({ terms: [{ count: 1, sides: 20 }], modifier });
const dmg = (count: number, sides: number, modifier = 0) => ({ terms: [{ count, sides }], modifier });
type AttackSlug = "scimitar" | "shortbow" | "spear" | "thrown-spear" | "staff" | "firebolt" | "longsword" | "dagger";
type CreatureSlug = "goblin-guard" | "goblin-spearman" | "human-mage" | "human-swordsman";
/**
 * Names are read when used, in the reader's language: a list shows the current one, and placing a
 * creature copies the placer's (localization: "Text the app copies into a room becomes room data").
 */
/** Ranges in feet, as the stat lines are written (attack-range); melee reaches one square. */
const MELEE: AttackRange = { kind: "melee" };
const ranged = (distance: number): AttackRange => ({ kind: "ranged", distance });

const attack = (slug: AttackSlug, toHit: number, damage: ReturnType<typeof dmg>, range: AttackRange, animation?: AnimationDef): AttackPreset => ({
  get name() {
    return t(`builtin.attack.${slug}`);
  },
  toHit: hit(toHit),
  damage,
  range,
  // A copy of the built-in look, as a GM attaching one would make (ADR 0038); none plays Automatic.
  ...(animation && { animation: structuredClone(animation) }),
});

/** `slug` is also the art file name under /img/tokens/enemies/. */
function creature(
  slug: CreatureSlug, maxHp: number, ac: number, color: string, attacks: AttackPreset[],
): LibraryCreature {
  return {
    id: `builtin:${slug}`,
    get name() {
      return t(`builtin.creature.${slug}`);
    },
    size: 1, hp: null, attacks, maxHp, ac, color, conditions: [],
    imageAssetId: null, imageUrl: `/img/tokens/enemies/${slug}.svg`, createdAt: SHIPPED,
  };
}

export const BUILTIN_CREATURES: readonly LibraryCreature[] = [
  creature("goblin-guard", 11, 15, "#689f38", [
    attack("scimitar", 4, dmg(1, 6, 2), MELEE, SHAPE_DEFAULTS.slash),
    attack("shortbow", 4, dmg(1, 6, 2), ranged(80), SHAPE_DEFAULTS.volley),
  ]),
  creature("goblin-spearman", 9, 13, "#7cb342", [
    attack("spear", 4, dmg(1, 6, 2), { kind: "melee", reach: 10 }, SHAPE_DEFAULTS.pierce),
    attack("thrown-spear", 4, dmg(1, 6, 2), ranged(20), SHAPE_DEFAULTS.pierce),
  ]),
  creature("human-mage", 22, 12, "#5c6bc0", [
    attack("staff", 2, dmg(1, 6), MELEE, SHAPE_DEFAULTS.slam),
    attack("firebolt", 5, dmg(2, 10), ranged(120), SHAPE_DEFAULTS.fireball),
  ]),
  creature("human-swordsman", 32, 16, "#78909c", [
    attack("longsword", 5, dmg(1, 8, 3), MELEE, SHAPE_DEFAULTS.slash),
    attack("dagger", 5, dmg(1, 4, 3), MELEE, SHAPE_DEFAULTS.pierce),
  ]),
];

export const isBuiltinCreature = (creature: Pick<LibraryCreature, "id">): boolean => creature.id.startsWith("builtin:");
