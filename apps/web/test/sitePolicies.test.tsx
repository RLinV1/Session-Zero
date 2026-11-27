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

  it("says what reaches a person's own AI app, and what the MCP server keeps (FR-PL-08, FR-GM-26)", () => {
    render(<PrivacyPage />);
    const part = screen.getByRole("heading", { level: 2, name: "AI apps" }).closest("section")!;
    expect(part.textContent).toMatch(/company that runs your AI app/);
    expect(part.textContent).toMatch(/refuses a GM's seat/);
    expect(part.textContent).toMatch(/stores nothing/);
    expect(screen.getByText(/build pass stops working after 24 hours/)).toBeTruthy();
    expect(screen.getByText(/changed for 14 days is closed/)).toBeTruthy();
    expect(screen.getByText(/Its name ends in \(AI\)/)).toBeTruthy();
  });

  it("says what Studio keeps, sends to the AI app, and exposes when art is published (FR-GM-26, FR-GM-27)", () => {
    render(<PrivacyPage />);
    const keep = screen.getByRole("heading", { level: 2, name: "What we keep" }).closest("section")!;
    expect(keep.textContent).toMatch(/access tokens are stored only as hashes/);
    expect(keep.textContent).toMatch(/deleted after 30 minutes/);
    const ai = screen.getByRole("heading", { level: 2, name: "AI apps" }).closest("section")!;
    expect(ai.textContent).toMatch(/cropped image of that area/);
    expect(ai.textContent).toMatch(/Only you publish, on the website/);
    expect(screen.getByText(/renews for at most 30 days/)).toBeTruthy();
    expect(screen.getByText(/including any metadata embedded in it/)).toBeTruthy();
    expect(screen.getByText(/choose Disconnect under AI app connections/)).toBeTruthy();
  });

  it("sets the terms for connecting an AI app (FR-PL-08, FR-GM-26)", () => {
    render(<TermsPage />);
    const part = screen.getByRole("heading", { level: 2, name: "AI apps" }).closest("section")!;
    expect(part.textContent).toMatch(/counts as what you do/);
    expect(part.textContent).toMatch(/its own terms and costs/);
    expect(part.textContent).toMatch(/like a password/);
    expect(part.textContent).toMatch(/work on a build in Studio/);
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
    const line = screen.getByText(/By signing up, you agree/).closest("p")!;
    expect(within(line).getByRole("link", { name: "terms" }).getAttribute("href")).toBe("/terms");
    expect(within(line).getByRole("link", { name: "privacy notice" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
