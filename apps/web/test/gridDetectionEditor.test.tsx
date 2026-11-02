// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type GridDetectionStatus } from "@vtt/shared";
import { api, ApiError } from "../src/net/api";
import { GridActionsContext } from "../src/pages/GridActionsContext";
import { GridForm } from "../src/pages/GridForm";
import { newGridSuggestionSession, toGridDraft, withGridSuggestion } from "../src/pages/gridDraft";
import { useGridDetection } from "../src/pages/useGridDetection";

const candidate = { cellSize: 64, offsetX: 7, offsetY: 13 };
const map = { url: "/uploads/map.png", width: 768, height: 648 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom has no layout; the editor's map preview only needs the observer to exist.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("GM grid suggestion editor (FR-GM-03)", () => {
  it("prefills untouched geometry once, preserves style/units and never saves automatically", async () => {
    const apply = vi.fn(async () => {});
    const session = newGridSuggestionSession();
    function Editor({ result = candidate }: { result?: typeof candidate }) {
      const [draft, setDraft] = useState(() => toGridDraft({ ...DEFAULT_GRID, unitsPerCell: 10, lineColor: "#ffffff", lineWidth: 3 }));
      return <GridForm grid={DEFAULT_GRID} map={map} draft={draft} hasDraft onChange={setDraft}
        onApply={apply} onCancel={() => {}} applying={false} error={null} autoSuggest suggestionSession={session}
        detection={{ status: "suggested", attempt: 1, candidate: result }} />;
    }
    const view = render(<Editor />);
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("64");
    expect((screen.getByLabelText("Distance per square") as HTMLInputElement).value).toBe("10");
    expect(apply).not.toHaveBeenCalled();
    view.rerender(<Editor result={{ ...candidate, cellSize: 82 }} />);
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("64");
    fireEvent.click(screen.getByRole("button", { name: "Apply grid" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({ unitsPerCell: 10, lineWidth: 3, lineColor: "#ffffff" })));
  });

  it.each(["typing", "discard", "start over", "save", "saved grid"])("blocks a delayed automatic estimate after %s", async (action) => {
    const pending = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.detection, "library").mockReturnValue(pending.promise);
    const session = newGridSuggestionSession();
    function Editor() {
      const [draft, setDraft] = useState(() => toGridDraft(DEFAULT_GRID));
      const detection = useGridDetection("library", "", "map-id");
      return <GridForm grid={DEFAULT_GRID} map={map} draft={draft} hasDraft onChange={setDraft}
        onApply={async () => {}} onCancel={() => setDraft(toGridDraft(DEFAULT_GRID))} applying={false} error={null}
        allowUnchanged autoSuggest={action !== "saved grid"} suggestionSession={session} detection={detection.status}
        onUseSuggestion={(value) => setDraft((current) => withGridSuggestion(current, value))} />;
    }
    render(<Editor />);
    if (action === "typing") {
      // Returning to equal values still expresses manual intent.
      fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: "71" } });
      fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: String(DEFAULT_GRID.cellSize) } });
    } else if (action === "discard") fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    else if (action === "start over") fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    else if (action === "save") fireEvent.click(screen.getByRole("button", { name: "Apply grid" }));
    await act(async () => pending.resolve({ status: "suggested", attempt: 1, candidate }));
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe(String(DEFAULT_GRID.cellSize));
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("64");
  });

  it("stops polling when analysis is absent", async () => {
    const poll = vi.spyOn(api.detection, "library").mockResolvedValue(null);
    function Probe() { useGridDetection("library", "", "absent"); return null; }
    vi.useFakeTimers();
    try {
      render(<Probe />);
      await act(async () => {});
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(poll).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("stops denied polling and exposes access loss so the editor permanently blocks automatic replacement", async () => {
    const poll = vi.spyOn(api.detection, "library").mockRejectedValue(new ApiError("GM only", 403));
    function Probe() {
      const result = useGridDetection("library", "", "denied");
      return <div>{result.accessDenied ? "denied" : "checking"}</div>;
    }
    vi.useFakeTimers();
    try {
      render(<Probe />);
      await act(async () => {});
      expect(screen.getByText("denied")).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(poll).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("leaves a dirty draft untouched on arrival and copies only alignment after Use suggestion", async () => {
    const pending = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.detection, "library").mockReturnValue(pending.promise);
    const apply = vi.fn(async () => {});
    const cancel = vi.fn();

    function Editor() {
      const [draft, setDraft] = useState(() => toGridDraft({
        ...DEFAULT_GRID, unitsPerCell: 10, unitLabel: "ft", lineColor: "#ffffff", lineWidth: 3,
      }));
      const detection = useGridDetection("library", "gm-token", "map-id");
      return <GridForm
        grid={DEFAULT_GRID} map={map} draft={draft} hasDraft
        onChange={setDraft} onApply={apply} onCancel={cancel} applying={false} error={null}
        detection={detection.status} detectionError={detection.error}
        onUseSuggestion={(value) => setDraft((current) => withGridSuggestion(current, value))}
      />;
    }

    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: "71" } });
    await act(async () => pending.resolve({ status: "suggested", attempt: 1, candidate }));
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("71");
    expect(screen.getByText(/Check alignment against the map/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("64");
    expect((screen.getByLabelText("Offset X") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Distance per square") as HTMLInputElement).value).toBe("10");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply grid" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      cellSize: 64, offsetX: 7, offsetY: 13, unitsPerCell: 10, lineColor: "#ffffff", lineWidth: 3,
    })));
  });

  it("ignores a superseded map response", async () => {
    const old = deferred<GridDetectionStatus | null>();
    const next = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.detection, "library").mockImplementation((id) => id === "old" ? old.promise : next.promise);
    function Probe({ id }: { id: string }) {
      const detection = useGridDetection("library", "gm-token", id);
      return <div>{detection.status?.status ?? "pending"}</div>;
    }
    const view = render(<Probe id="old" />);
    view.rerender(<Probe id="new" />);
    expect(screen.getByText("pending")).toBeTruthy();
    await act(async () => next.resolve({ status: "no_grid", attempt: 1 }));
    await act(async () => old.resolve({ status: "suggested", attempt: 1, candidate }));
    expect(screen.getByText("no_grid")).toBeTruthy();
  });

  it.each<{ label: string; detection: GridDetectionStatus; detectionError: string | null }>([
    { label: "no reliable grid", detection: { status: "no_grid", attempt: 1 }, detectionError: null },
    { label: "analysis error", detection: { status: "error", attempt: 1 }, detectionError: null },
    { label: "polling error", detection: { status: "running", attempt: 1 }, detectionError: "Could not check analysis" },
  ])("silently keeps manual alignment available after $label", async ({ detection, detectionError }) => {
    const apply = vi.fn(async () => {});
    function Editor({ finished = false, error = null }: { finished?: boolean; error?: string | null }) {
      const [draft, setDraft] = useState(() => toGridDraft(DEFAULT_GRID));
      return <GridForm
        grid={DEFAULT_GRID} map={map} draft={draft} hasDraft advancedOpen
        onChange={setDraft} onCancel={vi.fn()} onApply={apply} applying={false} error={error}
        detection={finished ? detection : { status: "running", attempt: 1 }}
        detectionError={finished ? detectionError : null}
      />;
    }
    const form = render(<Editor />);
    expect(screen.getByText("Analyzing the map grid…")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: "71" } });
    form.rerender(<Editor finished />);
    expect(form.container.querySelector(".grid-suggestion")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect((screen.getByLabelText("Cell size") as HTMLInputElement).value).toBe("71");
    fireEvent.click(screen.getByRole("button", { name: "Apply grid" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({ cellSize: 71 })));

    form.rerender(<Editor finished error="Could not save the grid" />);
    expect(screen.getByRole("alert").textContent).toBe("Could not save the grid");
  });
});

it.each([
  { submitLabel: "Apply grid", cancelLabel: "Cancel", saveLabel: "Save changes", closeLabel: "Discard" },
  { submitLabel: "Apply map", cancelLabel: "Close", saveLabel: "Apply map", closeLabel: "Close" },
  { submitLabel: "Save grid", cancelLabel: "Cancel", saveLabel: "Save grid", closeLabel: "Discard" },
])("keeps $saveLabel and $closeLabel actions in the header", async ({ submitLabel, cancelLabel, saveLabel, closeLabel }) => {
  const apply = vi.fn(async () => {});
  function Editor() {
    const [slot, setSlot] = useState<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState(() => toGridDraft(DEFAULT_GRID));
    return <>
      <header><div ref={setSlot} /></header>
      <GridActionsContext.Provider value={slot}>
        <GridForm grid={DEFAULT_GRID} map={map} draft={draft} hasDraft onChange={setDraft}
          onApply={apply} onCancel={() => {}} applying={false} error={null} submitLabel={submitLabel} cancelLabel={cancelLabel} />
      </GridActionsContext.Provider>
    </>;
  }
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Distance per square"), { target: { value: "10" } });
  const save = screen.getByRole("button", { name: saveLabel });
  expect(screen.getByRole("button", { name: closeLabel }).closest("header")).toBeTruthy();
  expect(save.closest("header")).toBeTruthy();
  expect(screen.getByText("Unsaved changes: only you see them").closest("header")).toBeTruthy();
  fireEvent.click(save);
  await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({ unitsPerCell: 10 })));
});
