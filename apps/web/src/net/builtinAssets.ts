import portraits from "../../public/img/tokens/enemies/portraits.json";
import { SHIPPED_MAPS, shippedMapByUrl, type LibraryAsset } from "@vtt/shared";

/**
 * Token art and maps that ship with the app (builtin-library-assets).
 *
 * Token art is not a library row: nobody owns it, nobody can rename or delete it, and placing
 * one records only its URL in the room, never an `assetId`. Maps are seeded into each account's
 * library as real rows (ADR 0036); the map entries here serve signed-out pages only. The files
 * are served by the web origin from `public/img/`; keep the names stable, since rooms store these URLs.
 */

const SHIPPED = "2026-09-24T00:00:00.000Z";
const TOKEN_SIZE = { width: 192, height: 192 };

/**
 * Each map carries its own grid, measured from its drawn floor tiles so the lines follow
 * the paving and walls (top-down-default-maps). A regenerated map needs measuring again.
 */
function token(slug: string, name: string, url: string): LibraryAsset {
  return { id: `builtin:${slug}`, kind: "token", name, url, ...TOKEN_SIZE, grid: null, createdAt: SHIPPED };
}

export const BUILTIN_ASSETS: readonly LibraryAsset[] = [
  ...SHIPPED_MAPS.map(
    ({ slug, name, url, width, height, grid }): LibraryAsset => ({ id: `builtin:${slug}`, kind: "map", name, url, width, height, grid, createdAt: SHIPPED }),
  ),
  ...portraits.map(({ slug, name, file, width, height }): LibraryAsset => ({
    ...token(slug, name, `/img/tokens/enemies/${file}`), width, height,
  })),
];

/**
 * The shipped maps' prepared thumbnails, cut by scripts/home-maps.mjs, by slug. Whole maps at 640px
 * wide, so a library card or the home page never downloads a full map just to show a picture of it.
 */
export const SHIPPED_MAP_THUMBS: Readonly<Record<string, { src: string; alt: string }>> = {
  "broken-span": {
    src: "/img/home/broken-span-thumb.webp",
    alt: "A top-down battle map of a ruined keep split by a rushing chasm, joined by two stone bridges.",
  },
  "hollowfrost-keep": {
    src: "/img/home/hollowfrost-keep-thumb.webp",
    alt: "A top-down battle map of a snowbound fortress on both sides of a frozen ravine, with an ice bridge and a crystal dais.",
  },
  "temple-green-sun": {
    src: "/img/home/temple-green-sun-thumb.webp",
    alt: "A top-down battle map of an overgrown temple plaza with a sun mosaic, lily ponds and a side chamber, framed by jungle.",
  },
  "sunken-crypt": {
    src: "/img/home/sunken-crypt-thumb.webp",
    alt: "A top-down battle map of a stone crypt: a pillared entry hall, a long corridor to a pillared chapel, a side vault behind a banded door, a guard room seen through a window, and a winding gallery.",
  },
};

/**
 * The prepared thumbnail for a map, by its URL, or null when it is not a shipped map. Seeded
 * library rows carry the shipped map's URL under their own id (ADR 0036), so the URL decides.
 */
export function mapThumbnailFor(url: string): string | null {
  const shipped = shippedMapByUrl(url);
  return shipped ? SHIPPED_MAP_THUMBS[shipped.slug]?.src ?? null : null;
}

export function isBuiltin(asset: LibraryAsset): boolean {
  return asset.id.startsWith("builtin:");
}

/** The id a room records for a placed asset: none for a built-in, which is not a library row. */
export function libraryAssetId(asset: LibraryAsset): string | null {
  return isBuiltin(asset) ? null : asset.id;
}

/** Built-ins of one kind whose name matches a search, in catalog order. */
export function builtinsMatching(kind: LibraryAsset["kind"], query: string): LibraryAsset[] {
  const q = query.trim().toLowerCase();
  return BUILTIN_ASSETS.filter((a) => a.kind === kind && (!q || a.name.toLowerCase().includes(q)));
}
