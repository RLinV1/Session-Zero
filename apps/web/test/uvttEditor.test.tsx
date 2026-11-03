// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, EMPTY_STATS, reduce, type RoomState, type UvttPreparation } from "@vtt/shared";
import { api } from "../src/net/api";
import type { CommandResult } from "../src/net/roomConnection";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { WallProperties } from "../src/pages/mapEditor/WallProperties";
import { draftConnection } from "../src/pages/mapEditor/draftConnection";
import { draftFrom, planDraftSave } from "../src/pages/mapEditor/mapDraft";
import { startUvttPrep, prepDirty } from "../src/pages/mapPrep";
import { fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));
const preparation: UvttPreparation = { id: "opaque", revision: 1, map: { url: "/uploads/import.png", width: 800, height: 600 },
  grid: { ...DEFAULT_GRID, cellSize: 50, offsetX: 12.5, offsetY: 4.5 },
  walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, uvttPortal: { position: { x: 40, y: 60 }, rotation: 1.3, closed: true, freestanding: true } }],
  diagnostics: [{ code: "unsupported_data", path: "lights", message: "Lights not imported", severity: "warning" }],
};
beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.uvtt, "prepare").mockResolvedValue(structuredClone(preparation));
  vi.spyOn(api.uvtt, "discard").mockResolvedValue();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(state = room()) {
  const fake = fakeConnection();
  const panel = (next: RoomState) => <GmPanel connection={fake.connection} state={next} token={TOKEN} gridDraft={toGridDraft(next.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />;
  const view = render(panel(state));
  return { ...fake, rerender: (next: RoomState) => view.rerender(panel(next)) };
}
async function importFile() {
  fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
  fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["json"], "map.dd2vtt")] } });
  await screen.findByText(/Unsaved changes: only you see them/);
}

describe("private UVTT editor (FR-GM-06/07/09/12)", () => {
  it("keeps full wall edits and fog reshaping in the same private room draft", async () => {
    const state = room({ walls: [{ ...preparation.walls[0]!, id: "wall" }], fog: [{ id: "fog", shape: "rect", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }] }] });
    const before = structuredClone(state);
    const fake = fakeConnection();
    let draft = draftFrom(state);
    const local = draftConnection(fake.connection, (change) => { draft = change(draft); }, async () => { throw new Error("Detection is not needed."); }, state.scene.map!.url, state.scene.map!, () => true);
    const wall = { ...draft.walls.wall!, b: { x: 210, y: 100 } };
    const points = [{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 50 }];
    expect(await local.command({ type: "wall.update", wall })).toMatchObject({ ok: true });
    expect(await local.command({ type: "fog.replace", removeIds: ["fog"], add: [{ shape: "polygon", points }] })).toMatchObject({ ok: true });
    expect(fake.commands).toEqual([]);
    expect(state).toEqual(before);
    expect(draft.walls.wall).toEqual(wall);
    expect(draft.walls.wall!.uvttPortal).toEqual(preparation.walls[0]!.uvttPortal);
    expect(draft.fog.fog).toBeUndefined();
    expect(Object.values(draft.fog)).toEqual([expect.objectContaining({ shape: "polygon", points })]);
    expect(planDraftSave(state, draft).map((command) => command.type)).toEqual(["wall.update", "fog.replace"]);
  });
  it("preserves validated fractional offsets without legacy normalization and tracks geometry edits", () => {
    const prep = startUvttPrep(preparation); expect(prep.initial).toEqual(preparation.grid); expect(prepDirty(prep)).toBe(false);
    prep.walls = {}; expect(prepDirty(prep)).toBe(true);
  });
  it("keeps imports and portal edits local, validates a revised draft then applies only its opaque reference", async () => {
    vi.mocked(api.uvtt.prepare).mockResolvedValue({ ...structuredClone(preparation), walls: [...preparation.walls, { a: { x: 200, y: 100 }, b: { x: 700, y: 100 }, source: "line_of_sight" }] });
    const fake = mount(); await importFile();
    expect(fake.commands).toEqual([]);
    expect(screen.getByText("1 import warnings")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    expect((screen.getByLabelText("Door position X") as HTMLInputElement).value).toBe("40");
    fireEvent.click(screen.getByLabelText("Closed (blocks movement)"));
    fireEvent.change(screen.getByLabelText("End B X"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(fake.commands).toEqual([]);
    expect(screen.getByRole("application").querySelector('line[x1="250"][x2="700"][y1="100"]')).toBeTruthy();
    const revise = vi.spyOn(api.uvtt, "revise").mockImplementation(async (_room, _token, _id, edit) => ({ ...preparation, ...edit, revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 2 }]));
    expect(revise.mock.calls[0]?.[3].walls[0]).toMatchObject({ b: { x: 250, y: 100 }, uvttPortal: { closed: false, freestanding: true, rotation: 1.3, position: { x: 40, y: 60 } } });
  });
  it("keeps a rejected unchanged draft for idempotent retry without revising it", async () => {
    const fake = mount();
    vi.mocked(fake.connection.command).mockResolvedValueOnce({ ok: false, code: "invalid", message: "Could not save. Draft kept." }).mockResolvedValue({ ok: true, seq: 3 });
    const revise = vi.spyOn(api.uvtt, "revise"); await importFile();
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save. Draft kept.");
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.connection.command).toHaveBeenCalledTimes(2));
    expect(revise).not.toHaveBeenCalled();
  });
  it("requires discard confirmation for changed draft geometry, deletes preparation and returns focus", async () => {
    mount(); await importFile();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Erase" }));
    // Selecting geometry and saving a change is keyboard accessible too.
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    fireEvent.click(screen.getByLabelText("Closed (blocks movement)")); fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const discard = await screen.findByRole("button", { name: "Discard" }); fireEvent.click(discard);
    await waitFor(() => expect(api.uvtt.discard).toHaveBeenCalledWith("r1", TOKEN, "opaque"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit map" })));
  });
  it("switches between Grid and Walls with edited UVTT geometry without applying it", async () => {
    const fake = mount(); await importFile();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    fireEvent.click(screen.getByLabelText("Closed (blocks movement)"));
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    fireEvent.click(screen.getByRole("tab", { name: /· Grid$/ }));
    expect(screen.getByRole("tab", { name: /· Grid$/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    expect(screen.getByLabelText("Closed (blocks movement)")).toHaveProperty("checked", false);
    expect(screen.queryByRole("dialog", { name: "Apply this map?" })).toBeNull();
    expect(fake.commands).toEqual([]);
  });
  it("retains a rejected import in the step-switch prompt and enters Fog only after successful Apply", async () => {
    const fake = mount(); await importFile();
    const send = vi.mocked(fake.connection.command);
    send.mockResolvedValueOnce({ ok: false, code: "invalid", message: "Import refused. Draft kept." }).mockResolvedValue({ ok: true, seq: 3 });
    const revise = vi.spyOn(api.uvtt, "revise");
    fireEvent.click(screen.getByRole("tab", { name: /· Fog$/ }));
    const prompt = screen.getByRole("dialog", { name: "Apply this map?" });
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(prompt).getByRole("button", { name: "Apply map" }));
    expect(await within(prompt).findByRole("alert")).toHaveProperty("textContent", "Import refused. Draft kept.");
    expect(screen.getByRole("tab", { name: /· Grid$/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Unsaved changes: only you see them/)).toBeTruthy();
    fireEvent.click(within(prompt).getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /· Fog$/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.queryByRole("dialog", { name: "Apply this map?" })).toBeNull();
    expect(send.mock.calls).toEqual([
      [{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 1 }],
      [{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 1 }],
    ]);
    expect(revise).not.toHaveBeenCalled();
  });
  it("uses KAN-67 token policy on import and explicitly designates a window while retaining metadata", async () => {
    const state = room();
    state.tokens.hero = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
    const fake = mount(state); await importFile();
    expect(screen.queryByRole("radio", { name: /^Keep positions/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    fireEvent.change(screen.getByLabelText("Use as"), { target: { value: "window" } });
    fireEvent.change(screen.getByLabelText("Window state"), { target: { value: "locked" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(fake.commands).toEqual([]);
    const revise = vi.spyOn(api.uvtt, "revise").mockImplementation(async (_room, _token, _id, edit) => ({ ...preparation, ...edit, revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    const dialog = await screen.findByRole("dialog", { name: "Tokens already on the table" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Keep positions/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 2, tokenPolicy: "keep" }]));
    expect(revise.mock.calls[0]?.[3].walls[0]).toMatchObject({ portal: { kind: "window", state: "locked" }, uvttPortal: preparation.walls[0]!.uvttPortal });
  });
  describe("token choice dialog (FR-GM-04)", () => {
    const withToken = () => {
      const state = room();
      state.tokens.hero = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
      return state;
    };
    it("asks on Apply map, not in the Grid step; Cancel sends nothing and keeps the draft; Recenter is sent", async () => {
      const fake = mount(withToken()); await importFile();
      expect(screen.queryByRole("radio")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
      let dialog = await screen.findByRole("dialog", { name: "Tokens already on the table" });
      expect(within(dialog).getByRole("radio", { name: /^Scale to fit/ })).toHaveProperty("checked", true);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog", { name: "Tokens already on the table" })).toBeNull();
      expect(fake.commands).toEqual([]);
      expect(screen.getByText(/Unsaved changes: only you see them/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
      dialog = await screen.findByRole("dialog", { name: "Tokens already on the table" });
      expect(within(dialog).getByRole("radio", { name: /^Scale to fit/ })).toHaveProperty("checked", true);
      fireEvent.click(within(dialog).getByRole("radio", { name: /^Recenter/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply map" }));
      await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 1, tokenPolicy: "recenter" }]));
    });
    it("applies at once with no dialog and no policy when the room has no tokens", async () => {
      const fake = mount(); await importFile();
      fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
      await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", expectedSceneId: "initial", importId: "opaque", revision: 1 }]));
      expect(screen.queryByRole("dialog", { name: "Tokens already on the table" })).toBeNull();
    });
  });
  it("preserves absence of optional portal fields when saving unchanged metadata", async () => {
    const save = vi.fn();
    render(<WallProperties map={preparation.map} wall={{ id: "p", a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, uvttPortal: {} }} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save.mock.calls[0]?.[0].uvttPortal).toEqual({});
  });
  it("omits a cleared optional rotation without changing other portal metadata", () => {
    const save = vi.fn();
    render(<WallProperties map={preparation.map} wall={{ ...preparation.walls[0]!, id: "p" }} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Rotation (radians)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].uvttPortal).toStrictEqual({ position: { x: 40, y: 60 }, closed: true, freestanding: true });
  });
  it.each([["X", "Y", "60"], ["Y", "X", "40"]])("omits a cleared position in %s/%s order and rejects incomplete coordinates", (first, second, remaining) => {
    const save = vi.fn();
    render(<WallProperties map={preparation.map} wall={{ ...preparation.walls[0]!, id: "p" }} onSave={save} />);
    fireEvent.change(screen.getByLabelText(`Door position ${first}`), { target: { value: "" } });
    expect(screen.getByLabelText(`Door position ${second}`)).toHaveProperty("value", remaining);
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(`Door position ${second}`), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].uvttPortal).toStrictEqual({ rotation: 1.3, closed: true, freestanding: true });
  });
  it("preserves numeric portal edits including zero and negative coordinates", () => {
    const save = vi.fn();
    render(<WallProperties map={preparation.map} wall={{ id: "p", a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, uvttPortal: { closed: true, freestanding: true } }} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Door position X"), { target: { value: "0" } });
    expect(screen.getByLabelText("Door position Y")).toHaveProperty("value", "0");
    fireEvent.change(screen.getByLabelText("Door position Y"), { target: { value: "-25.5" } });
    fireEvent.change(screen.getByLabelText("Rotation (radians)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].uvttPortal).toStrictEqual({ position: { x: 0, y: -25.5 }, rotation: 0, closed: true, freestanding: true });
  });
  it.each(["success", "rejection", "exception"] as const)("prevents duplicate map Undo, clears retry errors and handles %s", async (outcome) => {
    const state = room();
    state.scene.map = { ...state.scene.map!, width: 1600, height: 1200 };
    state.tokens.hero = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
    const fake = mount(state); await importFile();
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Tokens already on the table" })).getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toHaveLength(1));
    fake.rerender(reduce(state, { type: "MapSet", map: preparation.map, previous: state.scene.map,
      gridChange: { grid: preparation.grid, previous: state.scene.grid },
      tokenChanges: [{ tokenId: "hero", from: state.tokens.hero.position, to: { x: 50, y: 50 } }],
    }, { commandId: "import-action", actorId: "gm" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const send = vi.mocked(fake.connection.command);
    send.mockResolvedValueOnce({ ok: false, code: "invalid", message: "Earlier undo failed." });
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await screen.findByText("Earlier undo failed.");
    let resolve!: (result: CommandResult) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<CommandResult>((done, fail) => { resolve = done; reject = fail; });
    send.mockReturnValueOnce(pending);
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    fireEvent.click(undo);
    expect(undo.disabled).toBe(true);
    expect(screen.queryByText("Earlier undo failed.")).toBeNull();
    fireEvent.click(undo);
    expect(send.mock.calls.filter(([command]) => command.type === "history.undo")).toEqual([
      [{ type: "history.undo", commandId: "import-action" }], [{ type: "history.undo", commandId: "import-action" }],
    ]);
    await act(async () => {
      if (outcome === "success") resolve({ ok: true, seq: 4 });
      else if (outcome === "rejection") resolve({ ok: false, code: "invalid", message: "Current undo failed." });
      else reject(new Error("Current undo failed."));
    });
    if (outcome !== "success") {
      expect(screen.getByText("Current undo failed.")).toBeTruthy();
      expect(undo.disabled).toBe(false);
      send.mockResolvedValueOnce({ ok: true, seq: 5 });
      fireEvent.click(undo);
    }
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull());
  });
});
