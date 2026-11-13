// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type Point, type RoomState } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import type { BoardTool } from "../src/board/tools";

const gm: Participant = { id: "gm", displayName: "GM", role: "gm" };

type Harness = {
  state: RoomState;
  terrainStroke: unknown;
  onBackgroundDown(e: unknown): void;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
  setTool(tool: BoardTool): void;
  cancelTerrainStroke(): boolean;
};

/** A board run by its pointer handlers; not initialised, so nothing draws. Default grid: 70 px cells. */
function board(tool: BoardTool, state: RoomState = withMap()) {
  const callbacks = {
    selectToken: vi.fn(), togglePortal: vi.fn(), terrainNotice: vi.fn(), aimEnd: vi.fn(),
    paintTerrain: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
    setPortal: vi.fn(),
  };
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness;
  Object.assign(view, {
    state, you: gm, callbacks, tool, readOnly: false, placement: null, gesture: null, pan: null, placeDown: null, drag: null,
    world: { toLocal: (p: Point) => p, scale: { x: 1 }, x: 0, y: 0, position: { set: vi.fn() } },
    redrawOverlay: vi.fn(), invalidate: vi.fn(), syncTokens: vi.fn(), drawPortals: vi.fn(), drawWalls: vi.fn(),
    app: { stage: { cursor: "default" } },
  });
  const pointer = (p: Point, button = 0) => ({ global: p, button, altKey: false, shiftKey: false });
  return { view, callbacks, pointer };
}

function withMap(): RoomState {
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 } };
  state.terrainRevision = 4;
  return state;
}

const brush: BoardTool = { kind: "terrain", shape: "brush", paint: "difficult" };

describe("painting terrain on the board (board-terrain-tool, FR-TAC-02)", () => {
  it("a brush drag sends one terrain.paint for the squares it crossed, with the context from its start", () => {
    const { view, callbacks, pointer } = board(brush);
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    view.onPointerMove(pointer({ x: 175, y: 35 }));
    view.onPointerMove(pointer({ x: 245, y: 35 }));
    view.onPointerUp(pointer({ x: 245, y: 35 }));
    expect(callbacks.paintTerrain).toHaveBeenCalledTimes(1);
    expect(callbacks.paintTerrain).toHaveBeenCalledWith("base", [{ row: 0, start: 0, end: 3, kind: "difficult" }], { boardEpoch: 0, revision: 4 });
  });

  it("a rectangle with Normal erases the block it covers", () => {
    const { view, callbacks, pointer } = board({ kind: "terrain", shape: "rect", paint: null });
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    view.onPointerMove(pointer({ x: 105, y: 105 }));
    view.onPointerUp(pointer({ x: 105, y: 105 }));
    expect(callbacks.paintTerrain).toHaveBeenCalledWith("base", [
      { row: 0, start: 0, end: 1, kind: null },
      { row: 1, start: 0, end: 1, kind: null },
    ], expect.anything());
  });

  it("always paints Base, even when the room already has extra layers", () => {
    const state = withMap();
    state.terrain = { base: [], effects: [{ id: "ice", name: "Ice", runs: [] }] } as unknown as RoomState["terrain"];
    const { view, callbacks, pointer } = board(brush, state);
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    view.onPointerUp(pointer({ x: 35, y: 35 }));
    expect(callbacks.paintTerrain).toHaveBeenCalledWith("base", expect.anything(), expect.anything());
  });

  it("Escape (cancelTerrainStroke) and a right-click drop the stroke and send nothing", () => {
    const { view, callbacks, pointer } = board(brush);
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    expect(view.cancelTerrainStroke()).toBe(true);
    view.onPointerUp(pointer({ x: 35, y: 35 }));
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    view.onBackgroundDown(pointer({ x: 35, y: 35 }, 2));
    view.onPointerUp(pointer({ x: 35, y: 35 }));
    expect(callbacks.paintTerrain).not.toHaveBeenCalled();
    expect(view.cancelTerrainStroke()).toBe(false);
  });

  it("paints only squares on the map", () => {
    const { view, callbacks, pointer } = board({ kind: "terrain", shape: "rect", paint: "blocked" });
    view.onBackgroundDown(pointer({ x: 665, y: 665 }));
    view.onPointerMove(pointer({ x: 900, y: 900 }));
    view.onPointerUp(pointer({ x: 900, y: 900 }));
    expect(callbacks.paintTerrain).toHaveBeenCalledWith("base", [{ row: 9, start: 9, end: 9, kind: "blocked" }], expect.anything());
  });

  it("with no map, says so and paints nothing", () => {
    const state = emptyRoomState("r");
    const { view, callbacks, pointer } = board(brush, state);
    view.onBackgroundDown(pointer({ x: 35, y: 35 }));
    view.onPointerUp(pointer({ x: 35, y: 35 }));
    expect(callbacks.terrainNotice).toHaveBeenCalledWith("needsMap");
    expect(callbacks.paintTerrain).not.toHaveBeenCalled();
  });
});

describe("the Doors tool on the board (board-doors-tool, FR-GM-18)", () => {
  const withDoor = (): RoomState => {
    const state = withMap();
    state.walls = {
      door: { id: "door", a: { x: 140, y: 0 }, b: { x: 140, y: 140 }, portal: { kind: "door", state: "closed" } },
      wall: { id: "wall", a: { x: 350, y: 0 }, b: { x: 350, y: 140 } },
    };
    return state;
  };
  const doors = (mode: "toggle" | "lock"): BoardTool => ({ kind: "doors", mode });

  it("a click on a door applies the current mode", () => {
    const { view, callbacks, pointer } = board(doors("lock"), withDoor());
    view.onBackgroundDown(pointer({ x: 141, y: 70 }));
    view.onPointerUp(pointer({ x: 141, y: 70 }));
    expect(callbacks.setPortal).toHaveBeenCalledWith("door", "lock");
    expect(callbacks.togglePortal).not.toHaveBeenCalled();
  });

  it("a click on a plain wall or bare map does nothing, and does not clear the selection", () => {
    const { view, callbacks, pointer } = board(doors("toggle"), withDoor());
    for (const at of [{ x: 350, y: 70 }, { x: 500, y: 500 }]) {
      view.onBackgroundDown(pointer(at));
      view.onPointerUp(pointer(at));
    }
    expect(callbacks.setPortal).not.toHaveBeenCalled();
    expect(callbacks.selectToken).not.toHaveBeenCalled();
  });

  it("a drag pans instead of using the door", () => {
    const { view, callbacks, pointer } = board(doors("toggle"), withDoor());
    view.onBackgroundDown(pointer({ x: 141, y: 70 }));
    view.onPointerMove(pointer({ x: 300, y: 300 }));
    view.onPointerUp(pointer({ x: 300, y: 300 }));
    expect(callbacks.setPortal).not.toHaveBeenCalled();
  });

  it("highlights the door under the pointer", () => {
    const { view, pointer } = board(doors("toggle"), withDoor());
    view.onPointerMove(pointer({ x: 141, y: 70 }));
    expect((view as unknown as { hoveredPortalId: string | null }).hoveredPortalId).toBe("door");
    view.onPointerMove(pointer({ x: 500, y: 500 }));
    expect((view as unknown as { hoveredPortalId: string | null }).hoveredPortalId).toBeNull();
  });

  it("Select still opens a door on click", () => {
    const { view, callbacks, pointer } = board({ kind: "select" }, withDoor());
    view.onBackgroundDown(pointer({ x: 141, y: 70 }));
    view.onPointerUp(pointer({ x: 141, y: 70 }));
    expect(callbacks.togglePortal).toHaveBeenCalledWith("door", false);
  });
});
