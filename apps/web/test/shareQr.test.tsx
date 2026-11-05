// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareButton } from "../src/ui/ShareButton";
import { api } from "../src/net/api";

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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const connection = { command: vi.fn() };

describe("share modal (FR-GM-20)", () => {
  it("waits for the invite to load before allowing a reset", async () => {
    let resolve!: (value: { inviteCode: string }) => void;
    vi.spyOn(api, "getInvite").mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect((screen.getByRole("button", { name: "Reset link" }) as HTMLButtonElement).disabled).toBe(true);
    resolve({ inviteCode: "abc123" });
    await screen.findByLabelText("Invite link");
    expect((screen.getByRole("button", { name: "Reset link" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("selects the fallback copy field inside the active modal when clipboard access is unavailable", async () => {
    vi.spyOn(api, "getInvite").mockResolvedValue({ inviteCode: "abc123" } as never);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    let copied = "";
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => {
      // Native modal dialogs make fields outside them inert, so only this selection can be copied.
      const field = document.querySelector<HTMLTextAreaElement>("dialog[open] textarea");
      if (!field || field.selectionStart !== 0 || field.selectionEnd !== field.value.length) return false;
      copied = field.value;
      return true;
    }) });
    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByLabelText("Invite link");
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied"));
    expect(copied).toBe(`${location.origin}/join/abc123`);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("shows the full link, copies it, opens the QR popup on demand and resets after confirming", async () => {
    vi.spyOn(api, "getInvite").mockResolvedValue({ inviteCode: "abc123" } as never);
    vi.spyOn(api, "resetInvite").mockResolvedValue({ inviteCode: "new456" } as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    const field = (await screen.findByLabelText("Invite link")) as HTMLInputElement;
    expect(field.value).toBe(`${location.origin}/join/abc123`);
    // No QR anywhere until the GM asks for one.
    expect(screen.queryByRole("img", { name: "QR code for the invite link" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
    expect((await screen.findByRole("status")).textContent).toBe("Copied");

    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    const qr = await screen.findByRole("img", { name: "QR code for the invite link" });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(screen.getByText("Scan to join as a player.")).toBeTruthy();
    expect(qr.closest(".share-body")).toBeNull(); // the popup is its own dialog, not part of the share modal
    // The popup's footer Close (the title bar X is also named "Close").
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    await waitFor(() => expect(screen.queryByRole("img", { name: "QR code for the invite link" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Reset link" }));
    expect(api.resetInvite).not.toHaveBeenCalled();
    expect(screen.getByText(/stops working straight away/)).toBeTruthy();
    // The confirm dialog's button is the last "Reset link".
    const resetButtons = screen.getAllByRole("button", { name: "Reset link" });
    fireEvent.click(resetButtons[resetButtons.length - 1]!);

    await waitFor(() =>
      expect((screen.getByLabelText("Invite link") as HTMLInputElement).value).toBe(`${location.origin}/join/new456`),
    );
    expect(api.resetInvite).toHaveBeenCalledWith("r", "t");
    expect(screen.getByRole("status").textContent).toBe("Link reset");
    expect(screen.queryByRole("img", { name: "QR code for the invite link" })).toBeNull();

    // A QR generated after the reset encodes the new link.
    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    await screen.findByRole("img", { name: "QR code for the invite link" });
  });

  it("shows an error with Retry when the invite can't be loaded", async () => {
    const get = vi
      .spyOn(api, "getInvite")
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue({ inviteCode: "abc123" } as never);
    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByLabelText("Invite link");
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("locking the room from the share modal (FR-GM-20, ADR 0051)", () => {
  const openModal = (joinsLocked: boolean) => {
    vi.spyOn(api, "getInvite").mockResolvedValue({ inviteCode: "abc123" } as never);
    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={joinsLocked} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    return screen.getByRole("switch", { name: "Lock the room" }) as HTMLInputElement;
  };

  it("sends the lock and leaves the switch to follow the room's state", async () => {
    connection.command.mockResolvedValue({ ok: true, seq: 5 });
    const lock = openModal(false);
    expect(lock.checked).toBe(false);
    fireEvent.click(lock);
    expect(connection.command).toHaveBeenCalledWith({ type: "room.setJoinsLocked", locked: true });
    await waitFor(() => expect(lock.disabled).toBe(false));
    expect(lock.checked).toBe(false);
  });

  it("says the link admits no one new while locked, and offers to unlock", async () => {
    connection.command.mockResolvedValue({ ok: true, seq: 5 });
    const lock = openModal(true);
    expect(lock.checked).toBe(true);
    await screen.findByText("The room is locked, so this link can't admit anyone new.");
    fireEvent.click(lock);
    expect(connection.command).toHaveBeenCalledWith({ type: "room.setJoinsLocked", locked: false });
    await waitFor(() => expect(lock.disabled).toBe(false));
  });

  it("shows the server's refusal", async () => {
    connection.command.mockResolvedValue({ ok: false, code: "invalid", message: "You're sending commands too fast. Wait a few seconds." });
    fireEvent.click(openModal(false));
    expect((await screen.findByRole("alert")).textContent).toContain("too fast");
  });

  it("can still lock when the link won't load", async () => {
    vi.spyOn(api, "getInvite").mockRejectedValue(new Error("down"));
    render(<ShareButton roomId="r" token="t" connection={connection} joinsLocked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByText(/Couldn't load the link/);
    expect((screen.getByRole("switch", { name: "Lock the room" }) as HTMLInputElement).disabled).toBe(false);
  });
});
