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
export function exampleCommands(step: string, draft: MapDraft, grid: GridSpec, map: { width: number; height: number }): CommandInput[] {
  const size = grid.cellSize;
  const cols = Math.max(1, Math.floor((map.width - grid.offsetX) / size)), rows = Math.max(1, Math.floor((map.height - grid.offsetY) / size));
  const c0 = Math.max(0, Math.min(cellAt({ x: map.width / 2, y: map.height / 2 }, grid).col - 2, cols - 4));
  const r0 = Math.max(0, Math.min(cellAt({ x: map.width / 2, y: map.height / 2 }, grid).row - 2, rows - 4));
  const at = (col: number, row: number): Point => ({ x: grid.offsetX + col * size, y: grid.offsetY + row * size });
  if (step === "walls") {
    const wall = { a: at(c0, r0), b: at(c0 + 3, r0) };
    const door = { a: at(c0 + 3, r0), b: at(c0 + 3, r0 + 2), portal: { kind: "door" as const, state: "closed" as const } };
    const keys = new Set([key(wall.a, wall.b), key(door.a, door.b)]);
    const old = Object.values(draft.walls).filter((w) => keys.has(key(w.a, w.b))).map((w) => w.id);
    return [...(old.length ? [{ type: "wall.remove" as const, wallIds: old }] : []), { type: "wall.add", walls: [wall, door] }];
  }
  if (step === "fog") {
    const from = at(c0, r0), to = at(c0 + 3, r0 + 3);
    const exists = Object.values(draft.fog).some((f) => f.points.length === 4 && f.points.some((p) => near(p.x, from.x) && near(p.y, from.y)) && f.points.some((p) => near(p.x, to.x) && near(p.y, to.y)));
    return exists ? [] : [{ type: "fog.add", region: { shape: "rect", from, to } }];
  }
  if (step === "terrain") {
    const context = draft.terrainContext ?? { boardEpoch: 0, revision: 0 };
    return [{ type: "terrain.paint", layerId: "base", context, paint: [
      { row: r0 + 1, start: c0, end: c0 + 3, kind: "difficult" },
      { row: r0 + 2, start: c0, end: c0 + 3, kind: "blocked" },
    ] }];
  }
  return [];
}

/** Sent on `window` by the demo's Show me; the open map editor draws the sample into its draft. */
export const EXAMPLE_EVENT = "vtt:tutorial-example";
