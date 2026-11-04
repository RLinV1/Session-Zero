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
  setShowTerrain() {} setRepositionToken() {} refreshMovementPreview() {} cancelMovement() { return false; }
  setMovementRuler = mock.ruler;
} }));
vi.mock("../src/board/TokenCard", () => ({ TokenCard: () => null }));
import { Board } from "../src/board/Board";

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
const you: Participant = { id: "p", displayName: "Player", role: "player" };
const owned: Token = { id: "owned", name: "Ogre", position: { x: 140, y: 210 }, size: 2, rotation: 0, color: "#ffffff", imageUrl: null, ownerIds: ["p"], hidden: false, stats: { hp: 1, maxHp: 1, ac: null }, conditions: [] };

describe("personal movement planner board integration (FR-TAC-03)", () => {
  it("uses only a selected controllable token centre and never sends settings or measurements", async () => {
    const state = emptyRoomState("r");
    state.tokens = { owned, other: { ...owned, id: "other", ownerIds: [] } };
    const command = vi.fn(); const preview = vi.fn(); const ephemeral = vi.fn();
    const connection = { command, preview, ephemeral, onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
    render(<Board connection={connection} state={state} you={you} gridPreview={null} />);
    await act(async () => {});
    expect(screen.queryByRole("group", { name: "Personal movement planner" })).toBeNull();
    act(() => mock.callbacks!.selectToken("owned"));
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(mock.ruler).toHaveBeenLastCalledWith({ allowance: 30, rule: "equal" }, owned.position, 2);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Movement (ft)" }), { target: { value: "40" } });
    expect(mock.ruler).toHaveBeenLastCalledWith({ allowance: 40, rule: "equal" }, owned.position, 2);
    act(() => mock.callbacks!.movementFeedback!("20 / 40 ft · 20 ft remaining"));
    expect(screen.getByRole("status").textContent).toBe("20 / 40 ft · 20 ft remaining");
    act(() => mock.callbacks!.selectToken("other"));
    expect(mock.ruler).toHaveBeenLastCalledWith({ allowance: 40, rule: "equal" }, null, 2);
    act(() => mock.callbacks!.selectToken(null));
    expect(mock.ruler).toHaveBeenLastCalledWith({ allowance: 40, rule: "equal" }, null, 1);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByRole("group", { name: "Personal movement planner" })).toBeNull();
    expect(command).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled(); expect(ephemeral).not.toHaveBeenCalled();
  });

  it("Paint terrain with no map shows a notice instead of the Live terrain modal, and Terrain is a Show filter", async () => {
    const connection = { command: vi.fn(), preview: vi.fn(), ephemeral: vi.fn(), onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
    render(<Board connection={connection} state={emptyRoomState("r")} you={{ id: "g", displayName: "GM", role: "gm" }} gridPreview={null} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Show terrain" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paint terrain" }));
    expect(screen.getByText("Add a map first to paint terrain.")).toBeTruthy();
    expect(screen.queryByText("Live terrain")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    expect((screen.getByLabelText("Terrain") as HTMLInputElement).checked).toBe(false);
  });
});
