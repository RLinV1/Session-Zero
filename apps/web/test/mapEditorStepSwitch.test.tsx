// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridSpec } from "@vtt/shared";
import { api } from "../src/net/api";
import { toGridDraft, type GridDraft } from "../src/pages/gridDraft";
import { GmPanel } from "../src/pages/GmPanel";
import { GRID, MAP_URL, TOKEN, fakeConnection, room, stubMapEditorEnvironment } from "./mapEditorHarness";

// The panels below the map section have nothing to do with the editor.
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The GM panel on a room with a map; `gridDraft` stands in for grid edits kept by the room page. */
function mount(gridDraft: GridDraft | null = null) {
  const fake = fakeConnection();
  const onGridApply = vi.fn(async (_grid: GridSpec) => true);
  const onGridDraftCancel = vi.fn();
  render(
    <GmPanel
      connection={fake.connection} state={room()} token={TOKEN}
      gridDraft={gridDraft ?? toGridDraft(GRID)} hasGridDraft={gridDraft !== null}
      onGridDraftChange={() => {}} onGridDraftCancel={onGridDraftCancel} onGridApply={onGridApply}
      gridApplying={false} gridError={null} onReviewDeparture={() => {}}
    />,
  );
  return { ...fake, onGridApply, onGridDraftCancel };
}

const editor = () => screen.getByRole("dialog", { name: "Edit map" });
const tab = (name: string) => within(editor()).getByRole("tab", { name });
const selected = (name: string) => tab(name).getAttribute("aria-selected") === "true";

/** Opens Manage Fog and fogs the whole map, in the draft. */
function fogInDraft() {
  fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "4 · Fog" }));
  fireEvent.click(within(editor()).getByRole("button", { name: "Fog whole map" }));
}

describe("map editor step switching (FR-GM-09, FR-GM-17)", () => {
  it("asks before leaving Fog with unsaved fog, and Keep editing stays put", async () => {
    const fake = mount();
    fogInDraft();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(tab("3 · Walls"));
    const ask = screen.getByRole("dialog", { name: "Save changes?" });
    expect(selected("4 · Fog")).toBe(true);

    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save changes?" })).toBeNull());
    expect(selected("4 · Fog")).toBe(true);
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    expect(fake.commands).toEqual([]);
  });

  it("Discard drops the fog and switches without sending anything", async () => {
    const fake = mount();
    fogInDraft();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(tab("3 · Walls"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(selected("3 · Walls")).toBe(true));
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    expect(fake.commands).toEqual([]);
  });

  it("Save sends the fog, then switches", async () => {
    const fake = mount();
    fogInDraft();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(tab("3 · Walls"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(selected("3 · Walls")).toBe(true));
    expect(fake.commands).toEqual([
      { type: "fog.replace", expectedSceneId: "initial", expectedMapUrl: MAP_URL, removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 800, y: 600 } }] },
    ]);
  });

  it("asks about grid changes when leaving Grid, and Apply grid applies them before switching", async () => {
    const { onGridApply } = mount({ ...toGridDraft(GRID), cellSize: "80" });
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    fireEvent.click(tab("3 · Walls"));
    const ask = screen.getByRole("dialog", { name: "Apply grid changes?" });
    expect(selected("2 · Grid")).toBe(true);

    fireEvent.click(within(ask).getByRole("button", { name: "Apply grid" }));
    await waitFor(() => expect(selected("3 · Walls")).toBe(true));
    expect(onGridApply).toHaveBeenCalledOnce();
    expect(onGridApply.mock.calls[0]?.[0]).toMatchObject({ ...GRID, cellSize: 80 });
  });

  it("doesn't ask when the edited grid matches the map's grid", () => {
    mount(toGridDraft(GRID));
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    fireEvent.click(tab("3 · Walls"));
    expect(screen.queryByRole("dialog", { name: "Apply grid changes?" })).toBeNull();
    expect(selected("3 · Walls")).toBe(true);
  });

  it("asks about grid changes when closing instead of dropping them", async () => {
    const { onGridDraftCancel } = mount({ ...toGridDraft(GRID), cellSize: "80" });
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    fireEvent.click(within(editor()).getByRole("button", { name: "Close" }));
    const ask = screen.getByRole("dialog", { name: "Apply grid changes?" });
    expect(onGridDraftCancel).not.toHaveBeenCalled();

    fireEvent.click(within(ask).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull());
    expect(onGridDraftCancel).toHaveBeenCalled();
  });

  it("switches freely when nothing is unsaved", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    for (const name of ["3 · Walls", "4 · Fog", "1 · Map", "2 · Grid"]) {
      fireEvent.click(tab(name));
      expect(selected(name)).toBe(true);
    }
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
