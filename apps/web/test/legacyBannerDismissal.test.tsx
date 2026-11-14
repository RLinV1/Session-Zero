// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";

const TOKEN = "legacy-gm-token-0123456789abcdef";
const heading = "Bring this browser's rooms into your account";

function signIn(id: string) {
  accountStore.setState({ status: "signedIn", account: { id, email: `${id}@example.com`, displayName: id } });
}

async function mountDashboard() {
  await act(async () => { render(<GmDashboardPage />); });
}

beforeEach(() => {
  history.replaceState(null, "", "/gm-dashboard");
  localStorage.clear();
  localStorage.setItem("vtt.gm", TOKEN);
  signIn("a1");
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    switch (String(input)) {
      case "/api/me/rooms": return json({ hosting: [], playing: [] });
      case "/api/library/encounters": return json([]);
      case "/api/gm/legacy":
      case "/api/gm/legacy/claim": return json({ rooms: 1, assets: 0, creatures: 0, diceLooks: 0 });
      default: return new Response("{}", { status: 404 });
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/gm-dashboard");
  localStorage.clear();
  accountStore.setState({ status: "loading" });
});

describe("legacy migration dismissal on this browser (gm-dashboard)", () => {
  it("keeps Not now dismissed after leaving and reopening the dashboard without deleting the legacy token", async () => {
    await mountDashboard();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    cleanup();

    await mountDashboard();
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    expect(localStorage.getItem("vtt.gm")).toBe(TOKEN);
  });

  it("lets another account choose independently and remembers the original account's dismissal", async () => {
    await mountDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await act(async () => { signIn("a2"); });
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    await act(async () => { signIn("a1"); });
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
  });

  it("still moves and confirms an explicit save after a previous dismissal", async () => {
    await mountDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    cleanup();
    history.replaceState(null, "", "/gm-dashboard?save=1");

    await mountDashboard();
    expect(screen.getByRole("status").textContent).toBe("Moved into your account: 1 room.");
    expect(localStorage.getItem("vtt.gm")).toBeNull();
    expect(location.search).toBe("");
  });

  it("still dismisses for the current visit when browser storage rejects writes", async () => {
    await mountDashboard();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
  });

  it("offers migration when the saved dismissal cannot be read", async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key.startsWith("vtt.legacyMoveDismissed.")) throw new Error("Storage blocked");
      return getItem.call(this, key);
    });
    await mountDashboard();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });
});
