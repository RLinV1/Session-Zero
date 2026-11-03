import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID, SHIPPED_MAPS } from "@vtt/shared";
import type { LibraryAssetRecord } from "../src/store/libraryStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";
import { ensureShippedMaps, isShippedKey } from "../src/domain/shippedMaps";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const url = process.env.DATABASE_URL;
const postgres = url ? await PostgresRoomStore.connect(url) : null;
afterAll(async () => {
  await postgres?.close();
});

describe("seeding the shipped maps (builtin-library-assets, ADR 0036)", () => {
  it("seeds an owner once, keys the rows apart from stored objects, and never re-seeds", async () => {
    const store = new MemoryRoomStore();
    await ensureShippedMaps(store, "owner-a");
    await ensureShippedMaps(store, "owner-a");
    const rows = await store.listAssets("owner-a");
    expect(rows).toHaveLength(SHIPPED_MAPS.length);
    for (const row of rows) {
      expect(isShippedKey(row.objectKey)).toBe(true);
      expect(row.kind).toBe("map");
    }
    await store.deleteAsset(rows[0]!.id, "owner-a");
    await ensureShippedMaps(store, "owner-a");
    expect(await store.listAssets("owner-a")).toHaveLength(SHIPPED_MAPS.length - 1);
    expect(await store.listAssets("owner-b")).toEqual([]);
  });

  it("seeds concurrent callers once", async () => {
    const store = new MemoryRoomStore();
    await Promise.all([ensureShippedMaps(store, "o"), ensureShippedMaps(store, "o")]);
    expect(await store.listAssets("o")).toHaveLength(SHIPPED_MAPS.length);
  });
});

describe("seeding per map (builtin-library-assets, ADR 0036 amendment)", () => {
  const stores: [string, RoomStore | null][] = [["memory", new MemoryRoomStore()], ["postgres", postgres]];
  const row = (ownerGmId: string, slug: string): LibraryAssetRecord => ({
    id: randomUUID(), ownerGmId, kind: "map", objectKey: `shipped:${slug}`, url: `/img/${slug}.webp`,
    name: slug, width: 700, height: 700, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
  });
  const slugs = async (s: RoomStore, o: string) => (await s.listAssets(o)).map((r) => r.objectKey).sort();
  const ORIGINAL = ["broken-span", "hollowfrost-keep", "temple-green-sun"];

  for (const [label, store] of stores) {
    describe.skipIf(!store)(label, () => {
      const owner = () => store!.registerGm(randomUUID());

      it("adds only the new catalog map once, and never re-adds a deleted one", async () => {
        const o = await owner();
        expect(await store!.seedShippedMaps(o, ORIGINAL.map((s) => row(o, s)))).toBe(true);
        const [first] = await store!.listAssets(o);
        await store!.deleteAsset(first!.id, o);
        const catalog = [...ORIGINAL, "new-map"].map((s) => row(o, s));
        expect(await store!.seedShippedMaps(o, catalog)).toBe(true);
        expect(await store!.seedShippedMaps(o, catalog)).toBe(false);
        const keys = await slugs(store!, o);
        expect(keys).toHaveLength(3);
        expect(keys).toContain("shipped:new-map");
        expect(keys).not.toContain(first!.objectKey);
      });

      it("corrects only exact old factory grids, preserving row identity and custom line styling", async () => {
        const o = await owner();
        const map = SHIPPED_MAPS.find((m) => m.slug === "broken-span")!;
        const oldGrid = { ...DEFAULT_GRID, cellSize: 69.4, offsetX: 10, offsetY: 31 };
        const factory = { ...row(o, map.slug), name: "Renamed by GM", url: map.url, width: map.width, height: map.height, grid: oldGrid };
        await store!.seedShippedMaps(o, [factory]);
        await ensureShippedMaps(store!, o);
        const corrected = (await store!.listAssets(o)).find((r) => r.id === factory.id)!;
        expect(corrected).toMatchObject({ ...factory, grid: map.grid });
        const styled = { ...oldGrid, lineColor: "#123456", lineWidth: 2 };
        await store!.updateAsset(factory.id, o, { grid: styled });
        await ensureShippedMaps(store!, o);
        expect((await store!.listAssets(o)).find((r) => r.id === factory.id)!.grid).toEqual(styled);
      });

      it("upgrades a four-map library without resetting edited grids or restoring deleted maps", async () => {
        const o = await owner();
        const originals = SHIPPED_MAPS.filter((m) => !["emberwatch-archive", "moonwater-baths"].includes(m.slug));
        await store!.seedShippedMaps(o, originals.map((m) => ({ ...row(o, m.slug), url: m.url, width: m.width, height: m.height, grid: m.grid })));
        const existing = await store!.listAssets(o);
        const edited = existing[0]!;
        const customGrid = { ...DEFAULT_GRID, cellSize: 83, offsetX: 7, offsetY: 11 };
        await store!.updateAsset(edited.id, o, { name: "My prepared map", grid: customGrid });
        await store!.deleteAsset(existing[1]!.id, o);
        await Promise.all([ensureShippedMaps(store!, o), ensureShippedMaps(store!, o)]);
        const upgraded = await store!.listAssets(o);
        expect(upgraded).toHaveLength(SHIPPED_MAPS.length - 1);
        expect(upgraded.find((r) => r.id === edited.id)).toMatchObject({ name: "My prepared map", grid: customGrid });
        expect(upgraded.some((r) => r.objectKey === existing[1]!.objectKey)).toBe(false);
        for (const slug of ["emberwatch-archive", "moonwater-baths"]) {
          expect(upgraded.filter((r) => r.objectKey === `shipped:${slug}`)).toHaveLength(1);
        }
      });

      it("gives a new account every row exactly once, even under concurrent calls", async () => {
        const o = await owner();
        const catalog = [...ORIGINAL, "new-map"];
        await Promise.all([1, 2, 3].map(() => store!.seedShippedMaps(o, catalog.map((s) => row(o, s)))));
        expect(await slugs(store!, o)).toEqual(catalog.map((s) => `shipped:${s}`).sort());
      });
    });
  }
});
