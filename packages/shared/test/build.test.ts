import { describe, expect, it } from "vitest";
import {
  AttackDice,
  BUILD_DIE_SIDES,
  BUILD_LIMITS,
  BuildFlag,
  BuildPass,
  DraftCreature,
  DraftEncounter,
  DraftMap,
  EncounterTemplateData,
  GameProfile,
  DraftLine,
  DraftMapSetup,
  DraftMapSetupChange,
  DraftOpening,
  checkBuild,
  creatureProblems,
  draftEncounterToTemplate,
  draftMapBoard,
  gridsAgree,
  listOpenings,
  readDraftMap,
  type BuildCreatureValues,
  type DraftEncounterSource,
  type DraftMapState,
  type GridSpec,
  type LibraryMapBoard,
} from "../src";

const creature = (over: Record<string, unknown> = {}) => ({ key: "goblin", name: "Goblin", isPlayerCharacter: false, ...over });
const attack = (over: Record<string, unknown> = {}) => ({
  name: "Bite",
  toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 },
  damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 },
  ...over,
});
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  (result.error?.issues ?? []).map((i) => i.message).join(" | ");

describe("the build pass and limits (FR-GM-26)", () => {
  const pass = `szb_${"a".repeat(43)}`;

  it("accepts a pass in the issued format", () => {
    expect(BuildPass.safeParse(pass).success).toBe(true);
  });

  it("refuses a seat value, so a player's seat can't be given to a build tool", () => {
    expect(BuildPass.safeParse(`d290f1ee-6c54-4b01-90e6-d701748f0851.${"a".repeat(40)}`).success).toBe(false);
  });

  it("refuses a pass with too little randomness", () => {
    expect(BuildPass.safeParse("szb_short").success).toBe(false);
  });

  it("states the limits the user accepted", () => {
    expect(BUILD_LIMITS).toMatchObject({
      openBuildsPerAccount: 3,
      passLifetimeMs: 24 * 60 * 60 * 1000,
      filesPerBuild: 100,
      mapsPerBuild: 20,
      storageBytesPerBuild: 500 * 1024 ** 2,
      requestsPerPassPerMinute: 120,
      creaturesPerBuild: 200,
      creaturesPerCall: 20,
      encountersPerBuild: 20,
      tokensPerEncounter: 500,
      flagCharacters: 200,
      notCarriedOverCharacters: 2000,
      gameNotesCharacters: 8000,
      abandonedAfterDays: 14,
    });
  });
});

describe("a draft creature holds only real token fields (FR-GM-26)", () => {
  it("keeps the values it is given", () => {
    const parsed = DraftCreature.parse(creature({ hp: 24, maxHp: 24, ac: 15, size: 2, attacks: [attack(), attack({ name: "Claw" })] }));
    expect(parsed).toMatchObject({ hp: 24, maxHp: 24, ac: 15, size: 2 });
    expect(parsed.attacks).toHaveLength(2);
  });

  it("leaves what wasn't given blank, without inventing a value", () => {
    expect(DraftCreature.parse(creature())).toMatchObject({
      hp: null, maxHp: null, ac: null, size: 1, attacks: [], conditions: [], imageFileId: null, flags: [], notCarriedOver: "",
    });
  });

  it("must say whether it is a player character", () => {
    const { isPlayerCharacter: _omitted, ...without } = creature();
    expect(DraftCreature.safeParse(without).success).toBe(false);
  });

  it("names the die when it is a d3", () => {
    const result = DraftCreature.safeParse(creature({ attacks: [attack({ damage: { terms: [{ count: 1, sides: 3 }], modifier: 0 } })] }));
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("d3");
  });

  it("names the die when it is a d7", () => {
    expect(messages(DraftCreature.safeParse(creature({ attacks: [attack({ toHit: { terms: [{ count: 1, sides: 7 }], modifier: 0 } })] })))).toContain("d7");
  });

  it("uses exactly the dice an attack can roll", () => {
    for (const sides of BUILD_DIE_SIDES) expect(AttackDice.safeParse({ count: 1, sides, modifier: 0 }).success).toBe(true);
    for (const sides of [2, 3, 5, 7, 16]) expect(AttackDice.safeParse({ count: 1, sides, modifier: 0 }).success).toBe(false);
  });

  it("allows a roll left blank for a flag", () => {
    expect(DraftCreature.safeParse(creature({ attacks: [attack({ damage: null })] })).success).toBe(true);
  });

  it("refuses a Max HP over the limit, naming the field", () => {
    const result = DraftCreature.safeParse(creature({ maxHp: 20000 }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["maxHp"]);
  });

  it("refuses HP above Max HP, as placing the token would", () => {
    expect(DraftCreature.safeParse(creature({ hp: 30, maxHp: 20 })).success).toBe(false);
  });

  it("refuses over-long text", () => {
    expect(DraftCreature.safeParse(creature({ name: "x".repeat(61) })).success).toBe(false);
    expect(DraftCreature.safeParse(creature({ notCarriedOver: "x".repeat(2001) })).success).toBe(false);
    expect(BuildFlag.safeParse({ field: "hp", message: "x".repeat(201) }).success).toBe(false);
    expect(BuildFlag.safeParse({ field: "hp", message: "x".repeat(200) }).success).toBe(true);
  });

  it("refuses a condition the app doesn't have", () => {
    expect(DraftCreature.safeParse(creature({ conditions: ["bleeding"] })).success).toBe(false);
  });

  it("refuses more than 8 attacks", () => {
    const attacks = Array.from({ length: 9 }, (_, i) => attack({ name: `Attack ${i}` }));
    expect(DraftCreature.safeParse(creature({ attacks })).success).toBe(false);
  });

  it("refuses two attacks with one name", () => {
    expect(DraftCreature.safeParse(creature({ attacks: [attack(), attack()] })).success).toBe(false);
  });

  it("refuses a field the app doesn't have on a draft, such as owners or an animation", () => {
    expect(DraftCreature.safeParse(creature({ ownerIds: ["someone"] })).success).toBe(false);
    expect(DraftCreature.safeParse(creature({ imageUrl: "https://example.com/a.png" })).success).toBe(false);
    expect(DraftCreature.safeParse(creature({ attacks: [attack({ animation: { style: "x" } })] })).success).toBe(false);
  });

  it("takes a key that can only be a plain name", () => {
    expect(DraftCreature.safeParse(creature({ key: "goblin-2_b" })).success).toBe(true);
    expect(DraftCreature.safeParse(creature({ key: "../etc" })).success).toBe(false);
    expect(DraftCreature.safeParse(creature({ key: "x".repeat(65) })).success).toBe(false);
  });
});

describe("a draft map only proposes a grid (FR-GM-26)", () => {
  const map = (over: Record<string, unknown> = {}) => ({ key: "bridge", name: "Bridge", fileId: "11111111-1111-4111-8111-111111111111", ...over });

  it("starts with no proposal", () => {
    expect(DraftMap.parse(map()).proposedGrid).toBeNull();
  });

  it("keeps a proposal in pixels", () => {
    expect(DraftMap.parse(map({ proposedGrid: { cellSize: 70, offsetX: 5, offsetY: 0 } })).proposedGrid?.cellSize).toBe(70);
  });

  it("refuses an offset as large as a square", () => {
    expect(DraftMap.safeParse(map({ proposedGrid: { cellSize: 70, offsetX: 70, offsetY: 0 } })).success).toBe(false);
  });

  it("can't claim its grid is confirmed, or carry walls", () => {
    expect(DraftMap.safeParse(map({ gridStatus: "confirmed" })).success).toBe(false);
    expect(DraftMap.safeParse(map({ walls: [] })).success).toBe(false);
  });
});

describe("a draft encounter places creatures by square (FR-GM-26)", () => {
  const token = (over: Record<string, unknown> = {}) => ({ creatureKey: "goblin", square: { column: 1, row: 2 }, hidden: true, ...over });
  const encounter = (over: Record<string, unknown> = {}) => ({ key: "ambush", name: "Bridge ambush", mapKey: "bridge", tokens: [token()], ...over });

  it("keeps tokens by square", () => {
    expect(DraftEncounter.parse(encounter()).tokens[0]).toMatchObject({ square: { column: 1, row: 2 }, hidden: true });
  });

  it("accepts a token with no square", () => {
    expect(DraftEncounter.safeParse(encounter({ tokens: [token({ square: null })] })).success).toBe(true);
  });

  it("must state hidden for every token", () => {
    const { hidden: _omitted, ...without } = token();
    expect(DraftEncounter.safeParse(encounter({ tokens: [without] })).success).toBe(false);
  });

  it("refuses board coordinates and owners", () => {
    expect(DraftEncounter.safeParse(encounter({ tokens: [token({ position: { x: 1, y: 1 } })] })).success).toBe(false);
    expect(DraftEncounter.safeParse(encounter({ tokens: [token({ ownerIds: [] })] })).success).toBe(false);
  });

  it("refuses more tokens than a template holds", () => {
    expect(DraftEncounter.safeParse(encounter({ tokens: Array.from({ length: 501 }, () => token()) })).success).toBe(false);
  });
});

describe("a game profile describes the game, not a preset (FR-GM-26)", () => {
  const profile = (over: Record<string, unknown> = {}) => ({ name: "Lanternfall", ...over });

  it("defaults to every feature and 5 ft squares", () => {
    expect(GameProfile.parse(profile())).toMatchObject({
      features: { hitPoints: true, armorClass: true, attacks: true, conditions: true }, unitsPerCell: 5, unitLabel: "ft", notes: "", flags: [],
    });
  });

  it("records a game with no armour class and metre squares", () => {
    const parsed = GameProfile.parse(profile({ features: { hitPoints: true, armorClass: false, attacks: true, conditions: true }, unitsPerCell: 2, unitLabel: "m" }));
    expect(parsed.features.armorClass).toBe(false);
    expect(parsed).toMatchObject({ unitsPerCell: 2, unitLabel: "m" });
  });

  it("limits the notes", () => {
    expect(GameProfile.safeParse(profile({ notes: "x".repeat(8000) })).success).toBe(true);
    expect(GameProfile.safeParse(profile({ notes: "x".repeat(8001) })).success).toBe(false);
  });

  it("can't name a preset", () => {
    expect(GameProfile.safeParse(profile({ preset: "dnd5e" })).success).toBe(false);
  });
});

describe("checking a draft (FR-GM-26)", () => {
  const features = { hitPoints: true, armorClass: true, attacks: true, conditions: true };
  const pc = { isPlayerCharacter: true, hp: 1, maxHp: 1, ac: 10 };

  it("is happy with a complete character", () => {
    expect(creatureProblems(pc, [], features)).toEqual([]);
  });

  it("reports each blank with no flag, on a player character only", () => {
    expect(creatureProblems({ ...pc, hp: null, ac: null }, [], features)).toHaveLength(2);
    expect(creatureProblems({ ...pc, isPlayerCharacter: false, ac: null }, [], features)).toEqual([]);
  });

  it("accepts a flag on the field, in any case", () => {
    expect(creatureProblems({ ...pc, maxHp: null }, [{ field: "MaxHP", message: "not given" }], features)).toEqual([]);
  });

  it("ignores a field the game doesn't use", () => {
    expect(creatureProblems({ ...pc, ac: null }, [], { ...features, armorClass: false })).toEqual([]);
  });

  const data = DraftCreature.parse(creature({ hp: 1, maxHp: 1, ac: 10 }));
  const file = { id: "11111111-1111-4111-8111-111111111111", width: 700, height: 700 };
  const map = (over = {}) => ({ name: "Cave", fileId: file.id, proposedGrid: null, gridStatus: "none" as const, grid: null, ...over });
  const empty = { profile: GameProfile.parse({ name: "G" }), files: [file], creatures: [], maps: [], encounters: [] };
  const tokens = (square: { column: number; row: number } | null, creatureKey = "goblin") => [{ creatureKey, square, hidden: false }];
  const encounterOn = (mapKey: string, list: ReturnType<typeof tokens>) => ({ key: "e", data: { name: "E", mapKey, tokens: list }, flags: [] });

  it("asks for a profile when there is none", () => {
    expect(checkBuild({ ...empty, profile: null })).toEqual([{ type: "problem", item: "game profile", label: "Game profile", target: null, message: expect.stringContaining("No game profile") }]);
  });

  it("reports a grid that's missing or waiting", () => {
    expect(checkBuild({ ...empty, maps: [{ key: "m", data: map(), flags: [] }] })[0]?.message).toContain("needs a grid");
    expect(checkBuild({ ...empty, maps: [{ key: "m", data: map({ gridStatus: "proposed" }), flags: [] }] })[0]?.message).toContain("confirm");
  });

  it("is quiet about a confirmed grid", () => {
    expect(checkBuild({ ...empty, maps: [{ key: "m", data: map({ gridStatus: "confirmed" }), flags: [] }] })).toEqual([]);
  });

  it("reports what an encounter names that's gone, and what isn't placed or fits", () => {
    const creatures = [{ key: "goblin", data, flags: [] }];
    const grid = { cellSize: 70, offsetX: 0, offsetY: 0 };
    const maps = [{ key: "m", data: map({ gridStatus: "confirmed", grid }), flags: [] }];
    const messages = (list: ReturnType<typeof tokens>, mapKey = "m") =>
      checkBuild({ ...empty, creatures, maps, encounters: [encounterOn(mapKey, list)] }).map((i) => i.message).join(" | ");
    expect(messages(tokens({ column: 0, row: 0 }))).toBe("");
    expect(messages(tokens(null))).toContain("no square");
    expect(messages(tokens({ column: 50, row: 0 }))).toContain("off the map");
    expect(messages(tokens({ column: 0, row: 0 }, "dragon"))).toContain('"dragon"');
    expect(messages(tokens({ column: 0, row: 0 }), "gone")).toContain('"gone"');
  });

  it("reports a file that has gone", () => {
    expect(checkBuild({ ...empty, files: [], maps: [{ key: "m", data: map({ gridStatus: "confirmed" }), flags: [] }] })[0]?.message).toContain("file");
  });

  it("lists flags as flags", () => {
    const issues = checkBuild({ ...empty, creatures: [{ key: "goblin", data, flags: [{ field: "ac", message: "around 14 maybe" }] }] });
    expect(issues).toEqual([{ type: "flag", item: "creature goblin", label: "Goblin", target: { kind: "creature", key: "goblin" }, message: "ac: around 14 maybe" }]);
  });

  it("speaks to the owner about the page, by each item's name, not to the AI about its tools", () => {
    const owner = checkBuild({
      ...empty, audience: "owner", profile: null,
      creatures: [{ key: "goblin", data: DraftCreature.parse(creature({ isPlayerCharacter: true, hp: null, maxHp: 7, ac: 10 })), flags: [{ field: "maxHp", message: "two numbers on the sheet" }] }],
      maps: [{ key: "m", data: map({ gridStatus: "proposed" }), flags: [] }],
    });
    expect(owner.map((i) => [i.label, i.message])).toEqual([
      ["Game profile", "Your AI hasn't saved a game profile, so every field counts as in use. Ask it to save one if that's wrong."],
      ["Goblin", "Max HP: two numbers on the sheet"],
      ["Goblin", "HP is blank, and your AI didn't say why. Fill it in, or publish it blank."],
      ["Cave", "Its grid is waiting for you. Check it on the map below, then confirm it."],
    ]);
    expect(owner.map((i) => i.target)).toEqual([null, { kind: "creature", key: "goblin" }, { kind: "creature", key: "goblin" }, { kind: "map", key: "m" }]);
    // The AI still reads what to do with its own tools.
    expect(checkBuild({ ...empty, profile: null })[0]?.message).toMatch(/Save one so the GM knows/);
  });
});

describe("turning a draft encounter into a template (FR-GM-27)", () => {
  const grid: GridSpec = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
  const goblin: BuildCreatureValues = {
    name: "Goblin", size: 1, hp: 7, maxHp: 7, ac: 13, color: "#336699", conditions: [], attacks: [],
    imageUrl: "/uploads/goblin.webp", assetId: "22222222-2222-4222-8222-222222222222",
  };
  const source = (over: Partial<DraftEncounterSource> = {}): DraftEncounterSource => ({
    map: { assetId: "33333333-3333-4333-8333-333333333333", width: 700, height: 700 },
    grid,
    board: { walls: [], fog: [] },
    creatures: new Map([["goblin", goblin]]),
    tokens: [{ creatureKey: "goblin", square: { column: 2, row: 3 }, hidden: false }],
    ...over,
  });
  const onlyToken = (result: ReturnType<typeof draftEncounterToTemplate>) => {
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.data.tokens[0]!;
  };

  it.each([[1, 175, 245], [2, 210, 280], [3, 245, 315], [4, 280, 350]])("puts a size %i token's top-left on the square", (size, x, y) => {
    const result = draftEncounterToTemplate(source({ creatures: new Map([["goblin", { ...goblin, size }]]) }));
    expect(onlyToken(result).position).toEqual({ x, y });
  });

  it.each([[1, 138, 182], [2, 163, 207], [3, 188, 232], [4, 213, 257]])("honours an offset grid at size %i", (size, x, y) => {
    const offset = { ...grid, cellSize: 50, offsetX: 13, offsetY: 7 };
    const result = draftEncounterToTemplate(source({ grid: offset, creatures: new Map([["goblin", { ...goblin, size }]]) }));
    expect(onlyToken(result).position).toEqual({ x, y });
  });

  it("follows a corrected grid, because tokens are stored by square", () => {
    const before = onlyToken(draftEncounterToTemplate(source()));
    const after = onlyToken(draftEncounterToTemplate(source({ grid: { ...grid, cellSize: 50, offsetX: 10 } })));
    expect(before.position).toEqual({ x: 175, y: 245 });
    expect(after.position).toEqual({ x: 135, y: 175 });
  });

  it("copies the creature's values, with no owners and no initiative", () => {
    const token = onlyToken(draftEncounterToTemplate(source()));
    expect(token).toMatchObject({ name: "Goblin", size: 1, rotation: 0, color: "#336699", hidden: false, stats: { hp: 7, maxHp: 7, ac: 13 } });
    expect(token.imageUrl).toBe("/uploads/goblin.webp");
    expect(token.assetId).toBe(goblin.assetId);
    expect(token).not.toHaveProperty("ownerIds");
    expect(token).not.toHaveProperty("initiative");
  });

  it("keeps a hidden token hidden and uses a token's own label", () => {
    const token = onlyToken(draftEncounterToTemplate(source({ tokens: [{ creatureKey: "goblin", name: "Goblin 2", square: { column: 0, row: 0 }, hidden: true }] })));
    expect(token).toMatchObject({ name: "Goblin 2", hidden: true });
  });

  it("starts a creature with blank HP at full health, as placing one does", () => {
    const token = onlyToken(draftEncounterToTemplate(source({ creatures: new Map([["goblin", { ...goblin, hp: null, maxHp: 9 }]]) })));
    expect(token.stats).toMatchObject({ hp: 9, maxHp: 9 });
  });

  it("carries a creature with no art as a colour disc", () => {
    const token = onlyToken(draftEncounterToTemplate(source({ creatures: new Map([["goblin", { ...goblin, imageUrl: null, assetId: null }]]) })));
    expect(token.imageUrl).toBeNull();
    expect(token).not.toHaveProperty("assetId");
  });

  it("takes walls, doors and fog from the map, and gives a valid template", () => {
    const wall = { a: { x: 0, y: 700 }, b: { x: 700, y: 700 } };
    const door = { a: { x: 0, y: 0 }, b: { x: 0, y: 70 }, portal: { kind: "door" as const, state: "closed" as const } };
    const fog = { shape: "rect" as const, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }] };
    const result = draftEncounterToTemplate(source({ board: { walls: [wall, door], fog: [fog] } }));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.data.walls).toEqual([wall, door]);
    expect(result.data.fog).toEqual([fog]);
    expect(result.data.grid).toEqual(grid);
    expect(EncounterTemplateData.safeParse(result.data).success).toBe(true);
  });

  it("accepts a token exactly against the map's edge", () => {
    expect(draftEncounterToTemplate(source({ tokens: [{ creatureKey: "goblin", square: { column: 9, row: 9 }, hidden: false }] })).ok).toBe(true);
  });

  it.each([
    ["past the right edge", { column: 10, row: 0 }, 1],
    ["past the bottom edge", { column: 0, row: 10 }, 1],
    ["before the left edge", { column: -1, row: 0 }, 1],
    ["above the top edge", { column: 0, row: -1 }, 1],
    ["hanging over the edge", { column: 9, row: 0 }, 2],
  ])("refuses a token %s, naming it", (_label, square, size) => {
    const result = draftEncounterToTemplate(source({
      creatures: new Map([["goblin", { ...goblin, size }]]),
      tokens: [{ creatureKey: "goblin", name: "Scout", square, hidden: false }],
    }));
    expect(result).toEqual({ ok: false, problems: [{ token: "Scout", message: expect.stringContaining("map") }] });
  });

  it("refuses a small token whose snapped center would hang off the map", () => {
    const result = draftEncounterToTemplate(source({
      creatures: new Map([["goblin", { ...goblin, size: 0.5 }]]),
      tokens: [{ creatureKey: "goblin", square: { column: 0, row: 0 }, hidden: false }],
    }));
    expect(result.ok).toBe(false);
  });

  it("refuses the partial column an offset grid leaves before its first line", () => {
    const result = draftEncounterToTemplate(source({
      grid: { ...grid, offsetX: 30 },
      tokens: [{ creatureKey: "goblin", square: { column: -1, row: 0 }, hidden: false }],
    }));
    expect(result.ok).toBe(false);
  });

  const across = { a: { x: 175, y: 0 }, b: { x: 175, y: 700 } };

  it("refuses a footprint across a wall", () => {
    const result = draftEncounterToTemplate(source({ board: { walls: [across], fog: [] } }));
    expect(result).toEqual({ ok: false, problems: [{ token: "Goblin", message: expect.stringContaining("wall") }] });
  });

  it("refuses a footprint across a closed door", () => {
    const door = { ...across, portal: { kind: "door" as const, state: "closed" as const } };
    expect(draftEncounterToTemplate(source({ board: { walls: [door], fog: [] } })).ok).toBe(false);
  });

  it("allows a footprint across an open door", () => {
    const door = { ...across, portal: { kind: "door" as const, state: "open" as const } };
    expect(draftEncounterToTemplate(source({ board: { walls: [door], fog: [] } })).ok).toBe(true);
  });

  it("allows a token beside a wall on its square's edge", () => {
    const edge = { a: { x: 140, y: 0 }, b: { x: 140, y: 700 } };
    expect(draftEncounterToTemplate(source({ board: { walls: [edge], fog: [] } })).ok).toBe(true);
  });

  it("reports a token with no square rather than dropping it", () => {
    const result = draftEncounterToTemplate(source({ tokens: [{ creatureKey: "goblin", square: null, hidden: false }] }));
    expect(result).toEqual({ ok: false, problems: [{ token: "Goblin", message: expect.stringContaining("square") }] });
  });

  it("reports an unknown creature, even one named like an object's built-in property", () => {
    const result = draftEncounterToTemplate(source({ tokens: [{ creatureKey: "__proto__", square: { column: 0, row: 0 }, hidden: false }] }));
    expect(result).toEqual({ ok: false, problems: [{ token: "__proto__", message: expect.stringContaining("creature") }] });
  });

  it("refuses HP above Max HP if library values changed since the draft", () => {
    const result = draftEncounterToTemplate(source({ creatures: new Map([["goblin", { ...goblin, hp: 9, maxHp: 7 }]]) }));
    expect(result.ok).toBe(false);
  });

  it("reports every problem at once", () => {
    const result = draftEncounterToTemplate(source({ tokens: [
      { creatureKey: "goblin", name: "A", square: null, hidden: false },
      { creatureKey: "goblin", name: "B", square: { column: 99, row: 0 }, hidden: false },
      { creatureKey: "goblin", name: "C", square: { column: 0, row: 0 }, hidden: false },
    ] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((p) => p.token)).toEqual(["A", "B"]);
  });

  it("names the failure if the assembled template breaks the shared schema", () => {
    const result = draftEncounterToTemplate(source({ creatures: new Map([["goblin", { ...goblin, color: "not a colour" }]]) }));
    expect(result.ok).toBe(false);
  });
});

describe("AI-set grids and walls, by the owner's choice (FR-GM-26)", () => {
  const grid70 = { cellSize: 70, offsetX: 0, offsetY: 0 };
  const units = { unitsPerCell: 5, unitLabel: "ft" };
  const mapSize = { width: 700, height: 700 };
  const segment = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  // As a UVTT import leaves it: the opening already cut out of its wall.
  const board: LibraryMapBoard = {
    walls: [
      segment(0, 140, 140, 140), { ...segment(140, 140, 210, 140), uvttPortal: { closed: true } }, segment(210, 140, 350, 140),
      { ...segment(280, 0, 280, 70), uvttPortal: { closed: false } },
      segment(0, 0, 0, 700),
      segment(0, 425, 700, 425),
    ],
    fog: [],
  };
  const setup = (over: Partial<DraftMapSetup> = {}): DraftMapSetup => ({ openings: [], lines: [], marks: [], ...over });
  const line = (from: [number, number], to: [number, number], kind: "wall" | "door" | "window" = "wall", state?: "open" | "closed" | "locked") =>
    DraftLine.parse({ from: { column: from[0], row: from[1] }, to: { column: to[0], row: to[1] }, kind, ...(state ? { state } : {}) });
  const built = (s: DraftMapSetup, grid: typeof grid70 | null = grid70) => {
    const result = draftMapBoard(board, s, grid, mapSize);
    if (!result.ok) throw new Error(result.problems.join("; "));
    return result;
  };

  describe("the grid agreement", () => {
    it("matches a cell size just inside half a pixel, and not just outside", () => {
      expect(gridsAgree({ cellSize: 70.4, offsetX: 0, offsetY: 0 }, grid70)).toBe(true);
      expect(gridsAgree({ cellSize: 70.6, offsetX: 0, offsetY: 0 }, grid70)).toBe(false);
    });

    it("matches offsets within one pixel, compared across the cell", () => {
      expect(gridsAgree({ ...grid70, offsetX: 69.5 }, grid70)).toBe(true);
      expect(gridsAgree({ ...grid70, offsetY: 1 }, grid70)).toBe(true);
      expect(gridsAgree({ ...grid70, offsetY: 2.1 }, grid70)).toBe(false);
    });
  });

  describe("reading a draft map's grid", () => {
    const proposed: DraftMapState = { name: "Bridge", fileId: "f", proposedGrid: grid70, gridStatus: "proposed", grid: null };
    const suggested = { grid: null, detectionStatus: "suggested", detectionResult: grid70 };

    it("counts as confirmed when grids are allowed and detection agrees", () => {
      const read = readDraftMap(proposed, suggested, true, units);
      expect(read).toMatchObject({ gridStatus: "confirmed", gridBy: "agreement", grid: { ...grid70, ...units } });
    });

    it("uses detection's numbers once they agree, so small differences can't add up across the map", () => {
      const close = { ...proposed, proposedGrid: { cellSize: 70.4, offsetX: 0.8, offsetY: 0 } };
      const fitted = { grid: null, detectionStatus: "suggested", detectionResult: { cellSize: 70.02, offsetX: 0.1, offsetY: 0 } };
      expect(readDraftMap(close, fitted, true, units).grid).toEqual({ cellSize: 70.02, offsetX: 0.1, offsetY: 0, ...units });
    });

    it("waits for the user when grids aren't allowed", () => {
      expect(readDraftMap(proposed, suggested, false, units)).toMatchObject({ gridStatus: "proposed", grid: null, gridDiffers: null });
    });

    it("waits, and names detection's numbers, when the two differ", () => {
      const read = readDraftMap({ ...proposed, proposedGrid: { cellSize: 72, offsetX: 0, offsetY: 0 } }, suggested, true, units);
      expect(read).toMatchObject({ gridStatus: "proposed", gridDiffers: grid70 });
    });

    it("waits while detection runs, and counts once a matching suggestion arrives", () => {
      expect(readDraftMap(proposed, { grid: null, detectionStatus: "running", detectionResult: null }, true, units).gridStatus).toBe("proposed");
      expect(readDraftMap(proposed, suggested, true, units).gridStatus).toBe("confirmed");
    });

    it("keeps a file's grid and the owner's grid, whatever the choice", () => {
      const file = { ...grid70, ...units };
      expect(readDraftMap({ ...proposed, grid: file }, { ...suggested, grid: file }, false, units)).toMatchObject({ gridStatus: "confirmed", gridBy: "file" });
      expect(readDraftMap({ ...proposed, grid: file }, suggested, false, units)).toMatchObject({ gridStatus: "confirmed", gridBy: "owner" });
    });

    it("has no grid with no proposal", () => {
      expect(readDraftMap({ ...proposed, proposedGrid: null }, suggested, true, units).gridStatus).toBe("none");
    });
  });

  describe("what the AI may send", () => {
    it("takes whole and half squares, and refuses anything finer", () => {
      expect(DraftLine.safeParse({ from: { column: 3.5, row: 2 }, to: { column: 3.5, row: 4 }, kind: "wall" }).success).toBe(true);
      expect(messages(DraftLine.safeParse({ from: { column: 3.25, row: 2 }, to: { column: 4, row: 2 }, kind: "wall" }))).toMatch(/half squares/);
    });

    it("needs a state on a door or window, and none on a wall", () => {
      expect(DraftLine.safeParse({ from: { column: 0, row: 0 }, to: { column: 1, row: 0 }, kind: "door" }).success).toBe(false);
      expect(DraftLine.safeParse({ from: { column: 0, row: 0 }, to: { column: 1, row: 0 }, kind: "wall", state: "open" }).success).toBe(false);
      expect(DraftLine.safeParse({ from: { column: 0, row: 0 }, to: { column: 0, row: 0 }, kind: "wall" }).success).toBe(false);
    });

    it("needs a reason to leave an opening, and a state to make it a door", () => {
      expect(DraftOpening.safeParse({ number: 1, kind: "leave" }).success).toBe(false);
      expect(DraftOpening.safeParse({ number: 1, kind: "door" }).success).toBe(false);
      expect(DraftOpening.safeParse({ number: 1, kind: "leave", reason: "Could be an archway." }).success).toBe(true);
    });

    it("holds at most 500 lines on a map, and each opening once", () => {
      const wall = { from: { column: 0, row: 0 }, to: { column: 1, row: 0 }, kind: "wall" };
      expect(DraftMapSetup.safeParse(setup({ lines: Array(BUILD_LIMITS.linesPerMap).fill(wall) })).success).toBe(true);
      expect(DraftMapSetup.safeParse(setup({ lines: Array(BUILD_LIMITS.linesPerMap + 1).fill(wall) })).success).toBe(false);
      const door = { number: 1, kind: "door", state: "closed" };
      expect(DraftMapSetup.safeParse({ openings: [door, door], lines: [], marks: [] }).success).toBe(false);
    });

    it("needs at least one part in a change", () => {
      expect(DraftMapSetupChange.safeParse({}).success).toBe(false);
      expect(DraftMapSetupChange.safeParse({ marks: [] }).success).toBe(true);
    });
  });

  describe("a map's openings", () => {
    it("numbers them in the file's order, with where they are", () => {
      const openings = listOpenings(board, undefined, grid70);
      expect(openings.map((o) => [o.number, o.square, o.direction, o.lengthSquares, o.now])).toEqual([
        [1, { column: 2, row: 2 }, "horizontal", 1, { kind: "opening", state: "closed" }],
        [2, { column: 4, row: 0 }, "vertical", 1, { kind: "opening", state: "open" }],
      ]);
    });

    it("has no squares before there is a grid", () => {
      expect(listOpenings(board, undefined, null)[0]).toMatchObject({ square: null, lengthSquares: null });
    });

    it("shows what the setup made each one", () => {
      const s = setup({ openings: [{ number: 1, kind: "door", state: "locked" }, { number: 2, kind: "leave", reason: "Could be an archway." }] });
      expect(listOpenings(board, s, grid70).map((o) => [o.now, o.set])).toEqual([
        [{ kind: "door", state: "locked" }, true],
        [{ kind: "left", reason: "Could be an archway." }, true],
      ]);
    });

    it("turns them into doors and windows on the board, keeping the file's own data", () => {
      const s = setup({ openings: [{ number: 1, kind: "door", state: "locked" }, { number: 2, kind: "window", state: "closed" }] });
      const walls = built(s).board.walls;
      expect(walls).toContainEqual({ ...segment(140, 140, 210, 140), uvttPortal: { closed: true }, portal: { kind: "door", state: "locked" } });
      expect(walls).toContainEqual({ ...segment(280, 0, 280, 70), uvttPortal: { closed: false }, portal: { kind: "window", state: "closed" } });
    });

    it("leaves an opening left for the user as the file had it", () => {
      const walls = built(setup({ openings: [{ number: 1, kind: "leave", reason: "Unclear" }] })).board.walls;
      expect(walls).toContainEqual({ ...segment(140, 140, 210, 140), uvttPortal: { closed: true } });
    });

    it("refuses a number the map doesn't have", () => {
      const result = draftMapBoard(board, setup({ openings: [{ number: 3, kind: "door", state: "open" }] }), grid70, mapSize);
      expect(result).toEqual({ ok: false, problems: ["Opening 3 isn't on this map. It has 2 openings."] });
    });
  });

  describe("lines drawn by grid corners", () => {
    it("places them by the grid, so a corrected grid moves them", () => {
      const s = setup({ lines: [line([1, 1], [2, 1])] });
      expect(built(s).board.walls).toContainEqual(segment(70, 70, 140, 70));
      expect(built(s, { cellSize: 72, offsetX: 0, offsetY: 0 }).board.walls).toContainEqual(segment(72, 72, 144, 72));
    });

    it("refuses a corner off the map, naming the line", () => {
      const result = draftMapBoard(board, setup({ lines: [line([1, 1], [2, 1]), line([9, 9], [11, 9])] }), grid70, mapSize);
      expect(result).toEqual({ ok: false, problems: ["Line 2 (a wall from column 9, row 9 to column 11, row 9) has a corner off the map."] });
    });

    it("needs a grid", () => {
      const result = draftMapBoard(null, setup({ lines: [line([1, 1], [2, 1])] }), null, mapSize);
      expect(result.ok ? [] : result.problems).toEqual(["Drawing lines needs a grid first. Propose one with save_map."]);
    });

    it("cuts a solid wall where a door is drawn along it", () => {
      const result = built(setup({ lines: [line([0, 2], [0, 3], "door", "closed")] }));
      expect(result.board.walls).toContainEqual({ ...segment(0, 140, 0, 210), portal: { kind: "door", state: "closed" } });
      expect(result.board.walls).toContainEqual(segment(0, 0, 0, 140));
      expect(result.board.walls).toContainEqual(segment(0, 210, 0, 700));
      expect(result.board.walls).not.toContainEqual(segment(0, 0, 0, 700));
      expect(result.blockedLines).toEqual([]);
    });

    it("reports a door that sits on a wall it doesn't cut", () => {
      // The file's wall is at y = 425, five pixels off the grid line the door is drawn on.
      expect(built(setup({ lines: [line([3, 6], [4, 6], "door", "open")] })).blockedLines).toEqual([0]);
    });

    it("leaves the file's walls alone when nothing is drawn", () => {
      expect(built(setup()).board.walls).toEqual(board.walls);
    });
  });

  describe("what the check reports", () => {
    const file = { id: "f", width: 700, height: 700, board };
    const map = (over: Partial<DraftMapState> = {}): DraftMapState =>
      ({ name: "Chandlery", fileId: "f", proposedGrid: null, gridStatus: "confirmed", grid: { ...grid70, ...units }, ...over });
    const check = (data: DraftMapState, aiWalls: boolean) =>
      checkBuild({ profile: null, aiWalls, files: [file], creatures: [], maps: [{ key: "shop", data, flags: [] }], encounters: [] })
        .filter((i) => i.item === "map shop");

    it("lists openings left for the user and marked places, with reasons", () => {
      const s = setup({ openings: [{ number: 1, kind: "door", state: "closed" }, { number: 2, kind: "leave", reason: "Could be an archway." }], marks: [{ square: { column: 3, row: 4 }, reason: "Curved cave wall." }] });
      expect(check(map({ setup: s }), true)).toMatchObject([
        { type: "flag", item: "map shop", label: "Chandlery", target: { kind: "map", key: "shop" }, message: "Opening 2 is left for the user: Could be an archway." },
        { type: "flag", item: "map shop", message: "Marked at column 3, row 4: Curved cave wall." },
      ]);
    });

    it("asks about openings still as imported only when the AI may set walls", () => {
      expect(check(map(), true)).toMatchObject([{ type: "problem", item: "map shop", message: "Openings still as imported: 1, 2. Set each as a door or window, or leave it for the user with a reason." }]);
      expect(check(map(), false)).toEqual([]);
    });

    it("reports a blocked door", () => {
      const s = setup({ openings: [{ number: 1, kind: "door", state: "closed" }, { number: 2, kind: "door", state: "open" }], lines: [line([3, 6], [4, 6], "door", "open")] });
      expect(check(map({ setup: s }), true).map((i) => i.message)).toEqual([
        "Line 1 (a door from column 3, row 6 to column 4, row 6) sits on a wall it doesn't cut, so the wall still blocks it. Draw it along the wall's line, or mark the place for the user.",
      ]);
    });

    it("says when the AI's grid differs from detection's", () => {
      const data = map({ grid: null, gridStatus: "proposed", proposedGrid: { cellSize: 72, offsetX: 0, offsetY: 0 }, gridDiffers: grid70 });
      expect(check(data, false)[0]?.message).toBe("Your grid (72-pixel squares at offset (0, 0)) differs from grid detection's (70-pixel squares at offset (0, 0)), so it waits for the user. Look at the map with the grid drawn, then propose again.");
    });
  });
});
