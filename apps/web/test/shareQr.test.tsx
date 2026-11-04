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

describe("share modal (FR-GM-20)", () => {
  it("shows the full link, copies it, opens the QR popup on demand and resets after confirming", async () => {
    vi.spyOn(api, "getInvite").mockResolvedValue({ inviteCode: "abc123" } as never);
    vi.spyOn(api, "resetInvite").mockResolvedValue({ inviteCode: "new456" } as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ShareButton roomId="r" token="t" />);
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
    render(<ShareButton roomId="r" token="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByLabelText("Invite link");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
