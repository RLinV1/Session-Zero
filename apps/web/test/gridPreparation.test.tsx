// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, EMPTY_STATS, type GridDetectionStatus, type LibraryAsset } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api, ApiError } from "../src/net/api";
import * as imageFile from "../src/net/imageFile";
import { GmPanel } from "../src/pages/GmPanel";
import { LibraryPage } from "../src/pages/LibraryPage";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { newGridPreparation, newGridSuggestionSession, toGridDraft } from "../src/pages/gridDraft";
import { useGridDetection } from "../src/pages/useGridDetection";
import { useGridPreparation } from "../src/pages/useGridPreparation";
import { fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const asset: LibraryAsset = { id: "pending-map", kind: "map", name: "Pending map", url: "/pending.png", width: 800, height: 600, grid: null, createdAt: "2026-10-26T00:00:00Z" };
const fitted: GridDetectionStatus = { status: "suggested", attempt: 1, candidate: { cellSize: 64.125, offsetX: 7.25, offsetY: 13.5 } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = () => act(async () => {});
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const cell = () => screen.getByLabelText<HTMLInputElement>("Cell size");
function library(selected = asset) {
  const close = vi.fn(); const saved = vi.fn();
  const view = render(<LibraryMapEditor asset={selected} onClose={close} onSaved={saved} />);
  return { ...view, close, saved };
}
function roomEditor(state = room({ withMap: false })) {
  state.scene.grid = { ...DEFAULT_GRID, unitsPerCell: 10, unitLabel: "m", lineColor: "#ffffff", lineWidth: 3, lineOpacity: 0.4 };
  const fake = fakeConnection();
  const view = render(<GmPanel connection={fake.connection} state={state} token={TOKEN}
    gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false} onGridDraftChange={() => {}}
    onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return { ...view, ...fake, state };
}
function signedIn() {
  accountStore.setState({ status: "signedIn", account: { id: "owner", email: "owner@example.com", displayName: "Owner" } });
}
beforeEach(() => {
  stubMapEditorEnvironment();
  accountStore.setState({ status: "signedOut" });
  vi.spyOn(api.library, "board").mockResolvedValue({ walls: [], fog: [] });
  vi.spyOn(api.library, "update").mockImplementation(async (_id, change) => ({ ...asset, ...change }));
  vi.spyOn(api.library, "list").mockResolvedValue([asset]);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
  vi.spyOn(api.detection, "library").mockResolvedValue(null);
  vi.spyOn(api.detection, "room").mockResolvedValue(null);
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
  vi.spyOn(imageFile, "imageSize").mockResolvedValue({ width: 800, height: 600 });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

describe("wait before revealing map setup (FR-GM-03)", () => {
  it("hides the entire editor during lookup, queue and fitting, then first reveals fitted geometry without saving", async () => {
    vi.useFakeTimers();
    const lookup = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValueOnce(lookup.promise)
      .mockResolvedValueOnce({ status: "running", attempt: 1 }).mockResolvedValue(fitted);
    const view = library();
    expect(screen.getByText("Checking grid…").getAttribute("aria-live")).toBe("polite");
    for (const name of ["Cell size", "Distance per square"]) expect(screen.queryByLabelText(name)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("group", { name: "Place grid anchors on the map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Guide$/ })).toBeNull();
    await act(async () => lookup.resolve({ status: "queued", attempt: 1 }));
    expect(screen.getByText("Waiting to fit grid…")).toBeTruthy();
    await advance(1500);
    expect(screen.getByText("Fitting grid…")).toBeTruthy();
    const visibleCells: string[] = [];
    const observer = new MutationObserver(() => {
      const input = screen.queryByLabelText<HTMLInputElement>("Cell size");
      if (input) visibleCells.push(input.value);
    });
    observer.observe(view.container, { subtree: true, childList: true, attributes: true });
    await advance(1500); observer.disconnect();
    expect(visibleCells.length).toBeGreaterThan(0);
    expect(new Set(visibleCells)).toEqual(new Set(["64.125"]));
    expect(cell().value).toBe("64.125");
    expect(screen.getByLabelText("Offset X")).toHaveProperty("value", "7.25");
    expect(screen.getByRole("button", { name: /^Guide$/ })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Place grid anchors on the map" }));
    expect(api.library.update).not.toHaveBeenCalled();
    expect(view.saved).not.toHaveBeenCalled();
    expect(screen.getByText(/Check alignment against the map before saving/)).toBeTruthy();
    expect(api.detection.library).toHaveBeenCalledTimes(3);
  });

  it("reveals a cached estimate as soon as lookup resolves without a delay timer", async () => {
    vi.useFakeTimers();
    vi.mocked(api.detection.library).mockResolvedValue(fitted);
    library(); await flush();
    expect(cell().value).toBe("64.125");
    expect(screen.queryByText("Checking grid…")).toBeNull();
  });

  it("continues waiting beyond 15 seconds while queued/running responses succeed", async () => {
    vi.useFakeTimers();
    vi.mocked(api.detection.library).mockResolvedValue({ status: "queued", attempt: 1 });
    library(); await flush(); await advance(21_000);
    expect(screen.getByText("Waiting to fit grid…")).toBeTruthy();
    expect(screen.queryByLabelText("Cell size")).toBeNull();
    expect(api.detection.library).toHaveBeenCalledTimes(15);
    vi.mocked(api.detection.library).mockResolvedValue({ status: "running", attempt: 1 });
    await advance(18_000);
    expect(screen.getByText("Fitting grid…")).toBeTruthy();
    vi.mocked(api.detection.library).mockResolvedValue(fitted); await advance(1500);
    expect(cell().value).toBe("64.125");
  });

  it.each(["X", "button", "Escape", "backdrop", "cancel"])("%s skips waiting without closing, and a late estimate cannot replace typing or anchors", async (action) => {
    const lookup = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValue(lookup.promise);
    const view = library();
    const dialog = screen.getByRole("dialog", { name: "Set up map" });
    if (action === "X") fireEvent.click(dialog.querySelector(".modal-close")!);
    else if (action === "button") fireEvent.click(screen.getByText("Set up manually"));
    else if (action === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
    else if (action === "cancel") fireEvent(dialog, new Event("cancel", { cancelable: true }));
    else fireEvent.click(dialog);
    expect(view.close).not.toHaveBeenCalled();
    expect(dialog.querySelector(".modal-close")?.getAttribute("aria-label")).toBe("Close");
    const initial = cell().value;
    fireEvent.change(cell(), { target: { value: "71" } });
    fireEvent.change(cell(), { target: { value: initial } });
    const canvas = screen.getByRole("group", { name: "Place grid anchors on the map" });
    fireEvent.keyDown(canvas, { key: "Enter" });
    await act(async () => lookup.resolve(fitted));
    expect(cell().value).toBe(initial);
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy();
    expect(api.library.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(cell().value).toBe("64.125");
  });

  it.each(["completion first", "skip first"])("gives a simultaneous skip precedence: %s", async (order) => {
    const lookup = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValue(lookup.promise);
    library();
    await act(async () => {
      if (order === "completion first") lookup.resolve(fitted);
      fireEvent.click(screen.getByText("Set up manually"));
      if (order === "skip first") lookup.resolve(fitted);
    });
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy();
  });

  it("preserves the dismissed draft when completion was eagerly computed but has not been committed", async () => {
    vi.mocked(api.detection.library).mockResolvedValue(fitted);
    const initial = { draft: toGridDraft(DEFAULT_GRID), preparation: newGridPreparation(true), suggestionSession: newGridSuggestionSession() };
    type Setup = typeof initial;
    const queued: ((current: Setup) => Setup)[] = [];
    let commit!: (next: Setup) => void;
    function ConcurrentEditor() {
      const [setup, setSetup] = useState(initial); commit = setSetup;
      const preparation = useGridPreparation({ source: "library", token: "", id: asset.id, map: asset, enabled: true,
        setup, update: (change) => { queued.push(change); } });
      return preparation.waiting ? <button onClick={preparation.skip}>Manual setup</button>
        : <input aria-label="Cell size" readOnly value={setup.draft.cellSize} />;
    }
    render(<ConcurrentEditor />); await flush();
    // Model React eagerly evaluating an updater, then yielding before committing the new frame.
    const completed = queued.shift()!(initial);
    expect(completed.draft.cellSize).toBe("64.125");
    fireEvent.click(screen.getByRole("button", { name: "Manual setup" }));
    expect(initial.suggestionSession.blocked).toBe(true);
    const skipped = queued.shift()!(completed);
    act(() => commit(skipped));
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
  });

  it.each([
    { outcome: "absent", result: null, notice: null },
    { outcome: "no grid", result: { status: "no_grid", attempt: 1 }, notice: /No grid estimate was found/ },
    { outcome: "terminal error", result: { status: "error", attempt: 1 }, notice: /Grid fitting could not finish/ },
  ] as const)("opens manual setup after $outcome", async ({ result, notice }) => {
    vi.mocked(api.detection.library).mockResolvedValue(result);
    library(); await flush();
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    if (notice) expect(screen.getByText(notice)).toBeTruthy();
    else expect(screen.queryByText(/Set up the grid manually/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("quietly releases denied analysis and stops polling", async () => {
    vi.useFakeTimers();
    vi.mocked(api.detection.library).mockRejectedValue(new ApiError("Denied", 403));
    library(); await flush(); await advance(15_000);
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    expect(screen.queryByText(/Set up the grid manually/)).toBeNull();
    expect(api.detection.library).toHaveBeenCalledOnce();
  });

  it.each(["network failure", "request timeout"])("releases %s and permanently prevents later automatic adoption", async (failure) => {
    vi.useFakeTimers();
    const lookup = deferred<GridDetectionStatus | null>();
    if (failure === "network failure") vi.mocked(api.detection.library).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(fitted);
    else vi.mocked(api.detection.library).mockReturnValueOnce(lookup.promise).mockResolvedValue(fitted);
    library(); await flush();
    if (failure === "request timeout") {
      await advance(9999); expect(screen.queryByLabelText("Cell size")).toBeNull();
      await advance(1);
      expect(vi.mocked(api.detection.library).mock.calls[0]?.[1]?.aborted).toBe(true);
    }
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    expect(screen.getByText(/Grid fitting could not finish/)).toBeTruthy();
    await advance(3000);
    await act(async () => lookup.resolve({ status: "suggested", attempt: 1, candidate: { cellSize: 120, offsetX: 0, offsetY: 0 } }));
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(cell().value).toBe("64.125");
  });

  it("never automatically adopts again after revealing, even across grid-tab remounts", async () => {
    vi.useFakeTimers();
    vi.mocked(api.detection.library).mockResolvedValueOnce({ status: "running", attempt: 1 }).mockResolvedValue(fitted);
    library(); await flush(); fireEvent.click(screen.getByText("Set up manually"));
    const initial = cell().value;
    fireEvent.click(screen.getByRole("tab", { name: /Walls/ }));
    await advance(1500);
    const count = vi.mocked(api.detection.library).mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: /Grid/ })); await flush();
    expect(cell().value).toBe(initial);
    expect(api.detection.library).toHaveBeenCalledTimes(count);
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy();
  });

  it("also bounds a status request after analysis has started running", async () => {
    vi.useFakeTimers();
    const hung = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockResolvedValueOnce({ status: "running", attempt: 1 })
      .mockReturnValueOnce(hung.promise).mockResolvedValue(fitted);
    library(); await flush(); await advance(1500);
    expect(screen.getByText("Fitting grid…")).toBeTruthy();
    await advance(10_000);
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    await advance(3000);
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy();
  });

  it("ignores old target completions and aborts in-flight requests on unmount", async () => {
    const old = deferred<GridDetectionStatus | null>(); const next = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = library();
    view.rerender(<LibraryMapEditor asset={{ ...asset, id: "new", url: "/new.png" }} onClose={view.close} onSaved={view.saved} />);
    expect(vi.mocked(api.detection.library).mock.calls[0]?.[1]?.aborted).toBe(true);
    await act(async () => old.resolve(fitted));
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    view.unmount();
    expect(vi.mocked(api.detection.library).mock.calls[1]?.[1]?.aborted).toBe(true);
    await act(async () => next.resolve(fitted));
    expect(view.close).not.toHaveBeenCalled(); expect(api.library.update).not.toHaveBeenCalled();
  });

  it("bypasses waiting for configured/UVTT library grids even with a hung status request", () => {
    vi.mocked(api.detection.library).mockReturnValue(new Promise(() => {}));
    library({ ...asset, grid: { ...DEFAULT_GRID, cellSize: 90.5 } });
    expect(cell().value).toBe("90.5");
    expect(screen.queryByText("Checking grid…")).toBeNull();
  });

  it("does not poll disabled targets and reports initialLoading separately from absent analysis", async () => {
    function Probe({ enabled }: { enabled: boolean }) {
      const result = useGridDetection("library", "", asset.id, asset.url, enabled);
      return <span>{result.initialLoading ? "initial lookup" : "settled"}</span>;
    }
    const view = render(<Probe enabled={false} />);
    expect(api.detection.library).not.toHaveBeenCalled();
    view.rerender(<Probe enabled />);
    expect(screen.getByText("initial lookup")).toBeTruthy(); await flush();
    expect(screen.getByText("settled")).toBeTruthy();
    expect(api.detection.library).toHaveBeenCalledOnce();
  });

  it("checks afresh when reopening the same target after a failed session", async () => {
    const next = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockRejectedValueOnce(new Error("Offline")).mockReturnValueOnce(next.promise);
    function Probe({ enabled }: { enabled: boolean }) {
      const result = useGridDetection("library", "", asset.id, asset.url, enabled);
      return <span>{result.initialLoading ? "initial lookup" : result.error ?? result.status?.status ?? "settled"}</span>;
    }
    const view = render(<Probe enabled />); await flush();
    expect(screen.getByText("Offline")).toBeTruthy();
    view.rerender(<Probe enabled={false} />); await flush();
    view.rerender(<Probe enabled />);
    expect(screen.getByText("initial lookup")).toBeTruthy();
    await act(async () => next.resolve(fitted));
    expect(screen.getByText("suggested")).toBeTruthy();
  });
});

describe("upload and room preparation entry points (FR-GM-03, KAN-59)", () => {
  it("starts the loading step after a library raster upload", async () => {
    signedIn();
    vi.mocked(api.library.list).mockResolvedValue([]);
    vi.spyOn(api.library, "upload").mockResolvedValue(asset);
    vi.mocked(api.detection.library).mockReturnValue(new Promise(() => {}));
    render(<LibraryPage />);
    fireEvent.change(screen.getByLabelText("Upload map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
    await flush();
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    expect(screen.queryByLabelText("Cell size")).toBeNull();
    expect(api.library.update).not.toHaveBeenCalled();
  });

  it.each([false, true])("fits a room raster upload with save-to-library=%s privately before explicit Apply", async (saveToLibrary) => {
    if (saveToLibrary) signedIn();
    const lookup = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.library, "upload").mockResolvedValue(asset);
    vi.spyOn(api, "upload").mockResolvedValue({ url: asset.url });
    vi.mocked(saveToLibrary ? api.detection.library : api.detection.room).mockReturnValue(lookup.promise);
    const fake = roomEditor();
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["image"], "map.png", { type: "image/png" })] } });
    await flush();
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply map" })).toBeNull();
    expect(fake.commands).toEqual([]);
    await act(async () => lookup.resolve(fitted));
    expect(cell().value).toBe("64.125");
    expect(screen.getByLabelText("Distance per square")).toHaveProperty("value", "10");
    expect(fake.commands).toEqual([]); expect(api.library.update).not.toHaveBeenCalled();
    if (saveToLibrary) {
      expect(api.detection.library).toHaveBeenCalledWith(asset.id, expect.any(AbortSignal));
      expect(api.detection.room).not.toHaveBeenCalled();
    } else expect(api.detection.room).toHaveBeenCalledWith("r1", TOKEN, asset.url, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Apply map" })); await flush();
    expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", grid: expect.objectContaining({
      cellSize: 64.125, offsetX: 7.25, offsetY: 13.5, unitsPerCell: 10, unitLabel: "m", lineColor: "#ffffff", lineWidth: 3, lineOpacity: 0.4,
    }) })]);
  });

  it("keeps fitted setup private through the token-placement dialog and retains the Sight step", async () => {
    signedIn();
    const lookup = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValue(lookup.promise);
    const state = room();
    state.tokens.hero = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0,
      color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
    const fake = roomEditor(state);
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    fireEvent.click(within(editor).getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(asset.name)); await flush();
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    await act(async () => lookup.resolve(fitted));
    expect(cell().value).toBe("64.125");
    expect(within(editor).getByRole("tab", { name: "5 · Sight" })).toBeTruthy();
    fireEvent.click(within(editor).getByRole("button", { name: "Apply map" })); await flush();
    const policy = within(screen.getByRole("dialog", { name: "Tokens already on the table" }));
    expect(fake.commands).toEqual([]); expect(api.library.update).not.toHaveBeenCalled();
    fireEvent.click(policy.getByRole("radio", { name: /^Keep positions/ }));
    fireEvent.click(policy.getByRole("button", { name: "Apply map" })); await flush();
    expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", tokenPolicy: "keep",
      map: expect.objectContaining({ assetId: asset.id }), grid: expect.objectContaining({
        cellSize: 64.125, offsetX: 7.25, offsetY: 13.5, unitsPerCell: 10, unitLabel: "m",
        lineColor: "#ffffff", lineWidth: 3, lineOpacity: 0.4,
      }) })]);
  });

  it.each(["X", "button", "Escape", "backdrop"])("%s in room loading preserves private preparation and blocks delayed completion", async (action) => {
    signedIn(); const lookup = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockReturnValue(lookup.promise);
    const fake = roomEditor();
    fireEvent.click(screen.getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(asset.name)); await flush();
    const dialog = screen.getByRole("dialog", { name: "Edit map" });
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    if (action === "X") fireEvent.click(dialog.querySelector(".modal-close")!);
    else if (action === "button") fireEvent.click(screen.getByText("Set up manually"));
    else if (action === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
    else fireEvent.click(dialog);
    const initial = cell().value;
    await act(async () => lookup.resolve(fitted));
    expect(cell().value).toBe(initial); expect(fake.commands).toEqual([]);
    expect(api.detection.library).toHaveBeenCalledWith(asset.id, expect.any(AbortSignal));
    expect(api.detection.room).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText("Close"));
    expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull();
    expect(fake.commands).toEqual([]);
  });

  it("uses a configured/shipped library calibration without waiting", async () => {
    signedIn(); vi.mocked(api.library.list).mockResolvedValue([{ ...asset, grid: DEFAULT_GRID }]);
    const fake = roomEditor();
    fireEvent.click(screen.getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(asset.name)); await flush();
    expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", grid: DEFAULT_GRID })]);
    expect(api.detection.library).not.toHaveBeenCalled();
  });

  it("resets preparation on another room selection and ignores the old pending result", async () => {
    signedIn();
    const nextAsset = { ...asset, id: "next-map", name: "Next map", url: "/next.png" };
    vi.mocked(api.library.list).mockResolvedValue([asset, nextAsset]);
    const old = deferred<GridDetectionStatus | null>(); const next = deferred<GridDetectionStatus | null>();
    vi.mocked(api.detection.library).mockImplementation((id) => id === asset.id ? old.promise : next.promise);
    const fake = roomEditor();
    fireEvent.click(screen.getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(asset.name)); await flush();
    fireEvent.click(screen.getByText("Set up manually"));
    fireEvent.click(screen.getByRole("tab", { name: /· Map$/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Edit map" })).getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(nextAsset.name)); await flush();
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    await act(async () => old.resolve({ status: "suggested", attempt: 1, candidate: { cellSize: 120, offsetX: 0, offsetY: 0 } }));
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    await act(async () => next.resolve(fitted));
    expect(cell().value).toBe("64.125");
    expect(api.detection.library).toHaveBeenCalledTimes(2); expect(fake.commands).toEqual([]);
  });

  it.each(["network failure", "denied", "timeout", "pending"])("starts a fresh room lookup when returning through an unresolved target after %s", async (outcome) => {
    signedIn(); vi.useFakeTimers();
    const nextAsset = { ...asset, id: "next-map", name: "Next map", url: "/next.png" };
    vi.mocked(api.library.list).mockResolvedValue([asset, nextAsset]);
    const old = deferred<GridDetectionStatus | null>();
    const next = deferred<GridDetectionStatus | null>();
    const reopened = deferred<GridDetectionStatus | null>();
    let assetLookups = 0;
    vi.mocked(api.detection.library).mockImplementation((id) => {
      if (id === nextAsset.id) return next.promise;
      if (++assetLookups > 1) return reopened.promise;
      if (outcome === "network failure") return Promise.reject(new Error("Offline"));
      if (outcome === "denied") return Promise.reject(new ApiError("Denied", 403));
      return old.promise;
    });
    const fake = roomEditor();
    const choose = async (selected: LibraryAsset, fromEditor = false) => {
      if (fromEditor) {
        const dialog = screen.getByRole("dialog", { name: "Edit map" });
        fireEvent.click(within(dialog).getByRole("tab", { name: /· Map$/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "From library" }));
      } else fireEvent.click(screen.getByRole("button", { name: "From library" }));
      await flush();
      fireEvent.click(screen.getByTitle(selected.name)); await flush();
    };
    await choose(asset);
    if (outcome === "timeout") await advance(10_000);
    if (outcome === "pending") fireEvent.click(screen.getByText("Set up manually"));
    expect(cell().value).toBe(String(DEFAULT_GRID.cellSize));

    await choose(nextAsset, true);
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    fireEvent.click(screen.getByText("Set up manually"));
    await choose(asset, true);
    expect(assetLookups).toBe(2);
    expect(api.detection.library).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.detection.library).mock.calls.slice(0, 2).every((call) => call[1]?.aborted)).toBe(true);
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    expect(screen.queryByLabelText("Cell size")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply map" })).toBeNull();

    // Superseded requests may ignore abort and complete after the same asset is active again.
    await act(async () => {
      old.resolve({ status: "suggested", attempt: 1, candidate: { cellSize: 120, offsetX: 0, offsetY: 0 } });
      next.resolve({ status: "no_grid", attempt: 1 });
    });
    expect(screen.getByText("Checking grid…")).toBeTruthy();
    expect(screen.queryByLabelText("Cell size")).toBeNull();

    const visibleCells: string[] = [];
    const observer = new MutationObserver(() => {
      const input = screen.queryByLabelText<HTMLInputElement>("Cell size");
      if (input) visibleCells.push(input.value);
    });
    observer.observe(fake.container, { subtree: true, childList: true, attributes: true });
    try {
      await act(async () => reopened.resolve(fitted));
    } finally { observer.disconnect(); }
    expect(visibleCells.length).toBeGreaterThan(0);
    expect(new Set(visibleCells)).toEqual(new Set(["64.125"]));
    expect(cell().value).toBe("64.125");
    expect(screen.getByLabelText("Distance per square")).toHaveProperty("value", "10");
    expect(screen.getByLabelText("Distance unit")).toHaveProperty("value", "m");
    expect(fake.commands).toEqual([]); expect(api.library.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply map" })); await flush();
    expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", map: expect.objectContaining({ assetId: asset.id }),
      grid: expect.objectContaining({ cellSize: 64.125, offsetX: 7.25, offsetY: 13.5,
        unitsPerCell: 10, unitLabel: "m", lineColor: "#ffffff", lineWidth: 3, lineOpacity: 0.4 }) })]);
  });

  it("keeps room polling and the manual latch across grid-tab remounts", async () => {
    signedIn();
    vi.useFakeTimers();
    vi.mocked(api.detection.library).mockResolvedValueOnce({ status: "running", attempt: 1 }).mockResolvedValue(fitted);
    const fake = roomEditor();
    fireEvent.click(screen.getByRole("button", { name: "From library" })); await flush();
    fireEvent.click(screen.getByTitle(asset.name)); await flush();
    fireEvent.click(screen.getByText("Set up manually"));
    const initial = cell().value;
    fireEvent.click(screen.getByRole("tab", { name: /· Map$/ }));
    await advance(1500);
    fireEvent.click(screen.getByRole("tab", { name: /· Grid$/ })); await flush();
    expect(cell().value).toBe(initial);
    expect(api.detection.library).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Use suggestion" })).toBeTruthy(); expect(fake.commands).toEqual([]);
  });

  it("opens UVTT setup with supplied geometry while analysis is disabled", async () => {
    vi.spyOn(api.uvtt, "prepare").mockResolvedValue({ id: "uvtt", revision: 1,
      map: { url: asset.url, width: 800, height: 600 }, grid: { ...DEFAULT_GRID, cellSize: 50.25 }, walls: [], diagnostics: [] });
    const fake = roomEditor();
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["uvtt"], "map.dd2vtt")] } });
    await flush();
    expect(cell().value).toBe("50.25");
    expect(screen.queryByText("Checking grid…")).toBeNull();
    expect(api.detection.library).not.toHaveBeenCalled(); expect(api.detection.room).not.toHaveBeenCalled();
    expect(fake.commands).toEqual([]);
  });
});
