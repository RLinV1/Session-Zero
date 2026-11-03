import { z } from "zod";
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

/** Why this board can't sit on a map of this size, or null: the same limits the room's commands apply. */
export function libraryBoardProblem(board: LibraryMapBoard, map: { width: number; height: number }): string | null {
  if (board.walls.some((w) => w.a.x === w.b.x && w.a.y === w.b.y)) return "A wall needs two different ends.";
  if (!wallsFitMap(board.walls, map)) return "Walls must lie on the map.";
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  if (board.fog.some((f) => !f.points.every(inside))) return "Fog must lie on the map.";
  if (board.fog.some((f) => Math.abs(polygonArea(f.points)) < 1)) return "A fog region needs some area.";
  return null;
}

export const LibraryPreparation = z.object({ grid: GridSpec.nullable(), board: LibraryMapBoard, revision: z.string().min(1).max(128) }).strict();
export type LibraryPreparation = z.infer<typeof LibraryPreparation>;
export const SaveLibraryPreparation = z.object({ grid: GridSpec, board: LibraryMapBoard, revision: z.string().min(1).max(128), resetTerrain: z.boolean().optional() }).strict();
export type SaveLibraryPreparation = z.infer<typeof SaveLibraryPreparation>;
