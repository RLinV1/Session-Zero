import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyRoomState, type RoomState, type TerrainRun } from "@vtt/shared";
import { hex, MAP_PALETTE, outlineSegment, outlineVisibility, terrainHatch, terrainOutline, type OutlineSide } from "../src/board/mapPalette";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
const cssVar = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1]?.toLowerCase();

/** Hue in degrees, for telling colour families apart. */
function hue(colour: number): number {
  const r = (colour >> 16 & 255) / 255, g = (colour >> 8 & 255) / 255, b = (colour & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: number, b: number) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

describe("map palette (board-palette)", () => {
  it("the stylesheet mirrors the palette", () => {
    expect(cssVar("map-wall")).toBe(hex(MAP_PALETTE.wall.inner));
    expect(cssVar("map-wall-outer")).toBe(hex(MAP_PALETTE.wall.outer));
    expect(cssVar("map-door")).toBe(hex(MAP_PALETTE.door.inner));
    expect(cssVar("map-door-outer")).toBe(hex(MAP_PALETTE.door.outer));
    expect(cssVar("map-window")).toBe(hex(MAP_PALETTE.window.inner));
    expect(cssVar("map-window-outer")).toBe(hex(MAP_PALETTE.window.outer));
    expect(cssVar("map-difficult")).toBe(hex(MAP_PALETTE.difficult.inner));
    expect(cssVar("map-blocked")).toBe(hex(MAP_PALETTE.blocked.inner));
  });

  it("walls, doors, windows and Difficult terrain are different colour families", () => {
    const families = [MAP_PALETTE.wall, MAP_PALETTE.door, MAP_PALETTE.window, MAP_PALETTE.difficult, MAP_PALETTE.blocked].map((c) => c.inner);
    for (let i = 0; i < families.length; i++)
      for (let j = i + 1; j < families.length; j++) expect(hueGap(families[i]!, families[j]!)).toBeGreaterThan(25);
  });

  it("every outer tone is darker than its inner tone", () => {
    const lum = (c: number) => 0.2126 * (c >> 16 & 255) + 0.7152 * (c >> 8 & 255) + 0.0722 * (c & 255);
    for (const colour of Object.values(MAP_PALETTE)) expect(lum(colour.outer)).toBeLessThan(lum(colour.inner) / 3);
  });
});

describe("terrain hatching (board-palette)", () => {
  const slope = ([p, q]: [{ x: number; y: number }, { x: number; y: number }]) => Math.sign((q.y - p.y) / (q.x - p.x));

  it("Difficult is single hatching: every line runs one way", () => {
    const lines = terrainHatch("difficult", 70);
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines.map(slope))).toEqual(new Set([1]));
  });

  it("Blocked is crosshatching: lines run both ways, twice as many", () => {
    const lines = terrainHatch("blocked", 70);
    expect(new Set(lines.map(slope))).toEqual(new Set([1, -1]));
    expect(lines.length).toBe(2 * terrainHatch("difficult", 70).length);
  });

  it("stays inside the square", () => {
    for (const [p, q] of terrainHatch("blocked", 70)) for (const pt of [p, q]) {
      expect(pt.x).toBeGreaterThanOrEqual(0); expect(pt.x).toBeLessThanOrEqual(70);
      expect(pt.y).toBeGreaterThanOrEqual(0); expect(pt.y).toBeLessThanOrEqual(70);
    }
  });
});

describe("terrain area outlines (board-palette)", () => {
  const key = (s: OutlineSide) => `${s.kind}:${s.col},${s.row}:${s.side}`;
  const rect = (kind: TerrainRun["kind"], c0: number, r0: number, c1: number, r1: number): TerrainRun[] =>
    Array.from({ length: r1 - r0 + 1 }, (_, i) => ({ row: r0 + i, start: c0, end: c1, kind }));

  it("outlines a 3x2 block once around its perimeter, with no inner sides", () => {
    const sides = terrainOutline(rect("difficult", 0, 0, 2, 1));
    expect(sides).toHaveLength(10);
    expect(sides.map(key)).not.toContain("difficult:0,0:right");
    expect(sides.map(key)).not.toContain("difficult:1,0:bottom");
  });

  it("follows an L-shape", () => {
    const sides = terrainOutline([...rect("blocked", 0, 0, 0, 2), { row: 2, start: 1, end: 2, kind: "blocked" }]);
    // 5 squares, 4 shared sides: 5 * 4 - 2 * 4.
    expect(sides).toHaveLength(12);
  });

  it("outlines a hole inside an area", () => {
    const ring = rect("difficult", 0, 0, 2, 2).flatMap((r) => r.row === 1 ? [{ ...r, end: 0 }, { ...r, start: 2 }] : [r]);
    const sides = terrainOutline(ring).map(key);
    expect(sides).toHaveLength(16);
    for (const k of ["difficult:1,0:bottom", "difficult:0,1:right", "difficult:2,1:left", "difficult:1,2:top"]) expect(sides).toContain(k);
  });

  it("keeps squares touching only at a corner as separate areas", () => {
    const sides = terrainOutline([{ row: 0, start: 0, end: 0, kind: "blocked" }, { row: 1, start: 1, end: 1, kind: "blocked" }]);
    expect(sides).toHaveLength(8);
  });

  it("outlines a Difficult/Blocked shared edge once for each kind", () => {
    const sides = terrainOutline([{ row: 0, start: 0, end: 0, kind: "difficult" }, { row: 0, start: 1, end: 1, kind: "blocked" }]).map(key);
    expect(sides).toHaveLength(8);
    expect(sides).toContain("difficult:0,0:right");
    expect(sides).toContain("blocked:1,0:left");
  });

  it("keeps each kind's band in its own squares on a shared edge", () => {
    const sides = terrainOutline([{ row: 0, start: 0, end: 0, kind: "difficult" }, { row: 0, start: 1, end: 1, kind: "blocked" }]);
    const difficult = sides.find((s) => s.kind === "difficult" && s.side === "right")!;
    const blocked = sides.find((s) => s.kind === "blocked" && s.side === "left")!;
    expect(outlineSegment(difficult, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1)[0].x).toBe(9);
    expect(outlineSegment(blocked, { minX: 10, minY: 0, maxX: 20, maxY: 10 }, 1)[0].x).toBe(11);
  });

  it("joins the band at outer corners, straight runs and inner corners", () => {
    // An L: (0,0), (0,1), (1,1). The top of (1,1) meets (0,0)'s right side at an inner corner.
    const sides = terrainOutline([{ row: 0, start: 0, end: 0, kind: "blocked" }, { row: 1, start: 0, end: 1, kind: "blocked" }]);
    const find = (col: number, row: number, side: OutlineSide["side"]) => sides.find((s) => s.col === col && s.row === row && s.side === side)!;
    expect(find(0, 0, "top").ends).toEqual([1, 1]);
    expect(find(0, 1, "bottom").ends).toEqual([1, 0]);
    expect(find(1, 1, "top").ends).toEqual([-1, 1]);
    expect(find(0, 0, "right").ends).toEqual([1, -1]);
    // The inner corner's lines meet at the same inset point.
    const top = outlineSegment(find(1, 1, "top"), { minX: 10, minY: 10, maxX: 20, maxY: 20 }, 1);
    const right = outlineSegment(find(0, 0, "right"), { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1);
    expect(top[0]).toEqual({ x: 9, y: 11 });
    expect(right[1]).toEqual({ x: 9, y: 11 });
  });

  it("drops exactly the sides facing a square the viewer may not outline toward", () => {
    const sides = terrainOutline(rect("difficult", 0, 0, 1, 0), (col, row) => !(col === 2 && row === 0)).map(key);
    expect(sides).toHaveLength(5);
    expect(sides).not.toContain("difficult:1,0:right");
  });

  describe("what a player may outline toward", () => {
    // A 4x1-square map of 10px squares; fog over the two right squares.
    const state = (): RoomState => {
      const s = emptyRoomState("room");
      return {
        ...s,
        scene: { ...s.scene, grid: { ...s.scene.grid, cellSize: 10, offsetX: 0, offsetY: 0 }, map: { url: "/m.png", width: 40, height: 10 } },
        fog: { f: { id: "f", shape: "rect", points: [{ x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 20, y: 10 }] } },
      } as RoomState;
    };

    it("outlines along the map edge for players and the GM alike", () => {
      for (const gm of [false, true]) {
        const ok = outlineVisibility(state(), gm);
        expect(ok(-1, 0)).toBe(true);
        expect(ok(0, -1)).toBe(true);
        expect(ok(0, 1)).toBe(true);
      }
    });

    it("does not outline toward a fogged square, but the GM does", () => {
      expect(outlineVisibility(state(), false)(2, 0)).toBe(false);
      expect(outlineVisibility(state(), true)(2, 0)).toBe(true);
    });

    it("outlines toward a square the player can see part of, as the server sends it (ADR 0069)", () => {
      const ok = outlineVisibility(state(), false);
      // Square 1 only touches the fog along its edge.
      expect(ok(1, 0)).toBe(true);
      const partly = { ...state(), fog: { f: { id: "f", shape: "rect" as const, points: [{ x: 25, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 25, y: 10 }] } } };
      expect(outlineVisibility(partly, false)(2, 0)).toBe(true);
      expect(outlineVisibility(partly, false)(3, 0)).toBe(false);
    });

    it("looks the same whether the fogged neighbour is plain ground or more terrain", () => {
      // The player is sent only the visible square; what lies under fog never reaches them, and
      // either way the side facing the fog is not outlined.
      const ok = outlineVisibility(state(), false);
      const sent: TerrainRun[] = [{ row: 0, start: 0, end: 1, kind: "difficult" }];
      const sides = terrainOutline(sent, ok).map(key);
      expect(sides).not.toContain("difficult:1,0:right");
      expect(sides).toContain("difficult:0,0:left");
      expect(sides).toHaveLength(5);
    });
  });
});
