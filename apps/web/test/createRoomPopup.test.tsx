// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) =>
    String(input) === "/api/me/rooms" ? json({ hosting: [], playing: [] }) : json([]),
  );
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "tony@example.com", displayName: "Tony" } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

describe("create-room popup (FR-GM-01)", () => {
  it("hides the form until Create room is clicked, focuses Room name, and Esc closes it", async () => {
    render(<GmDashboardPage />);
    expect(screen.queryByLabelText("Room name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    expect(screen.getByRole("dialog", { name: "Create a room" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Room name"));
    fireEvent.keyDown(screen.getByLabelText("Room name"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Room name")).toBeNull());
  });
});
