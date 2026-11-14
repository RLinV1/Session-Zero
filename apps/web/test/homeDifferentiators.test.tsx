// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DifferentiatorsSection, REPO_URL } from "../src/pages/home/DifferentiatorsSection";
import { FactsRow } from "../src/pages/home/FactsRow";
import { Hero } from "../src/pages/home/Hero";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const walls = () => [...document.querySelectorAll("svg.walls-drawing line.wall-stroke")];
const BILLING = /\b(price|prices|pricing|trial|plans?|upgrade|premium|subscriptions?)\b/i;

describe("free is stated (gm-home: Free is stated)", () => {
  it("says Free forever in the hero and the facts row, and never names a price", () => {
    render(
      <>
        <Hero />
        <FactsRow />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Free forever");
    expect(screen.getByText("Free forever", { selector: "strong" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(BILLING);
  });
});

describe("the differentiators section (gm-home: A differentiators section opens the running-a-game part)", () => {
  it("lists grid and walls, AI seats, the builder and open source, in that order", () => {
    render(<DifferentiatorsSection />);
    const items = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(items).toEqual(["Grid and walls, suggested.", "Give your own AI a player seat.", "Let your AI fill in your game.", "Open source."]);
  });

  it("lets a visitor apply or discard the suggested walls", () => {
    render(<DifferentiatorsSection />);
    expect(walls().length).toBeGreaterThan(0);
    expect(walls().every((l) => l.classList.contains("is-suggested"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(walls().length).toBeGreaterThan(0);
    expect(walls().some((l) => l.classList.contains("is-suggested"))).toBe(false);
    expect(screen.getByText("Applied. The walls are now part of the map.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detect again" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(walls()).toHaveLength(0);
    expect(screen.getByText("Discarded. The map is as it was.")).toBeTruthy();
  });

  it("moves the AI's token when a preset instruction is chosen, and says it is a preview", () => {
    render(<DifferentiatorsSection />);
    expect(screen.getByText("Preview only. No AI is running here.")).toBeTruthy();
    const token = () => document.querySelector<HTMLElement>(".seat-token")!;
    const before = token().style.top;
    const north = screen.getByRole("button", { name: "Move Oswin two squares north" });
    fireEvent.click(north);
    expect(north.getAttribute("aria-pressed")).toBe("true");
    expect(token().style.top).not.toBe(before);
    expect(screen.getByText("Oswin (AI) moved two squares north.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move Oswin back to the start" }));
    expect(token().style.top).toBe(before);
  });

  it("links the open source tile to the repository", () => {
    render(<DifferentiatorsSection />);
    const link = screen.getByRole("link", { name: "View the source code" });
    expect(link.getAttribute("href")).toBe(REPO_URL);
    expect(within(link.closest("article")!).getByText(/MIT licensed/)).toBeTruthy();
  });
});

describe("claims stay accurate (gm-home: Differentiator claims stay accurate)", () => {
  it("states on each AI item that no AI runs here, that use counts against the GM's own app, and that a person is the GM", () => {
    render(<DifferentiatorsSection />);
    const [, seats, builder] = [...document.querySelectorAll("article")];
    for (const item of [seats!, builder!]) {
      expect(item.textContent).toContain("doesn't run an AI itself");
      expect(item.textContent).toContain("usage limits");
      expect(item.textContent).toContain("a person is still the GM");
    }
    expect(seats!.textContent).toContain("sees only what a player can see");
  });

  it("calls detection a suggestion, writes MCP once in parentheses, and uses no forbidden word", () => {
    render(<DifferentiatorsSection />);
    const text = document.body.textContent!;
    expect(text).toContain("You check a preview, then apply it or discard it");
    expect(text.match(/MCP/g)).toHaveLength(1);
    expect(text).toContain("(MCP)");
    expect(text).not.toMatch(BILLING);
    expect(text).not.toMatch(/\bservers?\b/i);
    expect(text).not.toMatch(/claude|chatgpt|openai|roll20|foundry/i);
    expect(text.includes("—")).toBe(false);
  });
});
