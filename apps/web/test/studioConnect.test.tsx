// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const studio = vi.hoisted(() => ({ checkRequest: vi.fn(), decide: vi.fn(), grants: vi.fn(), revoke: vi.fn() }));
vi.mock("../src/net/api", async (original) => ({ ...(await original<typeof import("../src/net/api")>()), api: { studio } }));
vi.mock("../src/account/RequireAccount", () => ({ RequireAccount: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../src/account/accountStore", () => ({ useAccount: () => ({ status: "signedIn", account: { id: "u1", email: "sam@example.com", displayName: "Sam" } }) }));
vi.mock("../src/ui/SiteHeader", () => ({ EntryPage: ({ children }: { children: React.ReactNode }) => children }));

import { ApiError } from "../src/net/api";
import { StudioConnectPage } from "../src/pages/studio/StudioConnectPage";
import { StudioConnections } from "../src/pages/studio/StudioConnections";

let host: HTMLDivElement;
let root: Root;
const assign = vi.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  for (const fn of Object.values(studio)) fn.mockReset();
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, search: "?client_id=szc_1&state=s", assign } as unknown as Location);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const render = async (element: React.ReactNode) => {
  await act(async () => { root.render(element); });
  await act(async () => { await Promise.resolve(); });
};
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent?.trim() || "").startsWith(label));
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
};

const request = { client: { name: "Test AI app", redirectHost: "ai-app.test.invalid" }, builds: [{ id: "b1", name: "Hollow Coast" }, { id: "b2", name: "Lanternfall" }] };

describe("connecting an AI app to builds (FR-GM-26, ADR 0073)", () => {
  it("says when the app gave no name", async () => {
    studio.checkRequest.mockResolvedValue({ ok: true, request: { ...request, client: { ...request.client, name: "" } } });
    await render(<StudioConnectPage />);
    expect(text()).toContain("An app that gave no name is asking to work on your builds.");
  });

  it("shows who asks, where the answer goes and what it can't do, with no build ticked", async () => {
    studio.checkRequest.mockResolvedValue({ ok: true, request });
    await render(<StudioConnectPage />);
    expect(studio.checkRequest).toHaveBeenCalledWith("?client_id=szc_1&state=s");
    expect(text()).toContain("“Test AI app”");
    expect(text()).toContain("ai-app.test.invalid");
    expect(text()).toContain("It can't publish, change your choices");
    expect(text()).toContain("Signed in as Sam.");
    expect([...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].map((box) => box.checked)).toEqual([false, false]);
  });

  it("needs at least one build, then sends exactly the ticked ones and returns where the server says", async () => {
    studio.checkRequest.mockResolvedValue({ ok: true, request });
    studio.decide.mockResolvedValue({ redirectTo: "https://ai-app.test.invalid/oauth/callback?code=c&state=s" });
    await render(<StudioConnectPage />);
    await click(button("Allow"));
    expect(text()).toContain("Choose at least one build.");
    expect(studio.decide).not.toHaveBeenCalled();
    await click(host.querySelectorAll("input[type=checkbox]")[1]);
    await click(button("Allow"));
    expect(studio.decide).toHaveBeenCalledWith({ client_id: "szc_1", state: "s" }, "allow", ["b2"]);
    expect(assign).toHaveBeenCalledWith("https://ai-app.test.invalid/oauth/callback?code=c&state=s");
  });

  it("sends a refusal back without granting anything", async () => {
    studio.checkRequest.mockResolvedValue({ ok: true, request });
    studio.decide.mockResolvedValue({ redirectTo: "https://ai-app.test.invalid/oauth/callback?error=access_denied" });
    await render(<StudioConnectPage />);
    await click(host.querySelectorAll("input[type=checkbox]")[0]);
    await click(button("Cancel"));
    expect(studio.decide).toHaveBeenCalledWith(expect.anything(), "deny", ["b1"]);
    expect(assign).toHaveBeenCalledWith("https://ai-app.test.invalid/oauth/callback?error=access_denied");
  });

  it("keeps a bad app or address on the page, and offers other problems back to the app only by a click", async () => {
    studio.checkRequest.mockResolvedValue({ ok: false, status: 400, error: "This connection request isn't valid.", redirectTo: null });
    await render(<StudioConnectPage />);
    expect(text()).toContain("This connection request can't be used");
    expect(host.querySelector("[role=alert]")?.textContent).toBe("This connection request isn't valid.");
    expect(assign).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(host);
    studio.checkRequest.mockResolvedValue({ ok: false, status: 400, error: "x", redirectTo: "https://ai-app.test.invalid/oauth/callback?error=invalid_scope" });
    await render(<StudioConnectPage />);
    // Anyone can register an app, so its address is never followed without the person's click.
    expect(assign).not.toHaveBeenCalled();
    const back = [...host.querySelectorAll("a")].find((a) => a.textContent === "Back to ai-app.test.invalid");
    expect(back?.getAttribute("href")).toBe("https://ai-app.test.invalid/oauth/callback?error=invalid_scope");
  });

  it("says when there's no open build to connect", async () => {
    studio.checkRequest.mockResolvedValue({ ok: true, request: { ...request, builds: [] } });
    await render(<StudioConnectPage />);
    expect(text()).toContain("You have no open builds.");
    expect(button("Allow")).toBeUndefined();
  });
});

describe("AI app connections on the build page (FR-GM-26, ADR 0073)", () => {
  const grant = { id: "g1", clientName: "Test AI app", redirectHost: "ai-app.test.invalid", createdAt: "2026-11-16T10:00:00Z", lastUsedAt: null, expiresAt: "2026-12-16T10:00:00Z", builds: [{ id: "b1", name: "Hollow Coast" }, { id: "b2", name: "Lanternfall" }] };

  it("lists each connection with what it covers, and disconnecting ends it", async () => {
    studio.grants.mockResolvedValueOnce({ grants: [grant] }).mockResolvedValueOnce({ grants: [] });
    studio.revoke.mockResolvedValue(undefined);
    await render(<StudioConnections buildId="b1" />);
    expect(text()).toContain("Test AI app, returning to ai-app.test.invalid");
    expect(text()).toContain("Builds: Hollow Coast, Lanternfall");
    expect(text()).toContain("Not used yet");
    expect(text()).toContain("every build listed with it");
    await click(button("Disconnect Test AI app"));
    expect(studio.revoke).toHaveBeenCalledWith("b1", "g1");
    expect(text()).not.toContain("Test AI app");
  });

  it("shows nothing when there are no connections or the server doesn't offer them", async () => {
    studio.grants.mockRejectedValue(new ApiError("Connecting an AI app isn't available on this server.", 404));
    await render(<StudioConnections buildId="b1" />);
    expect(host.innerHTML).toBe("");
  });

  it("says so when disconnecting fails, and keeps the connection listed", async () => {
    studio.grants.mockResolvedValue({ grants: [grant] });
    studio.revoke.mockRejectedValue(new ApiError("Something went wrong.", 500));
    await render(<StudioConnections buildId="b1" />);
    await click(button("Disconnect Test AI app"));
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Couldn't disconnect. Try again.");
    expect(text()).toContain("Test AI app");
  });
});
