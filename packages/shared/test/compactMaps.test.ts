import { describe, expect, it } from "vitest";
import { blocksSight, pointInPolygon, SHIPPED_MAPS, sightPolygon } from "../src";

describe("compact demonstration maps", () => {
  for (const slug of ["emberwatch-archive", "moonwater-baths"]) {
    it(`${slug} has an exact grid with usable doors and windows`, () => {
      const map = SHIPPED_MAPS.find((m) => m.slug === slug)!;
      expect(map).toBeDefined();
      expect(map.width % map.grid.cellSize).toBe(0);
      expect(map.height % map.grid.cellSize).toBe(0);
      expect(map.grid.offsetX).toBe(0);
      expect(map.grid.offsetY).toBe(0);
      expect(map.walls!.filter((w) => w.portal?.kind === "door")).toHaveLength(4);
      expect(map.walls!.filter((w) => w.portal?.kind === "window")).toHaveLength(4);
      const door = map.walls!.find((w) => w.portal?.kind === "door")!;
      const mid = { x: (door.a.x + door.b.x) / 2, y: (door.a.y + door.b.y) / 2 };
      const origin = { x: mid.x - 70, y: mid.y };
      const target = { x: mid.x + 70, y: mid.y };
      const see = (open: boolean) => {
        const walls = map.walls!.map((w, i) => ({ ...w, id: String(i), ...(open && w === door ? { portal: { kind: "door" as const, state: "open" as const } } : {}) }));
        return pointInPolygon(target, sightPolygon(walls.filter(blocksSight), origin, map));
      };
      expect(see(false)).toBe(false);
      expect(see(true)).toBe(true);
      const window = map.walls!.find((w) => w.portal?.kind === "window")!;
      const windowMid = { x: (window.a.x + window.b.x) / 2, y: window.a.y };
      const blockers = map.walls!.map((w, i) => ({ ...w, id: String(i) })).filter(blocksSight);
      expect(pointInPolygon({ x: windowMid.x, y: windowMid.y - 35 }, sightPolygon(blockers, { x: windowMid.x, y: windowMid.y + 35 }, map))).toBe(true);
      for (const wall of map.walls!) {
        expect(wall.a.x === wall.b.x || wall.a.y === wall.b.y).toBe(true);
        for (const p of [wall.a, wall.b]) {
          expect(p.x % (map.grid.cellSize / 2)).toBe(0);
          expect(p.y % (map.grid.cellSize / 2)).toBe(0);
        }
      }
    });
  }
});

// Seam centers measured in the unchanged WebP art; see docs/map-grid-audit.md.
describe("original-map calibration", () => {
  const cases = [
    { slug: "broken-span", old: [69.4, 10, 31], x: [[6,432],[7,501],[8,571],[9,641],[10,710],[11,780],[37,2594],[38,2663],[39,2733],[40,2803]], y: [[10,714],[11,784],[12,853],[13,926],[14,997],[15,1069],[16,1143],[17,1214]] },
    { slug: "hollowfrost-keep", old: [70,47,46], x: [[28,2025],[29,2095],[30,2163],[31,2232],[32,2301],[33,2370]], y: [[6,462],[7,533],[8,603],[9,674],[10,744],[11,815],[12,886],[13,957],[14,1028],[15,1099],[16,1170],[17,1241]] },
  ];
  for (const c of cases) it(`${c.slug} reduces the measured seam error by at least half`, () => {
    const grid = SHIPPED_MAPS.find((m) => m.slug === c.slug)!.grid;
    const error = (size: number, ox: number, oy: number) => [...c.x.map(([i,p]) => (p! - (ox + i! * size)) ** 2), ...c.y.map(([i,p]) => (p! - (oy + i! * size)) ** 2)].reduce((a,b) => a+b, 0);
    expect(error(grid.cellSize, grid.offsetX, grid.offsetY)).toBeLessThan(error(c.old[0]!, c.old[1]!, c.old[2]!) / 4);
  });
});
