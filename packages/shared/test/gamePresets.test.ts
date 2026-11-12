import { describe, expect, it } from "vitest";
import {
  Command,
  CreateRoomRequest,
  decide,
  DEFAULT_PRESET_ID,
  emptyRoomState,
  filterStateForViewer,
  GAME_PRESETS,
  GamePresetId,
  presetFromLog,
  presetOf,
  reduceAll,
  tableForPreset,
  type CommandInput,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, ctx, gm } from "./fixtures";

/** A preset with every rules feature off, registered only while a test needs it. */
function withLimitedPreset(run: () => void) {
  const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
  registry.push({ ...GAME_PRESETS[0], id: "limited", name: "Limited", features: { attacks: false, conditions: false, armorClass: false }, conditions: [] });
  try {
    run();
  } finally {
    registry.pop();
  }
}

/** A room created with `preset`, holding a GM, Alice and Alice's Fighter. */
function room(preset?: string) {
  const events: DomainEvent[] = [
    { type: "RoomCreated", name: "Test", ...(preset && { preset }) },
    { type: "ParticipantJoined", participant: gm },
    { type: "ParticipantJoined", participant: alice },
    {
      type: "TokenCreated",
      token: {
        id: "f1", name: "Fighter", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
        assetId: null, ownerIds: [alice.id], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
      },
    },
    {
      type: "TokenCreated",
      token: {
        id: "g1", name: "Goblin", position: { x: 175, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
        assetId: null, ownerIds: [], hidden: false, stats: { hp: 7, maxHp: 7, ac: null }, conditions: [],
      },
    },
  ];
  return reduceAll(emptyRoomState("r1"), events);
}

const attempt = (state: RoomState, actor: Participant, input: CommandInput) => decide(state, actor, Command.parse(input), ctx);

describe("Game preset registry (KAN-63)", () => {
  it("offers Free Mode only for now, with every feature on", () => {
    expect(GAME_PRESETS.map((p) => [p.id, p.name])).toEqual([["free", "Free Mode"]]);
    expect(DEFAULT_PRESET_ID).toBe("free");
    expect(presetOf({ preset: "free" }).features).toEqual({ attacks: true, conditions: true, armorClass: true });
  });

  it("accepts known ids and rejects unknown ones, in the create-room request too", () => {
    expect(GamePresetId.safeParse("free").success).toBe(true);
    expect(GamePresetId.safeParse("dnd5e").success).toBe(false);
    expect(GamePresetId.safeParse("chess").success).toBe(false);
    const base = { roomName: "R", displayName: "GM", guestToken: "x".repeat(32) };
    expect(CreateRoomRequest.safeParse({ ...base, preset: "free" }).success).toBe(true);
    expect(CreateRoomRequest.safeParse({ ...base, preset: "chess" }).success).toBe(false);
    expect(CreateRoomRequest.safeParse(base).success).toBe(true);
  });

  it("picks up a newly registered preset without other changes", () => {
    const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
    registry.push({ ...GAME_PRESETS[0], id: "test-game", name: "Test Game" });
    try {
      expect(GamePresetId.safeParse("test-game").success).toBe(true);
      expect(presetOf({ preset: "test-game" }).name).toBe("Test Game");
    } finally {
      registry.pop();
    }
  });
});

describe("Preset is saved with the room (KAN-63)", () => {
  it("is recorded by RoomCreated, and an old room without it is Free Mode", () => {
    expect(room("free").preset).toBe("free");
    expect(room().preset).toBe("free");
    expect(presetFromLog({ type: "RoomCreated", preset: "free" })).toBe("free");
    expect(presetFromLog({ type: "RoomCreated" })).toBe("free");
    expect(presetFromLog(undefined)).toBe("free");
  });

  it("is public: players see which game the room is", () => {
    expect(filterStateForViewer(room("free"), alice).preset).toBe("free");
  });
});

describe("Server enforces a preset's features (KAN-63, FR-GM-15)", () => {
  const limitedIt = (name: string, fn: (limited: RoomState) => void) => it(name, () => withLimitedPreset(() => fn(room("limited"))));

  limitedIt("rejects attack rolls, rulings and damage when attacks are off", (free) => {
    expect(attempt(free, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "f1", targetTokenId: "g1" } }))
      .toMatchObject({ ok: false, code: "invalid", message: "Attack rolls are off in Limited." });
    expect(attempt(free, gm, { type: "roll.rule", rollId: "r1", verdict: "hit" })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(free, gm, { type: "roll.applyDamage", rollId: "r1" })).toMatchObject({ ok: false, code: "invalid" });
  });

  limitedIt("still lets everyone roll plain dice", (free) => {
    expect(attempt(free, alice, { type: "dice.roll", expression: "2d6" })).toMatchObject({ ok: true });
  });

  limitedIt("rejects conditions and AC through every command that sets them", (free) => {
    const refused = [
      { type: "token.setConditions", tokenId: "g1", conditions: ["poisoned"] },
      { type: "token.configure", tokenId: "g1", changes: { conditions: ["prone"] } },
      { type: "token.configure", tokenId: "g1", changes: { stats: { hp: 5, maxHp: 7, ac: 12 } } },
      { type: "token.setStats", tokenId: "g1", stats: { hp: 5, maxHp: 7, ac: 12 } },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, conditions: ["prone"] },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, stats: { hp: 15, maxHp: 15, ac: 13 } },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, attacks: [{ name: "Axe", toHit: null, damage: { terms: [{ count: 1, sides: 12 }], modifier: 3 } }] },
    ] satisfies CommandInput[];
    for (const input of refused) expect(attempt(free, gm, input)).toMatchObject({ ok: false, code: "invalid" });
  });

  limitedIt("allows HP and clearing conditions", (free) => {
    expect(attempt(free, gm, { type: "token.setStats", tokenId: "g1", stats: { hp: 3, maxHp: 7, ac: null } })).toMatchObject({ ok: true });
    expect(attempt(free, gm, { type: "token.setConditions", tokenId: "g1", conditions: [] })).toMatchObject({ ok: true });
  });

  limitedIt("answers a player's forbidden command as forbidden, not as a preset refusal", (free) => {
    expect(attempt(free, alice, { type: "roll.rule", rollId: "r1", verdict: "hit" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("keeps Free Mode rooms as before", () => {
    const dnd = room("free");
    expect(attempt(dnd, gm, { type: "token.setConditions", tokenId: "g1", conditions: ["poisoned"] })).toMatchObject({ ok: true });
    expect(attempt(dnd, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "f1", targetTokenId: "g1" } })).toMatchObject({ ok: true });
  });
});

describe("Templates from another game (KAN-63)", () => {
  it("drops conditions, attacks and AC for a preset without them, and changes nothing for Free Mode", () => {
    const table = {
      scene: room().scene,
      tokens: {
        g1: {
          id: "g1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
          ownerIds: [], hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: ["poisoned" as const],
          attacks: [{ name: "Scimitar", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: null }],
        },
      },
      templates: {},
      fog: {},
      initiative: null,
    };
    const freeTable = tableForPreset(table, { ...presetOf({ preset: "free" }), features: { attacks: false, conditions: false, armorClass: false } });
    expect(freeTable.tokens.g1).toMatchObject({ conditions: [], stats: { hp: 7, maxHp: 7, ac: null } });
    expect(freeTable.tokens.g1!.attacks).toBeUndefined();
    expect(tableForPreset(table, presetOf({ preset: "free" }))).toBe(table);
  });
});
