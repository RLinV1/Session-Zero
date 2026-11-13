import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateCreatureRequest, creatureHpValid, TokenAttacks } from "@vtt/shared";
import { BUILTIN_CREATURES, isBuiltinCreature } from "../src/net/builtinCreatures";
import { BuiltinCreatureCard } from "../src/pages/LibraryCreatures";
import { creatureDraft } from "../src/pages/creatureDraft";
import { savedCreatureDraft } from "../src/panels/AddToken";

describe("default creatures (builtin-default-creatures, FR-TAC-07)", () => {
  it.each(BUILTIN_CREATURES)("places $name with its shipped art and no library asset id", (creature) => {
    expect(savedCreatureDraft(creature, false, { attacks: true, conditions: true, armorClass: true })).toMatchObject({
      imageUrl: creature.imageUrl, assetId: null,
    });
  });
  it("ships four with unique ids and names, each on its shipped token art", () => {
    expect(BUILTIN_CREATURES.length).toBe(4);
    expect(BUILTIN_CREATURES.map((c) => c.imageUrl)).toEqual(
      ["goblin-guard", "goblin-spearman", "human-mage", "human-swordsman"].map((s) => `/img/tokens/enemies/${s}.svg`),
    );
    expect(new Set(BUILTIN_CREATURES.map((c) => c.id)).size).toBe(BUILTIN_CREATURES.length);
    expect(new Set(BUILTIN_CREATURES.map((c) => c.name)).size).toBe(BUILTIN_CREATURES.length);
    expect(BUILTIN_CREATURES.every(isBuiltinCreature)).toBe(true);
  });

  it.each(BUILTIN_CREATURES.map((c) => [c.name, c] as const))("%s validates as a creature a GM could save", (_name, c) => {
    const { id: _id, imageUrl: _url, createdAt: _at, ...fields } = c;
    const parsed = CreateCreatureRequest.safeParse(fields);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(creatureHpValid({ hp: c.hp ?? null, maxHp: c.maxHp ?? null })).toBe(true);
    expect(c.attacks?.length).toBeGreaterThanOrEqual(1);
    expect(creatureDraft(c).image).toEqual({ url: c.imageUrl, assetId: null });
  });

  it("shows the art, name and stats with no actions at all", () => {
    const html = renderToStaticMarkup(<BuiltinCreatureCard creature={BUILTIN_CREATURES[0]!} />);
    expect(html).toContain("/img/tokens/enemies/goblin-guard.svg");
    expect(html).toContain("Goblin Guard");
    expect(html).not.toContain("<button");
  });
});

describe("built-in creatures' attack ranges and animations (attack-range)", () => {
  const attacks = () => Object.fromEntries(BUILTIN_CREATURES.flatMap((c) => c.attacks ?? []).map((a) => [a.name, a]));

  it("gives each attack its range and animation", () => {
    const all = attacks();
    const expected: Record<string, [string, number | null, string | undefined]> = {
      Scimitar: ["melee", null, "slash"],
      Shortbow: ["ranged", 80, "volley"],
      Spear: ["melee", 10, "pierce"],
      "Thrown Spear": ["ranged", 20, "pierce"],
      Staff: ["melee", null, "slam"],
      Firebolt: ["ranged", 120, "fireball"],
      Longsword: ["melee", null, "slash"],
      Dagger: ["melee", null, "pierce"],
    };
    for (const [name, [kind, distance, shape]] of Object.entries(expected)) {
      const attack = all[name]!;
      expect(attack.range?.kind, name).toBe(kind);
      expect(attack.range?.kind === "ranged" ? attack.range.distance : attack.range?.kind === "melee" ? attack.range.reach ?? null : null, name).toBe(distance);
      expect(attack.animation?.shape, name).toBe(shape);
    }
  });

  it("are valid token attacks, so placing a creature carries them into a room", () => {
    for (const creature of BUILTIN_CREATURES) {
      expect(TokenAttacks.safeParse(JSON.parse(JSON.stringify(creature.attacks))).success, creature.name).toBe(true);
    }
  });
});
