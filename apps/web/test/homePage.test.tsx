// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_MAPS } from "../src/pages/home/crops";
import { HomePage } from "../src/pages/HomePage";
import { LibraryStrip } from "../src/pages/home/LibraryStrip";

/** Not scrolled: no demo comes near the viewport, so none fetches its code. */
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

const field = () => screen.queryAllByLabelText("Paste the link your GM sent you");

describe("the players section (gm-home: The players section reuses the hero form)", () => {
  it("sits under a heading for joining, and its action opens and focuses the hero's form, the page's only one", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Joining a game" })).toBeTruthy();
    const players = document.querySelector<HTMLElement>(".players-section")!;
    expect(players.textContent).toContain("Open the link your GM sent");
    expect(field()).toHaveLength(0);
    fireEvent.click(within(players).getByRole("button", { name: "Join a game" }));
    expect(document.querySelectorAll("form.join-form")).toHaveLength(1);
    expect(field()).toHaveLength(1);
    expect(document.activeElement).toBe(field()[0]);
    expect(document.querySelector(".landing-hero")!.contains(document.activeElement)).toBe(true);
  });

  it("shows a capture of the player's board", () => {
    render(<HomePage />);
    const capture = within(document.querySelector<HTMLElement>(".players-section")!).getByRole("img");
    expect(capture.getAttribute("src")).toBe("/img/home/player-phone.webp");
  });
});

describe("the library strip (gm-home: The library is presented honestly)", () => {
  it("never links to the library, and says it is kept on the account, on any device", () => {
    render(<HomePage />);
    expect(document.querySelectorAll('a[href^="/library"]')).toHaveLength(0);
    const strip = document.querySelector(".library-strip")!.textContent!;
    expect(strip).toContain("kept on your account");
    expect(strip).toContain("any device you sign in on");
  });

  it("shows this page's maps whole, once, with their real size and squares, and says whose maps they are", () => {
    render(<LibraryStrip />);
    const shown = [...document.querySelectorAll(".marquee-track li:not([aria-hidden])")];
    expect(shown.map((li) => li.querySelector("strong")!.textContent)).toEqual(HOME_MAPS.map((m) => m.name));
    shown.forEach((li, i) => {
      const m = HOME_MAPS[i]!;
      expect(li.querySelector("img")!.getAttribute("src")).toBe(m.thumb);
      expect(li.querySelector(".readout")!.textContent).toBe(`${m.width} × ${m.height} px · ${m.squares.across} × ${m.squares.down} squares`);
    });
    expect(screen.getByText("The maps on this page, as a library keeps them.")).toBeTruthy();
    const maps = HOME_MAPS;
    // The loop's second copy is decoration.
    const copies = [...document.querySelectorAll(".marquee-track li[aria-hidden='true']")];
    expect(copies).toHaveLength(maps.length);
    expect(copies.every((li) => li.querySelector("img")!.getAttribute("alt") === "")).toBe(true);
  });
});

describe("the page's calls to action (gm-home: Each path names its reader)", () => {
  it("words each intent one way: every way into running a game says Start a room, every way into joining says Join a game", () => {
    render(<HomePage />);
    const main = document.querySelector("main")!;
    const run = [...main.querySelectorAll('a[href="/gm-dashboard"]')].map((a) => a.textContent!.trim());
    expect(run).toEqual(["Start a room", "Start a room"]);
    expect([...main.querySelectorAll("a.cta")].map((a) => a.getAttribute("href"))).toEqual(["/gm-dashboard", "/gm-dashboard"]);
    const join = within(main).getAllByRole("button", { name: /join/i }).map((b) => b.textContent!.trim());
    expect(join).toEqual(["Join a game", "Join a game"]);
    expect(main.textContent).not.toMatch(/Set up a room/);
  });
});
