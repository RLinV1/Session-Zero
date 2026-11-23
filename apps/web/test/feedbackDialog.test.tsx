// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { closeFeedback, openFeedback, useFeedbackRoom, type FeedbackRoom } from "../src/ui/feedback";
import { FeedbackHost } from "../src/ui/FeedbackDialog";
import { HomePage } from "../src/pages/HomePage";
import { RoomMenu } from "../src/ui/RoomMenu";
import { SettingsMenu } from "../src/ui/SettingsMenu";

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

let sent: FormData[] = [];
beforeEach(() => {
  sent = [];
  accountStore.setState({ status: "signedOut" });
  history.replaceState(null, "", "/join/room-1?token=secret#x");
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:shot-${++n}`, revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/feedback") {
      sent.push(init.body as FormData);
      const shots = (init.body as FormData).getAll("screenshots").length;
      return new Response(JSON.stringify({ reference: "FB-7Q2K", screenshots: shots }), { status: 201, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => {
  act(() => closeFeedback());
  cleanup();
  vi.unstubAllGlobals();
});

const png = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "image/png" });
const dialog = () => screen.getByRole("dialog", { name: "Send feedback" });
const report = (i = 0) => JSON.parse(String(sent[i]!.get("report"))) as Record<string, unknown> & { technical?: Record<string, unknown> };

function RoomStub({ room }: { room: FeedbackRoom }) {
  useFeedbackRoom(room);
  return null;
}

describe("Feedback dialog (FR-PL-11)", () => {
  it("opens from the floating launcher and sends a report with screenshots and allow-listed details", async () => {
    render(<><HomePage /><FeedbackHost /></>);
    // The header carries What's new instead (FR-PL-10).
    const header = within(document.querySelector<HTMLElement>(".site-header")!);
    expect(header.queryByRole("button", { name: /Feedback/ })).toBeNull();
    expect(header.getByRole("link", { name: "What's new" }).getAttribute("href")).toBe("/news");
    expect(within(screen.getByRole("contentinfo")).queryByRole("button", { name: "Feedback" })).toBeNull();
    const launcher = screen.getByRole("button", { name: "Feedback" });
    expect(launcher.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(launcher);
    const form = within(dialog());
    expect(form.getByRole("radio", { name: /Bug/ })).toHaveProperty("checked", true);
    expect(form.getByText("You're not signed in, so we can't reply to this report.")).toBeTruthy();

    fireEvent.click(form.getByRole("button", { name: "Send feedback" }));
    expect(form.getByRole("alert").textContent).toBe("Write a short summary first.");
    expect(sent).toHaveLength(0);

    fireEvent.change(form.getByLabelText("Summary"), { target: { value: "  Fog stays  " } });
    fireEvent.change(form.getByLabelText("What happened, and what did you expect?"), { target: { value: "Until reload." } });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [png("one.png"), png("two.png")] } });
    expect(form.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual(["one.png", "two.png"]);
    fireEvent.click(form.getByRole("button", { name: "Remove one.png" }));
    fireEvent.click(form.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(form.getByText("Thanks, we got it")).toBeTruthy());
    expect(form.getByText("FB-7Q2K")).toBeTruthy();
    expect(form.getByText(/Your report and 1 screenshot reached the team/)).toBeTruthy();
    expect(report()).toMatchObject({ kind: "bug", summary: "Fog stays", details: "Until reload." });
    // The address's query and fragment (an invite token) never leave the browser.
    expect(report().technical).toMatchObject({ pagePath: "/join/room-1", locale: "en" });
    expect(report().technical).not.toHaveProperty("roomId");
    expect(sent[0]!.getAll("screenshots").map((f) => (f as File).name)).toEqual(["two.png"]);
  });

  it("opens from the floating launcher and on top of Settings", () => {
    render(<><HomePage /><FeedbackHost /></>);
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    expect(dialog()).toBeTruthy();
    act(() => closeFeedback());
    cleanup();

    render(<><SettingsMenu open onClose={() => {}} /><FeedbackHost /></>);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", { name: "Send feedback" }));
    expect(dialog().hasAttribute("open")).toBe(true);
    // Settings stays open underneath, so closing Feedback comes back to it.
    expect(screen.getByRole("dialog", { name: "Settings" }).hasAttribute("open")).toBe(true);
  });

  it("sends no technical details when they are turned off, and says who can be replied to", async () => {
    accountStore.setState({ status: "signedIn", account: { id: "u1", email: "aria@example.com", displayName: "Aria" } as never });
    render(<FeedbackHost />);
    act(() => openFeedback("idea"));
    const form = within(dialog());
    expect(form.getByRole("radio", { name: /Idea/ })).toHaveProperty("checked", true);
    expect(form.getByText("Signed in as Aria, so we can reply by email.")).toBeTruthy();
    fireEvent.change(form.getByLabelText("Summary"), { target: { value: "Token colours" } });
    fireEvent.click(form.getByRole("checkbox", { name: "Include technical details" }));
    fireEvent.click(form.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(report()).toEqual({ kind: "idea", summary: "Token colours", details: "" });
  });

  it("refuses a wrong type, an oversize file and a fourth image before sending", () => {
    render(<FeedbackHost />);
    act(() => openFeedback());
    const form = within(dialog());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.gif", { type: "image/gif" })] } });
    expect(form.getByRole("alert").textContent).toBe("notes.gif isn't a PNG, JPEG or WebP image.");
    fireEvent.change(input, { target: { files: [png("huge.png", 5 * 1024 * 1024 + 1)] } });
    expect(form.getByRole("alert").textContent).toBe("huge.png is over 5 MB.");
    fireEvent.change(input, { target: { files: [png("1.png"), png("2.png"), png("3.png"), png("4.png")] } });
    expect(form.getAllByRole("img")).toHaveLength(3);
    expect(form.getByRole("alert").textContent).toBe("You can attach up to 3 images.");
    expect(form.queryByRole("button", { name: "Add image" })).toBeNull();
  });

  it("in a room, captures the board, warns a GM about fog, and adds the room's ids", async () => {
    const captureBoard = vi.fn(async () => new Blob([new Uint8Array(4)], { type: "image/png" }));
    render(<><RoomStub room={{ roomId: "room-1", seq: 42, role: "gm", captureBoard }} /><RoomMenu replaying={false} onGuide={() => {}} /><FeedbackHost /></>);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: /Report a problem/ }));
    const form = within(dialog());
    expect(form.queryByText(/fog-hidden areas included/)).toBeNull();
    fireEvent.click(form.getByRole("button", { name: /Capture the board/ }));
    await waitFor(() => expect(form.getAllByRole("img")).toHaveLength(1));
    expect(captureBoard).toHaveBeenCalledOnce();
    expect(form.getByText(/fog-hidden areas included/)).toBeTruthy();
    fireEvent.change(form.getByLabelText("Summary"), { target: { value: "Door" } });
    fireEvent.click(form.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(report().technical).toMatchObject({ roomId: "room-1", seq: 42, role: "gm" });
  });

  it("offers no board capture outside a room, and a player's capture carries no fog note", async () => {
    render(<FeedbackHost />);
    act(() => openFeedback());
    expect(within(dialog()).queryByRole("button", { name: /Capture the board/ })).toBeNull();
    act(() => closeFeedback());
    cleanup();

    const captureBoard = async () => new Blob([new Uint8Array(4)], { type: "image/png" });
    render(<><RoomStub room={{ roomId: "room-2", seq: 1, role: "player", captureBoard }} /><FeedbackHost /></>);
    act(() => openFeedback());
    const form = within(dialog());
    fireEvent.click(form.getByRole("button", { name: /Capture the board/ }));
    await waitFor(() => expect(form.getAllByRole("img")).toHaveLength(1));
    expect(form.queryByText(/fog-hidden areas included/)).toBeNull();
  });
});
