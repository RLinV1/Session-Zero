import { sameValue, type UvttPreparation, type Wall, normalizeLegacyGridForBoard, type Command, type GridSpec, type MapImage, type MapTokenPolicy, type RoomState } from "@vtt/shared";
import { gridsEqual, newGridPreparation, newGridSuggestionSession, parseGridDraft, toGridDraft, type GridDraft, type GridSuggestionSession, type GridPreparation } from "./gridDraft";

/**
 * A map being prepared before the table sees it (KAN-59, FRONTEND-CONTRACT §13.2): the chosen
 * image and its grid draft, held by the GM's browser only. Nothing reaches the room until Apply.
 */
export interface MapPrep {
  map: MapImage;
  /** The grid the draft started from, to tell an edited draft from an untouched one. */
  initial: GridSpec;
  draft: GridDraft;
  gridConfigured?: boolean;
  suggestionSession?: GridSuggestionSession;
  preparation?: GridPreparation;
  uvtt?: Pick<UvttPreparation, "id" | "revision" | "diagnostics">;
  walls?: Record<string, Wall>;
  initialWalls?: Record<string, Wall>;
  validated?: Pick<UvttPreparation, "grid" | "walls">;
}

/**
 * A fresh draft for `map`: a library map's saved grid when it has one, otherwise the room's
 * current grid, since the GM usually lines that up next. Either way it is fitted to this map
 * (offsets normalised, cells at least the map's minimum), so the untouched draft is valid.
 */
export function startPrep(map: MapImage, savedGrid: GridSpec | null | undefined, currentGrid: GridSpec): MapPrep {
  const initial = normalizeLegacyGridForBoard(savedGrid ?? currentGrid, map);
  return { map, initial, draft: toGridDraft(initial), gridConfigured: !!savedGrid,
    suggestionSession: newGridSuggestionSession(), preparation: newGridPreparation(!savedGrid) };
}

/** Whether closing would lose alignment work: the draft no longer matches where it started. */
export function prepDirty(prep: MapPrep): boolean {
  const parsed = parseGridDraft(prep.draft, prep.map);
  return parsed === null || !gridsEqual(parsed, prep.initial) || !sameValue(prep.walls, prep.initialWalls);
}

/** The one command Apply sends: map and grid together, a single `MapSet` (ADR 0004). Null while the grid is invalid. */
export function prepCommand(prep: MapPrep, tokenPolicy?: MapTokenPolicy): Extract<Command, { type: "scene.setMap" }> | null {
  const grid = parseGridDraft(prep.draft, prep.map);
  return grid ? { type: "scene.setMap", map: prep.map, grid, ...(prep.map.assetId ? { includeLibraryBoard: true } : {}), ...(tokenPolicy ? { tokenPolicy } : {}) } : null;
}

/** The choices for tokens already on a map that is about to be replaced (KAN-67, ADR 0042). */
export const TOKEN_POLICY_CHOICES: readonly { value: MapTokenPolicy; label: string; hint: string }[] = [
  { value: "scale", label: "Scale to fit", hint: "Move tokens in proportion to the size of the new map." },
  { value: "keep", label: "Keep positions", hint: "Leave tokens where they are; any off the new map move to its edge." },
  { value: "recenter", label: "Recenter", hint: "Move the tokens to the middle of the new map." },
];

/** The choice is only worth asking when a map would be replaced and tokens exist to move. */
export function offersTokenPolicy(state: RoomState): boolean {
  return state.scene.map !== null && Object.keys(state.tokens).length > 0;
}

/** "3 tokens adjusted", or null when nothing moved. */
export function adjustedMessage(count: number): string | null {
  return count === 0 ? null : `${count} ${count === 1 ? "token" : "tokens"} adjusted`;
}

/** A validated UVTT grid is used exactly; legacy normalization must not silently change it. */
export function startUvttPrep(preparation: UvttPreparation): MapPrep {
  const walls = Object.fromEntries(preparation.walls.map((w, i) => [`draft:${i}`, { ...w, id: `draft:${i}` }]));
  return { map: preparation.map, initial: preparation.grid, draft: toGridDraft(preparation.grid),
    uvtt: { id: preparation.id, revision: preparation.revision, diagnostics: preparation.diagnostics },
    walls, initialWalls: structuredClone(walls), validated: { grid: preparation.grid, walls: preparation.walls },
  };
}
