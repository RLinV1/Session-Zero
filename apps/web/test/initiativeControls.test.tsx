// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type CommandInput, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { InitiativeTracker } from "../src/panels/InitiativeTracker";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const token = (id: string, name: string): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});
const gm = { id: "g1", role: "gm", displayName: "Mara" } as Participant;

function room(activeIndex: number, round: number): RoomState {
  return {
    ...emptyRoomState("room"),
    tokens: { aria: token("aria", "Aria"), goblin: token("goblin", "Goblin") },
    initiative: { order: ["aria", "goblin"], activeIndex, round },
  };
}

function setup(state: RoomState) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return { ok: true }; }) } as unknown as RoomConnection;
  render(<InitiativeTracker connection={connection} state={state} you={gm} onFocusToken={() => {}} />);
  return sent;
}

describe("GM initiative controls (FR-GM-21, ADR 0060)", () => {
  it("steps the turn back, but not on round 1's first turn", () => {
    expect((screen.queryByRole("button", { name: "Previous turn" }) as HTMLButtonElement | null)).toBeNull();
    setup(room(0, 1));
    expect((screen.getByRole("button", { name: "Previous turn" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const sent = setup(room(1, 1));
    fireEvent.click(screen.getByRole("button", { name: "Previous turn" }));
    expect(sent).toEqual([{ type: "initiative.previous" }]);
  });

  it("ends the encounter only after confirming, with Cancel focused first", async () => {
    const sent = setup(room(1, 2));
    fireEvent.click(screen.getByRole("button", { name: "End encounter" }));
    const dialog = screen.getByRole("dialog", { name: "End the encounter?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "End encounter" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "End the encounter?" })).getByRole("button", { name: "End encounter" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.end" }]));
  });
});
