// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type LibraryAsset, type LibraryMapBoard, type LibraryUvttImportResponse } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import * as imageFile from "../src/net/imageFile";
import { LibraryPage } from "../src/pages/LibraryPage";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));
const asset: LibraryAsset = { id: "saved-map", kind: "map", name: "Dungeondraft map", url: "/uploads/library.png", width: 800, height: 600,
  grid: { ...DEFAULT_GRID, cellSize: 50, offsetX: 12.5, offsetY: 25 }, createdAt: "2026-10-18T00:00:00.000Z" };
const board: LibraryMapBoard = { walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, source: "objects_line_of_sight",
  uvttPortal: { closed: false, position: { x: 150, y: 100 }, rotation: 0.8, freestanding: true } }], fog: [] };
const imported: LibraryUvttImportResponse = { asset, diagnostics: [{ code: "unsupported_data", path: "lights", message: "Lights are not imported.", severity: "warning" }] };
beforeEach(() => {
  stubMapEditorEnvironment();
  accountStore.setState({ status: "signedIn", account: { id: "user", email: "gm@example.com", displayName: "GM" } });
  vi.spyOn(api.library, "list").mockResolvedValue([]);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
  vi.spyOn(api.library, "board");
  vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: asset.grid, board: structuredClone(board), revision: "r1" });
  vi.spyOn(api.library, "setBoard");
  vi.spyOn(api.library, "savePreparation").mockImplementation(async (_id, change) => ({ grid: change.grid, board: change.board, revision: "r2" }));
  vi.spyOn(api.detection, "library").mockResolvedValue({ status: "no_grid", attempt: 1 });
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.uvtt, "discard").mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); accountStore.setState({ status: "loading" }); });
const file = () => new File(["UVTT handled by the server"], "dungeondraft.dd2vtt");
function mountRoom() {
  const state = room(); const fake = fakeConnection();
  render(<GmPanel connection={fake.connection} state={state} token={TOKEN} gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return fake;
}

describe("UVTT upload and review in the asset library (KAN-43/44, FR-GM-06/07/12)", () => {
  it("accepts a UVTT file without imageSize, opens its saved grid and metadata, and saves geometry edits", async () => {
    const size = vi.spyOn(imageFile, "imageSize");
    const upload = vi.spyOn(api.library, "importUvtt").mockResolvedValue(structuredClone(imported));
    const saveGrid = vi.spyOn(api.library, "update").mockImplementation(async (_id, change) => ({ ...asset, ...change }));
    render(<LibraryPage />);
    const input = screen.getByLabelText("Upload map") as HTMLInputElement;
    expect(input.accept).toContain(".dd2vtt"); expect(input.accept).toContain(".uvtt"); expect(input.accept).toContain(".df2vtt");
    const selected = file(); fireEvent.change(input, { target: { files: [selected] } });
    expect(input.disabled).toBe(true);
    const editor = await screen.findByRole("dialog", { name: "Edit map" });
    expect(upload).toHaveBeenCalledWith(selected); expect(size).not.toHaveBeenCalled();
    expect(within(editor).getByText(/Imported map saved to your library/)).toBeTruthy();
    expect(within(editor).getByText("1 import warnings")).toBeTruthy();
    expect(within(editor).getByDisplayValue("12.5")).toBeTruthy();
    fireEvent.change(within(editor).getByLabelText("Distance per square"), { target: { value: "10" } });
    fireEvent.click(within(editor).getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(await within(editor).findByLabelText("Selected geometry"), { target: { value: "draft:w0" } });
    expect(within(editor).getByLabelText("Rotation (radians)")).toHaveProperty("value", "0.8");
    fireEvent.click(within(editor).getByLabelText("Closed (blocks movement)"));
    fireEvent.click(within(editor).getByRole("button", { name: "Save geometry" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, expect.objectContaining({ board: { walls: [{ ...board.walls[0], uvttPortal: { ...board.walls[0]!.uvttPortal, closed: true } }], fog: [] } })));
    await waitFor(() => expect(api.library.savePreparation).toHaveBeenCalledWith(asset.id, expect.objectContaining({ grid: { ...asset.grid, unitsPerCell: 10 } })));
    expect(within(editor).getByText("1 import warnings")).toBeTruthy();
    expect(saveGrid).not.toHaveBeenCalled();
    expect(editor.hasAttribute("open")).toBe(true);
    expect(input.disabled).toBe(false);
  });

  it("shows failed validation without creating a card and lets the same file be retried", async () => {
    const upload = vi.spyOn(api.library, "importUvtt").mockRejectedValueOnce(new Error("portals[0].bounds is invalid.")).mockResolvedValue({ ...imported, diagnostics: [] });
    render(<LibraryPage />); const input = screen.getByLabelText("Upload map") as HTMLInputElement; const selected = file();
    fireEvent.change(input, { target: { files: [selected] } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "portals[0].bounds is invalid.");
    expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull(); expect(screen.queryByText(asset.name)).toBeNull();
    expect(input.value).toBe(""); expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { files: [selected] } });
    await screen.findByRole("dialog", { name: "Edit map" }); expect(upload).toHaveBeenCalledTimes(2);
  });

  it("keeps token art image-only", () => {
    render(<LibraryPage />); fireEvent.click(screen.getByRole("tab", { name: "Token Art" }));
    expect(screen.getByLabelText("Upload token art")).toHaveProperty("accept", "image/png,image/jpeg,image/webp");
  });
});

describe("reusable UVTT maps from a room (KAN-43, FR-GM-06/12)", () => {
  it.each([true, false])("honors save-to-library=%s while keeping the room private until Apply", async (save) => {
    const prepare = vi.spyOn(api.uvtt, "prepare").mockResolvedValue({ id: "private", revision: 1,
      map: { url: asset.url, width: asset.width, height: asset.height }, grid: asset.grid!, walls: board.walls, diagnostics: [] });
    const fake = mountRoom(); fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    if (!save) fireEvent.click(screen.getByLabelText("Also save uploads to my library"));
    const selected = file(); fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [selected] } });
    await screen.findByText(/Unsaved changes: only you see them/);
    expect(prepare.mock.calls[0]).toEqual(save ? ["r1", TOKEN, selected, { saveToLibrary: true, sceneId: "initial" }] : ["r1", TOKEN, selected, { saveToLibrary: false, sceneId: "initial" }]);
    expect(fake.commands).toEqual([]);
  });

  it("places a library map with one reference command and no client-side wall/fog copy", async () => {
    vi.mocked(api.library.list).mockResolvedValue([asset]); const fake = mountRoom();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(asset.name));
    expect(fake.commands).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.setMap", expectedSceneId: "initial", map: { url: asset.url, width: 800, height: 600, assetId: asset.id }, grid: asset.grid, includeLibraryBoard: true, terrainContext: { boardEpoch: 0, revision: 0 } }]));
    expect(api.library.board).not.toHaveBeenCalled();
  });
});
