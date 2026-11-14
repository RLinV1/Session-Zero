// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GridSpec, TerrainRun } from "@vtt/shared";
import { TerrainCells } from "../src/pages/mapEditor/TerrainSetup";

afterEach(cleanup);
const grid = { cellSize: 10, offsetX: 0, offsetY: 0 } as GridSpec;
const block: TerrainRun[] = [{ row: 0, start: 0, end: 1, kind: "blocked" }, { row: 1, start: 0, end: 1, kind: "blocked" }];
const sides = (d: string | null) => (d ?? "").split("M").filter(Boolean).length;

describe("map editor terrain outlines (board-palette)", () => {
  it("outlines a 2x2 Blocked block once around its perimeter", () => {
    const { container } = render(<svg><TerrainCells runs={block} grid={grid} /></svg>);
    expect(container.querySelectorAll('[data-terrain="blocked"]')).toHaveLength(4);
    const outlines = container.querySelectorAll("[data-terrain-outline]");
    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.getAttribute("data-terrain-outline")).toBe("blocked");
    expect(sides(outlines[0]!.getAttribute("d"))).toBe(8);
    // No per-square outline rects: only each square's tint.
    expect(container.querySelectorAll('[data-terrain="blocked"] rect')).toHaveLength(4);
  });

  it("outlines Difficult and Blocked areas separately", () => {
    const { container } = render(<svg><TerrainCells runs={[{ row: 0, start: 0, end: 0, kind: "difficult" }, { row: 0, start: 1, end: 1, kind: "blocked" }]} grid={grid} /></svg>);
    const outlines = [...container.querySelectorAll("[data-terrain-outline]")];
    expect(outlines.map((o) => o.getAttribute("data-terrain-outline")).sort()).toEqual(["blocked", "difficult"]);
    for (const o of outlines) expect(sides(o.getAttribute("d"))).toBe(4);
  });

  it("keeps the stroke preview outlining each square", () => {
    const { container } = render(<svg><TerrainCells runs={block} grid={grid} outline="cell" /></svg>);
    expect(container.querySelectorAll("[data-terrain-outline]")).toHaveLength(0);
    // Tint plus the two-tone inset outline, per square.
    expect(container.querySelectorAll('[data-terrain="blocked"] rect')).toHaveLength(12);
  });
});
