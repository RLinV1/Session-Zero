// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";
import { SAVE_ACCOUNT_HREF } from "../src/ui/GuestRoom";
import { safeNext } from "../src/account/safeNext";

const SUMMARY = { rooms: 2, assets: 0, creatures: 0, diceLooks: 0 };
let claims = 0;

function stubApi() {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/me/rooms") return json({ hosting: [], playing: [] });
    if (url === "/api/library/encounters") return json([]);
    if (url === "/api/gm/legacy") return json(SUMMARY);
    if (url === "/api/gm/legacy/claim") {
      claims += 1;
      return json(SUMMARY);
    }
    return new Response("{}", { status: 404 });
  });
}

beforeEach(() => {
  claims = 0;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  localStorage.setItem("vtt.gm", "stored-gm-token-0123456789abcdef");
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "tony@example.com", displayName: "Tony" } });
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState(null, "", "/");
  accountStore.setState({ status: "loading" });
});

describe("saving a guest room (guest-gm-hosting, FR-GM-01)", () => {
  it("sends sign-up back to the dashboard with save=1, and keeps it through safeNext", () => {
    expect(SAVE_ACCOUNT_HREF).toBe("/signup?next=%2Fgm-dashboard%3Fsave%3D1");
    expect(safeNext(new URLSearchParams(SAVE_ACCOUNT_HREF.split("?")[1]).get("next"))).toBe("/gm-dashboard?save=1");
  });

  it("moves the rooms without a click on ?save=1, once, and removes save from the URL", async () => {
    history.replaceState(null, "", "/gm-dashboard?save=1&x=2");
    render(<StrictMode><GmDashboardPage /></StrictMode>);
    await screen.findByText(/Moved into your account/);
    expect(claims).toBe(1);
    expect(location.search).toBe("?x=2");
  });

  it("waits for the Move button without save=1", async () => {
    history.replaceState(null, "", "/gm-dashboard");
    render(<GmDashboardPage />);
    const button = await screen.findByRole("button", { name: "Move into my account" });
    expect(claims).toBe(0);
    fireEvent.click(button);
    await waitFor(() => expect(claims).toBe(1));
  });
});
