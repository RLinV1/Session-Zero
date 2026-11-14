import { describe, expect, it } from "vitest";
import {
  BuildChoices,
  BuildChoicesChange,
  DraftMapSetup,
  DraftMapSetupChange,
  GameProfile,
  MAX_TERRAIN_CELLS,
  cellOverlapsMap,
  changesWalls,
  checkBuild,
  draftEncounterToTemplate,
  draftTerrainProblems,
  draftTerrainState,
  footprintOnBlocked,
  normalizeTerrain,
  sameTerrainGrid,
  terrainTally,
  type BuildCreatureValues,
  type DraftEncounterSource,
  type DraftMapState,
  type GridSpec,
  type TerrainRun,
} from "../src";

const GRID = { cellSize: 70, offsetX: 0, offsetY: 0 };
const MAP = { width: 700, height: 700 };
const run = (row: number, start: number, end: number, kind: TerrainRun["kind"] = "difficult"): TerrainRun => ({ row, start, end, kind });

describe("the owner's terrain choice (FR-GM-26, ADR 0071)", () => {
  it("is a third choice, off in NO_BUILD_CHOICES, and required in a summary", () => {
    expect(BuildChoices.safeParse({ aiGrid: true, aiWalls: true }).success).toBe(false);
    expect(BuildChoices.parse({ aiGrid: false, aiWalls: false, aiTerrain: true })).toEqual({ aiGrid: false, aiWalls: false, aiTerrain: true });
  });

  it("lets a page from before ADR 0071 send only the first two", () => {
    expect(BuildChoicesChange.parse({ aiGrid: true, aiWalls: false })).toEqual({ aiGrid: true, aiWalls: false });
    expect(BuildChoicesChange.safeParse({ aiGrid: true, aiWalls: false, aiTerrain: "yes" }).success).toBe(false);
    expect(BuildChoicesChange.safeParse({ aiGrid: true, aiWalls: false, extra: true }).success).toBe(false);
  });
});

describe("a draft map's proposed terrain (FR-GM-26, ADR 0071)", () => {
  it("reads an older draft's setup, which has no terrain", () => {
    expect(DraftMapSetup.parse({ openings: [], lines: [], marks: [] })).toEqual({ openings: [], lines: [], marks: [] });
  });

  it("takes terrain alone, and tells walls from terrain by the parts sent", () => {
    const terrainOnly = DraftMapSetupChange.parse({ terrain: [run(1, 2, 4)] });
    expect(changesWalls(terrainOnly)).toBe(false);
    expect(changesWalls(DraftMapSetupChange.parse({ marks: [], terrain: [] }))).toBe(true);
    expect(DraftMapSetupChange.parse({ terrain: [] })).toEqual({ terrain: [] });
    expect(DraftMapSetupChange.safeParse({}).error?.issues[0]?.message).toBe("Send openings, lines, marks or terrain.");
  });

  it("refuses runs out of order, overlapping, backwards, of an unknown kind, or past the cell limit", () => {
    const refused = (terrain: unknown) => !DraftMapSetupChange.safeParse({ terrain }).success;
    expect(refused([run(2, 0, 1), run(1, 0, 1)])).toBe(true);
    expect(refused([run(1, 0, 3), run(1, 3, 5, "blocked")])).toBe(true);
    expect(refused([run(1, 4, 2)])).toBe(true);
    expect(refused([{ row: 1, start: 0, end: 0, kind: "normal" }])).toBe(true);
    expect(refused([{ row: 1, start: 0, end: 0, kind: "difficult", extra: 1 }])).toBe(true);
    expect(refused([run(0, 0, MAX_TERRAIN_CELLS)])).toBe(true);
    expect(refused([run(0, 0, MAX_TERRAIN_CELLS - 1)])).toBe(false);
  });

  it("needs a grid, and every square on the map", () => {
    expect(draftTerrainProblems([run(1, 1, 1)], null, MAP)).toEqual(["Terrain needs a grid first. Propose one with save_map."]);
    expect(draftTerrainProblems([run(1, 8, 10)], GRID, MAP)).toEqual(["Terrain run 1 (difficult, row 1, columns 8 to 10) has a square off the map."]);
    expect(draftTerrainProblems([run(-1, 0, 0, "blocked")], GRID, MAP)).toEqual(["Terrain run 1 (blocked, row -1, column 0) has a square off the map."]);
    expect(draftTerrainProblems([run(0, 0, 9), run(9, 0, 9, "blocked")], GRID, MAP)).toEqual([]);
    expect(draftTerrainProblems([], null, MAP)).toEqual([]);
  });

  it("counts a square the map's edge crops, by the terrain editor's own rule, but not one only touching it", () => {
    const offset = { cellSize: 70, offsetX: 20, offsetY: 30 };
    // Column -1 covers x from -50 to 20, and the last column, 9, runs from 650 past the edge at 700.
    expect(cellOverlapsMap(-1, -1, offset, MAP)).toBe(true);
    expect(cellOverlapsMap(9, 9, offset, MAP)).toBe(true);
    expect(cellOverlapsMap(10, 0, offset, MAP)).toBe(false);
    expect(draftTerrainProblems([run(-1, -1, 9)], offset, MAP)).toEqual([]);
    // With no offset, column -1 lies wholly off the map: it only touches its edge.
    expect(cellOverlapsMap(-1, 0, GRID, MAP)).toBe(false);
    expect(draftTerrainProblems([run(0, -1, 3)], GRID, MAP)).toHaveLength(1);
  });

  it("names five runs off the map, and counts the rest", () => {
    const off = Array.from({ length: 8 }, (_, i) => run(i, 10, 10));
    const problems = draftTerrainProblems(off, GRID, MAP);
    expect(problems).toHaveLength(6);
    expect(problems.at(-1)).toBe("3 more terrain runs have squares off the map.");
  });

  it("stores runs joined, so the same squares always read the same", () => {
    expect(normalizeTerrain([run(1, 0, 1), run(1, 2, 3), run(1, 4, 4, "blocked"), run(2, 0, 0)])).toEqual([run(1, 0, 3), run(1, 4, 4, "blocked"), run(2, 0, 0)]);
    expect(terrainTally([run(1, 0, 3), run(1, 4, 4, "blocked")])).toEqual({ difficult: 4, blocked: 1 });
  });

  it("knows terrain proposed on another grid, and doesn't take a wrapped offset as the same grid", () => {
    const setup = { openings: [], lines: [], marks: [], terrain: [run(1, 1, 1)], terrainGrid: GRID };
    expect(draftTerrainState(setup, GRID)).toBe("ready");
    // Within the grid agreement's tolerance: the same squares.
    expect(draftTerrainState(setup, { cellSize: 70.4, offsetX: 0.8, offsetY: 0 })).toBe("ready");
    expect(draftTerrainState(setup, { cellSize: 50, offsetX: 0, offsetY: 0 })).toBe("otherGrid");
    // 69.5 and 0 agree as grid lines, but every square would be numbered one off.
    expect(sameTerrainGrid(GRID, { cellSize: 70, offsetX: 69.5, offsetY: 0 })).toBe(false);
    expect(draftTerrainState(setup, null)).toBe("noGrid");
    expect(draftTerrainState({ ...setup, terrain: [] }, null)).toBe("none");
    expect(draftTerrainState(undefined, GRID)).toBe("none");
  });

  it("finds a footprint on Blocked ground by the room's rule, but not on Difficult or beside it", () => {
    const terrain = [run(3, 3, 3, "blocked"), run(5, 5, 5)];
    expect(footprintOnBlocked({ x: 245, y: 245 }, 1, GRID, terrain)).toBe(true);
    expect(footprintOnBlocked({ x: 385, y: 385 }, 1, GRID, terrain)).toBe(false);
    // Next to it, sharing only an edge.
    expect(footprintOnBlocked({ x: 315, y: 245 }, 1, GRID, terrain)).toBe(false);
    // A size 2 token over squares (2..3, 2..3) covers the Blocked square.
    expect(footprintOnBlocked({ x: 210, y: 210 }, 2, GRID, terrain)).toBe(true);
    expect(footprintOnBlocked({ x: 245, y: 245 }, 1, GRID, [])).toBe(false);
  });
});

describe("checking a draft's terrain (FR-GM-27, ADR 0071)", () => {
  const file = { id: "11111111-1111-4111-8111-111111111111", width: 700, height: 700 };
  const confirmed = { ...GRID, unitsPerCell: 5, unitLabel: "ft" };
  const map = (setup: DraftMapState["setup"], over: Partial<DraftMapState> = {}): DraftMapState =>
    ({ name: "Cave", fileId: file.id, proposedGrid: GRID, gridStatus: "confirmed", grid: confirmed, setup, ...over });
  const goblin = { name: "Goblin", isPlayerCharacter: false, size: 1, hp: 7, maxHp: 7, ac: 13, attacks: [], conditions: [], color: "#336699", imageFileId: null };
  const input = (data: DraftMapState, square = { column: 3, row: 3 }) => ({
    profile: GameProfile.parse({ name: "G" }), files: [file],
    creatures: [{ key: "goblin", data: goblin, flags: [] }],
    maps: [{ key: "cave", data, flags: [] }],
    encounters: [{ key: "e", data: { name: "Ambush", mapKey: "cave", tokens: [{ creatureKey: "goblin", square, hidden: false }] }, flags: [] }],
  });
  const setup = (terrain: TerrainRun[], terrainGrid = GRID) => ({ openings: [], lines: [], marks: [], terrain, terrainGrid });
  const messages = (issues: ReturnType<typeof checkBuild>) => issues.filter((i) => i.type === "problem").map((i) => i.message);

  it("reports a token standing on Blocked terrain, but not on Difficult", () => {
    expect(messages(checkBuild(input(map(setup([run(3, 3, 3, "blocked")])))))).toEqual([
      "Goblin at column 3, row 3 stands on Blocked terrain, so it couldn't move. Move it, or change the terrain.",
    ]);
    expect(messages(checkBuild({ ...input(map(setup([run(3, 3, 3, "blocked")]))), audience: "owner" }))[0]).toMatch(/Move it in the encounter's editor, or clear the terrain\./);
    expect(messages(checkBuild(input(map(setup([run(3, 3, 3)])))))).toEqual([]);
  });

  it("reports terrain the grid has moved away from, in each reader's words, and checks no token against it", () => {
    const corrected = map(setup([run(3, 3, 3, "blocked")]), { grid: { ...confirmed, cellSize: 50 } });
    const ai = messages(checkBuild(input(corrected)));
    expect(ai).toEqual([expect.stringMatching(/^Its terrain was proposed on 70-pixel squares at offset \(0, 0\), and the grid is now 50-pixel squares .* save the terrain again, or clear it with terrain: \[\]\.$/)]);
    expect(messages(checkBuild({ ...input(corrected), audience: "owner" }))).toEqual([expect.stringMatching(/Clear the terrain below, or put the grid back\.$/)]);
  });

  it("reports terrain waiting for a grid, and terrain off the map", () => {
    const noGrid = map(setup([run(1, 1, 1)]), { grid: null, proposedGrid: null, gridStatus: "none" });
    expect(messages(checkBuild(input(noGrid)))).toContain("Its terrain needs a grid. Propose one with save_map.");
    expect(messages(checkBuild({ ...input(noGrid), audience: "owner" }))).toContain("Its terrain needs a grid. Set the map's grid first.");
    expect(messages(checkBuild(input(map(setup([run(1, 9, 11)])))))).toEqual(["Terrain run 1 (difficult, row 1, columns 9 to 11) has a square off the map."]);
  });

  it("raises nothing new for a map with no terrain", () => {
    expect(messages(checkBuild(input(map(undefined))))).toEqual([]);
  });
});

describe("a template from a draft encounter on terrain (FR-GM-27, ADR 0071)", () => {
  const grid: GridSpec = { ...GRID, unitsPerCell: 5, unitLabel: "ft" };
  const goblin: BuildCreatureValues = { name: "Goblin", size: 1, hp: 7, maxHp: 7, ac: 13, color: "#336699", conditions: [], attacks: [], imageUrl: null, assetId: null };
  const source = (terrain: TerrainRun[] | undefined, square = { column: 3, row: 3 }, size = 1): DraftEncounterSource => ({
    map: { assetId: "33333333-3333-4333-8333-333333333333", width: 700, height: 700 },
    grid,
    board: { walls: [], fog: [], ...(terrain ? { terrain } : {}) },
    creatures: new Map([["goblin", { ...goblin, size }]]),
    tokens: [{ creatureKey: "goblin", square, hidden: false }],
  });

  it("carries the map's terrain into the template", () => {
    const terrain = [run(1, 1, 2), run(4, 4, 4, "blocked")];
    const result = draftEncounterToTemplate(source(terrain));
    expect(result.ok && result.data.terrain).toEqual(terrain);
    const plain = draftEncounterToTemplate(source(undefined));
    expect(plain.ok && "terrain" in plain.data).toBe(false);
  });

  it("refuses a token on Blocked terrain, naming it, but lets one stand on Difficult", () => {
    expect(draftEncounterToTemplate(source([run(3, 3, 3, "blocked")]))).toEqual({
      ok: false, problems: [{ token: "Goblin", message: "It would stand on Blocked terrain. Move it, or change the terrain." }],
    });
    expect(draftEncounterToTemplate(source([run(3, 3, 3)])).ok).toBe(true);
  });

  it("refuses a large token whose footprint covers one Blocked square", () => {
    expect(draftEncounterToTemplate(source([run(4, 4, 4, "blocked")], { column: 3, row: 3 }, 2)).ok).toBe(false);
    expect(draftEncounterToTemplate(source([run(5, 5, 5, "blocked")], { column: 3, row: 3 }, 2)).ok).toBe(true);
  });
});
