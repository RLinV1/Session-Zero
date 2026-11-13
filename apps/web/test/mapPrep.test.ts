import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec } from "@vtt/shared";
import { prepCommand, prepDirty, startPrep } from "../src/pages/mapPrep";

const map = { url: "/uploads/new.png", width: 1400, height: 700 };
const terrainContext = { boardEpoch: 3, revision: 7 };
const saved: GridSpec = { ...DEFAULT_GRID, cellSize: 100, offsetX: 10, offsetY: 20 };

describe("private map preparation (KAN-59)", () => {
  it("keeps a chosen isometric view as unsaved preparation", () => {
    const prep = startPrep(map, saved, DEFAULT_GRID, terrainContext);
    expect(prepDirty({ ...prep, isometric: true })).toBe(true);
    expect(prepDirty({ ...prep, isometric: false })).toBe(false);
  });
  it("starts a library map from its saved grid, and an upload from the room's grid", () => {
    expect(startPrep(map, saved, DEFAULT_GRID, terrainContext).initial).toMatchObject({ cellSize: 100, offsetX: 10, offsetY: 20 });
    expect(startPrep(map, undefined, { ...DEFAULT_GRID, offsetX: 75 }, terrainContext).initial).toMatchObject({ cellSize: 70, offsetX: 5 });
  });

  it("is clean until the grid changes, and dirty while a field is cleared", () => {
    const prep = startPrep(map, saved, DEFAULT_GRID, terrainContext);
    expect(prepDirty(prep)).toBe(false);
    expect(prepDirty({ ...prep, draft: { ...prep.draft, cellSize: "90" } })).toBe(true);
    expect(prepDirty({ ...prep, draft: { ...prep.draft, cellSize: "" } })).toBe(true);
  });

  it("applies as one setMap carrying both the map and the grid", () => {
    const prep = startPrep(map, undefined, DEFAULT_GRID, terrainContext);
    const edited = { ...prep, draft: { ...prep.draft, cellSize: "50" } };
    expect(prepCommand(edited)).toEqual({ type: "scene.setMap", map, grid: { ...DEFAULT_GRID, cellSize: 50 }, terrainContext });
  });

  it("won't apply an invalid grid", () => {
    const prep = startPrep(map, undefined, DEFAULT_GRID, terrainContext);
    expect(prepCommand({ ...prep, draft: { ...prep.draft, cellSize: "" } })).toBeNull();
  });
});

describe("a draft fits its map (KAN-59)", () => {
  it("raises a room grid too fine for the new map, so the untouched draft is valid and clean", () => {
    const huge = { url: "/uploads/huge.png", width: 100000, height: 100000 }; // minimum cell ≈ 4 px
    const prep = startPrep(huge, undefined, { ...DEFAULT_GRID, cellSize: 1 }, terrainContext);
    expect(prep.initial.cellSize).toBeGreaterThan(1);
    expect(prepCommand(prep)).not.toBeNull();
    expect(prepDirty(prep)).toBe(false);
  });
});
