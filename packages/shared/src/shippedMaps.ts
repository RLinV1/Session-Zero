import { DEFAULT_GRID, type GridSpec, type Point } from "./geometry";
import type { Portal } from "./state";
import { EMBERWATCH_ARCHIVE_WALLS } from "./shippedWalls/emberwatch-archive";
import { MOONWATER_BATHS_WALLS } from "./shippedWalls/moonwater-baths";
import { BROKEN_SPAN_WALLS } from "./shippedWalls/broken-span";
import { HOLLOWFROST_KEEP_WALLS } from "./shippedWalls/hollowfrost-keep";
import { SUNKEN_CRYPT_WALLS } from "./shippedWalls/sunken-crypt";
import { TEMPLE_GREEN_SUN_WALLS } from "./shippedWalls/temple-green-sun";

/**
 * The maps that ship with the app (builtin-library-assets, ADR 0036). Each account's library gets
 * them as rows; the files are served by the web origin from `public/img/`, so keep the URLs stable,
 * since rooms store them. Each grid is measured from the drawn floor tiles so the lines follow the
 * paving and walls (top-down-default-maps). A regenerated map needs measuring again. A map may
 * carry stored walls, in board pixels, that Detect walls offers instead of running detection; they
 * belong to exactly this image, so a regenerated map needs them redone too (FR-GM-09, FR-GM-19).
 */
/** One stored wall: the shape of a detected wall plus an optional door or window. */
export interface StoredWall {
  a: Point;
  b: Point;
  portal?: Portal;
}

export interface ShippedMap {
  slug: string;
  name: string;
  url: string;
  width: number;
  height: number;
  grid: GridSpec;
  walls?: readonly StoredWall[];
}

function shipped(
  slug: string,
  name: string,
  url: string,
  size: { width: number; height: number },
  grid: { cellSize: number; offsetX: number; offsetY: number },
  walls?: readonly StoredWall[],
): ShippedMap {
  return { slug, name, url, ...size, grid: { ...DEFAULT_GRID, ...grid }, ...(walls ? { walls } : {}) };
}

export const SHIPPED_MAPS: readonly ShippedMap[] = [
  shipped("broken-span", "The Broken Span", "/img/hero-map.webp", { width: 3344, height: 1882 }, { cellSize: 70, offsetX: 8, offsetY: 18 }, BROKEN_SPAN_WALLS),
  shipped("hollowfrost-keep", "Hollowfrost Keep", "/img/map-ice.webp", { width: 3269, height: 1882 }, { cellSize: 70.3, offsetX: 54, offsetY: 43 }, HOLLOWFROST_KEEP_WALLS),
  shipped("temple-green-sun", "Temple of the Green Sun", "/img/map-jungle.webp", { width: 2740, height: 1604 }, { cellSize: 70, offsetX: 21, offsetY: 36 }, TEMPLE_GREEN_SUN_WALLS),
  shipped("sunken-crypt", "Sunken Crypt", "/img/map-crypt.webp", { width: 2800, height: 1680 }, { cellSize: 70, offsetX: 0, offsetY: 0 }, SUNKEN_CRYPT_WALLS),
  shipped("emberwatch-archive", "Emberwatch Archive", "/img/map-emberwatch-archive.webp", { width: 1960, height: 1400 }, { cellSize: 70, offsetX: 0, offsetY: 0 }, EMBERWATCH_ARCHIVE_WALLS),
  shipped("moonwater-baths", "Moonwater Baths", "/img/map-moonwater-baths.webp", { width: 1960, height: 1400 }, { cellSize: 70, offsetX: 0, offsetY: 0 }, MOONWATER_BATHS_WALLS),
];

/** The slugs of `SHIPPED_MAPS`, as a tuple for `z.enum`; a test keeps the two in step (guest-gm-hosting). */
export const SHIPPED_MAP_SLUGS = ["broken-span", "hollowfrost-keep", "temple-green-sun", "sunken-crypt", "emberwatch-archive", "moonwater-baths"] as const;
export type ShippedMapSlug = (typeof SHIPPED_MAP_SLUGS)[number];

export function shippedMapByUrl(url: string): ShippedMap | undefined {
  return SHIPPED_MAPS.find((m) => m.url === url);
}

/**
 * The stored walls of a shipped map, only when the URL names one that has walls and the size
 * matches exactly (an edited or uploaded image never gets them). Otherwise null.
 */
export function storedWallsFor(map: { url: string; width: number; height: number }): readonly StoredWall[] | null {
  const m = shippedMapByUrl(map.url);
  return m?.walls && m.width === map.width && m.height === map.height ? m.walls : null;
}
