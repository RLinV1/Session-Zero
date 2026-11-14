// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type LibraryAsset } from "@vtt/shared";
import { api } from "../src/net/api";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { stubMapEditorEnvironment } from "./mapEditorHarness";
const asset: LibraryAsset = { id: "map1", kind: "map", name: "Crypt", url: "/crypt.png", width: 700, height: 700, grid: DEFAULT_GRID, createdAt: "2026-10-18T00:00:00Z" };
beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.detection, "library").mockResolvedValue(null);
  vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: DEFAULT_GRID, board: { walls: [], fog: [] }, revision: "r1" });
  vi.spyOn(api.library, "update").mockImplementation(async (_id, changes) => ({ ...asset, ...changes }));
  vi.spyOn(api.library, "setBoard");
  vi.spyOn(api.library, "savePreparation").mockImplementation(async (_id, change) => ({ grid: change.grid, board: change.board, revision: "r2" }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const close = vi.fn(); const saved = vi.fn();
  render(<LibraryMapEditor asset={asset} onClose={close} onSaved={saved} />);
  return { close, saved };
}
const gridChange = async () => { await waitFor(() => expect(api.library.preparation).toHaveBeenCalled()); await screen.findByRole("tab", { name: /Grid/ }); await new Promise((resolve) => setTimeout(resolve, 0)); fireEvent.change(screen.getByLabelText("Distance per square"), { target: { value: "10" } }); };
async function fogChange() {
  fireEvent.click(screen.getByRole("tab", { name: /Fog/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Fog whole map" }));
}
describe("one library map draft across Grid, Walls and Fog", () => {
  it("keeps grid changes across tabs, saves everything together, and stays open", async () => {
    const { close } = mount();
    await gridChange(); await fogChange();
    expect(api.library.update).not.toHaveBeenCalled();
    expect(api.library.setBoard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /Grid/ }));
    expect((screen.getByLabelText("Distance per square") as HTMLInputElement).value).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.library.savePreparation).toHaveBeenCalledWith("map1", expect.objectContaining({ board: expect.objectContaining({ fog: [expect.anything()] }) })));
    expect(api.library.savePreparation).toHaveBeenCalledWith("map1", expect.objectContaining({ grid: expect.objectContaining({ unitsPerCell: 10 }), revision: "r1" }));
    expect(api.library.update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/)).toBeNull());
    expect(screen.getByRole("dialog", { name: "Edit map" })).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
  });
  it("offers Keep editing and Discard on close without browser confirmation", async () => {
    const { close } = mount();
    const browserConfirm = vi.spyOn(window, "confirm");
    await gridChange();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    let prompt = screen.getByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Keep editing" }));
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Distance per square") as HTMLInputElement).value).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    prompt = screen.getByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Discard" }));
    expect(close).toHaveBeenCalledWith(asset);
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(api.library.update).not.toHaveBeenCalled();
  });
  it("saves before closing only when Save is chosen in the close prompt", async () => {
    const { close } = mount(); await gridChange();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(expect.objectContaining({ grid: expect.objectContaining({ unitsPerCell: 10 }) })));
  });
  it("discards grid and fog together while keeping the editor open", async () => {
    const { close } = mount(); await gridChange(); await fogChange();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/)).toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: /Grid/ }));
    expect((screen.getByLabelText("Distance per square") as HTMLInputElement).value).toBe(String(DEFAULT_GRID.unitsPerCell));
    expect(close).not.toHaveBeenCalled();
    expect(api.library.update).not.toHaveBeenCalled(); expect(api.library.setBoard).not.toHaveBeenCalled();
  });
  it("keeps the prompt and unsaved fog after atomic save failure, and retries the complete preparation", async () => {
    vi.mocked(api.library.savePreparation).mockRejectedValueOnce(new Error("Connection lost"));
    const { close } = mount(); await gridChange(); await fogChange();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const prompt = screen.getByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Save" }));
    await screen.findByText("Connection lost");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(within(prompt).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(api.library.update).not.toHaveBeenCalled();
    expect(api.library.setBoard).not.toHaveBeenCalled();
    expect(api.library.savePreparation).toHaveBeenCalledTimes(2);
  });
});

describe("Export .uvtt from the library map editor (asset-library, ADR 0070)", () => {
  const exportButton = () => screen.getByRole("button", { name: "Export .uvtt" }) as HTMLButtonElement;
  it("downloads the map as last saved, and says doors lose their identity", async () => {
    vi.mocked(api.library.preparation).mockResolvedValue({ grid: DEFAULT_GRID, board: { walls: [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 }, portal: { kind: "door", state: "closed" } }], fog: [] }, revision: "r1" });
    const download = vi.spyOn(api.library, "export").mockResolvedValue(new Blob(["{}"]));
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:map", revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mount();
    await waitFor(() => expect(api.library.preparation).toHaveBeenCalled());
    await waitFor(() => expect(exportButton().disabled).toBe(false));
    fireEvent.click(exportButton());
    await waitFor(() => expect(download).toHaveBeenCalledWith("map1"));
    expect(click).toHaveBeenCalled();
    expect(await screen.findByText(/UVTT does not carry door\/window identity or locks/)).toBeTruthy();
  });
  it("is unavailable while there are unsaved changes", async () => {
    const download = vi.spyOn(api.library, "export");
    mount();
    await gridChange();
    expect(exportButton().disabled).toBe(true);
    expect(screen.getByText("Save your changes before exporting.")).toBeTruthy();
    fireEvent.click(exportButton());
    expect(download).not.toHaveBeenCalled();
  });
  it("is unavailable for a map with no saved grid", async () => {
    vi.mocked(api.library.preparation).mockResolvedValue({ grid: null, board: { walls: [], fog: [] }, revision: "r1" });
    render(<LibraryMapEditor asset={{ ...asset, grid: null }} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(api.library.preparation).toHaveBeenCalled());
    // A map with no grid may first wait for grid detection; skip straight to manual setup.
    const skip = screen.queryByText("Set up manually");
    if (skip) fireEvent.click(skip);
    await waitFor(() => expect(exportButton().disabled).toBe(true));
    expect(screen.getByText("Save this map's grid before exporting.")).toBeTruthy();
  });
});
