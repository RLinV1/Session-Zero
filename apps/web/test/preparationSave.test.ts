import { describe, expect, it } from "vitest";
import { Command, DEFAULT_GRID, MAX_TERRAIN_PAINT_BYTES, Terrain, decide, emptyRoomState, reduce, terrainCells, type Participant, type RoomState, type TerrainRun } from "@vtt/shared";
import { draftFrom, planDraftSave } from "../src/pages/mapEditor/mapDraft";
import { prepCommand, startPrep } from "../src/pages/mapPrep";
const gm: Participant = { id: "g", role: "gm", displayName: "GM" };
const grid = { ...DEFAULT_GRID, cellSize: 10 };
const state = (): RoomState => ({ ...emptyRoomState("r"), scene: { map: { url: "/map", width: 1000, height: 1000 }, grid } });
const fragmented = (n: number): TerrainRun[] => Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / 100), start: i % 100, end: i % 100, kind: i % 2 ? "blocked" : "difficult" }));
const ctx = { newId: () => "id" };

describe("terrain preparation saves (FR-GM-15, FR-REC-02)", () => {
  it("sends one changed value on a fragmented 1,000-cell base and preserves other layers on erase", () => {
    const current = { ...state(), terrain: { base: fragmented(1000), effects: [{ id: "ice", name: "Private ice", runs: [{ row: 0, start: 0, end: 0, kind: "blocked" as const }] }] } };
    const draft = { ...draftFrom(current), terrain: current.terrain.base.map((r, i) => i === 500 ? { ...r, kind: "blocked" as const } : r) };
    const plan = planDraftSave(current, draft);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: "scene.savePreparation", edits: [{ type: "terrain.paint", paint: [{ row: 5, start: 0, end: 0, kind: "blocked" }] }] });
    expect(JSON.stringify(plan[0]).length).toBeLessThan(1024);
    const erase = planDraftSave(current, { ...draftFrom(current), terrain: current.terrain.base.slice(1) })[0]!;
    const decision = decide(current, gm, Command.parse(erase), ctx);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const result = decision.events.reduce<RoomState>((s, e) => reduce(s, e), current);
    expect(result.terrain?.effects).toEqual(current.terrain.effects);
    expect(terrainCells(result.terrain!.base).has("0:0")).toBe(false);
  });
  it("saves all 10,000 fragmented cells atomically through individually bounded paints", () => {
    const current = state(), base = fragmented(10_000);
    expect(Terrain.safeParse({ base, effects: [] }).success).toBe(true);
    const [input] = planDraftSave(current, { ...draftFrom(current), terrain: base });
    expect(input?.type).toBe("scene.savePreparation");
    if (input?.type !== "scene.savePreparation") return;
    expect(input.edits.length).toBeGreaterThan(1);
    for (const command of input.edits) expect(new TextEncoder().encode(JSON.stringify(command)).length).toBeLessThan(MAX_TERRAIN_PAINT_BYTES);
    const decision = decide(current, gm, Command.parse(input), ctx);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const saved = decision.events.reduce<RoomState>((s, e) => reduce(s, e), current);
    expect(saved.terrain?.base).toEqual(base);
    expect(saved.terrainRevision).toBe(input.edits.length);
  });
  it("rejects a stale fragmented save or an invalid last chunk without any successful prefix", () => {
    const current = state();
    const [input] = planDraftSave(current, { ...draftFrom(current), terrain: fragmented(1000), fog: { draft: { id: "draft", shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] } } });
    expect(input?.type).toBe("scene.savePreparation");
    if (input?.type !== "scene.savePreparation") return;
    expect(input.edits[0]?.type).toBe("fog.replace");
    const before = structuredClone(current);
    const decision = decide({ ...current, terrainRevision: 1 }, gm, Command.parse(input), ctx);
    expect(decision).toMatchObject({ ok: false }); expect(decision).not.toHaveProperty("events");
    const invalid = { ...input, edits: [...input.edits, { type: "terrain.paint", layerId: "base", context: { boardEpoch: 0, revision: 4 }, paint: [{ row: 20, start: 200, end: 200, kind: "blocked" }] }] };
    expect(decide(current, gm, Command.parse(invalid), ctx)).toMatchObject({ ok: false });
    expect(current).toEqual(before);
  });
  it("carries an explicit placement reset without silently resetting overridden library geometry", () => {
    const map = { url: "/library", width: 1000, height: 1000, assetId: "asset" };
    const prep = startPrep(map, grid, grid, { boardEpoch: 0, revision: 0 });
    const edited = { ...prep, draft: { ...prep.draft, cellSize: "20" } };
    expect(prepCommand(edited)).toMatchObject({ includeLibraryBoard: true, grid: { cellSize: 20 } });
    expect(prepCommand(edited)).not.toHaveProperty("resetTerrain");
    expect(prepCommand({ ...edited, resetTerrain: true })).toMatchObject({ includeLibraryBoard: true, resetTerrain: true });
  });
});
