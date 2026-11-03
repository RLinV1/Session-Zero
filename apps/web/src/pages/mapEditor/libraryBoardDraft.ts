import { type FogRegion, type LibraryMapBoard, type Wall } from "@vtt/shared";
import type { MapDraft } from "./mapDraft";

/** The editor's draft of a library map's board: ids are made here, since a stored board has none. */
export function draftFromBoard(mapUrl: string, board: LibraryMapBoard): MapDraft {
  const walls: Record<string, Wall> = {};
  board.walls.forEach((w, i) => { walls[`draft:w${i}`] = { id: `draft:w${i}`, ...w }; });
  const fog: Record<string, FogRegion> = {};
  board.fog.forEach((f, i) => { fog[`draft:f${i}`] = { id: `draft:f${i}`, ...f }; });
  return { terrain: board.terrain, mapUrl, walls, fog, lineOfSight: false, isometric: false, sightRange: null };
}

/** The board to store: the draft without its ids. */
export function boardFromDraft(draft: MapDraft): LibraryMapBoard {
  return {
    ...(draft.terrain ? { terrain: draft.terrain } : {}),
    walls: Object.values(draft.walls).map(({ id: _id, ...wall }) => wall),
    fog: Object.values(draft.fog).map(({ id: _id, ...region }) => region),
  };
}

/** Whether the draft differs from the stored board, ignoring ids and order. */
export function boardChanged(draft: MapDraft, stored: LibraryMapBoard): boolean {
  const serialize = (value: unknown) => JSON.stringify(value, (_key, node: unknown) =>
    node !== null && typeof node === "object" && !Array.isArray(node)
      ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : node);
  const key = (board: LibraryMapBoard) => JSON.stringify({
    terrain: board.terrain ?? [],
    walls: board.walls.map(serialize).sort(),
    fog: board.fog.map(serialize).sort(),
  });
  return key(boardFromDraft(draft)) !== key(stored);
}
