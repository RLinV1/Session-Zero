// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type ReplayFrame } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";

const mock = vi.hoisted(() => ({ slide: vi.fn(), stopSlides: vi.fn() }));
vi.mock("../src/board/boardView", () => ({ BoardView: class {
  init = async () => {};
  destroy() {} update() {} setGmFogView() {} setShowWalls() {} setShowPortals() {} setReadOnly() {} setGridPreview() {} setTool() {} setPlacement() {} setViewedTokens() {} setGroupSelection() {}
  setShowTerrain() {} setRepositionToken() {} setAttackRange() {} refreshMovementPreview() {} cancelMovement() { return false; } setMovementRuler() {}
  slide = mock.slide;
  stopSlides = mock.stopSlides;
} }));
vi.mock("../src/board/TokenCard", () => ({ TokenCard: () => null }));
import { Board } from "../src/board/Board";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const gm: Participant = { id: "g", displayName: "GM", role: "gm" };
const connection = { command: vi.fn(), preview: vi.fn(), ephemeral: vi.fn(), onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
const moveFrame = (seq: number): ReplayFrame => ({
  kind: "event", sentence: "GM moved Goblin",
  committed: { seq, at: new Date(0).toISOString(), actorId: gm.id, event: { type: "TokenMoved", tokenId: "goblin", from: { x: 35, y: 35 }, to: { x: 315, y: 35 }, via: [{ x: 175, y: 105 }] } },
});

describe("replays slide each move inside its step (token-slide)", () => {
  it("slides a move stepped forward to, along its path, capped to fit the step", async () => {
    const state = emptyRoomState("r");
    const view = render(<Board connection={connection} state={state} you={gm} gridPreview={null} readOnly suppressLiveEffects replayFrame={null} />);
    await act(async () => {});
    vi.clearAllMocks();
    view.rerender(<Board connection={connection} state={state} you={gm} gridPreview={null} readOnly suppressLiveEffects replayFrame={moveFrame(4)} />);
    expect(mock.stopSlides).toHaveBeenCalledOnce();
    expect(mock.slide).toHaveBeenCalledWith("goblin", [{ x: 35, y: 35 }, { x: 175, y: 105 }, { x: 315, y: 35 }], [], { capMs: 700 });
    expect(mock.stopSlides.mock.invocationCallOrder[0]).toBeLessThan(mock.slide.mock.invocationCallOrder[0]!);
  });

  it("only stops slides when the replay jumps rather than stepping forward", async () => {
    const state = emptyRoomState("r");
    const view = render(<Board connection={connection} state={state} you={gm} gridPreview={null} readOnly suppressLiveEffects replayFrame={moveFrame(4)} />);
    await act(async () => {});
    vi.clearAllMocks();
    view.rerender(<Board connection={connection} state={state} you={gm} gridPreview={null} readOnly suppressLiveEffects replayFrame={null} />);
    expect(mock.stopSlides).toHaveBeenCalledOnce();
    expect(mock.slide).not.toHaveBeenCalled();
  });
});
