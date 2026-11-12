import { z } from "zod";
import { englishText, sharedMsg, type MessageRef } from "./i18n";
import { TerrainRuns } from "./terrain";
import { polygonArea, Point, GridSpec } from "./geometry";
import { FogShape, MAX_FOG_POINTS, MAX_FOG_REGIONS, MAX_WALLS, Wall, type MapImage } from "./state";
import { wallsFitMap } from "./wallDetection";

/**
 * The walls and fog a GM prepared on a library map (ADR 0037). Stored beside the map, never part of
 * room state: placing the map in a room copies them in with the room's own commands. Entries carry
 * no ids; the editor and the room name them.
 */
export const LibraryMapBoard = z
  .object({
    terrain: TerrainRuns.optional(),
    walls: z.array(Wall.omit({ id: true }).strict()).max(MAX_WALLS),
    fog: z
      .array(z.object({ shape: FogShape, points: z.array(Point).min(3).max(MAX_FOG_POINTS) }).strict())
      .max(MAX_FOG_REGIONS),
  })
  .strict();
export type LibraryMapBoard = z.infer<typeof LibraryMapBoard>;

/** Server-resolved, account-owned library map for atomic placement (ADR 0043). */
export interface ResolvedLibraryMap { map: MapImage; grid: GridSpec | null; board: LibraryMapBoard }

export const EMPTY_LIBRARY_BOARD: LibraryMapBoard = { walls: [], fog: [] };

/**
 * Why this board can't sit on a map of this size, as a catalog ref, or null: the same limits the
 * room's commands apply. A build's owner reads it in their language (ADR 0055).
 */
export function libraryBoardIssue(board: LibraryMapBoard, map: { width: number; height: number }): MessageRef | null {
  if (board.walls.some((w) => w.a.x === w.b.x && w.a.y === w.b.y)) return sharedMsg("reject.wallZeroLength");
  if (!wallsFitMap(board.walls, map)) return sharedMsg("reject.wallOffMap");
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  if (board.fog.some((f) => !f.points.every(inside))) return sharedMsg("libraryBoard.fogOffMap");
  if (board.fog.some((f) => Math.abs(polygonArea(f.points)) < 1)) return sharedMsg("reject.fogNoArea");
  return null;
}

/** `libraryBoardIssue` in English, or null. */
export function libraryBoardProblem(board: LibraryMapBoard, map: { width: number; height: number }): string | null {
  const issue = libraryBoardIssue(board, map);
  return issue && englishText(issue);
}

export const LibraryPreparation = z.object({ grid: GridSpec.nullable(), board: LibraryMapBoard, revision: z.string().min(1).max(128) }).strict();
export type LibraryPreparation = z.infer<typeof LibraryPreparation>;
export const SaveLibraryPreparation = z.object({ grid: GridSpec, board: LibraryMapBoard, revision: z.string().min(1).max(128), resetTerrain: z.boolean().optional() }).strict();
export type SaveLibraryPreparation = z.infer<typeof SaveLibraryPreparation>;
