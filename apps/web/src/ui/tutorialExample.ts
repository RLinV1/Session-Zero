import { cellAt, type CommandInput, type GridSpec, type Point } from "@vtt/shared";
import type { MapDraft } from "../pages/mapEditor/mapDraft";

/** Editor lessons whose Show me also draws a sample into the editor's unsaved draft (guest-gm-hosting). */
export const EXAMPLE_STEPS: ReadonlySet<string> = new Set(["walls", "fog", "terrain"]);

const key = (a: Point, b: Point) => [a, b].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort().join("|");
const near = (a: number, b: number) => Math.abs(a - b) < 1;

/**
 * The draft commands that draw a small sample for a lesson: a wall with a door, a patch of Difficult
 * and Blocked ground, or a fog rectangle. Drawn near the middle of the map, and the same place every time,
 * so asking again replaces the earlier sample (walls) or repeats it harmlessly (terrain, fog) rather than stacking.
 */
export function exampleCommands(step: string, draft: MapDraft, grid: GridSpec, map: { width: number; height: number }, clear = false): CommandInput[] {
  const size = grid.cellSize;
  const { c0, r0 } = exampleCorner(grid, map);
  const at = (col: number, row: number): Point => ({ x: grid.offsetX + col * size, y: grid.offsetY + row * size });
  if (step === "walls") {
    const wall = { a: at(c0, r0), b: at(c0 + 5, r0) };
    const door = { a: at(c0 + 5, r0), b: at(c0 + 5, r0 + 3), portal: { kind: "door" as const, state: "closed" as const } };
    const keys = new Set([key(wall.a, wall.b), key(door.a, door.b)]);
    const old = Object.values(draft.walls).filter((w) => keys.has(key(w.a, w.b))).map((w) => w.id);
    if (clear) return old.length ? [{ type: "wall.remove" as const, wallIds: old }] : [];
    return [...(old.length ? [{ type: "wall.remove" as const, wallIds: old }] : []), { type: "wall.add", walls: [wall, door] }];
  }
  if (step === "fog") {
    const from = at(c0, r0), to = at(c0 + 5, r0 + 4);
    const exists = Object.values(draft.fog).some((f) => f.points.length === 4 && f.points.some((p) => near(p.x, from.x) && near(p.y, from.y)) && f.points.some((p) => near(p.x, to.x) && near(p.y, to.y)));
    if (clear) return Object.values(draft.fog).filter((f) => f.points.length === 4 && f.points.some((p) => near(p.x, from.x) && near(p.y, from.y)) && f.points.some((p) => near(p.x, to.x) && near(p.y, to.y))).map((f) => ({ type: "fog.remove" as const, regionId: f.id }));
    return exists ? [] : [{ type: "fog.add", region: { shape: "rect", from, to } }];
  }
  if (step === "terrain") {
    const context = draft.terrainContext ?? { boardEpoch: 0, revision: 0 };
    return [{ type: "terrain.paint", layerId: "base", context, paint: [
      { row: r0, start: c0, end: c0 + 5, kind: clear ? null : "difficult" },
      { row: r0 + 1, start: c0, end: c0 + 5, kind: clear ? null : "difficult" },
      { row: r0 + 2, start: c0, end: c0 + 5, kind: clear ? null : "blocked" },
      { row: r0 + 3, start: c0, end: c0 + 5, kind: clear ? null : "blocked" },
    ] }];
  }
  return [];
}

/** Sent on `window` by the demo's Show me; the open map editor draws the sample into its draft. */
export const EXAMPLE_EVENT = "vtt:tutorial-example";
/** Sent when the GM moves on: the sample is taken out again, so it never makes the editor ask to save. */
export const EXAMPLE_CLEAR_EVENT = "vtt:tutorial-example-clear";

/** The top-left cell of the sample, near the middle of the map and clear of its edges (a 6 by 5 cell patch). */
function exampleCorner(grid: GridSpec, map: { width: number; height: number }): { c0: number; r0: number } {
  const cols = Math.max(1, Math.floor((map.width - grid.offsetX) / grid.cellSize)), rows = Math.max(1, Math.floor((map.height - grid.offsetY) / grid.cellSize));
  const mid = cellAt({ x: map.width / 2, y: map.height / 2 }, grid);
  return { c0: Math.max(0, Math.min(mid.col - 3, cols - 6)), r0: Math.max(0, Math.min(mid.row - 2, rows - 5)) };
}

/** The map area the sample covers, for the editor to outline. */
export function exampleBox(grid: GridSpec, map: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  const { c0, r0 } = exampleCorner(grid, map);
  return { x: grid.offsetX + c0 * grid.cellSize, y: grid.offsetY + r0 * grid.cellSize, w: 6 * grid.cellSize, h: 5 * grid.cellSize };
}

/** Sent on `window` with a map-area box; the editor canvas outlines it for a few seconds. */
export const EXAMPLE_HIGHLIGHT_EVENT = "vtt:tutorial-highlight";
