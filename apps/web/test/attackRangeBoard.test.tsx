// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AttackRange, type Participant } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";

const mock = vi.hoisted(() => ({ setAttackRange: vi.fn(), ready: null as (() => void) | null }));
vi.mock("../src/board/boardView", () => ({ BoardView: class {
  // Ready only when the test says so, as Pixi's start-up is on the real board.
  init = () => new Promise<void>((resolve) => { mock.ready = resolve; });
  destroy() {} update() {} setGmFogView() {} setShowWalls() {} setShowPortals() {} setReadOnly() {} setGridPreview() {} setTool() {} setPlacement() {} setViewedTokens() {} setGroupSelection() {}
  setShowTerrain() {} setRepositionToken() {} refreshMovementPreview() {} setMovementRuler() {} cancelMovement() { return false; }
  setAttackRange = mock.setAttackRange;
} }));
vi.mock("../src/board/TokenCard", () => ({ TokenCard: () => null }));
import { Board } from "../src/board/Board";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const you: Participant = { id: "p", displayName: "Player", role: "player" };
const connection = { command: vi.fn(), preview: vi.fn(), ephemeral: vi.fn(), onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;

describe("the board's aim knows the chosen attack's range (attack-range)", () => {
  it("gets a range given before the board was ready, once it is", async () => {
    const melee: AttackRange = { kind: "melee" };
    render(<Board connection={connection} state={emptyRoomState("r")} you={you} gridPreview={null} attackRange={melee} />);
    // The Attack panel says its range as the room loads; the board isn't ready yet.
    expect(mock.setAttackRange).not.toHaveBeenCalled();
    await act(async () => mock.ready!());
    expect(mock.setAttackRange).toHaveBeenLastCalledWith(melee);
  });

  it("passes a later change straight on", async () => {
    const view = render(<Board connection={connection} state={emptyRoomState("r")} you={you} gridPreview={null} attackRange={null} />);
    await act(async () => mock.ready!());
    const bow: AttackRange = { kind: "ranged", distance: 80 };
    view.rerender(<Board connection={connection} state={emptyRoomState("r")} you={you} gridPreview={null} attackRange={bow} />);
    expect(mock.setAttackRange).toHaveBeenLastCalledWith(bow);
  });
});
