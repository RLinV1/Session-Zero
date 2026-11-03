// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../src/pages/HomePage";

/** The attack tile's stage needs WebGL; the copy around it is what is checked here. */
vi.mock("../src/ui/AnimationPreviewStage", () => ({
  AnimationPreviewStage: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

beforeEach(() => {
  localStorage.clear();
  // No IntersectionObserver: every demo counts as near and renders, so all its words are checked.
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Every word a visitor can meet: the text, and what assistive technology and tooltips say. */
function pageWords(): string {
  const attrs = [...document.querySelectorAll("[aria-label], [alt], [title], [placeholder]")].flatMap((el) =>
    ["aria-label", "alt", "title", "placeholder"].map((a) => el.getAttribute(a) ?? ""),
  );
  // Text node by node, so the last word of one element never runs into the first of the next.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const text: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest("style, script")) text.push(node.textContent ?? "");
  }
  return [...text, ...attrs].join("\n");
}

/** Words that describe how the app is built rather than what it does for a table. */
const IMPLEMENTATION = [/\bservers?\b/i, /\bclients?\b/i, /\bfilter(s|ed|ing)?\b/i, /\bsnapshots?\b/i, /update stream/i, /\bparser\b/i, /\boverlays?\b/i];
/** Code identifiers: camelCase, snake_case, calls, and dotted names such as token.move. */
const CODE = [/\b[a-z]+[A-Z][A-Za-z]*\b/, /\b[a-z]+_[a-z_]+\b/, /\b\w+\(\)/, /\b[a-z]+\.[a-z][A-Za-z]*\b/];
/** Features the table only has in part, which the page must not advertise (gm-home). */
const PARTIAL = [/movement budget/i, /shared (drawing|sketch)|draw(ing|ings)? (shared|together|for (the|your) players)/i, /(door|window)s?( (and|or) (door|window)s?)? detection|detect(s|ed|ing)? (the )?(doors?|windows?)/i];

function check(when: string) {
  const words = pageWords();
  for (const rule of [...IMPLEMENTATION, ...CODE, ...PARTIAL]) {
    const hit = words.match(rule);
    expect(hit?.[0], `${when}: "${hit?.[0]}" matches ${rule}`).toBeUndefined();
  }
  expect(words.includes("—"), `${when}: an em dash`).toBe(false);
}

describe("the home page's copy (gm-home: The home page advertises only what the table does)", () => {
  it("names no implementation, no code, no partial feature and no em dash, in either view and after any roll", async () => {
    render(<HomePage />);
    // The demos that load on their own render once their code arrives.
    expect(await screen.findByText("Activity log")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Next turn" })).toBeTruthy();
    check("player view");

    fireEvent.click(screen.getByRole("button", { name: "GM view" }));
    check("GM view");

    const roll = screen.getByLabelText("What to roll");
    fireEvent.change(roll, { target: { value: "1d20+5" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Roll" })));
    check("after a valid roll");

    fireEvent.change(roll, { target: { value: "roll a d20" } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(screen.getByRole("alert").textContent).toBe("Use NdX, NdX+M or NdX-M, for example 1d20+5");
    check("after an invalid roll");
  });

  it("catches what it is meant to catch", () => {
    const words = "The server sends a snapshot; call sightPolygon() or token.move — then draw together with your players.";
    expect(IMPLEMENTATION.some((r) => r.test(words))).toBe(true);
    expect(CODE.filter((r) => r.test(words))).toHaveLength(3);
    expect(PARTIAL.some((r) => r.test(words))).toBe(true);
    expect(PARTIAL.some((r) => r.test("Door and window detection"))).toBe(true);
    expect(words.includes("—")).toBe(true);
  });
});
