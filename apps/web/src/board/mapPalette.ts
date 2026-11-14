import { terrainSeen, type RoomState } from "@vtt/shared";
import { cellInMap } from "./terrainStroke";

/**
 * The colours of what is drawn on the map itself (board-palette): walls, doors, windows, locks and
 * terrain. Each kind has its own colour family and is drawn two-tone, a dark `outer` beneath a
 * bright `inner`, so it reads on light and dark maps alike. These do not follow the UI theme:
 * a map looks the same in light and dark mode. The board (Pixi) uses the numbers; the map
 * editor's SVG uses `hex()`; the stylesheet mirrors them as `--map-*` custom properties.
 */
export interface MapColour {
  inner: number;
  outer: number;
}

export const MAP_PALETTE = {
  wall: { inner: 0x4cc46a, outer: 0x0f1a12 },
  door: { inner: 0xf08a24, outer: 0x1a1108 },
  window: { inner: 0x5dade2, outer: 0x0b1620 },
  lock: { inner: 0xd0342c, outer: 0x1a0808 },
  difficult: { inner: 0x9b4de8, outer: 0x160b26 },
  blocked: { inner: 0xe0525a, outer: 0x1f0a0c },
} as const satisfies Record<string, MapColour>;

export type MapElement = keyof typeof MAP_PALETTE;

/** A palette number as a CSS/SVG colour. */
export const hex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

/** The colour for a terrain kind. */
export const terrainColour = (kind: "difficult" | "blocked"): MapColour => MAP_PALETTE[kind];

/** How many hatch lines cross a square in each direction. */
const HATCH_LINES = 4;

/**
 * A terrain square's hatching, as segments in a `size`-wide square from (0, 0) (board-palette):
 * Difficult is single hatching (one diagonal direction), Blocked is crosshatching (both). Terrain
 * carries no glyphs; the pattern and colour tell the kinds apart.
 */
export function terrainHatch(kind: "difficult" | "blocked", size: number): [{ x: number; y: number }, { x: number; y: number }][] {
  const lines: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (let i = 0; i < HATCH_LINES; i++) {
    const step = (i * size) / HATCH_LINES;
    // "\": down to the right.
    lines.push([{ x: step, y: 0 }, { x: size, y: size - step }]);
    if (i > 0) lines.push([{ x: 0, y: step }, { x: size - step, y: size }]);
    if (kind === "blocked") {
      // "/": up to the right, for the cross.
      lines.push([{ x: step, y: size }, { x: size, y: step }]);
      if (i > 0) lines.push([{ x: 0, y: size - step }, { x: size - step, y: 0 }]);
    }
  }
  return lines;
}

export type TerrainSide = "top" | "right" | "bottom" | "left";
/** How a side's end meets the next side: an outer corner (1), a straight run (0) or an inner corner (-1). */
export type OutlineCorner = 1 | 0 | -1;
/** One outlined side of a terrain square (board-palette). */
export interface OutlineSide {
  kind: "difficult" | "blocked"; col: number; row: number; side: TerrainSide;
  /** The corners at the side's two ends, in the order `outlineSegment` returns them. */
  ends: [OutlineCorner, OutlineCorner];
}

type Step = readonly [number, number];
/** Each side: its outward direction, then the directions from its start and its end along the area's edge. */
const SIDES: readonly [TerrainSide, Step, Step, Step][] = [
  ["top", [0, -1], [-1, 0], [1, 0]],
  ["right", [1, 0], [0, -1], [0, 1]],
  ["bottom", [0, 1], [-1, 0], [1, 0]],
  ["left", [-1, 0], [0, -1], [0, 1]],
];

/**
 * The sides that outline terrain areas (board-palette). An area is squares of one kind sharing a
 * side; a corner touch does not join them. A side is outlined when the square beyond it is not the
 * same kind and `outlined(col, row)` allows it: pass whether the viewer may outline toward that
 * square (outside the map: yes; a square they cannot see: no). The neighbour's kind comes only
 * from `runs`, so a viewer's outlines never depend on terrain they were not sent.
 */
export function terrainOutline(
  runs: readonly { row: number; start: number; end: number; kind: "difficult" | "blocked" }[],
  outlined: (col: number, row: number) => boolean = () => true,
): OutlineSide[] {
  const kinds = new Map<string, "difficult" | "blocked">();
  for (const r of runs) for (let col = r.start; col <= r.end; col++) kinds.set(`${r.row}:${col}`, r.kind);
  const sides: OutlineSide[] = [];
  for (const [key, kind] of kinds) {
    const [row, col] = key.split(":").map(Number) as [number, number];
    const same = (c: number, r: number) => kinds.get(`${r}:${c}`) === kind;
    // Along the edge: no same-kind square next → outer corner; one, with the area turning back over this side → inner corner.
    const corner = ([oc, or]: Step, [ac, ar]: Step): OutlineCorner => !same(col + ac, row + ar) ? 1 : same(col + ac + oc, row + ar + or) ? -1 : 0;
    for (const [side, out, from, to] of SIDES) {
      if (same(col + out[0], row + out[1]) || !outlined(col + out[0], row + out[1])) continue;
      sides.push({ kind, col, row, side, ends: [corner(out, from), corner(out, to)] });
    }
  }
  return sides;
}

/**
 * A side's line, `inset` inside its square and parallel to the edge (board-palette). Its ends move
 * in at an outer corner and out at an inner one, so the lines of an area meet as one band that
 * follows the area's edge, as the old per-square outline did. Each kind's band lies in its own
 * squares, so a Difficult and a Blocked outline on one edge sit side by side.
 */
export function outlineSegment({ side, ends }: Pick<OutlineSide, "side" | "ends">, r: { minX: number; minY: number; maxX: number; maxY: number }, inset = 0): [{ x: number; y: number }, { x: number; y: number }] {
  const a = r.minX + inset * ends[0], b = r.maxX - inset * ends[1];
  const c = r.minY + inset * ends[0], d = r.maxY - inset * ends[1];
  switch (side) {
    case "top": return [{ x: a, y: r.minY + inset }, { x: b, y: r.minY + inset }];
    case "right": return [{ x: r.maxX - inset, y: c }, { x: r.maxX - inset, y: d }];
    case "bottom": return [{ x: a, y: r.maxY - inset }, { x: b, y: r.maxY - inset }];
    case "left": return [{ x: r.minX + inset, y: c }, { x: r.minX + inset, y: d }];
  }
}

/**
 * An area outline's two tones in a `size`-wide square (board-palette): a dark band from the edge
 * inward, with the bright line just inside it, as the old per-square outline drew them.
 */
export function outlineTone(tone: "outer" | "inner", size: number): { inset: number; width: number; alpha: number } {
  return tone === "outer" ? { inset: size / 60, width: size / 30, alpha: .85 } : { inset: size / 24, width: size / 60, alpha: .95 };
}

/**
 * Which neighbours a viewer may outline toward (board-palette): a square outside the map always;
 * otherwise any square for the GM, and for a player only a square they can see part of now (fog
 * and sight, the same test that decides which terrain they are sent, ADR 0069). Cached per square.
 */
export function outlineVisibility(state: Pick<RoomState, "scene" | "fog" | "sight">, gm: boolean): (col: number, row: number) => boolean {
  const map = state.scene.map, grid = state.scene.grid;
  const known = gm ? null : terrainSeen(state);
  const cache = new Map<string, boolean>();
  return (col, row) => {
    if (!map || !cellInMap(col, row, grid, map)) return true;
    if (!known) return true;
    const key = `${row}:${col}`;
    let result = cache.get(key);
    if (result === undefined) { result = known(col, row); cache.set(key, result); }
    return result;
  };
}
