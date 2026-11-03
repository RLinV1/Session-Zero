// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type LibraryAsset, type RoomState, type UvttPreparation, type Wall } from "@vtt/shared";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { fakeConnection, MAP_URL, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const BUTTON = "Make all imported openings doors";
/** Two imported openings, one the file marks open, beside a plain wall and a window the GM already chose. */
const walls: Omit<Wall, "id">[] = [
  { a: { x: 100, y: 100 }, b: { x: 150, y: 100 }, uvttPortal: { closed: true, position: { x: 125, y: 100 }, rotation: 0, freestanding: false } },
  { a: { x: 200, y: 100 }, b: { x: 250, y: 100 }, uvttPortal: { closed: false } },
  { a: { x: 300, y: 100 }, b: { x: 400, y: 100 }, source: "line_of_sight" },
  { a: { x: 450, y: 100 }, b: { x: 500, y: 100 }, uvttPortal: { closed: true }, portal: { kind: "window", state: "closed" } },
];
const closedDoor = { kind: "door", state: "closed" } as const;
const openDoor = { kind: "door", state: "open" } as const;

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mountRoom(state: RoomState) {
  const fake = fakeConnection();
  render(<GmPanel connection={fake.connection} state={state} token={TOKEN} gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return fake;
}

/** Clicks the bulk button and checks the step reports it, with no openings left to convert. */
async function makeDoors(scope: HTMLElement) {
  fireEvent.click(await within(scope).findByRole("button", { name: BUTTON }));
  expect(await within(scope).findByText("Made 2 doors from imported openings.")).toBeTruthy();
  expect(within(scope).queryByRole("button", { name: BUTTON })).toBeNull();
}

describe("Make all imported openings doors (FR-GM-09, FR-GM-18)", () => {
  it("saves an applied map's openings as portal designations, open or closed as the file marks them", async () => {
    const fake = mountRoom(room({ walls: walls.map((wall, i) => ({ ...wall, id: `w${i}` })) }));
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getByText(/the 2 openings from the map file/)).toBeTruthy();
    await makeDoors(editor);
    expect(fake.commands).toEqual([]);
    fireEvent.click(await within(editor).findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([{
      type: "scene.savePreparation", expectedMapUrl: MAP_URL, expectedSceneId: "initial", context: { boardEpoch: 0, revision: 0 }, edits: [
        { type: "portal.set", expectedMapUrl: MAP_URL, expectedSceneId: "initial", wallId: "w0", portal: closedDoor },
        { type: "portal.set", expectedMapUrl: MAP_URL, expectedSceneId: "initial", wallId: "w1", portal: openDoor },
      ],
    }]));
  });

  it("leaves the button out when no imported opening is left", () => {
    mountRoom(room({ walls: [{ ...walls[2]!, id: "plain" }, { ...walls[3]!, id: "window" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("designates a fresh UVTT import's openings in its private draft, then applies them in one import", async () => {
    const preparation: UvttPreparation = { id: "opaque", revision: 1, map: { url: "/uploads/import.png", width: 800, height: 600 },
      grid: { ...DEFAULT_GRID, cellSize: 50 }, walls, diagnostics: [] };
    vi.spyOn(api.uvtt, "prepare").mockResolvedValue(structuredClone(preparation));
    vi.spyOn(api.uvtt, "discard").mockResolvedValue();
    const revise = vi.spyOn(api.uvtt, "revise").mockImplementation(async (_room, _token, _id, edit) => ({ ...preparation, ...edit, revision: 2 }));
    const fake = mountRoom(room());
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["json"], "map.dd2vtt")] } });
    await screen.findByText(/Unsaved changes: only you see them/);
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    await makeDoors(screen.getByRole("dialog", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", importId: "opaque", revision: 2, expectedSceneId: "initial" }]));
    expect(revise.mock.calls[0]?.[3].walls).toEqual([
      { ...walls[0], portal: closedDoor },
      { ...walls[1], portal: openDoor },
      walls[2],
      walls[3],
    ]);
  });

  it("saves a library map's openings as doors on its board", async () => {
    const asset: LibraryAsset = { id: "map1", kind: "map", name: "Chandlery", url: "/chandlery.png", width: 800, height: 600, grid: DEFAULT_GRID, createdAt: "2026-11-02T00:00:00Z" };
    vi.spyOn(api.detection, "library").mockResolvedValue(null);
    vi.spyOn(api.library, "preparation").mockResolvedValue({ grid: DEFAULT_GRID, board: { walls: structuredClone(walls), fog: [] }, revision: "r1" });
    const savePreparation = vi.spyOn(api.library, "savePreparation").mockImplementation(async (_id, change) => ({ grid: change.grid, board: change.board, revision: "r2" }));
    render(<LibraryMapEditor asset={asset} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Walls/ }));
    await makeDoors(screen.getByRole("dialog", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(savePreparation).toHaveBeenCalledWith("map1", expect.objectContaining({
      revision: "r1", board: {
        walls: [{ ...walls[0], portal: closedDoor }, { ...walls[1], portal: openDoor }, walls[2], walls[3]],
        fog: [],
      },
    })));
  });
});
