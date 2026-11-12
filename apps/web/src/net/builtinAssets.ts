import portraits from "../../public/img/tokens/enemies/portraits.json";
import { SHIPPED_MAPS, shippedMapByUrl, type LibraryAsset } from "@vtt/shared";
import { t } from "../i18n/locale";
import type { WebEn } from "../i18n/en";

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
/** A built-in's name, read when used, in the reader's language; one without a catalog entry keeps its own. */
function named<T extends object>(item: T, key: string, fallback: string): T & { name: string } {
  return Object.defineProperty(item, "name", {
    get: () => (key in BUILTIN_NAME_KEYS ? t(BUILTIN_NAME_KEYS[key as keyof typeof BUILTIN_NAME_KEYS]) : fallback),
    enumerable: true,
  }) as T & { name: string };
}
const BUILTIN_NAME_KEYS = {
  "token:goblin-guard": "builtin.creature.goblin-guard",
  "token:goblin-spearman": "builtin.creature.goblin-spearman",
  "token:human-mage": "builtin.creature.human-mage",
  "token:human-swordsman": "builtin.creature.human-swordsman",
  "map:broken-span": "builtin.map.broken-span",
  "map:hollowfrost-keep": "builtin.map.hollowfrost-keep",
  "map:temple-green-sun": "builtin.map.temple-green-sun",
  "map:sunken-crypt": "builtin.map.sunken-crypt",
  "map:emberwatch-archive": "builtin.map.emberwatch-archive",
  "map:moonwater-baths": "builtin.map.moonwater-baths",
} as const satisfies Record<string, keyof WebEn>;

function token(slug: string, name: string, url: string): LibraryAsset {
  return named({ id: `builtin:${slug}`, kind: "token" as const, url, ...TOKEN_SIZE, grid: null, createdAt: SHIPPED }, `token:${slug}`, name);
}

export const BUILTIN_ASSETS: readonly LibraryAsset[] = [
  ...SHIPPED_MAPS.map(
    ({ slug, name, url, width, height, grid }): LibraryAsset => named({ id: `builtin:${slug}`, kind: "map" as const, url, width, height, grid, createdAt: SHIPPED }, `map:${slug}`, name),
  ),
  ...portraits.map(({ slug, name, file, width, height }): LibraryAsset => ({
    ...token(slug, name, `/img/tokens/enemies/${file}`), width, height,
  })),
];

/**
 * The shipped maps' prepared thumbnails, cut by scripts/home-maps.mjs, by slug. Whole maps at 640px
 * wide, so a library card or the home page never downloads a full map just to show a picture of it.
 */
type ShippedSlug = "emberwatch-archive" | "moonwater-baths" | "broken-span" | "hollowfrost-keep" | "temple-green-sun" | "sunken-crypt";
/** A thumbnail whose `alt` is read when shown, in the reader's language. */
const thumb = (slug: ShippedSlug, src: string) => ({
  src,
  get alt() {
    return t(`builtin.mapAlt.${slug}`);
  },
});

export const SHIPPED_MAP_THUMBS: Readonly<Record<string, { src: string; alt: string }>> = {
  "emberwatch-archive": thumb("emberwatch-archive", "/img/home/emberwatch-archive-thumb.webp"),
  "moonwater-baths": thumb("moonwater-baths", "/img/home/moonwater-baths-thumb.webp"),
  "broken-span": thumb("broken-span", "/img/home/broken-span-thumb.webp"),
  "hollowfrost-keep": thumb("hollowfrost-keep", "/img/home/hollowfrost-keep-thumb.webp"),
  "temple-green-sun": thumb("temple-green-sun", "/img/home/temple-green-sun-thumb.webp"),
  "sunken-crypt": thumb("sunken-crypt", "/img/home/sunken-crypt-thumb.webp"),
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

/**
 * The name a library card shows: a seeded shipped map that still has its shipped name reads in the
 * reader's language; a name the GM gave it is theirs and shows as typed.
 */
export function assetDisplayName(asset: Pick<LibraryAsset, "name" | "url">): string {
  const shipped = shippedMapByUrl(asset.url);
  const key = shipped ? (`map:${shipped.slug}` as const) : null;
  return shipped && key && key in BUILTIN_NAME_KEYS && asset.name === shipped.name
    ? t(BUILTIN_NAME_KEYS[key as keyof typeof BUILTIN_NAME_KEYS])
    : asset.name;
}
