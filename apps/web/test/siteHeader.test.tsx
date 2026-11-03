// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";
import { HomePage } from "../src/pages/HomePage";
import { LibraryPage } from "../src/pages/LibraryPage";
import { PRODUCT_NAME } from "../src/ui/SiteHeader";

/** A page that has not been scrolled: nothing comes near the viewport, so no demo fetches its code. */
class StillObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubFetch() {
  vi.stubGlobal("IntersectionObserver", StillObserver);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/me/rooms") return json({ hosting: [], playing: [] });
    if (url.startsWith("/api/library")) return json([]);
    if (url === "/api/me/legacy") return json({ rooms: [], assets: 0 });
    return new Response("{}", { status: 404 });
  });
}

/** The header every home and hub page shows: the mark and name first, the toggle last. */
function expectSharedHeader() {
  const headers = document.querySelectorAll<HTMLElement>("header.site-header");
  expect(headers).toHaveLength(1);
  const header = headers[0]!;
  const brand = within(header).getByRole("link", { name: PRODUCT_NAME });
  expect(brand.getAttribute("href")).toBe("/");
  expect(header.firstElementChild).toBe(brand);
  const toggle = within(header).getByRole("button", { name: /^Theme:/ });
  expect(header.querySelector(".site-actions")?.lastElementChild).toBe(toggle);
  return header;
}

beforeEach(() => {
  stubFetch();
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
  vi.spyOn(api.library, "list").mockResolvedValue([]);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

describe("one header for the home and hub pages (design-language: One header)", () => {
  it("is on the home page, with the way back to your rooms", () => {
    render(<HomePage />);
    const header = expectSharedHeader();
    expect(within(header).getByRole("link", { name: "Your rooms" }).getAttribute("href")).toBe("/gm-dashboard");
  });

  it("is on the dashboard, with Your rooms marked as the current page", () => {
    render(<GmDashboardPage />);
    const header = expectSharedHeader();
    const nav = within(header).getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Your rooms" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Library" }).getAttribute("aria-current")).toBeNull();
    expect(within(header).getByRole("button", { name: "Dana" })).toBeTruthy();
  });

  it("is on the library, with Library marked as the current page", () => {
    render(<LibraryPage />);
    const header = expectSharedHeader();
    const nav = within(header).getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Your rooms" }).getAttribute("href")).toBe("/gm-dashboard");
  });

  it("names the product the same way everywhere", () => {
    render(<HomePage />);
    expect(screen.getAllByText(PRODUCT_NAME).length).toBeGreaterThan(0);
  });
});
