// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { slideDistance, slideDuration } from "../src/board/tokenSlide";

/** The centre of square (col, row) on the default 70 px grid. */
const at = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });
const you: Participant = { id: "p", displayName: "P", role: "player" };

/** A stand-in for a Pixi container: where it is drawn, and whether it was destroyed. */
function sprite(start: Point) {
  const c = { x: start.x, y: start.y, alpha: 1, eventMode: "auto", cursor: "", destroyed: false, history: [] as Point[],
    position: { set: (x: number, y: number) => { c.x = x; c.y = y; c.history.push({ x, y }); } },
    destroy: () => { c.destroyed = true; } };
  return c;
}

type Harness = {
  drag: unknown;
  dragGhost: { container: ReturnType<typeof sprite> } | null;
  pendingMoves: Map<string, Point>;
  pathMoves: Map<string, number>;
  animations: Set<(now: number) => boolean>;
  state: RoomState;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
  cancelMovement(): boolean;
  setTool(tool: { kind: string }): void;
  syncTokens(): void;
};

/** A board holding Aria at square (1, 1), with the pointer handlers and the frame loop run by hand. */
function board(moveToken = vi.fn(() => Promise.resolve(true))) {
  const token: Token = { id: "aria", name: "Aria", position: at(1, 1), size: 1, rotation: 0, color: "#c2410c", imageUrl: null, ownerIds: [you.id], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [] };
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 } };
  state.tokens = { aria: token };
  const real = sprite(token.position);
  const ghosts: ReturnType<typeof sprite>[] = [];
  const callbacks = { dragPreview: vi.fn(), dragEnd: vi.fn(), selectToken: vi.fn(), moveToken, requestMovementPreview: vi.fn(), movementFeedback: vi.fn() };
  // Constructed for its pointer handlers (arrow-function fields); nothing is initialised or rendered.
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness;
  Object.assign(view, {
    state, you, callbacks, tool: { kind: "select" }, readOnly: false, placement: null, gesture: null, pan: null, placeDown: null,
    tokens: new Map([["aria", { container: real }]]), pendingMoves: new Map(), pathMoves: new Map(), ownSlides: new Set(), slideIds: 0,
    animations: new Set(), osReduced: false, tableReduced: false, repositionToken: null, localMovementPreview: null, localPlanKey: "",
    movementPreviewId: 0, movementRequest: null, measurement: null, fogPoints: [], dragGhost: null, dragDownAt: { x: 0, y: 0 },
    drag: { tokenId: "aria", offset: { x: 0, y: 0 }, movable: true, origin: token.position, epoch: 0 },
    overlayGraphics: { clear: () => ({}) }, measureLabel: { visible: false }, fxLayer: { addChild: vi.fn() },
    world: { toLocal: (p: Point) => p },
    createTokenView: () => { const c = sprite({ x: 0, y: 0 }); ghosts.push(c); return { container: c }; },
    drawToken: vi.fn(), schedule: vi.fn(), invalidate: vi.fn(), redrawOverlay: vi.fn(), refreshMovementPreview: vi.fn(), syncTokens: vi.fn(),
  });
  vi.spyOn(performance, "now").mockReturnValue(0);
  const frame = (now: number) => { for (const step of [...view.animations]) if (!step(now)) view.animations.delete(step); };
  const pointer = (p: Point, altKey = false) => ({ global: p, altKey, shiftKey: false });
  return { view, real, ghosts, callbacks, frame, pointer, token };
}

describe("the mover drags a faded copy (token-slide)", () => {
  it("moves a half-faded copy with the pointer while the token stays on its square", () => {
    const { view, real, ghosts, pointer } = board();
    view.onPointerMove(pointer(at(3, 1)));
    view.onPointerMove(pointer(at(4, 1)));
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!).toMatchObject({ x: at(4, 1).x, y: at(4, 1).y, alpha: 0.5, eventMode: "none" });
    expect(real.history).toEqual([]);
  });

  it("makes no copy for a click, and moves nothing", () => {
    const { view, real, ghosts, callbacks, pointer } = board();
    view.onPointerUp(pointer({ x: 0, y: 0 }));
    expect(ghosts).toHaveLength(0);
    expect(real.history).toEqual([]);
    expect(callbacks.moveToken).not.toHaveBeenCalled();
    expect(callbacks.selectToken).toHaveBeenCalledWith("aria", false);
  });

  it("leaves no copy behind on drop, cancel or a tool change", () => {
    for (const end of ["drop", "cancel", "tool"] as const) {
      const { view, ghosts, pointer } = board();
      view.onPointerMove(pointer(at(3, 1)));
      if (end === "drop") view.onPointerUp(pointer(at(3, 1)));
      if (end === "cancel") view.cancelMovement();
      if (end === "tool") view.setTool({ kind: "measure" });
      expect(ghosts[0]!.destroyed).toBe(true);
      expect(view.dragGhost).toBeNull();
    }
  });
});

describe("the mover's token slides on drop (token-slide)", () => {
  it("slides along the path it sends, before the server answers, and rests on the new square", () => {
    const { view, real, callbacks, frame, pointer } = board();
    view.onPointerMove(pointer(at(4, 1)));
    view.onPointerUp(pointer(at(4, 1)));
    expect(callbacks.moveToken).toHaveBeenCalledOnce();
    expect(view.pathMoves.has("aria")).toBe(true);
    const duration = slideDuration(3 * 70, 70);
    frame(100);
    expect(real.x - at(1, 1).x).toBeCloseTo(slideDistance(100, 3 * 70, duration), 6);
    frame(duration);
    expect({ x: real.x, y: real.y }).toEqual(at(4, 1));
  });

  it("follows the turns of a path around a Blocked patch", () => {
    const { view, real, frame, pointer } = board();
    // A player plans with the terrain they were sent.
    view.state.terrainView = { runs: [{ row: 1, start: 2, end: 3, kind: "blocked" }], temporary: [] };
    view.onPointerMove(pointer(at(4, 1)));
    view.onPointerUp(pointer(at(4, 1)));
    for (let ms = 0; ms <= 3000; ms += 10) frame(ms);
    // It went round, never through row 1's Blocked squares.
    expect(real.history.some((p) => p.y !== at(1, 1).y)).toBe(true);
    expect({ x: real.x, y: real.y }).toEqual(at(4, 1));
  });

  it("slides back from under a third of a square when refused at 100 ms", async () => {
    let refuse!: (ok: boolean) => void;
    const { view, real, frame, pointer } = board(vi.fn(() => new Promise<boolean>((resolve) => { refuse = resolve; })));
    view.onPointerMove(pointer(at(4, 1)));
    view.onPointerUp(pointer(at(4, 1)));
    frame(100);
    const reached = real.x - at(1, 1).x;
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(70 / 3);
    refuse(false);
    await Promise.resolve(); await Promise.resolve();
    expect(view.pendingMoves.has("aria")).toBe(false);
    expect(view.pathMoves.has("aria")).toBe(true);
    for (let ms = 0; ms <= 1000; ms += 10) frame(ms);
    expect({ x: real.x, y: real.y }).toEqual(at(1, 1));
  });
});

describe("a snapped drop doesn't stack tokens (FR-TAC-02, token-no-stacking)", () => {
  const withBram = (hp: number | null = null) => {
    const b = board();
    b.view.state.tokens.bram = { ...b.token, id: "bram", name: "Bram", ownerIds: [], position: at(3, 1), stats: { hp, maxHp: null, ac: null } };
    const dropRefused = vi.fn();
    Object.assign(b.callbacks, { dropRefused });
    return { ...b, dropRefused };
  };

  it("sends nothing for a snapped drop onto another token, stays put without sliding, and says why", () => {
    const { view, real, callbacks, pointer, dropRefused, frame } = withBram();
    view.onPointerMove(pointer(at(3, 1)));
    view.onPointerUp(pointer(at(3, 1)));
    expect(callbacks.moveToken).not.toHaveBeenCalled();
    expect(dropRefused).toHaveBeenCalledWith("Another token is already there.");
    frame(10_000);
    expect(real.history).toEqual([]);
    expect(view.animations.size).toBe(0);
  });

  it("still sends an Alt (free) drop onto another token", () => {
    const { view, callbacks, pointer, dropRefused } = withBram();
    view.onPointerMove(pointer(at(3, 1), true));
    view.onPointerUp(pointer(at(3, 1), true));
    expect(callbacks.moveToken).toHaveBeenCalledOnce();
    expect(dropRefused).not.toHaveBeenCalled();
  });

  it("sends a snapped drop onto a downed token", () => {
    const { view, callbacks, pointer } = withBram(0);
    view.onPointerMove(pointer(at(3, 1)));
    view.onPointerUp(pointer(at(3, 1)));
    expect(callbacks.moveToken).toHaveBeenCalledOnce();
  });
});
