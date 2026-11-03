import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type LibraryAsset } from "@vtt/shared";
import { BUILTIN_ASSETS, builtinsMatching, isBuiltin, libraryAssetId } from "../src/net/builtinAssets";

describe("built-in library assets (builtin-library-assets)", () => {
  it("ships six maps, two goblins and two human portraits with unique built-in ids", () => {
    expect(BUILTIN_ASSETS.filter((a) => a.kind === "map")).toHaveLength(6);
    expect(BUILTIN_ASSETS.filter((a) => a.kind === "token")).toHaveLength(4);
    const ids = BUILTIN_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BUILTIN_ASSETS) expect(isBuiltin(a)).toBe(true);
  });

  it("gives every token its own name, so the picker never shows two of one character", () => {
    const names = BUILTIN_ASSETS.filter((a) => a.kind === "token").map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => /[()]/.test(n))).toBe(false);
  });

  it("gives each map its own measured size and grid, and tokens none (top-down-default-maps)", () => {
    const maps = Object.fromEntries(BUILTIN_ASSETS.filter((a) => a.kind === "map").map((a) => [a.name, a]));
    const expected = {
      "The Broken Span": { width: 3344, height: 1882, cellSize: 70, offsetX: 8, offsetY: 18 },
      "Hollowfrost Keep": { width: 3269, height: 1882, cellSize: 70.3, offsetX: 54, offsetY: 43 },
      "Temple of the Green Sun": { width: 2740, height: 1604, cellSize: 70, offsetX: 21, offsetY: 36 },
      "Sunken Crypt": { width: 2800, height: 1680, cellSize: 70, offsetX: 0, offsetY: 0 },
      "Emberwatch Archive": { width: 1960, height: 1400, cellSize: 70, offsetX: 0, offsetY: 0 },
      "Moonwater Baths": { width: 1960, height: 1400, cellSize: 70, offsetX: 0, offsetY: 0 },
    };
    expect(Object.keys(maps).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, e] of Object.entries(expected)) {
      const m = maps[name]!;
      expect({ width: m.width, height: m.height }).toEqual({ width: e.width, height: e.height });
      expect(m.grid).toEqual({ ...DEFAULT_GRID, cellSize: e.cellSize, offsetX: e.offsetX, offsetY: e.offsetY });
      // The grid schema requires 0 <= offset < cellSize.
      expect(m.grid!.offsetX).toBeGreaterThanOrEqual(0);
      expect(m.grid!.offsetY).toBeGreaterThanOrEqual(0);
      expect(m.grid!.offsetX).toBeLessThan(m.grid!.cellSize);
      expect(m.grid!.offsetY).toBeLessThan(m.grid!.cellSize);
    }
    for (const t of BUILTIN_ASSETS.filter((a) => a.kind === "token")) expect(t.grid).toBeNull();
  });

  it("points at files that exist in the web app's public folder", () => {
    for (const a of BUILTIN_ASSETS) {
      expect(existsSync(fileURLToPath(new URL(`../public${a.url}`, import.meta.url)))).toBe(true);
    }
  });

  it("records no library asset id for a built-in, and the row id for an upload", () => {
    const upload: LibraryAsset = { ...BUILTIN_ASSETS[0]!, id: "0b6f8a5e-5c1e-4f55-9d57-2f4a4b8c9d10" };
    expect(libraryAssetId(BUILTIN_ASSETS[0]!)).toBeNull();
    expect(libraryAssetId(upload)).toBe(upload.id);
  });

  it("filters by kind and a case-insensitive name search", () => {
    expect(builtinsMatching("map", "FROST").map((a) => a.name)).toEqual(["Hollowfrost Keep"]);
    expect(builtinsMatching("token", "").every((a) => a.kind === "token")).toBe(true);
  });
});

it("includes searchable portraits with their actual bundled image dimensions", async () => {
  const { default: sharp } = await import("sharp");
  const portraits = BUILTIN_ASSETS.filter((asset) => asset.url.startsWith("/img/tokens/enemies/"));
  expect(portraits).toHaveLength(4);
  expect(builtinsMatching("token", "goblin").map((asset) => asset.name)).toEqual(["Goblin Spearman", "Goblin Guard"]);
  expect(builtinsMatching("token", "human").map((asset) => asset.name)).toEqual(["Human Swordsman", "Human Mage"]);
  for (const asset of portraits) {
    const metadata = await sharp(fileURLToPath(new URL(`../public${asset.url}`, import.meta.url))).metadata();
    expect(metadata.width).toBe(asset.width);
    expect(metadata.height).toBe(asset.height);
    expect(metadata.hasAlpha).toBe(true);
    expect(libraryAssetId(asset)).toBeNull();
  }
});
