// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Participant, RoomState } from "@vtt/shared";
import { LeaveTable } from "../src/panels/LeaveTable";
import type { RoomConnection } from "../src/net/roomConnection";

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

const you = { id: "p1", role: "player", displayName: "Sam" } as Participant;
const state = { name: "The Keep", tokens: {} } as unknown as RoomState;

function setup() {
  const command = vi.fn().mockResolvedValue({ ok: true });
  const connection = { command, snapshot: { status: "connected" } } as unknown as RoomConnection;
  render(<LeaveTable connection={connection} state={state} you={you} />);
  return { command, opener: screen.getByRole("button", { name: "Leave table" }) };
}

describe("Leave table control (leave-table)", () => {
  it("is a small unfilled button with an icon, not a text link", () => {
    const { opener } = setup();
    expect(opener.className.split(" ")).toEqual(expect.arrayContaining(["secondary", "small"]));
    expect(opener.classList.contains("link")).toBe(false);
    expect(opener.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("asks first, naming the room, with the safe choice focused", async () => {
    const { command, opener } = setup();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Leave The Keep?" });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Stay" })));
    expect(command).not.toHaveBeenCalled();
  });

  it("sends participant.leave only once confirmed", () => {
    const { command, opener } = setup();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave table" }));
    expect(command).toHaveBeenCalledWith({ type: "participant.leave" });
  });
});
