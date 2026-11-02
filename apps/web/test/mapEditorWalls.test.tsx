// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toGridDraft } from "../src/pages/gridDraft";
import { MAX_WALLS_PER_ADD, SAMPLE_TOLERANCE_DEFAULT, type DetectedWallsResponse, type RoomState, type Wall } from "@vtt/shared";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { WallSetup } from "../src/pages/mapEditor/WallSetup";
import { MAP_URL, TOKEN, click, fakeConnection, pointer, room, stubMapEditorEnvironment } from "./mapEditorHarness";

// The panels below the map section have nothing to do with the editor.
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const canvas = () => screen.getByRole("application");
/** `count` horizontal detected walls, one cell long, 100 px apart down the map. */
const detectedRows = (count: number) => Array.from({ length: count }, (_, i) => ({ a: { x: 100, y: 50 + i * 100 }, b: { x: 170, y: 50 + i * 100 } }));
const tool = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
  vi.spyOn(api.walls, "detected").mockResolvedValue({ resultId: "result-a", walls: detectedRows(7) });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("map editor walls (FR-GM-09, FR-GM-11)", () => {
  const mount = (state = room()) => {
    const fake = fakeConnection();
    render(<WallSetup connection={fake.connection} state={state} token={TOKEN} />);
    return fake;
  };

  it("zooms about the midpoint of a two-finger pinch in any mode, and a pinch adds no wall", async () => {
    const { commands } = mount();
    const svg = canvas();
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 600");
    // Two fingers 100 px apart about (400, 300) spread to 200 px: zoom doubles about that point.
    pointer("pointerDown", svg, { x: 350, y: 300 }, { id: 1 });
    pointer("pointerDown", svg, { x: 450, y: 300 }, { id: 2 });
    pointer("pointerMove", svg, { x: 300, y: 300 }, { id: 1 });
    pointer("pointerMove", svg, { x: 500, y: 300 }, { id: 2 });
    expect(svg.getAttribute("viewBox")).toBe("200 150 400 300");
    pointer("pointerUp", svg, { x: 300, y: 300 }, { id: 1 });
    pointer("pointerUp", svg, { x: 500, y: 300 }, { id: 2 });
    expect(commands).toEqual([]);
  });

  it("pans on a two-finger drag in Draw mode, then taps still draw", async () => {
    const { commands } = mount();
    const svg = canvas();
    pointer("pointerDown", svg, { x: 350, y: 300 }, { id: 1 });
    pointer("pointerDown", svg, { x: 450, y: 300 }, { id: 2 });
    // Both fingers drag 80 px right: the map moves with them, so the view moves left.
    pointer("pointerMove", svg, { x: 430, y: 300 }, { id: 1 });
    pointer("pointerMove", svg, { x: 530, y: 300 }, { id: 2 });
    expect(svg.getAttribute("viewBox")).toBe("-80 0 800 600");
    pointer("pointerUp", svg, { x: 430, y: 300 }, { id: 1 });
    pointer("pointerUp", svg, { x: 530, y: 300 }, { id: 2 });
    expect(commands).toEqual([]);
    click(svg, { x: 100, y: 100 });
    click(svg, { x: 200, y: 100 });
    await waitFor(() => expect(commands).toHaveLength(1));
  });

  it("leaves detection out when the server can't detect, but still draws and erases", async () => {
    const availability = vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false, reason: "The vision service is not running." });
    mount();
    await waitFor(() => expect(availability).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Detect walls" })).toBeNull();
    expect(screen.queryByText("Automatic detection")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Pick" })).toBeNull();
    expect((tool("Draw") as HTMLButtonElement).disabled).toBe(false);
    expect((tool("Erase") as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers detection while the server can detect", async () => {
    vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
    mount();
    expect(await screen.findByRole("button", { name: "Detect walls" })).toBeTruthy();
    expect(tool("Pick")).toBeTruthy();
  });

  it("offers Detect walls but not Pick when only a built-in map's stored walls are available", async () => {
    const availability = vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true, sampleAvailable: false });
    mount();
    expect(await screen.findByRole("button", { name: "Detect walls" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Pick" })).toBeNull();
    expect(availability.mock.calls[0]![0]).toBeTruthy();
  });

  it("adds a wall per segment of a chain, snapped to grid corners, and Enter ends the chain", async () => {
    const { commands } = mount();
    const svg = canvas();
    click(svg, { x: 103, y: 98 });
    expect(commands).toEqual([]);
    click(svg, { x: 212, y: 101 });
    await waitFor(() => expect(commands).toHaveLength(1));
    click(svg, { x: 205, y: 203 });
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands).toEqual([
      { type: "wall.add", walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 } }] },
      { type: "wall.add", walls: [{ a: { x: 200, y: 100 }, b: { x: 200, y: 200 } }] },
    ]);

    fireEvent.keyDown(svg, { key: "Enter" });
    click(svg, { x: 403, y: 397 });
    await Promise.resolve();
    expect(commands).toHaveLength(2);
  });

  it("erases the wall near the click and nothing when the click is far away", async () => {
    const wall: Wall = { id: "w1", a: { x: 100, y: 100 }, b: { x: 300, y: 100 } };
    const { commands } = mount(room({ walls: [wall] }));
    fireEvent.click(tool("Erase"));
    const svg = canvas();

    click(svg, { x: 200, y: 150 });
    await Promise.resolve();
    expect(commands).toEqual([]);

    click(svg, { x: 200, y: 106 });
    await waitFor(() => expect(commands).toEqual([{ type: "wall.remove", wallIds: ["w1"] }]));
  });

  it("makes the clicked wall the chosen door or window, and sends nothing when it already is (FR-GM-18)", async () => {
    const wall: Wall = { id: "w1", a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, portal: { kind: "door", state: "closed" } };
    const { commands } = mount(room({ walls: [wall] }));
    fireEvent.click(tool("Door"));
    const svg = canvas();

    // Door, Closed is the default and the wall is one already.
    click(svg, { x: 200, y: 104 });
    await Promise.resolve();
    expect(commands).toEqual([]);

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Make walls" })).getByRole("radio", { name: "Window" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Starting state" })).getByRole("radio", { name: "Locked" }));
    click(svg, { x: 200, y: 104 });
    await waitFor(() => expect(commands).toEqual([{ type: "portal.set", wallId: "w1", portal: { kind: "window", state: "locked" } }]));
  });

  it("sends the clicked map point to the Pick tool", async () => {
    const detect = vi.spyOn(api.walls, "detect").mockResolvedValue({ status: "queued" });
    mount();
    await waitFor(() => expect((tool("Pick") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(tool("Pick"));
    click(canvas(), { x: 321, y: 123 });
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, { sample: { x: 321, y: 123 }, tolerance: SAMPLE_TOLERANCE_DEFAULT, minLength: 0 }));
  });

  it("sends the strictness and shortest wall chosen on the sliders with Detect walls", async () => {
    const detect = vi.spyOn(api.walls, "detect").mockResolvedValue({ status: "queued" });
    const fake = mount();
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText(/Strictness/), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText(/Shortest wall/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Wall colour/), { target: { value: "bright" } });
    fireEvent.click(screen.getByRole("button", { name: "Detect walls" }));
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, { strictness: 0.5, style: "bright", minLength: 2 }));
    // Back to automatic leaves strictness out of the request again (once the first job has ended).
    fake.notify({ status: "failed", message: "no" });
    fireEvent.click(screen.getByRole("button", { name: "Back to automatic" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Detect (walls|again)/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /Detect (walls|again)/ }));
    await waitFor(() => expect(detect).toHaveBeenLastCalledWith("r1", TOKEN, { style: "bright", minLength: 2 }));
  });

  it("sends the colour range chosen on the slider with the click", async () => {
    const detect = vi.spyOn(api.walls, "detect").mockResolvedValue({ status: "queued" });
    mount();
    await waitFor(() => expect((tool("Pick") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(tool("Pick"));
    fireEvent.change(screen.getByLabelText(/Colour range/), { target: { value: "18" } });
    click(canvas(), { x: 321, y: 123 });
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, expect.objectContaining({ sample: { x: 321, y: 123 }, tolerance: 18 })));
  });

  it("opens a modal preview when detection finishes, and Apply adds the walls to the draft (FR-GM-09, FR-GM-11)", async () => {
    const fake = mount();
    const button = await screen.findByRole("button", { name: "Detect walls" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });

    const dialog = await screen.findByRole("dialog", { name: "Detected walls" });
    expect(within(dialog).getByText("7 walls found.")).toBeTruthy();
    expect(within(dialog).getAllByRole("button", { name: /^Detected wall/ })).toHaveLength(7);
    // The old overlay on the canvas and the side-panel figure are gone.
    expect(screen.queryByTestId("wall-candidates")).toBeNull();
    expect(fake.commands).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Apply 7 walls" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "wall.applyDetected", mapUrl: MAP_URL }]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Detected walls" })).toBeNull());
  });

  it("tells walls, doors and windows and their states apart in the preview and legend (FR-GM-11)", async () => {
    const rows = detectedRows(4);
    vi.spyOn(api.walls, "detected").mockResolvedValue({
      resultId: "result-a",
      walls: [
        rows[0]!,
        { ...rows[1]!, portal: { kind: "door", state: "locked" } },
        { ...rows[2]!, portal: { kind: "window", state: "open" } },
        { ...rows[3]!, portal: { kind: "door", state: "closed" }, confidence: 0.3 },
      ],
    });
    const fake = mount();
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 4, width: 800, height: 600 });
    const dialog = await screen.findByRole("dialog", { name: "Detected walls" });
    expect(within(dialog).getByText("4 walls found: 1 wall, 2 doors, 1 window.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Detected wall 2, door, locked" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Detected wall 3, window, open" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Detected wall 4, door, closed, doubtful" })).toBeTruthy();
    const legend = within(within(dialog).getByRole("list", { name: "Detected wall colours" }));
    for (const entry of ["Wall", "Door", "Window", "Closed", "Open", "Locked", "Doubtful"]) expect(legend.getByText(entry)).toBeTruthy();
    expect(legend.queryByText("Erased")).toBeNull();
  });

  it("Discard adds nothing and leaves Detect walls ready (FR-GM-09)", async () => {
    const fake = mount();
    const button = await screen.findByRole("button", { name: "Detect walls" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
    const dialog = await screen.findByRole("dialog", { name: "Detected walls" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Detected walls" })).toBeNull());
    expect(fake.commands).toEqual([]);
    // Focus return is the shared Modal's `close` event, which the jsdom stub doesn't fire; the Detect walls button is back and enabled.
    expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Escape discards the preview (FR-GM-09)", async () => {
    const fake = mount();
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
    const dialog = await screen.findByRole("dialog", { name: "Detected walls" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Detected walls" })).toBeNull());
    expect(fake.commands).toEqual([]);
  });

  describe("doubtful walls (wall-review)", () => {
    /** Seven rows; rows 1, 3 and 4 score below the threshold. */
    const SCORES = [0.95, 0.4, 0.9, 0.55, 0.3, 0.8, 0.99];
    const scored = () => detectedRows(7).map((w, i) => ({ ...w, confidence: SCORES[i] }));
    const detectWithScores = async () => {
      vi.spyOn(api.walls, "detected").mockResolvedValue({ resultId: "result-a", walls: scored() });
      const fake = mount();
      await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
      fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
      return { fake, dialog: await screen.findByRole("dialog", { name: "Detected walls" }) };
    };

    it("draws doubtful walls with a pink dashed halo in the preview, with a legend", async () => {
      const { dialog } = await detectWithScores();
      const marked = dialog.querySelectorAll("g[data-doubtful='true'] > line[stroke-dasharray]");
      expect(marked).toHaveLength(3);
      expect(marked[0]!.getAttribute("stroke")).toBe("#ff5fa2");
      expect(marked[0]!.getAttribute("stroke-dasharray")).toBeTruthy();
      expect(within(dialog).getByRole("list", { name: "Detected wall colours" })).toBeTruthy();
    });

    it("shows no doubtful walls when the result has no confidences", async () => {
      const fake = mount();
      await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
      fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
      await screen.findByRole("button", { name: "Apply 7 walls" });
      expect(screen.queryByText(/Doubtful/)).toBeNull();
      expect(screen.queryByRole("button", { name: /confident walls only/ })).toBeNull();
    });

    const wall = (dialog: HTMLElement, n: number) => within(dialog).getByRole("button", { name: new RegExp(`^Detected wall ${n}\\b`) });

    it("counts doubtful walls not erased, and erasing in the modal sends the index on Apply", async () => {
      const { fake, dialog } = await detectWithScores();
      expect(within(dialog).getByText("3 doubtful walls")).toBeTruthy();
      fireEvent.click(wall(dialog, 2));
      expect(wall(dialog, 2).getAttribute("aria-pressed")).toBe("true");
      expect(within(dialog).getByText("2 doubtful walls")).toBeTruthy();
      fireEvent.click(wall(dialog, 1));
      fireEvent.click(wall(dialog, 1));
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply 6 walls" }));
      await waitFor(() => expect(fake.commands).toEqual([
        { type: "wall.applyDetected", mapUrl: MAP_URL, exclude: { resultId: "result-a", indices: [1] } },
      ]));
    });

    it("steps through doubtful walls, erasing and keeping", async () => {
      const { fake, dialog } = await detectWithScores();
      fireEvent.click(within(dialog).getByRole("button", { name: "Review doubtful walls" }));
      expect(within(dialog).getByText("Wall 1 of 3")).toBeTruthy();
      expect(dialog.querySelector("g[data-focus='true']")).toBe(wall(dialog, 2));
      fireEvent.click(within(dialog).getByRole("button", { name: "Erase" }));
      expect(within(dialog).getByText("Wall 2 of 3")).toBeTruthy();
      expect(within(dialog).getByText("2 doubtful walls")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
      expect(within(dialog).getByRole("button", { name: "Review doubtful walls" })).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply 6 walls" }));
      await waitFor(() => expect(fake.commands).toEqual([
        { type: "wall.applyDetected", mapUrl: MAP_URL, exclude: { resultId: "result-a", indices: [1] } },
      ]));
    });

    it("applies confident walls only by excluding the doubtful ones", async () => {
      const { fake, dialog } = await detectWithScores();
      fireEvent.click(within(dialog).getByRole("button", { name: "Apply confident walls only (4)" }));
      await waitFor(() => expect(fake.commands).toEqual([
        { type: "wall.applyDetected", mapUrl: MAP_URL, exclude: { resultId: "result-a", indices: [1, 3, 4] } },
      ]));
    });
  });

  it("offers Replace when walls already exist", async () => {
    const fake = mount(room({ walls: [{ id: "w1", a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }] }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
    expect(await screen.findByRole("button", { name: "Replace with 7 walls" })).toBeTruthy();
  });
});

describe("map editor in the GM panel (FR-GM-09, FR-GM-17)", () => {
  const mount = (state: RoomState) => {
    const fake = fakeConnection();
    const panel = (state: RoomState) => (
      <GmPanel
        connection={fake.connection} state={state} token={TOKEN}
        gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
        onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true}
        gridApplying={false} gridError={null} onReviewDeparture={() => {}}
      />
    );
    const view = render(panel(state));
    return { ...fake, rerender: (next: RoomState) => view.rerender(panel(next)) };
  };

  /** Opens the editor with Manage Fog and fogs the whole map, in the draft. */
  const fogInDraft = () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "4 · Fog" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    fireEvent.click(within(editor).getByRole("button", { name: "Fog whole map" }));
    return editor;
  };

  it("keeps walls and fog in a draft until Save changes (map-editor-drafts)", async () => {
    const fake = mount(room());
    const editor = fogInDraft();
    await waitFor(() => expect(within(editor).getByText(/Unsaved changes/)).toBeTruthy());
    expect(fake.commands).toEqual([]);
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([
      { type: "fog.replace", expectedMapUrl: MAP_URL, removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 800, y: 600 } }] },
    ]));
  });

  it("does not apply a delayed detection to a reopened editor", async () => {
    const fake = mount(room());
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });
    await screen.findByRole("dialog", { name: "Detected walls" });
    let complete!: (result: DetectedWallsResponse) => void;
    vi.mocked(api.walls.detected).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 7 walls" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    fireEvent.click(within(editor.querySelector<HTMLElement>(".modal-head")!).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    await act(async () => { complete({ resultId: "result-a", walls: detectedRows(7) }); });
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    expect(fake.commands).toEqual([]);
  });

  it("stops a multi-batch Save when another GM changes the map", async () => {
    const fake = mount(room());
    const walls = Array.from({ length: MAX_WALLS_PER_ADD + 1 }, (_, i) => ({ a: { x: i * 5, y: 0 }, b: { x: i * 5, y: 50 } }));
    vi.mocked(api.walls.detected).mockResolvedValue({ resultId: "large-result", walls });
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    fake.notify({ status: "done", wallCount: walls.length, width: 800, height: 600 });
    await screen.findByRole("dialog", { name: "Detected walls" });
    fireEvent.click(screen.getByRole("button", { name: `Apply ${walls.length} walls` }));
    await screen.findByText(/Unsaved changes/);
    let complete!: () => void;
    vi.mocked(fake.connection.command).mockImplementationOnce(async (command) => {
      fake.commands.push(command);
      await new Promise<void>((resolve) => { complete = resolve; });
      return { ok: true, seq: null };
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toHaveLength(1));
    expect(fake.commands[0]).toMatchObject({ type: "wall.add", expectedMapUrl: MAP_URL });
    const next = room();
    next.scene.map = { ...next.scene.map!, url: "/uploads/other.png" };
    fake.rerender(next);
    await act(async () => { complete(); });
    expect(fake.commands).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Edit map" })).toBeTruthy();
  });

  it("uses saved wall IDs for subsequent portal edits in the same editor", async () => {
    const fake = mount(room());
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "3 · Walls" }));
    click(canvas(), { x: 100, y: 100 });
    click(canvas(), { x: 200, y: 100 });
    fireEvent.keyDown(canvas(), { key: "Enter" });
    const saved = room({ walls: [{ id: "saved-wall", a: { x: 100, y: 100 }, b: { x: 200, y: 100 } }] });
    Object.defineProperty(fake.connection, "snapshot", { get: () => ({ state: saved }) });
    vi.mocked(fake.connection.command).mockImplementationOnce(async (command) => {
      fake.commands.push(command);
      fake.rerender(saved);
      return { ok: true, seq: null };
    });
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/)).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "Door" }));
    click(canvas(), { x: 150, y: 100 });
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands[1]).toEqual({ type: "portal.set", expectedMapUrl: MAP_URL, wallId: "saved-wall", portal: { kind: "door", state: "closed" } }));
  });

  it("asks before closing with unsaved changes, and Discard sends nothing (map-editor-drafts)", async () => {
    const fake = mount(room());
    const editor = fogInDraft();
    await waitFor(() => expect(within(editor).getByText(/Unsaved changes/)).toBeTruthy());
    fireEvent.click(within(editor).getByRole("button", { name: "Close" }));
    const ask = await screen.findByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull());
    expect(fake.commands).toEqual([]);
  });

  it("opens the full-screen editor from Edit Grid and reaches the Walls and Fog steps", async () => {
    mount(room());
    expect(screen.getByText(/800 × 600 px · 0 walls/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1 · Map", "2 · Grid", "3 · Walls", "4 · Fog", "5 · Sight"]);
    expect(within(editor).getByRole("tab", { name: "2 · Grid" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(editor).getByRole("tab", { name: "3 · Walls" }));
    expect(within(editor).getByRole("complementary", { name: "Wall tools" })).toBeTruthy();
    expect(within(editor).getByRole("application")).toBeTruthy();
    await waitFor(() => expect(api.walls.availability).toHaveBeenCalled());

    fireEvent.click(within(editor).getByRole("tab", { name: "4 · Fog" }));
    expect(within(editor).getByRole("complementary", { name: "Fog tools" })).toBeTruthy();
    expect(within(editor).getByRole("application")).toBeTruthy();
    expect(within(editor).getByRole("button", { name: "Fog whole map" })).toBeTruthy();
  });

  it("shows the title and the steps in one header row", () => {
    mount(room());
    fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(screen.getByRole("tab", { name: "2 · Grid" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    const head = editor.querySelector(".modal-head")!;
    expect(within(head as HTMLElement).getByRole("heading", { name: "Edit map" })).toBeTruthy();
    expect(within(head as HTMLElement).getAllByRole("tab")).toHaveLength(5);
    expect(within(head as HTMLElement).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("offers Upload map instead of Edit map when the room has no map", () => {
    mount(room({ withMap: false }));
    expect(screen.getByText("No map yet.")).toBeTruthy();
    expect(screen.getByLabelText("Upload battle map")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit map" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull();
  });

  it("opens the editor on the Map step from one Edit map button, and gives focus back to it", async () => {
    mount(room());
    for (const name of ["Change Map", "Edit Grid", "Manage Walls", "Manage Fog", "Manage Sight"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    const button = screen.getByRole("button", { name: "Edit map" });
    button.focus();
    fireEvent.click(button);
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getByRole("tab", { name: "1 · Map" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(editor).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit map" })).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});
