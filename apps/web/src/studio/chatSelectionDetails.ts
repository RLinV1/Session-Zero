import { studioTerrainCoverage, type StudioInspection, type StudioSelection } from "@vtt/shared";

/**
 * What the AI reads about the user's current selection, attached with its reference to the next
 * chat message. It lets the AI say what is selected before any correction exists. It is a
 * description for the model, not text people read; authority stays with the saved selection on
 * the server, which bounds every edit.
 */
export interface ChatSelectionDetails {
  map: string;
  mapKey: string;
  encounterKey: string | null;
  /** Grid squares the area touches, in the same column/row numbering the build tools use. */
  squares: { columns: { from: number; to: number }; rows: { from: number; to: number } } | null;
  editable: ("walls and openings" | "terrain" | "creature placements")[];
  contains: { walls: number; doors: number; windows: number; openings: number; marks: number; creatures: string[] };
}

const layerNames = { geometry: "walls and openings", terrain: "terrain", placements: "creature placements" } as const;

export function chatSelectionDetails(inspection: StudioInspection, selection: StudioSelection, map: string, mapKey: string,
  encounterKey: string | null): ChatSelectionDetails {
  const grid = inspection.scene.grid;
  const coverage = grid ? studioTerrainCoverage(selection.region, grid) : null;
  const ids = new Set(selection.objectIds);
  const inside = inspection.objects.filter((object) => ids.has(object.id));
  const count = (kind: string) => inside.filter((object) => object.kind === kind).length;
  return {
    map, mapKey, encounterKey,
    squares: coverage && { columns: { from: coverage.fromColumn, to: coverage.toColumn }, rows: { from: coverage.fromRow, to: coverage.toRow } },
    editable: selection.layers.map((layer) => layerNames[layer]),
    contains: { walls: count("wall"), doors: count("door"), windows: count("window"), openings: count("opening"), marks: count("mark"),
      creatures: inside.filter((object) => object.kind === "token").map((object) => object.label ?? "creature") },
  };
}
