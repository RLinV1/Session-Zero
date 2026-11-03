// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command, decide, reduce, type GridSpec } from "@vtt/shared";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { api } from "../src/net/api";
import { room, fakeConnection, stubMapEditorEnvironment } from "./mapEditorHarness";
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));
beforeEach(() => { stubMapEditorEnvironment(); vi.spyOn(api.detection, "room").mockResolvedValue(null); vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const fake = fakeConnection(); let committed = room();
  const gm = { id: "g", role: "gm" as const, displayName: "GM" };
  Object.defineProperty(fake.connection, "snapshot", { get: () => ({ state: committed }) });
  const apply = vi.fn(async (_grid: GridSpec) => true);
  function Harness() {
    const [state, setState] = useState(committed), [draft, setDraft] = useState(toGridDraft(state.scene.grid));
    fake.connection.command = vi.fn(async (input) => {
      fake.commands.push(input); const result = decide(committed, gm, Command.parse(input), { newId: () => "id" });
      if (!result.ok) return result;
      committed = result.events.reduce((s, e) => reduce(s, e), committed); setState(committed);
      return { ok: true as const, seq: null };
    });
    return <GmPanel connection={fake.connection} state={state} token="gm-token" gridDraft={draft} hasGridDraft={true} onGridDraftChange={setDraft} onGridDraftCancel={() => {}} onGridApply={async (grid) => { await apply(grid); committed = { ...committed, scene: { ...committed.scene, grid } }; setState(committed); return true; }} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
  fireEvent.click(screen.getByRole("tab", { name: "6 · Terrain" }));
  const canvas = screen.getByRole("application", { name: "Terrain preparation canvas" });
  fireEvent.keyDown(canvas, { key: "Enter" }); fireEvent.keyDown(canvas, { key: "Enter" });
  return { ...fake, apply, committed: () => committed };
}
const editGrid = () => {
  fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
  const ask = screen.getByRole("dialog", { name: "Save changes?" });
  fireEvent.click(within(ask).getByRole("button", { name: "Keep draft and edit grid" }));
};
const saveGrid = () => fireEvent.click(document.querySelector('button[type="submit"][form]')!);

describe("private terrain across grid editing (FR-GM-15, FR-REC-02)", () => {
  it.each(["units", "style"])("keeps private terrain through a %s-only form-associated grid save", async (kind) => {
    const fake = mount(); await screen.findByRole("button", { name: "Save changes" });
    expect(fake.commands).toEqual([]); editGrid();
    if (kind === "units") fireEvent.change(screen.getByLabelText("Distance per square"), { target: { value: "10" } });
    else fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), { target: { value: "60" } });
    saveGrid(); await waitFor(() => expect(fake.apply).toHaveBeenCalledOnce());
    expect(fake.committed().terrain).toBeUndefined();
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "6 · Terrain" }));
    expect(screen.getAllByText("×2").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.committed().terrain?.base).toEqual([{ row: 0, start: 0, end: 0, kind: "difficult" }]));
    expect(fake.commands).toHaveLength(1);
  });
  it("guards Terrain navigation and refuses implicit private resets on geometry apply", async () => {
    const fake = mount(); await screen.findByRole("button", { name: "Save changes" });
    fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    const ask = screen.getByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("tab", { name: "6 · Terrain" }).getAttribute("aria-selected")).toBe("true");
    editGrid(); fireEvent.change(screen.getByLabelText("Cell size"), { target: { value: "100" } }); saveGrid();
    await screen.findByText("Save or discard private terrain before changing grid spacing or origin.");
    expect(fake.apply).not.toHaveBeenCalled(); expect(fake.commands).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).find((button) => button.parentElement?.querySelector('button[type="button"]:not(.secondary)'))!);
    saveGrid(); await waitFor(() => expect(fake.apply).toHaveBeenCalledOnce());
  });
});
