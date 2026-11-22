// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS } from "../src/news/entries";
import { NewsPage } from "../src/pages/NewsPage";
import { parseRoute } from "../src/router";
import { layerFor } from "../src/theme";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("What's new page (site-news-and-feedback)", () => {
  it("routes /news to a reading page on the hub's ground, beside Privacy and Terms", () => {
    expect(parseRoute("/news")).toEqual({ page: "news" });
    expect(parseRoute("/news/")).toEqual({ page: "news" });
    expect(layerFor({ page: "news" })).toBe("hub");
  });

  it("shows every post as its own section, newest first, with its picture described", () => {
    render(<NewsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "What's new" })).toBeTruthy();
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    // The index on the left, then the posts, in reading order.
    expect(titles).toEqual(["All updates", ...NEWS.map((e) => e.title.en)]);
    for (const entry of NEWS) {
      expect(document.getElementById(entry.id)?.tagName).toBe("SECTION");
      if (entry.media?.type === "image") expect(screen.getByRole("img", { name: entry.media.alt.en })).toBeTruthy();
    }
  });

  it("marks What's new in the header and footer navigation, and the index jumps to each post", () => {
    render(<NewsPage />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "What's new" }).getAttribute("aria-current")).toBe("page");
    expect(within(main).getByRole("link", { name: "Privacy" }).getAttribute("aria-current")).toBeNull();
    const footer = screen.getByRole("navigation", { name: "Policies" });
    expect(within(footer).getByRole("link", { name: "What's new" }).getAttribute("aria-current")).toBe("page");
    const index = screen.getByRole("navigation", { name: "All updates" });
    expect(within(index).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(NEWS.map((e) => `#${e.id}`));
  });
});
