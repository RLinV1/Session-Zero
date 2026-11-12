// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type Point } from "@vtt/shared";
import { slideDistance, slideDuration } from "../src/board/tokenSlide";
import { BoardView } from "../src/board/boardView";

/** A board with just enough to run path animations: one token sprite, and the animation loop by hand. */
function board() {
  const positions: Point[] = [];
  const container = { destroyed: false, position: { set: (x: number, y: number) => positions.push({ x, y }) } };
  const view = Object.create(BoardView.prototype) as {
    slide(tokenId: string, points: readonly Point[], gaps?: readonly number[], options?: { capMs?: number; own?: boolean }): boolean;
    stopSlides(): void;
    animations: Set<(now: number) => boolean>;
    pathMoves: Map<string, number>;
    pendingMoves: Map<string, Point>;
    tableReduced: boolean;
  };
  Object.assign(view, {
    state: { scene: { grid: { ...DEFAULT_GRID, cellSize: 100 } }, tokens: { t: { position: { x: 400, y: 0 } } } },
    tokens: new Map([["t", { container }]]),
    animations: new Set(), pathMoves: new Map(), ownSlides: new Set(), slideIds: 0, pendingMoves: new Map(), drag: null,
    osReduced: false, tableReduced: false, schedule: vi.fn(), invalidate: vi.fn(),
  });
  // The slide's clock starts at 0, so `frame(ms)` is `ms` after it started.
  vi.spyOn(performance, "now").mockReturnValue(0);
  /** Runs the animation loop at `now` ms after it started; true while it still plays. */
  const frame = (now: number) => {
    let playing = false;
    for (const step of [...view.animations]) if (step(now)) playing = true; else view.animations.delete(step);
    return playing;
  };
  return { view, container, positions, frame };
}

describe("other players' path moves (FR-TAC-02, ADR 0055)", () => {
  it("travels the path and rests where the room says the token is", () => {
    const { view, positions, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }]);
    expect(view.pathMoves.has("t")).toBe(true);
    expect(frame(5000)).toBe(false);
    expect(positions.at(-1)).toEqual({ x: 400, y: 0 });
    expect(view.pathMoves.has("t")).toBe(false);
  });

  it("jumps across a hidden stretch instead of sliding through it", () => {
    const { view, positions, frame } = board();
    // Stretch 1 (100 -> 300) is hidden: the token never appears between those points.
    view.slide("t", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }, { x: 400, y: 0 }], [1]);
    for (let ms = 0; ms <= 400; ms += 5) frame(ms);
    expect(positions.some((p) => p.x > 100 + 1e-6 && p.x < 300 - 1e-6)).toBe(false);
  });

  it("stops and forgets the path when the sprite goes away mid-move", () => {
    const { view, container, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }]);
    container.destroyed = true;
    expect(frame(10)).toBe(false);
    expect(view.pathMoves.has("t")).toBe(false);
  });
});

describe("slides start slowly and keep a steady pace (token-slide)", () => {
  it("draws the token along the timing curve", () => {
    const { view, positions, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }]);
    const duration = slideDuration(400, 100);
    for (const ms of [50, 100, 250, 600]) {
      frame(ms);
      expect(positions.at(-1)!.x).toBeCloseTo(slideDistance(ms, 400, duration), 6);
    }
    // Under a third of a square after 100 ms: a refused move barely shows.
    expect(slideDistance(100, 400, duration)).toBeLessThan(100 / 3);
    expect(frame(duration + 1)).toBe(false);
    expect(positions.at(-1)).toEqual({ x: 400, y: 0 });
  });

  it("jumps for a move under one square, and under reduced motion", () => {
    const short = board();
    expect(short.view.slide("t", [{ x: 0, y: 0 }, { x: 60, y: 0 }])).toBe(false);
    expect(short.positions).toEqual([{ x: 400, y: 0 }]);
    expect(short.view.animations.size).toBe(0);
    const reduced = board();
    reduced.view.tableReduced = true;
    expect(reduced.view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }])).toBe(false);
    expect(reduced.positions).toEqual([{ x: 400, y: 0 }]);
  });

  it("fits a capped slide into its time", () => {
    const { view, positions, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 3000, y: 0 }], [], { capMs: 700 });
    expect(frame(699)).toBe(true);
    expect(frame(700)).toBe(false);
    expect(positions.at(-1)).toEqual({ x: 400, y: 0 });
  });

  it("puts every token where it rests when slides are stopped", () => {
    const { view, positions, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }]);
    frame(100);
    view.stopSlides();
    expect(positions.at(-1)).toEqual({ x: 400, y: 0 });
    expect(view.pathMoves.size).toBe(0);
    expect(frame(200)).toBe(false);
  });

  it("lets a newer slide of the same token replace the running one", () => {
    const { view, positions, frame } = board();
    view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }]);
    frame(100);
    view.slide("t", [{ x: 0, y: 500 }, { x: 400, y: 500 }]);
    frame(300);
    expect(positions.at(-1)!.y).toBe(500);
  });
});

describe("which moves a board slides (token-slide)", () => {
  it("leaves a token alone while this board is sliding or holding it for its own drop", () => {
    const own = board();
    expect(own.view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }], [], { own: true })).toBe(true);
    // The event confirming that drop arrives: nothing restarts.
    expect(own.view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }])).toBe(false);
    expect(own.view.animations.size).toBe(1);
    const pending = board();
    pending.view.pendingMoves.set("t", { x: 400, y: 0 });
    expect(pending.view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }])).toBe(false);
  });

  it("slides a move this account made from another tab, which this board never dropped", () => {
    const other = board();
    expect(other.view.slide("t", [{ x: 0, y: 0 }, { x: 400, y: 0 }])).toBe(true);
  });
});

