// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as router from "../src/router";
import { Hero, inviteCodeFrom, openHeroJoin } from "../src/pages/home/Hero";

let navigate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  navigate = vi.spyOn(router, "navigate").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const field = () => screen.queryByLabelText("Paste the link your GM sent you") as HTMLInputElement | null;

describe("the hero's two ways in (gm-home: Both paths in the first screen)", () => {
  it("makes running a game the primary action, into the GM flow", () => {
    render(<Hero />);
    const start = screen.getByRole("link", { name: "Start a room" });
    expect(start.getAttribute("href")).toBe("/gm-dashboard");
    expect(start.className).toContain("cta");
  });

  it("opens the join form in place and moves focus to its field", () => {
    render(<Hero />);
    expect(field()).toBeNull();
    const join = screen.getByRole("button", { name: "Join a game" });
    expect(join.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(join);
    expect(join.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(field());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("starts open, with the joined rooms above the field, for a browser that has joined rooms", () => {
    localStorage.setItem("vtt.credentials.room-1", JSON.stringify({ roomId: "room-1", guestToken: "guest-token-0123456789", roomName: "Goblin Caves" }));
    render(<Hero />);
    const room = screen.getByRole("link", { name: /Goblin Caves/ });
    expect(room.getAttribute("href")).toBe("/r/room-1");
    expect(screen.getByText("Pick up where you left off. Saved in this browser only.")).toBeTruthy();
    expect(field()).toBeTruthy();
    // The list comes before the field.
    expect(room.compareDocumentPosition(field()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the same form when another part of the page asks to join", () => {
    render(<Hero />);
    act(() => openHeroJoin());
    expect(document.activeElement).toBe(field());
    expect(document.querySelectorAll("form.join-form")).toHaveLength(1);
  });

  it("takes a full invite link or a bare code, and says so beside the field otherwise", () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole("button", { name: "Join a game" }));
    fireEvent.change(field()!, { target: { value: "https://vtt.example/join/abc123" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(navigate).toHaveBeenCalledWith("/join/abc123");
    fireEvent.change(field()!, { target: { value: "not a link!" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByRole("alert").textContent).toBe("That doesn't look like an invite link or code.");
    expect(field()!.getAttribute("aria-invalid")).toBe("true");
    expect(inviteCodeFrom("  xyz789 ")).toBe("xyz789");
  });
});
