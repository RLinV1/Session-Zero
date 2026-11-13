// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import type { BoardCallbacks } from "../src/board/boardView";

const mock = vi.hoisted(() => ({ ruler: vi.fn(), callbacks: null as BoardCallbacks | null }));
vi.mock("../src/board/boardView", () => ({ BoardView: class {
  constructor(_host: unknown, callbacks: BoardCallbacks) { mock.callbacks = callbacks; }
  init = async () => {};
  destroy() {} update() {} setGmFogView() {} setShowWalls() {} setShowPortals() {} setReadOnly() {} setGridPreview() {} setTool() {} setPlacement() {} setViewedTokens() {} setGroupSelection() {}
  setShowTerrain() {} setRepositionToken() {} setAttackRange() {} refreshMovementPreview() {} cancelMovement() { return false; }
  setMovementRuler = mock.ruler;
} }));
vi.mock("../src/board/TokenCard", () => ({ TokenCard: () => null }));
import { Board } from "../src/board/Board";

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
const you: Participant = { id: "p", displayName: "Player", role: "player" };
const owned: Token = { id: "owned", name: "Ogre", position: { x: 140, y: 210 }, size: 2, rotation: 0, color: "#ffffff", imageUrl: null, ownerIds: ["p"], hidden: false, stats: { hp: 1, maxHp: 1, ac: null }, conditions: [] };

describe("personal movement planner board integration (FR-TAC-03)", () => {
  it("uses only a selected controllable token centre and never sends measurements", async () => {
    const state = emptyRoomState("r");
    state.tokens = { owned, other: { ...owned, id: "other", ownerIds: [] } };
    const command = vi.fn(); const preview = vi.fn(); const ephemeral = vi.fn();
    const connection = { command, preview, ephemeral, onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
    render(<Board connection={connection} state={state} you={you} gridPreview={null} />);
    await act(async () => {});
    expect(screen.queryByRole("group", { name: "Measure options" })).toBeNull();
    act(() => mock.callbacks!.selectToken("owned"));
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(mock.ruler).toHaveBeenLastCalledWith(owned.position, 2);
    // Rulers show length only: no movement budget to set (ruler-modes).
    fireEvent.click(screen.getByRole("button", { name: "Movement" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    act(() => mock.callbacks!.movementFeedback!("20 ft"));
    expect(screen.getByRole("status").textContent).toBe("20 ft");
    act(() => mock.callbacks!.selectToken("other"));
    expect(mock.ruler).toHaveBeenLastCalledWith(null, 2);
    act(() => mock.callbacks!.selectToken(null));
    expect(mock.ruler).toHaveBeenLastCalledWith(null, 1);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByRole("group", { name: "Measure options" })).toBeNull();
    expect(command).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled(); expect(ephemeral).not.toHaveBeenCalled();
  });

  it("the Terrain tool with no map shows a notice, and Terrain is a Show filter", async () => {
    const connection = { command: vi.fn(), preview: vi.fn(), ephemeral: vi.fn(), onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
    render(<Board connection={connection} state={emptyRoomState("r")} you={{ id: "g", displayName: "GM", role: "gm" }} gridPreview={null} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Show terrain" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paint terrain" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Terrain" }));
    act(() => mock.callbacks!.terrainNotice!("needsMap"));
    expect(screen.getByText("Add a map first to paint terrain.")).toBeTruthy();
    expect(screen.queryByText("Live terrain")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    expect((screen.getByLabelText("Terrain") as HTMLInputElement).checked).toBe(true);
  });
});
