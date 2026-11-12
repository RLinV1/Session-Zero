import { describe, expect, it } from "vitest";
import type { LibraryCreature, Token } from "@vtt/shared";
import { creatureDraft, creatureFromToken } from "../src/pages/creatureDraft";
import { LEGACY_ATTACK_KEYS, clearLegacyAttackStorage } from "../src/panels/tokenAttacks";

const attacks = [{ name: "Claws", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 2, sides: 6 }], modifier: 3 } }];
const token: Token = {
  id: "ogre", name: "Ogre", position: { x: 0, y: 0 }, size: 2, rotation: 0,
  color: "#6d4c41", imageUrl: null, ownerIds: [], hidden: false,
  stats: { hp: 30, maxHp: 59, ac: 11 }, conditions: [], attacks,
};

describe("template attacks in Save as creature and From creature (KAN-70)", () => {
  it("round-trips current attacks and stats, making independent copies", () => {
    const prefill = creatureFromToken(token, []);
    const saved: LibraryCreature = { ...prefill, id: "creature", createdAt: new Date(0).toISOString() };
    const draft = creatureDraft(saved);
    expect(draft.attacks).toEqual(attacks);
    expect(draft.stats).toEqual(token.stats);
    draft.attacks[0]!.damage!.modifier = 9;
    expect(token.attacks).toEqual(attacks);
    expect(saved.attacks).toEqual(attacks);
  });

  it("saves the token's own attacks, including none (shared-token-attacks)", () => {
    expect(creatureFromToken(token, []).attacks).toEqual(attacks);
    expect(creatureFromToken({ ...token, attacks: [] }, []).attacks).toEqual([]);
  });
});

describe("attacks kept only in a browser are cleared (shared-token-attacks)", () => {
  it("removes both old keys", () => {
    const removed: string[] = [];
    clearLegacyAttackStorage({ removeItem: (key: string) => void removed.push(key) });
    expect(removed).toEqual([...LEGACY_ATTACK_KEYS]);
    expect(removed).toEqual(["vtt.attack.presets", "vtt.attack.saved"]);
  });

  it("copes with missing or blocked storage", () => {
    expect(() => clearLegacyAttackStorage(null)).not.toThrow();
    expect(() => clearLegacyAttackStorage({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
