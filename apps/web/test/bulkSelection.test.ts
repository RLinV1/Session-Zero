// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type Point, type RoomState, type Token, type Wall } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { boxBetween, tokensInBox } from "../src/board/marquee";
import type { BoardTool } from "../src/board/tools";
import { compactTurnOrder } from "../src/panels/turnOrderView";

const gm: Participant = { id: "gm", displayName: "GM", role: "gm" };
const alice: Participant = { id: "alice", displayName: "Alice", role: "player" };

const token = (id: string, at: Point, extra: Partial<Token> = {}): Token => ({
  id, name: id, position: at, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

describe("compact turn order (FR-GM-21, gm-bulk-select)", () => {
  const order = Array.from({ length: 11 }, (_, i) => `t${i}`);

  it("shows three rows from the active turn, the rest folded", () => {
    const { shown, rest } = compactTurnOrder(order, 0);
    expect(shown.map((r) => r.tokenId)).toEqual(["t0", "t1", "t2"]);
    expect(rest).toHaveLength(8);
  });

  it("wraps past the end into the next round, marking where", () => {
    const { shown, rest } = compactTurnOrder(order, 9);
    expect(shown.map((r) => [r.tokenId, r.index, r.startsNextRound])).toEqual([["t9", 9, false], ["t10", 10, false], ["t0", 0, true]]);
    expect(rest.map((r) => r.tokenId)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]);
    expect(rest.some((r) => r.startsNextRound)).toBe(false);
  });

  it("never marks a new round when the active turn is first", () => {
    const { shown, rest } = compactTurnOrder(order, 0);
    expect([...shown, ...rest].some((r) => r.startsNextRound)).toBe(false);
  });

  it("folds only when at least two rows would be hidden", () => {
    expect(compactTurnOrder(["a", "b", "c", "d"], 2).rest).toEqual([]);
    expect(compactTurnOrder(["a", "b", "c", "d", "e"], 2).rest.map((r) => r.tokenId)).toEqual(["a", "b"]);
    expect(compactTurnOrder([], 0)).toEqual({ shown: [], rest: [] });
  });
});

describe("Shift-drag box (FR-GM-10, ADR 0074)", () => {
  const tokens = [token("a", { x: 35, y: 35 }), token("b", { x: 105, y: 35 }), token("c", { x: 245, y: 245 }), token("mine", { x: 70, y: 70 }, { ownerIds: ["alice"] }), token("hid", { x: 50, y: 50 }, { hidden: true })];

  it("is the same box whichever way it was dragged", () => {
    expect(boxBetween({ x: 100, y: 10 }, { x: 0, y: 90 })).toEqual({ x: 0, y: 10, width: 100, height: 80 });
  });

  it("selects every token whose centre is inside, hidden ones too, for the GM", () => {
    expect(tokensInBox(tokens, { x: 140, y: 100 }, { x: 0, y: 0 }, gm).sort()).toEqual(["a", "b", "hid", "mine"]);
  });

  it("counts a centre on the edge, and not a token only partly inside", () => {
    expect(tokensInBox(tokens, { x: 35, y: 35 }, { x: 70, y: 70 }, gm).sort()).toEqual(["a", "hid", "mine"]);
    expect(tokensInBox(tokens, { x: 200, y: 200 }, { x: 240, y: 240 }, gm)).toEqual([]);
  });

  it("never gives a player a token they don't control", () => {
    expect(tokensInBox(tokens, { x: 0, y: 0 }, { x: 300, y: 300 }, alice)).toEqual(["mine"]);
  });
});

type Harness = {
  state: RoomState;
  you: Participant;
  readOnly: boolean;
  pan: unknown;
  onBackgroundDown(e: unknown): void;
  onPointerMove(e: unknown): void;
  onPointerUp(e: unknown): void;
  cancelMovement(): boolean;
  setTool(tool: BoardTool): void;
};

/** A board run by its pointer handlers; not initialised, so nothing draws. Board points equal screen points. */
function board(you: Participant = gm) {
  const callbacks = {
    selectToken: vi.fn(), selectTokens: vi.fn(), togglePortal: vi.fn(), toggleGroupToken: vi.fn(), aimEnd: vi.fn(),
  };
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness;
  const state: RoomState = {
    ...emptyRoomState("r"),
    scene: { ...emptyRoomState("r").scene, map: { url: "/m.png", width: 700, height: 700 } },
    tokens: { a: token("a", { x: 35, y: 35 }), b: token("b", { x: 105, y: 35 }), c: token("c", { x: 385, y: 385 }) },
  };
  const position = { set: vi.fn() };
  Object.assign(view, {
    state, you, callbacks, tool: { kind: "select" }, readOnly: false, placement: null, gesture: null, pan: null, placeDown: null, drag: null,
    world: { toLocal: (p: Point) => p, scale: { x: 1 }, x: 0, y: 0, position },
    redrawOverlay: vi.fn(), invalidate: vi.fn(), syncTokens: vi.fn(), drawPortals: vi.fn(), drawWalls: vi.fn(),
    app: { stage: { cursor: "default" } },
  });
  const pointer = (p: Point, shiftKey = false, button = 0) => ({ global: p, button, altKey: false, shiftKey });
  return { view, callbacks, pointer, position };
}

describe("drag-selecting on the board (FR-GM-10, ADR 0074)", () => {
  it("adds the tokens a GM's Shift-drag boxes on empty board to the selection", () => {
    const { view, callbacks, pointer, position } = board();
    view.onBackgroundDown(pointer({ x: 0, y: 0 }, true));
    view.onPointerMove(pointer({ x: 80, y: 40 }, true));
    view.onPointerMove(pointer({ x: 140, y: 70 }, true));
    view.onPointerUp(pointer({ x: 140, y: 70 }, true));
    expect(callbacks.selectTokens).toHaveBeenCalledWith(["a", "b"]);
    // The view stayed put: a Shift-drag selects instead of panning.
    expect(position.set).not.toHaveBeenCalled();
    expect(callbacks.selectToken).not.toHaveBeenCalled();
  });

  it("keeps a plain drag on empty board panning, selecting nothing", () => {
    const { view, callbacks, pointer, position } = board();
    view.onBackgroundDown(pointer({ x: 0, y: 0 }));
    view.onPointerMove(pointer({ x: 140, y: 70 }));
    view.onPointerUp(pointer({ x: 140, y: 70 }));
    expect(position.set).toHaveBeenCalled();
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });

  it("sends nothing for a box around empty map", () => {
    const { view, callbacks, pointer } = board();
    view.onBackgroundDown(pointer({ x: 200, y: 200 }, true));
    view.onPointerMove(pointer({ x: 300, y: 300 }, true));
    view.onPointerUp(pointer({ x: 300, y: 300 }, true));
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });

  it("treats a Shift press that stays put as a click: it locks a door", () => {
    const { view, callbacks, pointer } = board();
    const door: Wall = { id: "d1", a: { x: 0, y: 140 }, b: { x: 140, y: 140 }, portal: { kind: "door", state: "closed" } } as Wall;
    view.state = { ...view.state, walls: { d1: door } };
    view.onBackgroundDown(pointer({ x: 70, y: 140 }, true));
    view.onPointerUp(pointer({ x: 71, y: 140 }, true));
    expect(callbacks.togglePortal).toHaveBeenCalledWith("d1", true);
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });

  it("clears like any click when a Shift press on bare map stays put", () => {
    const { view, callbacks, pointer } = board();
    view.onBackgroundDown(pointer({ x: 300, y: 300 }, true));
    view.onPointerUp(pointer({ x: 300, y: 300 }, true));
    expect(callbacks.selectToken).toHaveBeenCalledWith(null);
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });

  it("drops a box on Escape", () => {
    const { view, callbacks, pointer } = board();
    view.onBackgroundDown(pointer({ x: 0, y: 0 }, true));
    view.onPointerMove(pointer({ x: 140, y: 70 }, true));
    expect(view.cancelMovement()).toBe(true);
    view.onPointerUp(pointer({ x: 140, y: 70 }, true));
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });

  it("gives players no box: a Shift-drag pans as before", () => {
    const { view, callbacks, pointer, position } = board(alice);
    view.onBackgroundDown(pointer({ x: 0, y: 0 }, true));
    view.onPointerMove(pointer({ x: 140, y: 70 }, true));
    view.onPointerUp(pointer({ x: 140, y: 70 }, true));
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
    expect(position.set).toHaveBeenCalled();
  });

  it("gives no box on a read-only board, such as viewing as a player", () => {
    const { view, callbacks, pointer } = board();
    view.readOnly = true;
    view.onBackgroundDown(pointer({ x: 0, y: 0 }, true));
    view.onPointerMove(pointer({ x: 140, y: 70 }, true));
    view.onPointerUp(pointer({ x: 140, y: 70 }, true));
    expect(callbacks.selectTokens).not.toHaveBeenCalled();
  });
});
