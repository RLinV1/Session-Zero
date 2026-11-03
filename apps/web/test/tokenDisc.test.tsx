// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryCreature } from "@vtt/shared";
import { CreatureCard } from "../src/pages/LibraryCreatures";
import { TokenDisc } from "../src/ui/TokenDisc";

afterEach(cleanup);

const creature = (overrides: Partial<LibraryCreature> = {}): LibraryCreature => ({
  id: "c1", name: "Bugbear", size: 1, hp: null, maxHp: 27, ac: 16, color: "#c0392b", conditions: [],
  imageAssetId: "a1", imageUrl: "/uploads/bugbear.png", createdAt: "2026-10-01T00:00:00.000Z", ...overrides,
});

describe("one token drawing (design-language: One token drawing)", () => {
  it("shows a creature card's art clipped to the disc, over the creature's colour", () => {
    const { container } = render(<ul><CreatureCard creature={creature()} onEdit={() => {}} onDeleted={() => {}} /></ul>);
    const disc = container.querySelector(".creature-card .token-disc") as HTMLElement;
    expect(disc.classList.contains("has-art")).toBe(true);
    expect(disc.querySelector("img")?.getAttribute("src")).toBe("/uploads/bugbear.png");
    expect(disc.style.backgroundColor).toBe("rgb(192, 57, 43)");
  });

  it("falls back to the coloured disc and initial when a creature's art fails to load", () => {
    const { container } = render(<ul><CreatureCard creature={creature()} onEdit={() => {}} onDeleted={() => {}} /></ul>);
    const disc = container.querySelector(".creature-card .token-disc") as HTMLElement;
    fireEvent.error(disc.querySelector("img")!);
    expect(disc.querySelector("img")).toBeNull();
    expect(disc.classList.contains("has-art")).toBe(false);
    expect(disc.textContent).toBe("B");
    expect(disc.style.backgroundColor).toBe("rgb(192, 57, 43)");
  });

  it("draws a creature without art as its coloured disc and initial", () => {
    const { container } = render(<ul><CreatureCard creature={creature({ imageUrl: null, imageAssetId: null })} onEdit={() => {}} onDeleted={() => {}} /></ul>);
    expect(container.querySelector(".creature-card .token-disc")?.textContent).toBe("B");
    expect(screen.getByText("Bugbear")).toBeTruthy();
  });

  it("shows the hit-point bar in the board's colours, and only when hit points are known", () => {
    const { container, rerender } = render(<TokenDisc name="Ash" color="#d29922" hp={0.2} />);
    const fill = container.querySelector(".token-hp-fill") as HTMLElement;
    expect(fill.style.width).toBe("20%");
    expect(fill.style.backgroundColor).toBe("var(--danger)");
    rerender(<TokenDisc name="Ash" color="#d29922" />);
    expect(container.querySelector(".token-hp")).toBeNull();
  });
});
