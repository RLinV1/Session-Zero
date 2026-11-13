import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hex, MAP_PALETTE, terrainHatch } from "../src/board/mapPalette";

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
