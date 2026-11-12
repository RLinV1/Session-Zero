// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type Point } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";

/** A board with just enough to run path animations: one token sprite, and the animation loop by hand. */
function board() {
  const positions: Point[] = [];
  const container = { destroyed: false, position: { set: (x: number, y: number) => positions.push({ x, y }) } };
  const view = Object.create(BoardView.prototype) as {
    animateTokenPath(tokenId: string, points: readonly Point[], gaps?: readonly number[]): void;
    animations: Set<(now: number) => boolean>;
    pathMoves: Set<string>;
  };
  Object.assign(view, {
    state: { scene: { grid: { ...DEFAULT_GRID, cellSize: 100 } }, tokens: { t: { position: { x: 400, y: 0 } } } },
    tokens: new Map([["t", { container }]]),
    animations: new Set(), pathMoves: new Set(), pendingMoves: new Map(), drag: null,
    osReduced: false, tableReduced: false, schedule: vi.fn(), invalidate: vi.fn(),
  });
  /** Runs the animation loop at `now` ms after it started; true while it still plays. */
  const frame = (now: number) => {
    let playing = false;
    for (const step of [...view.animations]) if (step(performance.now() + now)) playing = true; else view.animations.delete(step);
    return playing;
  };
  return { view, container, positions, frame };
}

describe("other players' path moves (FR-TAC-02, ADR 0055)", () => {
  it("travels the path and rests where the room says the token is", () => {
    const { view, positions, frame } = board();
    view.animateTokenPath("t", [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }]);
    expect(view.pathMoves.has("t")).toBe(true);
    expect(frame(5000)).toBe(false);
    expect(positions.at(-1)).toEqual({ x: 400, y: 0 });
    expect(view.pathMoves.has("t")).toBe(false);
  });

  it("jumps across a hidden stretch instead of sliding through it", () => {
    const { view, positions, frame } = board();
    // Stretch 1 (100 -> 300) is hidden: the token never appears between those points.
    view.animateTokenPath("t", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }, { x: 400, y: 0 }], [1]);
    for (let ms = 0; ms <= 400; ms += 5) frame(ms);
    expect(positions.some((p) => p.x > 100 + 1e-6 && p.x < 300 - 1e-6)).toBe(false);
  });

  it("stops and forgets the path when the sprite goes away mid-move", () => {
    const { view, container, frame } = board();
    view.animateTokenPath("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }]);
    container.destroyed = true;
    expect(frame(10)).toBe(false);
    expect(view.pathMoves.has("t")).toBe(false);
  });
});
