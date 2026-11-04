// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpPage } from "../src/account/AccountPages";
import { accountStore } from "../src/account/accountStore";
import { HomePage } from "../src/pages/HomePage";
import { PrivacyPage, TermsPage } from "../src/pages/PolicyPages";
import { navigate, parseRoute } from "../src/router";
import { layerFor } from "../src/theme";

class StillObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", StillObserver);
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("privacy and terms pages (site-policies)", () => {
  it("routes /privacy and /terms to reading pages on the hub's ground", () => {
    expect(parseRoute("/privacy")).toEqual({ page: "privacy" });
    expect(parseRoute("/terms/")).toEqual({ page: "terms" });
    expect(layerFor({ page: "privacy" })).toBe("hub");
    expect(layerFor({ page: "terms" })).toBe("hub");
  });

  it("marks the current policy in the header's navigation and the footer, as the hub marks its page", () => {
    render(<PrivacyPage />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Privacy" }).getAttribute("aria-current")).toBe("page");
    expect(within(main).getByRole("link", { name: "Terms" }).getAttribute("aria-current")).toBeNull();
    const footer = screen.getByRole("navigation", { name: "Policies" });
    expect(within(footer).getByRole("link", { name: "Privacy" }).getAttribute("aria-current")).toBe("page");
    // A document, not an entry card.
    expect(document.querySelector(".card")).toBeNull();
  });

  it("says what is kept, the one cookie, and that deletion is the Delete account button", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    for (const name of ["What we keep", "What we don't do", "How long we keep it", "Cookies and browser storage", "Deleting your data", "Contact"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
    expect(screen.getByText(/There is one cookie/)).toBeTruthy();
    expect(screen.getByText("Delete account").closest("li")?.textContent).toMatch(/account menu/);
    expect(screen.getByRole("link", { name: "GitHub issue tracker" }).getAttribute("href")).toBe("https://github.com/RLinV1/Session-Zero/issues");
  });

  it("no longer reads like a course handout", () => {
    for (const page of [<PrivacyPage key="p" />, <TermsPage key="t" />]) {
      const { unmount } = render(page);
      expect(document.querySelector("article")?.textContent).not.toMatch(/student project|not a business|CSE 416|Ask any of us|no button to delete/);
      unmount();
    }
  });

  it("covers uploads and links back to privacy", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "What you upload" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "privacy notice" }).getAttribute("href")).toBe("/privacy");
  });

  it("links both from the home page's footer", () => {
    render(<HomePage />);
    const nav = screen.getByRole("navigation", { name: "Policies" });
    expect(within(nav).getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(within(nav).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("opens a page at its top when a footer link is followed", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    history.replaceState(null, "", "/");
    render(<HomePage />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Policies" })).getByRole("link", { name: "Privacy" }));
    expect(location.pathname).toBe("/privacy");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockClear();
    navigate("/privacy?x=1");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("names both on the sign-up form, with nothing the person must tick", () => {
    accountStore.setState({ status: "signedOut" });
    render(<SignUpPage />);
    const line = screen.getByText(/By creating an account you agree/).closest("p")!;
    expect(within(line).getByRole("link", { name: "terms" }).getAttribute("href")).toBe("/terms");
    expect(within(line).getByRole("link", { name: "privacy notice" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
