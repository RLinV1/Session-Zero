// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, SHIPPED_MAPS, type LibraryAsset } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { mapThumbnailFor, SHIPPED_MAP_THUMBS } from "../src/net/builtinAssets";
import { LibraryPage } from "../src/pages/LibraryPage";
import { MapThumbnail } from "../src/ui/MapThumbnail";

/** A shipped map as an account's library holds it: a real row with its own id (ADR 0036). */
const seeded = (i: number): LibraryAsset => {
  const m = SHIPPED_MAPS[i]!;
  return { id: `00000000-0000-4000-8000-00000000000${i}`, kind: "map", name: m.name, url: m.url, width: m.width, height: m.height, grid: m.grid, createdAt: "2026-10-01T00:00:00.000Z" } as LibraryAsset;
};
const uploaded: LibraryAsset = {
  id: "11111111-1111-4111-8111-111111111111", kind: "map", name: "My cave", url: "/uploads/cave.png", width: 1400, height: 1000, grid: DEFAULT_GRID,
  createdAt: "2026-10-01T00:00:00.000Z",
} as LibraryAsset;

beforeEach(() => {
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  accountStore.setState({ status: "loading" });
});

describe("map thumbnails (design-language: Map thumbnails)", () => {
  it("knows each shipped map's prepared thumbnail by its URL, and nothing else's", () => {
    for (const m of SHIPPED_MAPS) expect(mapThumbnailFor(m.url)).toBe(SHIPPED_MAP_THUMBS[m.slug]!.src);
    expect(mapThumbnailFor("/uploads/cave.png")).toBeNull();
  });

  it("loads the prepared thumbnail, not the full map, for every shipped map in the library", async () => {
    vi.spyOn(api.library, "list").mockResolvedValue([seeded(0), seeded(1), seeded(2), seeded(3), uploaded]);
    vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    render(<LibraryPage />);
    await screen.findByText("My cave");
    const sources = [...document.querySelectorAll<HTMLImageElement>(".asset-thumb img")].map((img) => img.getAttribute("src"));
    for (const m of SHIPPED_MAPS) {
      expect(sources).toContain(SHIPPED_MAP_THUMBS[m.slug]!.src);
      expect(sources).not.toContain(m.url);
    }
    expect(sources).toContain("/uploads/cave.png");
  });

  it("holds an uploaded map's place with a hidden placeholder, then draws its grid", () => {
    const { container } = render(<MapThumbnail url="/uploads/cave.png" width={1400} height={1000} grid={DEFAULT_GRID} />);
    const placeholder = container.querySelector(".map-thumb-placeholder")!;
    expect(placeholder.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg.map-grid")).toBeNull();
    fireEvent.load(container.querySelector("img")!);
    expect(container.querySelector(".map-thumb-placeholder")).toBeNull();
    const grid = container.querySelector("svg.map-grid-light")!;
    expect(grid.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
  });

  it("keeps the placeholder when the picture cannot load", () => {
    const { container } = render(<MapThumbnail url="/uploads/missing.png" width={800} height={600} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(within(container as HTMLElement).queryByRole("img")).toBeNull();
    expect(container.querySelector(".map-thumb-placeholder")).toBeTruthy();
  });
});
