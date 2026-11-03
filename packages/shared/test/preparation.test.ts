import { describe, expect, it } from "vitest";
import { Command, MAX_PREPARATION_BYTES, MAX_PREPARATION_EDITS, decide, reduce, type CommandInput, type Command as ParsedCommand, type PreparationEdit } from "../src";
import { alice, attempt, baseRoom, ctx, gm, run } from "./fixtures";

const setup = () => run(baseRoom(), gm, { type: "scene.setMap", map: { url: "/map", width: 700, height: 700 } }).state;
const fog: PreparationEdit = { type: "fog.replace", removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } }] };
const save = (edits: PreparationEdit[]): Extract<CommandInput, { type: "scene.savePreparation" }> => ({ type: "scene.savePreparation", expectedMapUrl: "/map", context: { boardEpoch: 1, revision: 1 }, edits });
// Map replacement advances the revision even when terrain is absent.
describe("atomic preparation decisions (FR-GM-15, FR-REC-02)", () => {
  it("rejects the whole save for stale parent or later edit context", () => {
    const state = setup();
    const paint: PreparationEdit = { type: "terrain.paint", layerId: "base", context: { boardEpoch: 1, revision: 1 }, paint: [{ row: 1, start: 1, end: 1, kind: "blocked" }] };
    const before = structuredClone(state);
    expect(attempt(state, gm, { ...save([fog, paint]), context: { boardEpoch: 1, revision: 0 } })).toMatchObject({ ok: false });
    expect(attempt(state, gm, save([fog, { ...paint, context: { boardEpoch: 1, revision: 0 } }]))).toMatchObject({ ok: false });
    expect(state).toEqual(before);
    const applied = run(state, gm, save([fog, paint]));
    expect(applied.events.map((event) => event.type)).toEqual(["FogAdded", "TerrainPainted"]);
    expect(Object.values(applied.state.fog)).toHaveLength(1);
  });
  it("validates all edits against the staged state and rejects a late non-terrain failure", () => {
    const state = setup();
    const decision = attempt(state, gm, save([fog, { type: "scene.setIsometric", enabled: true }, { type: "wall.update", wall: { id: "gone", a: { x: 0, y: 0 }, b: { x: 0, y: 70 } } }]));
    expect(decision).toMatchObject({ ok: false });
    expect(decision).not.toHaveProperty("events");
    expect(state.fog).toEqual({});
    expect(state.scene.isometric).toBeUndefined();
    const sight = run(state, gm, save([{ type: "scene.setLineOfSight", enabled: true }, { type: "scene.setIsometric", enabled: true }, { type: "scene.setSightRange", range: 60 }]));
    expect(sight.state.scene).toMatchObject({ lineOfSight: true, isometric: true, sightRange: 60 });
  });
  it("refuses unauthorized, nested, unrelated and oversized preparations", () => {
    const state = setup();
    expect(attempt(state, alice, save([fog]))).toMatchObject({ ok: false, code: "forbidden" });
    for (const edit of [save([fog]), { type: "scene.setMap", map: state.scene.map }, { type: "participant.revoke", participantId: alice.id }]) {
      const forged = { ...save([fog]), edits: [fog, edit] };
      expect(Command.safeParse(forged).success).toBe(false);
      expect(decide(state, gm, forged as unknown as ParsedCommand, ctx)).toMatchObject({ ok: false });
    }
    expect(Command.safeParse(save(Array.from({ length: MAX_PREPARATION_EDITS + 1 }, () => fog))).success).toBe(false);
    const large = save(Array.from({ length: MAX_PREPARATION_EDITS }, () => ({ type: "fog.replace", removeIds: [], add: Array.from({ length: 30 }, () => ({ shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } })) })));
    expect(JSON.stringify(large).length).toBeGreaterThan(MAX_PREPARATION_BYTES);
    expect(Command.safeParse(large).success).toBe(false);
  });
  it("bounds cumulative paint cells and forbids overlapping chunks", () => {
    const state = setup();
    const paint: PreparationEdit = { type: "terrain.paint", layerId: "base", context: { boardEpoch: 1, revision: 1 }, paint: [{ row: 0, start: 0, end: 9999, kind: "blocked" }] };
    expect(attempt(state, gm, save([fog, paint, { ...paint, paint: [{ row: 1, start: 0, end: 0, kind: "blocked" }] }]))).toMatchObject({ ok: false });
    expect(attempt(state, gm, save([fog, paint, paint]))).toMatchObject({ ok: false });
  });
});

describe("prepared library geometry (FR-GM-15, FR-REC-02)", () => {
  const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
  const map = { url: "/library", width: 700, height: 700, assetId: "asset" };
  const base = [{ row: 2, start: 2, end: 2, kind: "blocked" as const }];
  const libraryMap = { map, grid, board: { walls: [], fog: [], terrain: base } };
  it.each([{ cellSize: 20 }, { offsetX: 2 }, { offsetY: 2 }])("requires explicit reset for incompatible placement %j", (change) => {
    const state = setup(), before = structuredClone(libraryMap);
    const command = Command.parse({ type: "scene.setMap", map, grid: { ...grid, ...change }, includeLibraryBoard: true });
    expect(decide(state, gm, command, { ...ctx, libraryMap })).toMatchObject({ ok: false });
    if (command.type !== "scene.setMap") throw new Error("Expected placement command");
    const decision = decide(state, gm, { ...command, resetTerrain: true }, { ...ctx, libraryMap });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]).toMatchObject({ type: "MapSet", terrainChange: { terrain: { base: [], effects: [] } } });
    expect(decision.events.reduce((current, event) => reduce(current, event), state).terrain?.base ?? []).toEqual([]);
    expect(libraryMap).toEqual(before);
  });
  it.each([{}, { unitsPerCell: 10, unitLabel: "m", lineColor: "#112233", lineOpacity: 0.5 }])("copies the exact base for matching geometry and cosmetic edits %j", (change) => {
    const state = setup();
    const decision = decide(state, gm, Command.parse({ type: "scene.setMap", map, grid: { ...grid, ...change }, includeLibraryBoard: true }), { ...ctx, libraryMap });
    expect(decision).toMatchObject({ ok: true, events: [{ type: "MapSet", terrainChange: { terrain: { base, effects: [] } } }] });
  });
});
