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
