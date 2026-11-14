import { describe, expect, it } from "vitest";
import { listOpenings, type LibraryMapBoard } from "@vtt/shared";
import { mapOverlay, type OverlayInput } from "../src/domain/mapOverlay";

const grid = { cellSize: 70, offsetX: 0, offsetY: 0 };
const input = (over: Partial<OverlayInput> = {}): OverlayInput =>
  ({ width: 3000, height: 1000, grid, walls: [], openings: [], marks: [], region: null, maxEdge: 1500, ...over });

describe("the map picture an AI reads positions from (FR-GM-26, ADR 0053)", () => {
  it("shows a block of squares with their own column and row numbers", () => {
    const layout = mapOverlay(input({ region: { fromColumn: 20, toColumn: 29, fromRow: 0, toRow: 9 } }));
    expect(layout.crop).toEqual({ left: 1400, top: 0, width: 700, height: 700 });
    expect(layout.out).toEqual({ width: 1500, height: 1500 });
    const columns = layout.labels.filter((l) => l.kind === "column");
    const rows = layout.labels.filter((l) => l.kind === "row");
    expect(columns.map((l) => l.text)).toEqual(["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]);
    expect(rows.map((l) => l.text)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    // Column 20's number sits over the middle of the region's first square.
    const scale = 1500 / 700;
    expect(columns[0]!.x).toBeCloseTo(35 * scale, 0);
    expect(rows[0]!.y).toBeCloseTo(35 * scale, 0);
  });

  it("numbers every 5th column when squares are too small to number each", () => {
    const layout = mapOverlay(input({ width: 2100, height: 1400, grid: { cellSize: 10, offsetX: 0, offsetY: 0 } }));
    const columns = layout.labels.filter((l) => l.kind === "column").map((l) => Number(l.text));
    expect(columns.slice(0, 3)).toEqual([0, 5, 10]);
    expect(columns.every((c) => c % 5 === 0)).toBe(true);
  });

  it("numbers openings as the setup list does, at their middles", () => {
    const board: LibraryMapBoard = {
      walls: [
        { a: { x: 0, y: 140 }, b: { x: 140, y: 140 } },
        { a: { x: 140, y: 140 }, b: { x: 210, y: 140 }, uvttPortal: { closed: true } },
        { a: { x: 280, y: 0 }, b: { x: 280, y: 70 }, uvttPortal: { closed: false } },
      ],
      fog: [],
    };
    const openings = listOpenings(board, undefined, grid);
    const layout = mapOverlay(input({ width: 700, height: 700, walls: board.walls, openings }));
    const scale = 1500 / 700;
    expect(layout.labels.filter((l) => l.kind === "opening")).toEqual([
      { kind: "opening", text: "1", x: expect.closeTo(175 * scale, 0), y: expect.closeTo(140 * scale, 0) },
      { kind: "opening", text: "2", x: expect.closeTo(280 * scale, 0), y: expect.closeTo(35 * scale, 0) },
    ]);
    expect(openings.map((o) => o.number)).toEqual([1, 2]);
  });

  it("draws numbers as strokes, with no text that needs a font", () => {
    const layout = mapOverlay(input({ region: { fromColumn: 0, toColumn: 3, fromRow: 0, toRow: 3 } }));
    expect(layout.svg).toMatch(/^<svg [^>]*width="1120" height="1120"/);
    expect(layout.svg).not.toMatch(/<text/);
  });

  it("shows the whole map when there is no grid to count squares by", () => {
    const layout = mapOverlay(input({ grid: null, region: { fromColumn: 0, toColumn: 1, fromRow: 0, toRow: 1 } }));
    expect(layout.crop).toEqual({ left: 0, top: 0, width: 3000, height: 1000 });
    expect(layout.labels).toEqual([]);
  });
});

describe("the AI's terrain in the map picture (FR-GM-26, ADR 0071)", () => {
  const terrain = [{ row: 0, start: 0, end: 2, kind: "difficult" as const }, { row: 1, start: 40, end: 41, kind: "blocked" as const }];
  const rects = (svg: string) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#terrain-(\w+)\)"/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), kind: m[5] }));

  it("draws each run as one area, Difficult single-hatched and Blocked crosshatched, under the grid", () => {
    const layout = mapOverlay(input({ terrain }));
    const scale = 1500 / 3000;
    expect(rects(layout.svg)).toEqual([
      { x: 0, y: 0, width: 210 * scale, height: 70 * scale, kind: "difficult" },
      { x: 2800 * scale, y: 70 * scale, width: 140 * scale, height: 70 * scale, kind: "blocked" },
    ]);
    // Two patterns: one hatch direction for Difficult, both for Blocked.
    expect(layout.svg.match(/<pattern id="terrain-difficult"[^]*?<\/pattern>/)?.[0].match(/M/g)).toHaveLength(2);
    expect(layout.svg.match(/<pattern id="terrain-blocked"[^]*?<\/pattern>/)?.[0].match(/M/g)).toHaveLength(4);
    expect(layout.svg.indexOf("terrain-difficult")).toBeLessThan(layout.svg.indexOf('stroke="#00e5ff"'));
  });

  it("draws only the part of a run inside a block of squares, and nothing without a grid", () => {
    const close = mapOverlay(input({ terrain, region: { fromColumn: 1, toColumn: 4, fromRow: 0, toRow: 1 } }));
    expect(rects(close.svg).map((r) => r.kind)).toEqual(["difficult"]);
    expect(rects(close.svg)[0]).toMatchObject({ x: 0, y: 0 });
    expect(mapOverlay(input({ grid: null, terrain })).svg).not.toContain("terrain-");
    expect(mapOverlay(input()).svg).not.toContain("terrain-");
  });
});
