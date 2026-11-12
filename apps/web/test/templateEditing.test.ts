// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AreaTemplate, type Participant, type Point, type RoomState, type TemplateGeometry } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import type { BoardTool } from "../src/board/tools";

const alice: Participant = { id: "alice", displayName: "Alice", role: "player" };
const bob: Participant = { id: "bob", displayName: "Bob", role: "player" };
const gm: Participant = { id: "gm", displayName: "GM", role: "gm" };

/** A 20 ft circle (radius 4 cells) centred at (700, 700), and a 15 ft cone, on the default 70 px, 5 ft grid. */
const circle = (ownerId: string, extra: Partial<AreaTemplate> = {}): AreaTemplate =>
  ({ id: "c", shape: "circle", origin: { x: 700, y: 700 }, toward: { x: 701, y: 700 }, size: 20, ownerId, gmOnly: false, ...extra });

type Harness = {
  state: RoomState;
  selectedTemplate: string | null;
  templateEdit: unknown;
  pendingEdits: Map<string, TemplateGeometry>;
  gesture: unknown;
  pan: unknown;
  onBackgroundDown(e: unknown): void;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
  setTool(tool: BoardTool): void;
  cancelTemplateEdit(clearSelection?: boolean): boolean;
  /** What `update` does for templates when state changes; the rest of it renders the map. */
  settleTemplateEdits(): void;
  selectArrivedAreas(): void;
  showAimPreview(from: string, preview: unknown, label: string, templateId?: string): void;
  aims: Map<string, { templateId?: string }>;
};

const areaTool: BoardTool = { kind: "area", shape: "circle", lineCells: 1, color: "orange", gmOnly: false };

/** A board with `templates` in state, its pointer handlers run by hand; nothing is rendered. */
function board(you: Participant, templates: AreaTemplate[], tool: BoardTool = { kind: "select" }) {
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 2000, height: 2000 } };
  state.templates = Object.fromEntries(templates.map((t) => [t.id, t]));
  const callbacks = {
    aimPreview: vi.fn(), aimEnd: vi.fn(), selectToken: vi.fn(), dragEnd: vi.fn(),
    updateTemplate: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
    placeTemplate: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
  };
  // Constructed for its pointer handlers (arrow-function fields); not initialised, so nothing draws.
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness;
  Object.assign(view, {
    state, you, callbacks, tool, readOnly: false, placement: null, gesture: null, pan: null, placeDown: null, drag: null,
    world: { toLocal: (p: Point) => p, scale: { x: 1 }, x: 0, y: 0, position: { set: vi.fn() } },
    redrawOverlay: vi.fn(), invalidate: vi.fn(), syncTokens: vi.fn(), finishGesture: vi.fn(),
  });
  const pointer = (p: Point, altKey = false) => ({ global: p, button: 0, altKey, shiftKey: false });
  const drag = (from: Point, to: Point) => {
    view.onBackgroundDown(pointer(from));
    view.onPointerMove(pointer(to));
    view.onPointerUp(pointer(to));
  };
  const click = (at: Point) => {
    view.onBackgroundDown(pointer(at));
    view.onPointerUp(pointer(at));
  };
  return { view, callbacks, pointer, drag, click };
}

describe("selecting and moving a placed area with the Select tool (FR-TAC-06, ADR 0058)", () => {
  it("selects your own area on a press, and a drag moves it, keeping its size", () => {
    const { view, callbacks, click, drag } = board(alice, [circle(alice.id)]);
    click({ x: 720, y: 700 });
    expect(view.selectedTemplate).toBe("c");
    expect(callbacks.updateTemplate).not.toHaveBeenCalled();

    drag({ x: 720, y: 700 }, { x: 720 + 140, y: 700 });
    expect(callbacks.aimPreview).toHaveBeenCalledWith(expect.objectContaining({ shape: "circle", origin: { x: 840, y: 700 }, size: 20 }), "c");
    expect(callbacks.aimEnd).toHaveBeenCalledWith(false, "c");
    expect(callbacks.updateTemplate).toHaveBeenCalledWith(
      "c",
      { origin: { x: 840, y: 700 }, toward: { x: 841, y: 700 }, size: 20 },
      { origin: { x: 700, y: 700 }, toward: { x: 701, y: 700 }, size: 20 },
    );
    expect(view.pendingEdits.get("c")).toMatchObject({ origin: { x: 840, y: 700 } });
  });

  it("pans instead when the area belongs to another player", () => {
    const { view, pointer } = board(bob, [circle(alice.id)]);
    view.onBackgroundDown(pointer({ x: 720, y: 700 }));
    expect(view.templateEdit).toBeNull();
    expect(view.pan).not.toBeNull();
    expect(view.selectedTemplate).toBeNull();
  });

  it("lets the GM grab a player's area", () => {
    const { view, click } = board(gm, [circle(alice.id)]);
    click({ x: 720, y: 700 });
    expect(view.selectedTemplate).toBe("c");
  });

  it("resizes from the rim handle of the selected area", () => {
    const { view, callbacks, click, drag } = board(alice, [circle(alice.id)]);
    click({ x: 700, y: 700 });
    // The rim handle faces the aim: 4 cells right of the centre.
    drag({ x: 700 + 280, y: 700 }, { x: 700 + 420, y: 700 });
    expect(view.selectedTemplate).toBe("c");
    expect(callbacks.updateTemplate).toHaveBeenCalledWith("c", expect.objectContaining({ origin: { x: 700, y: 700 }, size: 30 }), expect.anything());
  });

  it("clears the selection on a click on the map, a tool other than Select or Area, or Escape", () => {
    const { view, click } = board(alice, [circle(alice.id)]);
    click({ x: 700, y: 700 });
    click({ x: 1800, y: 1800 });
    expect(view.selectedTemplate).toBeNull();

    click({ x: 700, y: 700 });
    view.setTool(areaTool);
    view.setTool({ kind: "select" });
    expect(view.selectedTemplate).toBe("c");
    view.setTool({ kind: "erase" });
    expect(view.selectedTemplate).toBeNull();

    view.setTool({ kind: "select" });
    click({ x: 700, y: 700 });
    expect(view.cancelTemplateEdit()).toBe(true);
    expect(view.selectedTemplate).toBeNull();
    expect(view.cancelTemplateEdit()).toBe(false);
  });

  it("puts the area back and sends nothing when Escape cancels a drag", () => {
    const { view, callbacks, pointer } = board(alice, [circle(alice.id)]);
    view.onBackgroundDown(pointer({ x: 700, y: 700 }));
    view.onPointerMove(pointer({ x: 900, y: 700 }));
    expect(view.cancelTemplateEdit()).toBe(true);
    expect(callbacks.aimEnd).toHaveBeenCalledWith(false, "c");
    view.onPointerUp(pointer({ x: 900, y: 700 }));
    expect(callbacks.updateTemplate).not.toHaveBeenCalled();
    expect(view.selectedTemplate).toBe("c");
  });

  it("shows the area as the room has it again when the edit is refused", async () => {
    const { view, callbacks, drag } = board(alice, [circle(alice.id)]);
    callbacks.updateTemplate.mockResolvedValueOnce(false);
    drag({ x: 700, y: 700 }, { x: 840, y: 700 });
    expect(view.pendingEdits.has("c")).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(view.pendingEdits.has("c")).toBe(false);
  });

  it("drops a pending edit once the room has it", () => {
    const { view, drag } = board(alice, [circle(alice.id)]);
    drag({ x: 700, y: 700 }, { x: 840, y: 700 });
    view.state = { ...view.state, templates: { c: circle(alice.id, { origin: { x: 840, y: 700 }, toward: { x: 841, y: 700 } }) } };
    view.settleTemplateEdits();
    expect(view.pendingEdits.has("c")).toBe(false);
  });
});

describe("editing from the Area tool (FR-TAC-06, ADR 0058)", () => {
  it("selects your own area on a click instead of placing a new one, and moves it on a drag", () => {
    const { view, callbacks, click, drag } = board(alice, [circle(alice.id)], areaTool);
    click({ x: 720, y: 700 });
    expect(view.selectedTemplate).toBe("c");
    expect(view.gesture).toBeNull();
    drag({ x: 720, y: 700 }, { x: 720, y: 700 + 140 });
    expect(callbacks.updateTemplate).toHaveBeenCalledWith("c", expect.objectContaining({ origin: { x: 700, y: 840 } }), expect.anything());
    expect(callbacks.placeTemplate).not.toHaveBeenCalled();
  });

  it("places a new area inside another player's area", () => {
    const { view, pointer } = board(bob, [circle(alice.id)], areaTool);
    view.onBackgroundDown(pointer({ x: 720, y: 700 }));
    expect(view.templateEdit).toBeNull();
    expect(view.gesture).not.toBeNull();
  });

  it("lets the GM move a player's area from the Area tool", () => {
    const { callbacks, drag } = board(gm, [circle(alice.id)], areaTool);
    drag({ x: 720, y: 700 }, { x: 860, y: 700 });
    expect(callbacks.updateTemplate).toHaveBeenCalledOnce();
    expect(callbacks.placeTemplate).not.toHaveBeenCalled();
  });

  it("places on an empty spot, and selects the new area once it arrives", () => {
    const { view, pointer } = board(alice, [], areaTool);
    view.onBackgroundDown(pointer({ x: 350, y: 350 }));
    expect(view.gesture).not.toBeNull();
    // The click's area as it comes back from the room: placing selects it on arrival.
    const placed = { id: "new", shape: "circle" as const, origin: { x: 350, y: 350 }, toward: { x: 351, y: 350 }, size: 10, ownerId: alice.id, gmOnly: false, color: "orange" as const };
    (view as unknown as { selectOnArrival: unknown[] }).selectOnArrival.push({ kind: "area", ...placed, free: true });
    view.state = { ...view.state, templates: { new: placed } };
    view.selectArrivedAreas();
    expect(view.selectedTemplate).toBe("new");
  });
});

describe("someone else editing an area (FR-TAC-06, ADR 0058)", () => {
  it("remembers which area another participant's preview stands in for, until it clears", () => {
    const { view } = board(bob, [circle(alice.id)]);
    Object.assign(view, { fxLayer: { addChild: vi.fn() } });
    view.showAimPreview("alice", { shape: "circle", origin: { x: 840, y: 700 }, toward: { x: 841, y: 700 }, size: 20, gmOnly: false }, "Alice", "c");
    expect(view.aims.get("alice")?.templateId).toBe("c");
    view.showAimPreview("alice", null, "Alice");
    expect(view.aims.has("alice")).toBe(false);
  });
});

describe("drawing areas while someone else edits them (FR-TAC-06, ADR 0058)", () => {
  it("leaves out the original while another participant's edit preview is live, and draws it again when it clears", () => {
    const { view } = board(bob, [circle(alice.id), { ...circle(alice.id), id: "other", origin: { x: 100, y: 100 } }]);
    const drawn: string[] = [];
    const g = { clear: () => g, circle: () => g, fill: () => g, stroke: () => g };
    Object.assign(view, {
      initialized: true, fxLayer: { addChild: vi.fn() }, marksGraphics: g, redrawFog: vi.fn(),
      drawMark: (_g: unknown, mark: { origin: Point }) => drawn.push(`${mark.origin.x},${mark.origin.y}`),
    });
    view.showAimPreview("alice", { shape: "circle", origin: { x: 840, y: 700 }, toward: { x: 841, y: 700 }, size: 20, gmOnly: false }, "Alice", "c");
    expect(drawn).toEqual(["100,100"]);
    drawn.length = 0;
    view.showAimPreview("alice", null, "Alice");
    expect(drawn).toEqual(["700,700", "100,100"]);
  });
});

describe("placing with a click (FR-TAC-06, ADR 0058)", () => {
  it.each([
    [{ unitsPerCell: 5, unitLabel: "ft" }, 10],
    [{ unitsPerCell: 1.5, unitLabel: "m" }, 3],
  ])("places a 2-cell area on a %o grid", (units, size) => {
    const { view, callbacks, click } = board(alice, [], { ...areaTool, shape: "cone" });
    Object.assign(view, { finishGesture: (BoardView.prototype as unknown as { finishGesture: unknown }).finishGesture });
    view.state.scene = { ...view.state.scene, grid: { ...view.state.scene.grid, ...units } };
    click({ x: 350, y: 350 });
    expect(callbacks.placeTemplate).toHaveBeenCalledWith(expect.objectContaining({ shape: "cone", size }));
  });

  it("takes a click-placed line's width from the width field", () => {
    const { view, callbacks, click } = board(alice, [], { ...areaTool, shape: "line", lineCells: 2 });
    Object.assign(view, { finishGesture: (BoardView.prototype as unknown as { finishGesture: unknown }).finishGesture });
    click({ x: 350, y: 350 });
    expect(callbacks.placeTemplate).toHaveBeenCalledWith(expect.objectContaining({ shape: "line", size: 10, width: 10 }));
  });
});

describe("clipping areas the viewer may not edit (FR-GM-17, ADR 0059)", () => {
  /** A board whose drawing is recorded: which graphics each area went into, and where aims were added. */
  function clippingBoard(you: Participant) {
    const { view } = board(you, [circle(alice.id), { ...circle(bob.id), id: "bobs" }]);
    const graphics = () => { const g = { clear: () => g, circle: () => g, fill: () => g, stroke: () => g }; return g; };
    const mine = graphics(), clipped = graphics();
    const into = new Map<unknown, string[]>([[mine, []], [clipped, []]]);
    const fxLayer = { addChild: vi.fn() }, clippedAims = { addChild: vi.fn(), mask: null as unknown };
    const masks = vi.fn(() => ({ texture: { destroy: vi.fn() }, areaMask: { destroy: vi.fn() }, aimMask: { destroy: vi.fn() } }));
    Object.assign(view, {
      initialized: true, marksGraphics: mine, clippedGraphics: clipped, redrawFog: vi.fn(), fxLayer, clippedAims,
      clippedAreas: { mask: null }, markLayer: { addChild: vi.fn() }, createRegionMasks: masks,
      drawMark: (g: unknown, mark: { origin: Point; size: number }) => into.get(g)!.push(mark.size === 20 ? "circle" : "?"),
    });
    const redraw = () => { for (const list of into.values()) list.length = 0; (view as unknown as { redrawMarks(): void }).redrawMarks(); };
    const sync = () => (view as unknown as { syncVisibleRegion(): void }).syncVisibleRegion();
    return { view, into, mine, clipped, fxLayer, clippedAims, masks, redraw, sync };
  }

  it("draws another player's area behind the mask and the viewer's own in the open", () => {
    const b = clippingBoard(alice);
    b.redraw();
    expect(b.into.get(b.mine)).toHaveLength(1);
    expect(b.into.get(b.clipped)).toHaveLength(1);
  });

  it("masks nothing for the GM, and builds no mask", () => {
    const b = clippingBoard(gm);
    b.redraw();
    expect(b.into.get(b.mine)).toHaveLength(2);
    expect(b.into.get(b.clipped)).toHaveLength(0);
    b.sync();
    expect(b.masks).not.toHaveBeenCalled();
  });

  it("puts another participant's aim behind the mask for a player, but not for the GM", () => {
    const preview = { shape: "circle", origin: { x: 840, y: 700 }, toward: { x: 841, y: 700 }, size: 20, gmOnly: false };
    const player = clippingBoard(bob);
    player.view.showAimPreview("alice", preview, "Alice");
    expect(player.clippedAims.addChild).toHaveBeenCalledOnce();
    expect(player.fxLayer.addChild).not.toHaveBeenCalled();
    const gmBoard = clippingBoard(gm);
    gmBoard.view.showAimPreview("alice", preview, "Alice");
    expect(gmBoard.fxLayer.addChild).toHaveBeenCalledOnce();
  });

  it("rebuilds the mask when fog changes, not otherwise, and drops it for the GM's view", () => {
    const b = clippingBoard(alice);
    b.sync();
    expect(b.masks).toHaveBeenCalledOnce();
    b.sync();
    expect(b.masks).toHaveBeenCalledOnce();
    b.view.state = { ...b.view.state, fog: { f: { id: "f", shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] } } };
    b.sync();
    expect(b.masks).toHaveBeenCalledTimes(2);
    Object.assign(b.view, { you: gm });
    b.sync();
    expect((b.view as unknown as { visibleRegion: unknown }).visibleRegion).toBeNull();
  });
});
