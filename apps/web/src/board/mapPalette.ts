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
