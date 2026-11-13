// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_ROOM_DEFAULTS, DEFAULT_GRID, type LibraryAsset } from "@vtt/shared";
import { api } from "../src/net/api";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { stubMapEditorEnvironment } from "./mapEditorHarness";

const unconfigured: LibraryAsset = { id: "map1", kind: "map", name: "Crypt", url: "/crypt.png", width: 700, height: 700, grid: null, createdAt: "2026-11-13T00:00:00Z" };
const metres = { ...BUILTIN_ROOM_DEFAULTS, unitsPerCell: 1.5, unitLabel: "m" };

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.detection, "library").mockResolvedValue(null);
  vi.spyOn(api.roomDefaults, "get").mockResolvedValue(metres);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const distance = () => (screen.getByLabelText("Distance per square") as HTMLInputElement).value;
const unit = () => (screen.getByLabelText("Distance unit") as HTMLInputElement).value;

describe("library grid setup starts from the GM's units (gm-room-defaults, asset-library)", () => {
  it("fills in an unconfigured map's units per square and unit label from the GM's defaults", async () => {
    vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: null, board: { walls: [], fog: [] }, revision: "r1" });
    render(<LibraryMapEditor asset={unconfigured} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole("tab", { name: /Grid/ });
    await waitFor(() => expect(distance()).toBe("1.5"));
    expect(unit()).toBe("m");
  });

  it("keeps a saved grid's own units", async () => {
    const saved = { ...unconfigured, grid: DEFAULT_GRID };
    vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: DEFAULT_GRID, board: { walls: [], fog: [] }, revision: "r1" });
    render(<LibraryMapEditor asset={saved} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole("tab", { name: /Grid/ });
    await waitFor(() => expect(api.roomDefaults.get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(distance()).toBe("5");
    expect(unit()).toBe("ft");
  });

  it("starts from 5 ft when the GM's defaults can't be read", async () => {
    vi.mocked(api.roomDefaults.get).mockRejectedValue(new Error("offline"));
    vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: null, board: { walls: [], fog: [] }, revision: "r1" });
    render(<LibraryMapEditor asset={unconfigured} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole("tab", { name: /Grid/ });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(distance()).toBe("5");
    expect(unit()).toBe("ft");
  });
});
