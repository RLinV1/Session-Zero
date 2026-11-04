import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateCreatureRequest, creatureHpValid } from "@vtt/shared";
import { BUILTIN_CREATURES, isBuiltinCreature } from "../src/net/builtinCreatures";
import { BuiltinCreatureCard } from "../src/pages/LibraryCreatures";
import { creatureDraft } from "../src/pages/creatureDraft";

describe("default creatures (builtin-default-creatures, FR-TAC-07)", () => {
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
    expect(creatureDraft(c).image).toBeNull();
  });

  it("shows the art, name and stats with no actions at all", () => {
    const html = renderToStaticMarkup(<BuiltinCreatureCard creature={BUILTIN_CREATURES[0]!} />);
    expect(html).toContain("/img/tokens/enemies/goblin-guard.svg");
    expect(html).toContain("Goblin Guard");
    expect(html).not.toContain("<button");
  });
});
