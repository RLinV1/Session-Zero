// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command, decide, reduce, type CommandInput, type GridDetectionStatus, type LibraryAsset, type Participant, type RoomState } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import * as imageFile from "../src/net/imageFile";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { click, fakeConnection, GRID, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const baseline = { boardEpoch: 3, revision: 7 };
const asset: LibraryAsset = { id: "library-map", kind: "map", name: "Prepared map", url: "/library.png", width: 800, height: 600, grid: GRID, createdAt: "2026-10-18T00:00:00Z" };
const libraryMap = {
  map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: GRID,
  board: { walls: [], fog: [], terrain: [{ row: 2, start: 2, end: 2, kind: "blocked" as const }] },
};
const context = (state: RoomState) => ({ boardEpoch: state.boardEpoch ?? 0, revision: state.terrainRevision ?? 0 });
function initialRoom(): RoomState {
  return { ...room(), boardEpoch: baseline.boardEpoch, terrainRevision: baseline.revision,
    terrain: { base: [{ row: 0, start: 0, end: 0, kind: "difficult" }], effects: [] } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Use the actual command parser/decision/reducer behind the UI's preparation-to-command flow. */
function mount(initial = initialRoom()) {
  let current = initial;
  const fake = fakeConnection();
  const decideCommand = (input: CommandInput) => decide(current, gm, Command.parse(input), { newId: () => "id", libraryMap });
  const commit = (input: CommandInput) => {
    const decision = decideCommand(input);
    if (decision.ok) current = decision.events.reduce<RoomState>((state, event) => reduce(state, event), current);
    return decision;
  };
  Object.defineProperty(fake.connection, "snapshot", { get: () => ({ state: current }) });
  vi.mocked(fake.connection.command).mockImplementation(async (input) => {
    fake.commands.push(input);
    const decision = commit(input);
    return decision.ok ? { ok: true, seq: null } : decision;
  });
  const panel = () => <GmPanel connection={fake.connection} state={current} token={TOKEN}
    gridDraft={toGridDraft(current.scene.grid)} hasGridDraft={false} onGridDraftChange={() => {}}
    onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />;
  const view = render(panel());
  return { ...fake, state: () => current,
    rerender: () => view.rerender(panel()),
    otherGm: (input: CommandInput) => {
      const decision = commit(input);
      expect(decision.ok).toBe(true);
      view.rerender(panel());
    },
  };
}

beforeEach(() => {
  stubMapEditorEnvironment();
  accountStore.setState({ status: "signedIn", account: { id: "owner", email: "owner@example.com", displayName: "GM" } });
  vi.spyOn(api.library, "list").mockResolvedValue([asset]);
  vi.spyOn(api.library.animations, "list").mockResolvedValue([]);
  vi.spyOn(api.detection, "room").mockResolvedValue({ status: "no_grid", attempt: 1 });
  vi.spyOn(api.detection, "library").mockResolvedValue({ status: "no_grid", attempt: 1 });
  vi.spyOn(imageFile, "imageSize").mockResolvedValue({ width: 800, height: 600 });
  vi.spyOn(api, "upload").mockResolvedValue({ url: "/upload.png" });
  vi.spyOn(api.library, "upload").mockResolvedValue(asset);
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

function upload(saveToLibrary: boolean) {
  if (!saveToLibrary) fireEvent.click(screen.getByLabelText("Also save uploads to my library"));
  fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
}
async function prepare(source: "upload" | "library") {
  fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
  if (source === "upload") upload(false);
  else {
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(asset.name));
  }
  await screen.findByLabelText("Cell size");
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply map" })).toHaveProperty("disabled", false));
}
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
const paint = (state: RoomState): CommandInput => ({ type: "terrain.paint", layerId: "base", context: context(state), paint: [{ row: 1, start: 1, end: 1, kind: "blocked" }] });

describe.each(["upload", "library"] as const)("%s preparation context (FR-TAC-03, FR-GM-15)", (source) => {
  it.each(["terrain", "epoch"] as const)("refuses Apply after the %s changes and keeps the draft through retry and rerender", async (change) => {
    const view = mount();
    await prepare(source);
    fireEvent.change(screen.getByLabelText("Distance per square"), { target: { value: "10" } });
    if (change === "terrain") view.otherGm(paint(view.state()));
    // Reapplying identical map geometry advances only the epoch, independently of terrain revision.
    else view.otherGm({ type: "scene.setMap", map: view.state().scene.map! });
    expect(context(view.state())).toEqual(change === "terrain" ? { ...baseline, revision: 8 } : { ...baseline, boardEpoch: 4 });
    const before = structuredClone(view.state());
    for (let attempt = 1; attempt <= 2; attempt++) {
      apply();
      expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Terrain or the board changed. Review the current map before applying.");
      expect(view.commands).toHaveLength(attempt);
      expect(view.commands.at(-1)).toMatchObject({ type: "scene.setMap", terrainContext: baseline, grid: { unitsPerCell: 10 } });
      expect(view.state()).toEqual(before);
      expect(screen.getByLabelText("Distance per square")).toHaveProperty("value", "10");
      expect(screen.getByRole("button", { name: "Apply map" })).toHaveProperty("disabled", false);
      view.rerender();
    }
  });

  it("applies unchanged context normally with the existing terrain replacement behavior", async () => {
    const view = mount();
    await prepare(source);
    view.rerender(); apply();
    await waitFor(() => expect(view.commands).toHaveLength(1));
    expect(view.commands[0]).toMatchObject({ type: "scene.setMap", terrainContext: baseline });
    expect(view.state().scene.map?.url).toBe(source === "upload" ? "/upload.png" : asset.url);
    expect(view.state().terrain).toEqual(source === "upload" ? undefined : { base: libraryMap.board.terrain, effects: [] });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("preparation entry points retain their baseline (FR-TAC-03, FR-GM-02/03)", () => {
  it("does not apply prepared view or building edits to another GM's replacement map", async () => {
    const view = mount(room({ withMap: false }));
    const send = vi.mocked(view.connection.command).getMockImplementation()!;
    vi.mocked(view.connection.command).mockImplementation(async (command) => {
      const result = await send(command);
      if (command.type === "scene.setMap") view.otherGm({ type: "scene.setMap", map: { url: "/replacement.png", width: 700, height: 700 } });
      return result;
    });
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("radio", { name: "Isometric" }));
    apply();
    await screen.findByText(/Another GM changed the map or scene/);
    expect(view.state().scene.map?.url).toBe("/replacement.png");
    expect(view.state().scene.isometric).not.toBe(true);
    expect(view.commands.map((command) => command.type)).toEqual(["scene.setMap"]);
    expect(screen.getByRole("dialog", { name: "Edit map" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Isometric" }).getAttribute("aria-checked")).toBe("true");
  });
  it("retains outlined buildings when a follow-up save fails while closing, then retries before closing", async () => {
    const view = mount(room({ withMap: false }));
    const send = vi.mocked(view.connection.command).getMockImplementation()!;
    let refuse = true;
    vi.mocked(view.connection.command).mockImplementation(async (command) => {
      if (command.type === "scene.savePreparation" && refuse) {
        refuse = false;
        return { ok: false as const, code: "invalid" as const, message: "Height save refused" };
      }
      return send(command);
    });
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
    fireEvent.click(await screen.findByRole("radio", { name: "Isometric" }));
    fireEvent.click(screen.getByRole("button", { name: "Outline buildings and add height" }));
    const canvas = screen.getByRole("application");
    for (const point of [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]) click(canvas, point);
    fireEvent.click(screen.getByRole("button", { name: "Finish outline" }));
    fireEvent.click(screen.getByLabelText("Close", { exact: true }));
    const applyPrompt = await screen.findByRole("dialog", { name: "Apply this map?" });
    fireEvent.click(within(applyPrompt).getByRole("button", { name: "Apply map" }));
    const retryPrompt = await screen.findByRole("dialog", { name: "Save changes?" });
    expect(screen.getByRole("dialog", { name: "Edit map" })).toBeTruthy();
    expect(view.state().scene.map?.url).toBe(asset.url);
    expect(view.state().scene.isometricBuildings).toBeUndefined();
    fireEvent.click(within(retryPrompt).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(view.state().scene.isometricBuildings?.items).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull());
  });

  it("offers the view choice before a first library map with a saved grid is applied", async () => {
    const view = mount(room({ withMap: false }));
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(asset.name));
    const choice = await screen.findByRole("radio", { name: "Isometric" });
    expect(view.commands).toEqual([]);
    fireEvent.click(choice);
    apply();
    await waitFor(() => expect(view.state().scene.isometric).toBe(true));
    expect(view.state().scene.map?.url).toBe(asset.url);
  });
  it("lets a first map use isometric view before Apply, and persists that view", async () => {
    const view = mount(room({ withMap: false }));
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
    const choice = await screen.findByRole("radio", { name: "Isometric" });
    fireEvent.click(choice);
    expect(view.commands).toEqual([]);
    apply();
    await waitFor(() => expect(view.state().scene.isometric).toBe(true));
    expect(view.commands.map((command) => command.type)).toEqual(["scene.setMap", "scene.savePreparation"]);
    expect(view.state().scene.map?.url).toBe(asset.url);
  });
  it.each([false, true])("captures before decoding and upload, surviving fitting and room rerenders (save to library: %s)", async (saveToLibrary) => {
    const size = deferred<{ width: number; height: number }>();
    const uploaded = deferred<LibraryAsset>();
    const fitted = deferred<GridDetectionStatus | null>();
    vi.mocked(imageFile.imageSize).mockReturnValue(size.promise);
    vi.mocked(api.upload).mockReturnValue(uploaded.promise);
    vi.mocked(api.library.upload).mockReturnValue(uploaded.promise);
    vi.mocked(saveToLibrary ? api.detection.library : api.detection.room).mockReturnValue(fitted.promise);
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    upload(saveToLibrary);
    view.otherGm(paint(view.state()));
    await act(async () => size.resolve({ width: 800, height: 600 }));
    expect(saveToLibrary ? api.library.upload : api.upload).toHaveBeenCalledOnce();
    view.otherGm({ type: "scene.setMap", map: view.state().scene.map! });
    await act(async () => uploaded.resolve(asset));
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    view.otherGm(paint(view.state()));
    await act(async () => fitted.resolve({ status: "suggested", attempt: 1, candidate: { cellSize: 75, offsetX: 5, offsetY: 10 } }));
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "75");
    fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: "90" } });
    view.rerender();
    const before = structuredClone(view.state());
    apply();
    await screen.findByRole("alert");
    expect(view.commands).toEqual([expect.objectContaining({ type: "scene.setMap", terrainContext: baseline, grid: expect.objectContaining({ cellSize: 90 }) })]);
    expect(view.state()).toEqual(before);
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "90");
  });

  it("captures the first library map's baseline when chosen, before view setup", async () => {
    const view = mount({ ...room({ withMap: false }), boardEpoch: 3, terrainRevision: 7 });
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    await screen.findByTitle(asset.name);
    view.otherGm({ type: "scene.setGrid", grid: { ...GRID, cellSize: 100 } });
    const atSelection = context(view.state());
    fireEvent.click(screen.getByTitle(asset.name));
    await screen.findByRole("radio", { name: "Isometric" });
    expect(view.commands).toEqual([]);
    apply();
    await waitFor(() => expect(view.commands).toHaveLength(1));
    expect(view.commands[0]).toMatchObject({ type: "scene.setMap", terrainContext: atSelection, includeLibraryBoard: true });
    expect(view.state().scene.map).toEqual(libraryMap.map);
    expect(view.state().terrain).toEqual({ base: libraryMap.board.terrain, effects: [] });
    await waitFor(() => expect(screen.getByRole("tab", { name: "3 · Walls" }).getAttribute("aria-selected")).toBe("true"));
  });

  it("retains the selection baseline while fitting a library map without a saved grid", async () => {
    const fitted = deferred<GridDetectionStatus | null>();
    vi.mocked(api.library.list).mockResolvedValue([{ ...asset, grid: null }]);
    vi.mocked(api.detection.library).mockReturnValue(fitted.promise);
    const view = mount({ ...room({ withMap: false }), boardEpoch: 3, terrainRevision: 7 });
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(asset.name));
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    view.otherGm({ type: "scene.setGrid", grid: { ...GRID, cellSize: 100 } });
    await act(async () => fitted.resolve({ status: "no_grid", attempt: 1 }));
    const before = structuredClone(view.state());
    apply();
    await screen.findByRole("alert");
    expect(view.commands[0]).toMatchObject({ type: "scene.setMap", terrainContext: baseline, includeLibraryBoard: true });
    expect(view.state()).toEqual(before);
    expect(screen.getByLabelText("Cell size")).toHaveProperty("value", "50");
  });
});
