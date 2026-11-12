// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, filterStateForViewer, movementFeedbackForViewer, type MovementPreviewRequest, type RoomState, type Token, type Participant } from "@vtt/shared";
import { Modal } from "../src/ui/Modal";
import { fixedPosition } from "../src/ui/Popover";
import { TerrainSetup } from "../src/pages/mapEditor/TerrainSetup";
import { movementPreview, movementReadout } from "../src/board/movementRuler";
import { draftFrom, planDraftSave, applyToDraft } from "../src/pages/mapEditor/mapDraft";
import { stubMapEditorEnvironment, fakeConnection, room, drag } from "./mapEditorHarness";
beforeEach(stubMapEditorEnvironment);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("terrain tools and mover ruler (FR-TAC-03, FR-GM-15/23)", () => {
  it("creates a layer from the plus button and caps at 32 (FR-TAC-03)", async () => {
    const { connection, commands } = fakeConnection();
    const { rerender } = render(<TerrainSetup connection={connection} state={room()} live />);
    expect(screen.queryByLabelText("New layer name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    const input = screen.getByLabelText("New layer name");
    fireEvent.change(input, { target: { value: "Ice" } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(commands).toEqual([expect.objectContaining({ type: "terrain.effect.create", name: "Ice" })]));
    await waitFor(() => expect(screen.queryByLabelText("New layer name")).toBeNull());
    const effects = Array.from({ length: 32 }, (_, i) => ({ id: `e${i}`, name: `L${i}`, runs: [] }));
    rerender(<TerrainSetup connection={connection} state={{ ...room(), terrain: { base: [], effects } }} live />);
    expect((screen.getByRole("button", { name: "Add layer" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("focuses the new layer name input when + is clicked in a live room (FR-TAC-03)", () => {
    const { connection } = fakeConnection();
    render(<TerrainSetup connection={connection} state={room()} live />);
    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    expect(document.activeElement).toBe(screen.getByLabelText("New layer name"));
  });
  it("hides Add layer in the library editor and says why, instead of a dead button (FR-TAC-03)", () => {
    const { connection } = fakeConnection();
    render(<TerrainSetup connection={connection} state={room()} />);
    expect(screen.queryByRole("button", { name: "Add layer" })).toBeNull();
    expect(screen.getByText(/Layers are for room maps/)).toBeTruthy();
  });
  it("offers Add layer in a room map-editor draft (FR-TAC-03)", () => {
    const { connection } = fakeConnection();
    render(<TerrainSetup connection={connection} state={room()} layers />);
    expect(screen.getByRole("button", { name: "Add layer" })).toBeTruthy();
    expect(screen.queryByText(/Layers are for room maps/)).toBeNull();
  });
  it("keeps a fixed popover fully inside the window", () => {
    const view = { innerWidth: 400, innerHeight: 300 }, panel = { width: 256, height: 120 };
    // Right-aligned to a button near the left edge: shifted in, not cut off.
    expect(fixedPosition({ top: 10, bottom: 40, left: 20, right: 60 }, panel, "right", view).left).toBe(8);
    // Near the right edge: pulled back so the right side stays visible.
    expect(fixedPosition({ top: 10, bottom: 40, left: 380, right: 400 }, panel, "left", view).left).toBe(400 - 256 - 8);
    // No room below: opens above.
    expect(fixedPosition({ top: 250, bottom: 280, left: 100, right: 140 }, panel, "left", view).top).toBe(250 - 8 - 120);
  });
  it("opens the Guide with the keyboard rows and closes on Escape", () => {
    const { connection } = fakeConnection();
    render(<TerrainSetup connection={connection} state={room()} live />);
    expect(screen.queryByText(/Esc cancels/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guide" }));
    expect(screen.getByText(/Esc cancels/)).toBeTruthy();
    expect(screen.getByText(/Undo each stroke from Activity/)).toBeTruthy();
    fireEvent.keyDown(screen.getByText(/Esc cancels/), { key: "Escape" });
    expect(screen.queryByText(/Esc cancels/)).toBeNull();
  });
  it("Escape closes the Guide before the surrounding terrain editor", () => {
    const { connection } = fakeConnection(), close = vi.fn();
    render(<Modal open title="Terrain" onClose={close}><TerrainSetup connection={connection} state={room()} live /></Modal>);
    const guide = screen.getByRole("button", { name: "Guide" });
    fireEvent.click(guide);
    fireEvent.keyDown(screen.getByText(/Esc cancels/), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByText(/Esc cancels/)).toBeNull();
    expect(document.activeElement).toBe(guide);
  });
  it("paints one rectangle as one command and cancels keyboard previews", async () => {
    const { connection, commands } = fakeConnection();
    render(<TerrainSetup connection={connection} state={room()} live />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    const canvas = screen.getByRole("application", { name: "Live terrain canvas" });
    drag(canvas, { x: 25, y: 25 }, { x: 125, y: 75 });
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 0, end: 2, kind: "difficult" }, { row: 1, start: 0, end: 2, kind: "difficult" }] });
    fireEvent.keyDown(canvas, { key: "Enter" }); fireEvent.keyDown(canvas, { key: "ArrowRight" }); fireEvent.keyDown(canvas, { key: "Escape" });
    expect(commands).toHaveLength(1);
  });
  it("Escape cancels a stroke before it can close the surrounding editor", () => {
    const { connection } = fakeConnection(), close = vi.fn();
    render(<Modal open title="Terrain" onClose={close}><TerrainSetup connection={connection} state={room()} /></Modal>);
    const canvas = screen.getByRole("application");
    fireEvent.keyDown(canvas, { key: "Enter" }); fireEvent.keyDown(canvas, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
  });
  it("keeps a refused gesture for retry without silently rebasing it", async () => {
    const { connection, commands } = fakeConnection();
    vi.mocked(connection.command).mockImplementationOnce(async () => ({ ok: false, code: "invalid", message: "Terrain changed" }));
    render(<TerrainSetup connection={connection} state={{ ...room(), terrainRevision: 5, boardEpoch: 2 }} />);
    const canvas = screen.getByRole("application"); drag(canvas, { x: 25, y: 25 }, { x: 75, y: 25 });
    await screen.findByText(/Terrain changed.*Press Enter to retry or Esc to cancel/);
    expect(screen.queryByRole("button", { name: /Apply preview|Cancel stroke/ })).toBeNull();
    fireEvent.keyDown(canvas, { key: "Enter" });
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ context: { revision: 5, boardEpoch: 2 } });
  });
  it("after a failed save, Enter retries and a fresh press replaces the stale stroke", async () => {
    const { connection, commands } = fakeConnection();
    vi.mocked(connection.command).mockImplementationOnce(async () => { throw new Error("offline"); });
    render(<TerrainSetup connection={connection} state={room()} live />);
    const canvas = screen.getByRole("application", { name: "Live terrain canvas" }); drag(canvas, { x: 25, y: 25 }, { x: 75, y: 25 });
    await screen.findByText(/Couldn't save terrain.*Press Enter to retry or Esc to cancel/);
    drag(canvas, { x: 25, y: 125 }, { x: 25, y: 125 });
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ type: "terrain.paint", paint: [{ row: 2, start: 0, end: 0, kind: "difficult" }] });
  });
  it("keeps private base painting out of the connection until one guarded save", () => {
    const state = room();
    const draft = applyToDraft(draftFrom(state), { type: "terrain.paint", layerId: "base", paint: [{ row: 1, start: 1, end: 2, kind: "blocked" }], context: { boardEpoch: 0, revision: 0 } }, () => "id")!;
    expect(state.terrain).toBeUndefined();
    expect(planDraftSave(state, draft)).toEqual([expect.objectContaining({ type: "scene.savePreparation", context: { boardEpoch: 0, revision: 0 }, edits: [expect.objectContaining({ type: "terrain.paint", layerId: "base" })] })]);
  });
  it("labels a straight move with distance only, without using hidden layouts or ghosts (ADR 0055)", () => {
    const gm: Participant = { id: "g", role: "gm", displayName: "G" }, player: Participant = { id: "p", role: "player", displayName: "P" };
    const token: Token = { id: "t", name: "Hero", position: { x: 25, y: 25 }, size: 1, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [player.id], hidden: false, conditions: [], stats: { hp: null, maxHp: null, ac: null } };
    const state = { ...emptyRoomState("r"), ...room(), tokens: { t: token }, terrain: { base: [{ row: 0, start: 1, end: 1, kind: "difficult" as const }], effects: [] } };
    expect(movementPreview(state, gm, token, token.position, { x: 125, y: 25 })).toEqual({ label: "10 ft", obstruction: "clear" });
    const blocked = { ...state, walls: { w: { id: "w", a: { x: 100, y: 0 }, b: { x: 100, y: 100 } } } };
    expect(movementPreview(blocked, gm, token, token.position, { x: 125, y: 25 }).obstruction).toBe("blocked");
    expect(movementReadout(blocked, gm, token, token.position, { x: 125, y: 25 })).toBe("10 ft");
    const limited = { ...state, scene: { ...state.scene, lineOfSight: true, sightRange: 5 } };
    const visible = filterStateForViewer(limited, player);
    const before = JSON.stringify(visible);
    expect(movementPreview(visible, player, token, token.position, { x: 225, y: 25 })).toEqual({ label: "20 ft", obstruction: "unknown" });
    expect(JSON.stringify(visible)).toBe(before);
  });
  it("keeps permitted owner fog routes uncertain, GM feedback accurate and Reposition destination checked", () => {
    const gm: Participant = { id: "g", role: "gm", displayName: "G" }, player: Participant = { id: "p", role: "player", displayName: "P" };
    const token: Token = { id: "t", name: "Hero", position: { x: 25, y: 25 }, size: 1, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [player.id], hidden: false, conditions: [], stats: { hp: null, maxHp: null, ac: null } };
    const state: RoomState = { ...room(), tokens: { t: token }, fog: { f: { id: "f", shape: "rect", points: [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 50 }, { x: 50, y: 50 }] } }, terrain: { base: [{ row: 0, start: 1, end: 1, kind: "difficult" }], effects: [] } };
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "gm-fog", tokenId: token.id, from: token.position, to: { x: 175, y: 25 }, boardEpoch: 0 };
    for (const [from, to] of [[25, 75], [75, 125], [25, 175], [125, 175]]) {
      const current = { ...token, position: { x: from!, y: 25 } };
      const fogged = { ...state, tokens: { t: current } }, target = { x: to!, y: 25 };
      expect(movementPreview(fogged, gm, current, current.position, target).obstruction).toBe("clear");
      expect(movementFeedbackForViewer(fogged, gm, { ...request, from: current.position, to: target })).toBe("clear");
      expect(movementPreview(filterStateForViewer(fogged, player), player, current, current.position, target)).toEqual({ label: `${Math.abs(to! - from!) / 10} ft`, obstruction: "unknown" });
      expect(movementFeedbackForViewer(fogged, player, { ...request, from: current.position, to: target })).toBe("unknown");
    }
    const strip = { ...state, fog: { f: { ...state.fog.f!, points: [{ x: 99, y: 0 }, { x: 99.1, y: 0 }, { x: 99.1, y: 50 }, { x: 99, y: 50 }] } } };
    expect(movementPreview(filterStateForViewer(strip, player), player, token, token.position, request.to)).toEqual({ label: "15 ft", obstruction: "unknown" });
    expect(movementReadout(state, gm, token, token.position, request.to)).toBe("15 ft");
    const wall = { id: "w", a: { x: 100, y: 0 }, b: { x: 100, y: 50 } };
    const obstacles: RoomState[] = [
      { ...state, terrain: { base: [{ row: 0, start: 1, end: 1, kind: "blocked" }], effects: [] } },
      { ...state, walls: { w: wall } },
      ...(["closed", "locked"] as const).map((status) => ({ ...state, walls: { w: { ...wall, portal: { kind: "door" as const, state: status } } } })),
    ];
    for (const obstacle of obstacles) {
      for (const to of [request.to, { x: 100, y: 25 }]) {
        expect(movementPreview(obstacle, gm, token, token.position, to).obstruction).toBe("blocked");
        expect(movementFeedbackForViewer(obstacle, gm, { ...request, to })).toBe("blocked");
        expect(movementPreview(filterStateForViewer(obstacle, player), player, token, token.position, to).obstruction).toBe("unknown");
        expect(movementFeedbackForViewer(obstacle, player, { ...request, to })).toBe("unknown");
      }
      expect(movementPreview(obstacle, gm, token, token.position, request.to, false, true).obstruction).toBe("clear");
      expect(movementFeedbackForViewer(obstacle, gm, { ...request, reposition: true })).toBe("clear");
      expect(movementPreview(obstacle, gm, token, token.position, { x: 100, y: 25 }, false, true).obstruction).toBe("blocked");
      expect(movementFeedbackForViewer(obstacle, gm, { ...request, to: { x: 100, y: 25 }, reposition: true })).toBe("blocked");
    }
  });
});
