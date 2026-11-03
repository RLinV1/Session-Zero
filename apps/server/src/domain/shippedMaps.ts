import { randomUUID } from "node:crypto";
import { DEFAULT_GRID, SHIPPED_MAPS } from "@vtt/shared";
import type { LibraryAssetRecord, LibraryStore } from "../store/libraryStore";

/** Object keys of seeded rows start with this; the image is a shipped file, not a stored object (ADR 0036). */
export const SHIPPED_KEY_PREFIX = "shipped:";

/** Only these complete historical factory grids may be replaced; custom styling also counts as an edit. */
export const SHIPPED_GRID_CORRECTIONS = [
  { slug: "broken-span", previous: { ...DEFAULT_GRID, cellSize: 69.4, offsetX: 10, offsetY: 31 } },
  { slug: "hollowfrost-keep", previous: { ...DEFAULT_GRID, cellSize: 70, offsetX: 47, offsetY: 46 } },
].map(({ slug, previous }) => ({ map: SHIPPED_MAPS.find((m) => m.slug === slug)!, previous }));

export const isShippedKey = (objectKey: string) => objectKey.startsWith(SHIPPED_KEY_PREFIX);

/**
 * Gives an owner each shipped map once. Later catalog additions reach existing owners;
 * only exact obsolete factory grids are corrected, and deleted maps are not added back.
 */
export async function ensureShippedMaps(store: Pick<LibraryStore, "seedShippedMaps">, ownerGmId: string): Promise<void> {
  const createdAt = new Date().toISOString();
  const rows: LibraryAssetRecord[] = SHIPPED_MAPS.map((m) => ({
    id: randomUUID(),
    ownerGmId,
    kind: "map",
    objectKey: `${SHIPPED_KEY_PREFIX}${m.slug}`,
    url: m.url,
    name: m.name,
    width: m.width,
    height: m.height,
    grid: m.grid,
    detectionStatus: null,
    detectionAttempt: 0,
    detectionResult: null,
    createdAt,
  }));
  await store.seedShippedMaps(ownerGmId, rows);
}
