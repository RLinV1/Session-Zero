// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type LibraryAsset, type LibraryMapBoard } from "@vtt/shared";
import { api } from "../src/net/api";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { stubMapEditorEnvironment } from "./mapEditorHarness";

const grid = { ...DEFAULT_GRID, cellSize: 50, offsetX: 0, offsetY: 0 };
const asset: LibraryAsset = { id: "map1", kind: "map", name: "Crypt", url: "/crypt.png", width: 700, height: 700, grid, createdAt: "2026-10-18T00:00:00Z" };
const board: LibraryMapBoard = {
  walls: [{ a: { x: 50, y: 50 }, b: { x: 100, y: 50 } }], fog: [],
  terrain: [{ row: 1, start: 1, end: 1, kind: "blocked" }],
};
const candidate = { cellSize: 150, offsetX: 10, offsetY: 20 };
const painted = [{ row: 0, start: 0, end: 0, kind: "blocked" }];

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(api.detection, "library").mockResolvedValue({ status: "suggested", attempt: 1, candidate });
  vi.spyOn(api.library, "preparation").mockResolvedValue({ grid, board, revision: "r1" });
  vi.spyOn(api.library, "savePreparation").mockImplementation(async (_id, change) => ({ grid: change.grid, board: change.board, revision: "r2" }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount() {
  const close = vi.fn(), saved = vi.fn();
  render(<LibraryMapEditor asset={asset} onClose={close} onSaved={saved} />);
  await waitFor(() => expect(screen.getByRole("tabpanel").hasAttribute("inert")).toBe(false));
  return { close, saved };
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const terrainTab = () => fireEvent.click(screen.getByRole("tab", { name: /Terrain/ }));
const gridTab = () => fireEvent.click(screen.getByRole("tab", { name: /Grid/ }));
const terrainCanvas = () => screen.getByRole("application", { name: "Terrain preparation canvas" });
const expectTerrain = (cells: number) => expect(terrainCanvas().querySelectorAll('[data-terrain="blocked"]')).toHaveLength(cells);
async function saveChanges() {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.library.savePreparation).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByText(/Unsaved changes:/)).toBeNull());
}
function changeGeometry(source: "manual" | "suggestion") {
  if (source === "manual") change("Cell size", "150");
  else fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
}
const decisions = [
  { source: "manual", accept: true }, { source: "manual", accept: false },
  { source: "suggestion", accept: true }, { source: "suggestion", accept: false },
] as const;

describe("library grid loading and terrain safeguards (FR-GM-04, FR-TAC-03)", () => {
  it("normalizes legacy geometry initially, after preparation loads, and on Discard without hiding the pending migration", async () => {
    const legacy = { ...grid, cellSize: 0.01 };
    const loaded = { grid: { ...legacy, cellSize: 0.02, unitsPerCell: 10 }, board: { walls: [], fog: [] }, revision: "legacy-r1" };
    let resolve!: (value: typeof loaded) => void;
    vi.mocked(api.library.preparation).mockReturnValue(new Promise((done) => { resolve = done; }));
    const saved = vi.fn();
    render(<LibraryMapEditor asset={{ ...asset, grid: legacy }} onClose={() => {}} onSaved={saved} />);
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "0.03");
    expect(screen.getByRole("tabpanel").hasAttribute("inert")).toBe(true);
    await act(async () => resolve(loaded));
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "0.03");
    expect(screen.getByLabelText("Distance per square")).toHaveProperty("value", "10");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", false);
    change("Cell size", "100"); change("Distance per square", "20");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "0.03");
    expect(screen.getByLabelText("Distance per square")).toHaveProperty("value", "10");
    // Normalization remains an unsaved change; the stored asset still has its raw grid.
    expect(screen.getByText(/Unsaved changes:/)).toBeTruthy();
    await saveChanges();
    expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, {
      grid: { ...loaded.grid, cellSize: 0.03 }, board: loaded.board, revision: "legacy-r1", resetTerrain: false,
    });
    expect(saved).toHaveBeenCalledWith({ ...asset, grid: { ...loaded.grid, cellSize: 0.03 } });
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("exposes preparation failures on Grid and every other step while keeping unloaded content inert and Save disabled", async () => {
    vi.mocked(api.library.preparation).mockRejectedValue(new Error("Preparation unavailable"));
    render(<LibraryMapEditor asset={{ ...asset, grid: null }} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole("alert");
    expect((await screen.findByRole("tab", { name: /Grid/ })).getAttribute("aria-selected")).toBe("true");
    for (const step of [/Grid/, /Walls/, /Fog/, /Terrain/]) {
      fireEvent.click(screen.getByRole("tab", { name: step }));
      const error = screen.getByRole("alert");
      expect(error.textContent).toBe("Preparation unavailable");
      expect(error.closest("[inert]")).toBeNull();
      expect(screen.getByRole("tabpanel").hasAttribute("inert")).toBe(true);
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    }
    expect(screen.queryByRole("application", { name: "Terrain preparation canvas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(api.library.savePreparation).not.toHaveBeenCalled();
  });

  it.each(decisions)("guards $source geometry changes with terrain (accept=$accept)", async ({ source, accept }) => {
    vi.mocked(window.confirm).mockReturnValue(accept);
    await mount();
    change("Distance per square", "10");
    expect(window.confirm).not.toHaveBeenCalled();
    changeGeometry(source);
    expect(window.confirm).toHaveBeenCalledOnce();
    const nextGrid = accept ? { ...grid, ...(source === "manual" ? { cellSize: 150 } : candidate), unitsPerCell: 10 } : { ...grid, unitsPerCell: 10 };
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", String(nextGrid.cellSize));
    expect(screen.getByLabelText("Offset X")).toHaveProperty("value", String(nextGrid.offsetX));
    expect(screen.getByLabelText("Offset Y")).toHaveProperty("value", String(nextGrid.offsetY));
    terrainTab(); expectTerrain(accept ? 0 : 1);
    expect(api.library.savePreparation).not.toHaveBeenCalled();
    await saveChanges();
    expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, {
      grid: nextGrid, board: accept ? { ...board, terrain: [] } : board, revision: "r1", resetTerrain: accept,
    });
  });

  it.each(decisions)("guards newly painted terrain after an earlier reset for $source changes (accept=$accept)", async ({ source, accept }) => {
    vi.mocked(window.confirm).mockReturnValueOnce(true).mockReturnValueOnce(accept);
    await mount();
    change("Cell size", "100");
    expect(window.confirm).toHaveBeenCalledOnce();
    // Stored terrain was already discarded; another empty-grid edit needs no prompt.
    change("Offset X", "5");
    expect(window.confirm).toHaveBeenCalledOnce();
    terrainTab(); expectTerrain(0);
    fireEvent.click(screen.getByRole("button", { name: "Blocked" }));
    fireEvent.keyDown(terrainCanvas(), { key: "Enter" });
    fireEvent.keyDown(terrainCanvas(), { key: "Enter" });
    await waitFor(() => expect(screen.queryByLabelText("Terrain preview")).toBeNull());
    expectTerrain(1);
    gridTab();
    change("Distance per square", "10");
    fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), { target: { value: "60" } });
    expect(window.confirm).toHaveBeenCalledOnce();
    changeGeometry(source);
    expect(window.confirm).toHaveBeenCalledTimes(2);
    const currentGrid = { ...grid, cellSize: 100, offsetX: 5, unitsPerCell: 10, lineOpacity: 0.6 };
    const nextGrid = accept ? { ...currentGrid, ...(source === "manual" ? { cellSize: 150 } : candidate) } : currentGrid;
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", String(nextGrid.cellSize));
    expect(screen.getByLabelText("Offset X")).toHaveProperty("value", String(nextGrid.offsetX));
    expect(screen.getByLabelText("Offset Y")).toHaveProperty("value", String(nextGrid.offsetY));
    terrainTab(); expectTerrain(accept ? 0 : 1);
    await saveChanges();
    expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, {
      grid: nextGrid, board: { ...board, terrain: accept ? [] : painted }, revision: "r1", resetTerrain: true,
    });
  });

  it.each(["units", "style"])("preserves stored terrain without confirmation for %s-only edits", async (kind) => {
    await mount();
    if (kind === "units") change("Distance per square", "10");
    else fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), { target: { value: "60" } });
    expect(window.confirm).not.toHaveBeenCalled();
    terrainTab(); expectTerrain(1);
    await saveChanges();
    expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, {
      grid: { ...grid, ...(kind === "units" ? { unitsPerCell: 10 } : { lineOpacity: 0.6 }) }, board, revision: "r1", resetTerrain: false,
    });
  });

  it("restores the stored grid, terrain and reset protection on Discard", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true).mockReturnValueOnce(false);
    await mount();
    changeGeometry("suggestion");
    terrainTab(); expectTerrain(0);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expectTerrain(1);
    gridTab();
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "50");
    expect(screen.queryByText(/Unsaved changes:/)).toBeNull();
    changeGeometry("manual");
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "50");
    change("Distance per square", "10");
    await saveChanges();
    expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, { grid: { ...grid, unitsPerCell: 10 }, board, revision: "r1", resetTerrain: false });
  });
});
