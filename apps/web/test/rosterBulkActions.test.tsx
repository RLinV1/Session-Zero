// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type CommandInput, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import type { GroupSelection } from "../src/panels/GroupSelection";
import { TokenRoster } from "../src/panels/TokenRoster";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };

const tok = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

function room(extra: Partial<RoomState> = {}): RoomState {
  return {
    ...emptyRoomState("r1"),
    participants: { gm, alice },
    tokens: { m1: tok("m1", "Moth 1"), m2: tok("m2", "Moth 2"), m3: tok("m3", "Moth 3"), f1: tok("f1", "Fighter", { ownerIds: ["alice"] }) },
    ...extra,
  };
}

/** The roster with the GM's selection kept as RoomPage keeps it, starting from `initial`. */
function Selecting({ connection, state, initial }: { connection: RoomConnection; state: RoomState; initial: string[] }) {
  const [ids, setIds] = useState<string[]>(initial);
  const selection: GroupSelection = {
    tokenIds: ids.filter((id) => state.tokens[id]),
    toggle: (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    remove: (id) => setIds((cur) => cur.filter((x) => x !== id)),
    clear: () => setIds([]),
    fromTemplate: () => {},
  };
  return (
    <TokenRoster connection={connection} state={state} you={gm} token="t" onFocusToken={() => {}} onPlaceToken={() => {}}
      onDuplicateToken={() => {}} editingTokenId={null} onEditToken={() => {}} selection={selection} />
  );
}

function show(state: RoomState, initial: string[] = []) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return { ok: true, seq: 1 }; }) } as unknown as RoomConnection;
  render(<Selecting connection={connection} state={state} initial={initial} />);
  return sent;
}

describe("token list selection (FR-GM-10, ADR 0074)", () => {
  it("ticks rows into the GM's selection and shows one bar for it", () => {
    show(room());
    expect(screen.queryByRole("group", { name: /selected/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Moth 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Moth 3" }));
    const bar = screen.getByRole("group", { name: "2 tokens selected" });
    expect(within(bar).getByRole("button", { name: "Delete 2 tokens" })).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("group", { name: /selected/ })).toBeNull();
  });

  it("shows tokens selected on the board as ticked", () => {
    show(room(), ["m2"]);
    expect((screen.getByRole("checkbox", { name: "Select Moth 2" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Select Moth 1" }) as HTMLInputElement).checked).toBe(false);
  });

  it("gives players no checkboxes and no bar", () => {
    const connection = { command: vi.fn() } as unknown as RoomConnection;
    render(
      <TokenRoster connection={connection} state={room()} you={alice} token="t" onFocusToken={() => {}} onPlaceToken={() => {}}
        onDuplicateToken={() => {}} editingTokenId={null} onEditToken={() => {}} />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("deleting the selection (FR-GM-10, FR-REC-02, ADR 0074)", () => {
  it("asks first, with Keep focused, and deletes nothing on Keep", () => {
    const sent = show(room(), ["m1", "m2"]);
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 tokens" }));
    const dialog = screen.getByRole("dialog", { name: "Delete 2 tokens?" });
    expect(dialog.textContent).toContain("Moth 1 and Moth 2");
    expect(dialog.textContent).toContain("undo");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(sent).toEqual([]);
  });

  it("deletes them all in one undoable command once confirmed", async () => {
    const sent = show(room(), ["m1", "m2", "f1"]);
    fireEvent.click(screen.getByRole("button", { name: "Delete 3 tokens" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete 3 tokens?" })).getByRole("button", { name: "Delete 3 tokens" }));
    await waitFor(() => expect(sent).toEqual([{ type: "token.deleteSeveral", tokenIds: ["m1", "m2", "f1"] }]));
  });

  it("names the first five and counts the rest", () => {
    const many = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`g${i}`, tok(`g${i}`, `Goblin ${i + 1}`)]));
    show(room({ tokens: many }), Object.keys(many));
    fireEvent.click(screen.getByRole("button", { name: "Delete 8 tokens" }));
    expect(screen.getByRole("dialog", { name: "Delete 8 tokens?" }).textContent).toContain("Goblin 5, and 3 more");
  });
});

describe("moving the selection to a group (token-groups, ADR 0074)", () => {
  const grouped = () => room({ groups: { pack: { id: "pack", name: "Pack" } }, tokenGroups: { m1: "pack" } });

  it("moves only the selected tokens not already there, in one command", async () => {
    const sent = show(grouped(), ["m1", "m2"]);
    fireEvent.click(screen.getByRole("button", { name: "Move 2 to group" }));
    fireEvent.click(screen.getByRole("button", { name: "Pack" }));
    await waitFor(() => expect(sent).toEqual([{ type: "group.assign", groupId: "pack", tokenIds: ["m2"] }]));
  });

  it("offers no group they are all in already", () => {
    show(grouped(), ["m1"]);
    fireEvent.click(screen.getByRole("button", { name: "Move 1 to group" }));
    expect((screen.getByRole("button", { name: "Pack" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Ungrouped" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("has no Move with no groups in the room", () => {
    show(room(), ["m1"]);
    expect(screen.queryByRole("button", { name: /to group/ })).toBeNull();
  });
});
