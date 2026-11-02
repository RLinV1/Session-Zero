// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RecoverDemo from "../src/pages/home/RecoverDemo";
import { logLines, moveToken, startRoom, undoAction } from "../src/pages/home/recoverRoom";
import { squareCenter } from "../src/pages/home/sightDemo";

afterEach(cleanup);

describe("the recovery demo runs the table's undo (gm-home: Undo runs the table's undo, FR-REC-02)", () => {
  it("restores the position on Undo, and the log keeps the move and adds the undo as its own entry", () => {
    const start = startRoom();
    const from = start.state.tokens["sela"]!.position;
    const moved = moveToken(start, "sela", squareCenter(6, 7));
    expect(moved.refused).toBeNull();
    expect(moved.room.state.tokens["sela"]!.position).toEqual(squareCenter(6, 7));
    const [move] = logLines(moved.room);
    expect(move!.sentence).toBe(`GM moved Sela from (${from.x}, ${from.y}) to (455, 525)`);
    expect(move!.undo).not.toBeNull();

    const undone = undoAction(moved.room, move!.commandId!);
    expect(undone.refused).toBeNull();
    expect(undone.room.state.tokens["sela"]!.position).toEqual(from);
    const lines = logLines(undone.room);
    // Newest first: the undo's own entries, then the original, kept and marked.
    expect(lines.map((l) => l.sentence)).toEqual([
      expect.stringMatching(/^GM undid /),
      `GM moved Sela from (455, 525) to (${from.x}, ${from.y})`,
      move!.sentence,
    ]);
    const original = lines.at(-1)!;
    expect(original.undone).toBe(true);
    expect(original.undo).toBeNull();
    // An undo is never itself undoable (no redo), as at the table.
    expect(lines.every((l) => l.undo === null)).toBe(true);
  });

  it("refuses to undo a move that a later move has overtaken, as the table does", () => {
    const first = moveToken(startRoom(), "sela", squareCenter(5, 7)).room;
    const firstId = logLines(first)[0]!.commandId!;
    const second = moveToken(first, "sela", squareCenter(6, 7)).room;
    const result = undoAction(second, firstId);
    expect(result.refused).toBeTruthy();
    expect(result.room).toBe(second);
  });
});

describe("the recovery demo on the page", () => {
  it("opens with a move to undo, and Undo puts the token back and marks the entry", () => {
    render(<RecoverDemo />);
    const sela = screen.getByRole("button", { name: /^Sela\./ });
    const before = { left: sela.style.left, top: sela.style.top };
    fireEvent.click(screen.getByRole("button", { name: /^Undo / }));
    expect(screen.getByText("Undone")).toBeTruthy();
    expect(document.querySelectorAll(".recover-log li")).toHaveLength(3);
    expect(sela.style.left).not.toBe(before.left);
    fireEvent.keyDown(sela, { key: "ArrowRight" });
    expect(sela.style.left).toBe(before.left);
    expect(document.querySelectorAll(".recover-log li")).toHaveLength(4);
  });
});
