// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emptyRoomState, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { ParticipantsButton } from "../src/ui/ParticipantsButton";

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const sam: Participant = { id: "sam", role: "player", displayName: "Sam" };
const kim: Participant = { id: "kim", role: "player", displayName: "Kim" };
const lee: Participant = { id: "lee", role: "player", displayName: "Lee" };

function setup(players: Participant[], you: Participant = gm, options: { readOnly?: boolean; result?: unknown; after?: RoomState } = {}) {
  const state: RoomState = { ...emptyRoomState("r"), participants: Object.fromEntries([gm, ...players].map((p) => [p.id, p])) };
  const command = vi.fn().mockResolvedValue(options.result ?? { ok: true, seq: 9 });
  const connection = { command, snapshot: { state: options.after ?? state } } as unknown as RoomConnection;
  const onReviewDeparture = vi.fn();
  render(<ParticipantsButton state={state} you={you} connection={connection} onReviewDeparture={onReviewDeparture} readOnly={options.readOnly} />);
  fireEvent.click(screen.getByRole("button", { name: /^Participants/ }));
  return { command, onReviewDeparture };
}

const openDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: "Remove several…" }));
  return within(screen.getByRole("dialog", { name: "Remove players" }));
};

describe("removing several players (FR-GM-20, ADR 0051)", () => {
  it("sends the ticked players in one command", async () => {
    const { command } = setup([sam, kim, lee]);
    const dialog = openDialog();
    expect((dialog.getByRole("button", { name: "Remove 0 players" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialog.getByRole("checkbox", { name: "Sam" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Lee" }));
    fireEvent.click(dialog.getByRole("button", { name: "Remove 2 players" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "participant.revokeMany", participantIds: ["sam", "lee"] }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove players" })).toBeNull());
  });

  it("ticks everyone, the GM aside, from one box", () => {
    setup([sam, kim]);
    const dialog = openDialog();
    expect(dialog.queryByRole("checkbox", { name: "GM" })).toBeNull();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Everyone (2)" }));
    expect((dialog.getByRole("checkbox", { name: "Kim" }) as HTMLInputElement).checked).toBe(true);
    expect(dialog.getByRole("button", { name: "Remove 2 players" })).toBeTruthy();
  });

  it("keeps the dialog and shows the refusal when the server says no", async () => {
    setup([sam, kim], gm, { result: { ok: false, code: "invalid", message: "Kim is no longer in the room." } });
    const dialog = openDialog();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Kim" }));
    fireEvent.click(dialog.getByRole("button", { name: "Remove 1 player" }));
    expect((await dialog.findByRole("alert")).textContent).toContain("no longer in the room");
  });

  it("opens the token review when a removed player still owns tokens", async () => {
    const after: RoomState = {
      ...emptyRoomState("r"),
      participants: { gm, sam: { ...sam, revoked: true }, kim },
      tokens: {
        t1: {
          id: "t1", name: "Rogue", position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
          ownerIds: ["sam"], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
        },
      },
    };
    const { onReviewDeparture } = setup([sam, kim], gm, { after });
    const dialog = openDialog();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Sam" }));
    fireEvent.click(dialog.getByRole("button", { name: "Remove 1 player" }));
    await waitFor(() => expect(onReviewDeparture).toHaveBeenCalledWith("sam"));
  });

  it("isn't offered to players, in a preview, or with fewer than two players", () => {
    setup([sam, kim], sam);
    expect(screen.queryByRole("button", { name: "Remove several…" })).toBeNull();
    cleanup();
    setup([sam, kim], gm, { readOnly: true });
    expect(screen.queryByRole("button", { name: "Remove several…" })).toBeNull();
    cleanup();
    setup([sam]);
    expect(screen.queryByRole("button", { name: "Remove several…" })).toBeNull();
  });
});
