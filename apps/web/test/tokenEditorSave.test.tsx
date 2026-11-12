// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Token, TokenUpdate } from "@vtt/shared";
import { TokenEditor } from "../src/panels/TokenRoster";

const goblin: Token = {
  id: "g1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: ["alice"], hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: [],
};

afterEach(cleanup);

function editor(isGm = true, error: string | null = null) {
  const onSave = vi.fn(async (_changes: TokenUpdate) => {});
  const onDelete = vi.fn();
  render(<TokenEditor token={goblin} roomToken="room" isGm={isGm} players={[]} departedOwner={null} error={error} onSave={onSave} onDelete={onDelete} />);
  return { onSave, onDelete };
}

describe("Token editor saves at once (token-editor)", () => {
  it("Save sends the change with no prompt (token-editor)", () => {
    const { onSave } = editor();
    fireEvent.change(screen.getByLabelText("HP"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ stats: { hp: 3, maxHp: 7, ac: 15 } });
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByText(/Save changes to/)).toBeNull();
  });

  it("Enter in a field saves the same as Save", () => {
    const { onSave } = editor(false);
    const ac = screen.getByLabelText("AC");
    fireEvent.change(ac, { target: { value: "17" } });
    fireEvent.submit(ac.closest("form")!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ stats: { ac: 17 } });
  });

  it("keeps Save disabled and sends nothing when nothing changed", () => {
    const { onSave } = editor();
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(save.closest("form")!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the server's message on a refused save, keeping the typed values", () => {
    editor(true, "You can't do that");
    expect(screen.getByRole("alert").textContent).toBe("You can't do that");
  });
});

describe("Deleting a token asks first (token-editor)", () => {
  it("opens a confirmation naming the token, with Keep focused; Keep sends nothing", () => {
    const { onDelete, onSave } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Delete Goblin" }));
    expect(screen.getByText(/Goblin/, { selector: ".confirm p" })).toBeTruthy();
    const keep = screen.getByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("deletes when confirmed", () => {
    const { onDelete } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Delete Goblin" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete token" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
