import { describe, expect, it } from "vitest";
import type { StudioInspection, StudioSelection } from "@vtt/shared";
import { chatSelectionDetails } from "../src/studio/chatSelectionDetails";

describe("the chat selection description (FR-GM-27)", () => {
  it("names the map, squares, editable layers and the selected objects without anything outside the scope", () => {
    const inspection = {
      scene: { grid: { offsetX: 0, offsetY: 0, cellSize: 50 } },
      objects: [
        { id: "w1", kind: "wall", layer: "geometry" }, { id: "d1", kind: "door", layer: "geometry" },
        { id: "t1", kind: "token", layer: "placements", label: "Sentry" }, { id: "t2", kind: "token", layer: "placements" },
        { id: "outside", kind: "wall", layer: "geometry" },
      ],
    } as unknown as StudioInspection;
    const selection: StudioSelection = { region: { minX: 60, minY: 10, maxX: 240, maxY: 140 }, layers: ["geometry", "terrain", "placements"],
      objectIds: ["w1", "d1", "t1", "t2"], wholeObjectIds: [] };
    expect(chatSelectionDetails(inspection, selection, "Chapel", "chapel", "watch")).toEqual({
      map: "Chapel", mapKey: "chapel", encounterKey: "watch",
      squares: { columns: { from: 1, to: 4 }, rows: { from: 0, to: 2 } },
      editable: ["walls and openings", "terrain", "creature placements"],
      contains: { walls: 1, doors: 1, windows: 0, openings: 0, marks: 0, creatures: ["Sentry", "creature"] },
    });
  });
});
