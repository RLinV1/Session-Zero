// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type Participant, type Point } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { hitMark, type BoardTool, type Mark } from "../src/board/tools";
import { DEFAULT_TOOL_OPTIONS, toolFor, type ToolOptions } from "../src/ui/ToolRail";

const grid = DEFAULT_GRID; // 70 px squares
const centre = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });
type Route = Extract<Mark, { kind: "route" }>;

/** A BoardView with only what the ruler's route handling touches, as in movementPreview.test.ts. */
function view(origin: Point | null = null) {
  const you: Participant = { id: "p", displayName: "P", role: "player" };
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 }, grid };
  const v = Object.create(BoardView.prototype) as {
    routeClick(at: Point): void;
    closeRoute(): boolean;
    dropRoutePoint(): boolean;
    cancelRoute(): boolean;
    measurement: Mark | null;
  };
  Object.assign(v, { state, you, measurement: null, routeHover: null, movementOrigin: origin, tool: { kind: "measure", mode: "movement" }, redrawOverlay: vi.fn() });
  const route = () => v.measurement as Route | null;
  return { v, route };
}

describe("ruler mode in tool options (ruler-modes)", () => {
  it("builds a Range measure tool by default and keeps the chosen mode", () => {
    expect(toolFor("measure", DEFAULT_TOOL_OPTIONS)).toEqual({ kind: "measure", mode: "range" });
    expect(toolFor("measure", { ...DEFAULT_TOOL_OPTIONS, measure: { mode: "movement" } })).toEqual({ kind: "measure", mode: "movement" });
  });

  it("reads options saved before the ruler had modes as Range", () => {
    const { measure: _measure, ...old } = DEFAULT_TOOL_OPTIONS;
    expect(toolFor("measure", old as ToolOptions)).toEqual<BoardTool>({ kind: "measure", mode: "range" });
  });
});

describe("Movement-mode route gestures (ruler-modes)", () => {
  it("adds snapped points on click, starting from the first click", () => {
    const { v, route } = view();
    v.routeClick({ x: 10, y: 20 });
    v.routeClick({ x: 220, y: 30 });
    expect(route()).toEqual({ kind: "route", points: [centre(0, 0), centre(3, 0)], done: false });
  });

  it("starts from the selected token", () => {
    const { v, route } = view(centre(1, 1));
    v.routeClick(centre(4, 1));
    expect(route()!.points).toEqual([centre(1, 1), centre(4, 1)]);
  });

  it("finishes on Enter, and a new press after that starts a new route", () => {
    const { v, route } = view();
    v.routeClick(centre(0, 0));
    expect(v.closeRoute()).toBe(false); // A single point is not a route yet.
    v.routeClick(centre(2, 0));
    expect(v.closeRoute()).toBe(true);
    expect(route()!.done).toBe(true);
    v.routeClick(centre(5, 5));
    expect(route()).toEqual({ kind: "route", points: [centre(5, 5)], done: false });
  });

  it("drops the last point on Backspace but never the start", () => {
    const { v, route } = view();
    for (const p of [centre(0, 0), centre(2, 0), centre(2, 2)]) v.routeClick(p);
    expect(v.dropRoutePoint()).toBe(true);
    expect(route()!.points).toEqual([centre(0, 0), centre(2, 0)]);
    expect(v.dropRoutePoint()).toBe(true);
    expect(v.dropRoutePoint()).toBe(false);
    expect(route()!.points).toEqual([centre(0, 0)]);
  });

  it("clears on Escape, then lets Escape leave the tool", () => {
    const { v, route } = view();
    v.routeClick(centre(0, 0));
    v.routeClick(centre(2, 0));
    expect(v.cancelRoute()).toBe(true);
    expect(route()).toBeNull();
    expect(v.cancelRoute()).toBe(false);
  });

  it("lets the eraser hit a route along its runs", () => {
    const route: Route = { kind: "route", points: [centre(0, 0), centre(3, 0), centre(3, 3)], done: true };
    expect(hitMark(route, { x: 245, y: 140 }, 5, grid)).toBe(true);
    expect(hitMark(route, { x: 100, y: 200 }, 5, grid)).toBe(false);
  });
});
