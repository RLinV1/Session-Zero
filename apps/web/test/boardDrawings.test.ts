// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Drawing, type Participant, type Point, type RoomState } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { DRAW_COLORS, type BoardTool } from "../src/board/tools";

const gm: Participant = { id: "gm", displayName: "GM", role: "gm" };
const alice: Participant = { id: "alice", displayName: "Alice", role: "player" };

type Harness = {
  state: RoomState;
  onBackgroundDown(e: unknown): void;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
  clearMarks(): void;
};

/** A board run by its pointer handlers; not initialised, so nothing draws. */
function board(tool: BoardTool, state: RoomState, you: Participant, answer = true) {
  const callbacks = {
    selectToken: vi.fn(), aimEnd: vi.fn(),
    addDrawing: vi.fn((..._args: unknown[]) => Promise.resolve(answer)),
    removeDrawing: vi.fn((..._args: unknown[]) => Promise.resolve(answer)),
    removeTemplate: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
  };
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness;
  Object.assign(view, {
    state, you, callbacks, tool, readOnly: false, placement: null, gesture: null, pan: null, placeDown: null, drag: null,
    world: { toLocal: (p: Point) => p, scale: { x: 1 }, x: 0, y: 0, position: { set: vi.fn() } },
    redrawOverlay: vi.fn(), invalidate: vi.fn(), syncTokens: vi.fn(), drawPortals: vi.fn(), drawWalls: vi.fn(),
    app: { stage: { cursor: "default" } },
  });
  const pointer = (p: Point) => ({ global: p, button: 0, altKey: false, shiftKey: false });
  const drag = (points: Point[]) => {
    view.onBackgroundDown(pointer(points[0]!));
    for (const p of points.slice(1)) view.onPointerMove(pointer(p));
    view.onPointerUp(pointer(points.at(-1)!));
  };
  return { view, callbacks, drag };
}

function withMap(drawings: Record<string, Drawing> = {}): RoomState {
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 } };
  state.drawings = drawings;
  return state;
}

const red = DRAW_COLORS[0].value;
const line = (id: string, ownerId: string, y: number): Drawing => ({ id, ownerId, kind: "line", color: "blue", from: { x: 100, y }, to: { x: 400, y } });

describe("the Draw tool shares drawings (shared-drawings, FR-TAC-04)", () => {
  it("sends a released rectangle once, in whole map pixels and a named colour", () => {
    const { callbacks, drag } = board({ kind: "draw", shape: "rect", color: red }, withMap(), alice);
    drag([{ x: 100.4, y: 100.6 }, { x: 200, y: 180 }, { x: 300.2, y: 250.7 }]);
    expect(callbacks.addDrawing).toHaveBeenCalledTimes(1);
    expect(callbacks.addDrawing).toHaveBeenCalledWith({ kind: "rect", color: "red", from: { x: 100, y: 101 }, to: { x: 300, y: 251 } });
  });

  it("sends a brush stroke once, simplified and kept on the map", () => {
    const { callbacks, drag } = board({ kind: "draw", shape: "brush", color: red }, withMap(), alice);
    const path = Array.from({ length: 60 }, (_, i) => ({ x: 100 + i * 15, y: 300 }));
    drag(path);
    expect(callbacks.addDrawing).toHaveBeenCalledTimes(1);
    const sent = callbacks.addDrawing.mock.calls[0]![0] as { kind: string; points: number[] };
    expect(sent.kind).toBe("stroke");
    // A straight drag runs off the map's right edge; it comes out as its two ends, the far one on the edge.
    expect(sent.points).toEqual([100, 300, 700, 300]);
  });

  it("drops its pending copy once the server answers, refused or not", async () => {
    const { view, callbacks, drag } = board({ kind: "draw", shape: "line", color: red }, withMap(), alice, false);
    drag([{ x: 100, y: 100 }, { x: 300, y: 100 }]);
    expect((view as unknown as { pendingDrawings: unknown[] }).pendingDrawings).toHaveLength(1);
    await callbacks.addDrawing.mock.results[0]!.value;
    await Promise.resolve();
    expect((view as unknown as { pendingDrawings: unknown[] }).pendingDrawings).toHaveLength(0);
  });
});

describe("the Eraser removes shared drawings (shared-drawings, FR-TAC-04)", () => {
  it("removes a player's own drawing once per sweep and passes over someone else's", () => {
    const state = withMap({ mine: line("mine", alice.id, 100), theirs: line("theirs", "bob", 200) });
    const { callbacks, drag } = board({ kind: "erase" }, state, alice);
    drag([{ x: 250, y: 50 }, { x: 250, y: 100 }, { x: 251, y: 100 }, { x: 250, y: 150 }, { x: 250, y: 250 }]);
    expect(callbacks.removeDrawing).toHaveBeenCalledTimes(1);
    expect(callbacks.removeDrawing).toHaveBeenCalledWith("mine");
  });

  it("lets the GM erase anyone's drawing", () => {
    const state = withMap({ theirs: line("theirs", "bob", 200) });
    const { callbacks, drag } = board({ kind: "erase" }, state, gm);
    drag([{ x: 250, y: 150 }, { x: 250, y: 250 }]);
    expect(callbacks.removeDrawing).toHaveBeenCalledWith("theirs");
  });

  it("Clear erases only your own drawings", () => {
    const state = withMap({ mine: line("mine", alice.id, 100), theirs: line("theirs", "bob", 200) });
    const { view, callbacks } = board({ kind: "select" }, state, alice);
    view.clearMarks();
    expect(callbacks.removeDrawing.mock.calls).toEqual([["mine"]]);
  });
});
