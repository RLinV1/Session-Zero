// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, filterStateForViewer, movementFeedbackForViewer, type MovementPreviewRequest, type RoomState, type Token, type Participant } from "@vtt/shared";
import { Modal } from "../src/ui/Modal";
import { TerrainSetup } from "../src/pages/mapEditor/TerrainSetup";
import { movementPreview, movementReadout } from "../src/board/movementRuler";
import { draftFrom, planDraftSave, applyToDraft } from "../src/pages/mapEditor/mapDraft";
import { stubMapEditorEnvironment, fakeConnection, room, drag } from "./mapEditorHarness";
beforeEach(stubMapEditorEnvironment);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("terrain tools and mover ruler (FR-TAC-03, FR-GM-15/23)", () => {
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
    await screen.findByText("Terrain changed");
    fireEvent.click(screen.getByRole("button", { name: "Apply preview" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ context: { revision: 5, boardEpoch: 2 } });
  });
  it("keeps private base painting out of the connection until one guarded save", () => {
    const state = room();
    const draft = applyToDraft(draftFrom(state), { type: "terrain.paint", layerId: "base", paint: [{ row: 1, start: 1, end: 2, kind: "blocked" }], context: { boardEpoch: 0, revision: 0 } }, () => "id")!;
    expect(state.terrain).toBeUndefined();
    expect(planDraftSave(state, draft)).toEqual([expect.objectContaining({ type: "scene.savePreparation", context: { boardEpoch: 0, revision: 0 }, edits: [expect.objectContaining({ type: "terrain.paint", layerId: "base" })] })]);
  });
  it("labels cost and unknown coverage without using hidden layouts or ghosts", () => {
    const gm: Participant = { id: "g", role: "gm", displayName: "G" }, player: Participant = { id: "p", role: "player", displayName: "P" };
    const token: Token = { id: "t", name: "Hero", position: { x: 25, y: 25 }, size: 1, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [player.id], hidden: false, conditions: [], stats: { hp: null, maxHp: null, ac: null } };
    const state = { ...emptyRoomState("r"), ...room(), tokens: { t: token }, terrain: { base: [{ row: 0, start: 1, end: 1, kind: "difficult" as const }], effects: [] } };
    expect(movementPreview(state, gm, token, token.position, { x: 125, y: 25 })).toEqual({ label: "10 ft · Cost 20 ft", obstruction: "clear" });
    const blocked = { ...state, walls: { w: { id: "w", a: { x: 100, y: 0 }, b: { x: 100, y: 100 } } } };
    expect(movementPreview(blocked, gm, token, token.position, { x: 125, y: 25 }).obstruction).toBe("blocked");
    expect(movementReadout(blocked, gm, token, token.position, { x: 125, y: 25 })).toBe("10 ft · Cost 20 ft");
    const limited = { ...state, scene: { ...state.scene, lineOfSight: true, sightRange: 5 } };
    const visible = filterStateForViewer(limited, player);
    const before = JSON.stringify(visible);
    expect(movementPreview(visible, player, token, token.position, { x: 225, y: 25 })).toEqual({ label: "20 ft · Cost unknown", obstruction: "unknown" });
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
      expect(movementPreview(filterStateForViewer(fogged, player), player, current, current.position, target)).toEqual({ label: `${Math.abs(to! - from!) / 10} ft · Cost unknown`, obstruction: "unknown" });
      expect(movementFeedbackForViewer(fogged, player, { ...request, from: current.position, to: target })).toBe("unknown");
    }
    const strip = { ...state, fog: { f: { ...state.fog.f!, points: [{ x: 99, y: 0 }, { x: 99.1, y: 0 }, { x: 99.1, y: 50 }, { x: 99, y: 50 }] } } };
    expect(movementPreview(filterStateForViewer(strip, player), player, token, token.position, request.to)).toEqual({ label: "15 ft · Cost unknown", obstruction: "unknown" });
    expect(movementReadout(state, gm, token, token.position, request.to)).toBe("15 ft · Cost 25 ft");
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
