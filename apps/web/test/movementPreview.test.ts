// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { type MovementPreviewFeedback, type MovementPreviewRequest, type Participant, type Point } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { room } from "./mapEditorHarness";

it("keeps a player route tentative until its own reply, and ignores replies for an older drag target or canceled drag", () => {
  const you: Participant = { id: "p", displayName: "Mover", role: "player" };
  const state = room();
  state.tokens.t = { id: "t", name: "Mover", position: { x: 25, y: 25 }, size: 1, rotation: 0, color: "#4477aa", imageUrl: null, ownerIds: [you.id], hidden: false, conditions: [], stats: { hp: null, maxHp: null, ac: null } };
  const request = vi.fn<(r: MovementPreviewRequest) => void>(), line = vi.fn();
  const view = Object.create(BoardView.prototype) as {
    drag: { tokenId: string; movable: boolean; origin: Point; epoch: number; target: { at: Point; free: boolean } } | null;
    refreshMovementPreview(force?: boolean): void;
    showMovementFeedback(feedback: MovementPreviewFeedback): void;
  };
  Object.assign(view, { state, you, readOnly: false, drag: { tokenId: "t", movable: true, origin: { x: 25, y: 25 }, epoch: 0, target: { at: { x: 125, y: 25 }, free: false } }, movementPreviewId: 0, movementRequest: null, repositionToken: null, callbacks: { requestMovementPreview: request }, drawMovementLine: line, showLabel: vi.fn(), invalidate: vi.fn() });
  view.refreshMovementPreview(false);
  const first = request.mock.calls[0]![0];
  expect(line).toHaveBeenLastCalledWith(first.from, first.to, "unknown");
  view.showMovementFeedback({ type: "tokenMoveFeedback", requestId: first.requestId, atSeq: 1, status: "blocked" });
  expect(line).toHaveBeenLastCalledWith(first.from, first.to, "blocked");
  view.drag!.target.at.x = 126; view.refreshMovementPreview(false);
  expect(request).toHaveBeenCalledOnce(); // Same snapped cell keeps its current feedback.
  expect(line).toHaveBeenLastCalledWith(first.from, first.to, "blocked");
  view.drag!.target.at.x = 175; view.refreshMovementPreview(false);
  const second = request.mock.calls[1]![0];
  expect(line).toHaveBeenLastCalledWith(second.from, second.to, "unknown");
  line.mockClear();
  view.showMovementFeedback({ type: "tokenMoveFeedback", requestId: first.requestId, atSeq: 1, status: "clear" });
  expect(line).not.toHaveBeenCalled();
  view.showMovementFeedback({ type: "tokenMoveFeedback", requestId: second.requestId, atSeq: 1, status: "clear" });
  expect(line).toHaveBeenLastCalledWith(second.from, second.to, "clear");
  // A committed edit invalidates the accepted result even with the pointer stationary.
  view.refreshMovementPreview();
  expect(line).toHaveBeenLastCalledWith(second.from, second.to, "unknown");
  line.mockClear(); view.drag = null;
  view.showMovementFeedback({ type: "tokenMoveFeedback", requestId: request.mock.calls[2]![0].requestId, atSeq: 2, status: "blocked" });
  expect(line).not.toHaveBeenCalled();
});
