// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { TokenCard } from "../src/board/TokenCard";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };
const bob: Participant = { id: "bob", role: "player", displayName: "Bob" };

const fighter: Token = {
  id: "f1", name: "Fighter", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: ["alice"], hidden: false, stats: { hp: 12, maxHp: 12, ac: 16 }, conditions: [],
};
const state: RoomState = { ...emptyRoomState("r1"), participants: { gm, alice, bob }, tokens: { f1: fighter } };

afterEach(cleanup);

function show(you: Participant, readOnly = false) {
  const onEdit = vi.fn();
  const onDuplicate = vi.fn();
  render(<TokenCard token={fighter} state={state} you={you} readOnly={readOnly} onClose={() => {}} onEdit={onEdit} onDuplicate={onDuplicate} />);
  return { onEdit, onDuplicate };
}

describe("board token card actions (FR-GM-08, token-card-actions)", () => {
  it("offers the GM Edit and Duplicate, each for this token", () => {
    const { onEdit, onDuplicate } = show(gm);
    fireEvent.click(screen.getByRole("button", { name: "Edit Fighter" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Fighter" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it("draws Edit as an icon with no visible text (FR-GM-19)", () => {
    show(gm);
    const edit = screen.getByRole("button", { name: "Edit Fighter" });
    expect(edit.textContent).toBe("");
    expect(edit.getAttribute("title")).toBe("Edit token");
  });

  it("shows the eye only when given sight, with a pressed state, and toggles (FR-GM-19)", () => {
    show(gm);
    expect(screen.queryByRole("button", { name: /view as Fighter/i })).toBeNull();
    cleanup();
    const onToggle = vi.fn();
    const { rerender } = render(<TokenCard token={fighter} state={state} you={gm} onClose={() => {}} sight={{ on: false, onToggle }} />);
    const eye = screen.getByRole("button", { name: "View as Fighter" });
    expect(eye.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(eye);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<TokenCard token={fighter} state={state} you={gm} onClose={() => {}} sight={{ on: true, onToggle }} />);
    expect(screen.getByRole("button", { name: "Stop viewing as Fighter" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers the token's owner Edit but not Duplicate", () => {
    show(alice);
    expect(screen.getByRole("button", { name: "Edit Fighter" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Duplicate Fighter" })).toBeNull();
  });

  it("offers another player neither", () => {
    show(bob);
    expect(screen.queryByRole("button", { name: "Edit Fighter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate Fighter" })).toBeNull();
  });

  it("offers nothing while previewing or replaying", () => {
    show(gm, true);
    expect(screen.queryByRole("button", { name: "Edit Fighter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate Fighter" })).toBeNull();
  });
});
