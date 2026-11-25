import { describe, expect, it } from "vitest";
import {
  blocksSight,
  clipSegmentsToMap,
  polygonArea,
  prepareSightBlockers,
  SHIPPED_MAPS,
  sightPolygon,
  splitSegments,
  viewerSight,
  type Point,
  type RoomState,
  type Segment,
} from "../src";

const distToSegment = (p: Point, s: Segment) => {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2));
  return Math.hypot(s.a.x + t * dx - p.x, s.a.y + t * dy - p.y);
};

/** Three fixed tokens per map, along its diagonal, each moved off any wall it would stand on. */
function tokensFor(width: number, height: number, walls: readonly Segment[]): Point[] {
  return [0.3, 0.5, 0.7].map((f) => {
    let p = { x: width * f + 0.37, y: height * f + 0.53 };
    while (walls.some((w) => distToSegment(p, w) < 2)) p = { x: p.x + 7.1, y: p.y + 3.3 };
    return p;
  });
}

describe("sight on the shipped maps (FR-GM-19, fix-sight-crossing-walls)", () => {
  for (const map of SHIPPED_MAPS) {
    it(`${map.slug}: matches the old sight wherever its walls don't cross`, () => {
      const walls = (map.walls ?? []).filter(blocksSight).map((w) => ({ a: w.a, b: w.b }));
      const bounds = { width: map.width, height: map.height };
      const prepared = clipSegmentsToMap(prepareSightBlockers(walls, []).segments, map.width, map.height);
      const crossings = splitSegments(walls.map((w) => ({ ...w, source: "wall" as const }))).length - walls.length;
      for (const origin of tokensFor(map.width, map.height, walls)) {
        const before = Math.abs(polygonArea(sightPolygon(walls, origin, bounds)));
        const after = Math.abs(polygonArea(sightPolygon(prepared, origin, bounds)));
        if (crossings === 0) expect(after).toBeCloseTo(before, 0);
        else if (Math.abs(after - before) > 1) {
          console.log(`${map.slug}: ${crossings} more pieces after the split; from (${origin.x.toFixed(0)}, ${origin.y.toFixed(0)}) sight changes by ${(after - before).toFixed(0)} px²`);
        }
        // Splitting only ever restores lit floor a chord had cut away; it never hides more.
        expect(after).toBeGreaterThanOrEqual(before - 1);
      }
    });
  }

  it("prepares and casts three tokens on The Broken Span quickly, sharing one split", () => {
    const map = SHIPPED_MAPS.find((m) => m.slug === "broken-span")!;
    const walls = Object.fromEntries((map.walls ?? []).map((w, i) => [`w${i}`, { id: `w${i}`, ...w }]));
    const tokens = Object.fromEntries(
      tokensFor(map.width, map.height, Object.values(walls)).map((p, i) => [`t${i}`, { id: `t${i}`, position: p, ownerIds: ["p1"], hidden: false }]),
    );
    const room = {
      scene: { map: { url: map.url, width: map.width, height: map.height }, grid: map.grid, lineOfSight: true },
      walls, tokens, fog: {},
    } as unknown as RoomState;
    const player = { id: "p1", role: "player", displayName: "P" } as const;
    viewerSight(room, player); // the split, cached from here on
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      viewerSight(room, player);
      best = Math.min(best, performance.now() - start);
    }
    console.log(`viewerSight, 3 tokens on The Broken Span (cached split): ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(10);
  });
});

describe("sight split at the limits (FR-GM-19, fix-sight-crossing-walls)", () => {
  it("splits 1,500 walls and 100 fog regions of 64 points within budget", () => {
    let s = 9;
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const walls: Segment[] = Array.from({ length: 1500 }, () => {
      const x = rand() * 3000, y = rand() * 3000, a = rand() * Math.PI * 2, len = 20 + rand() * 200;
      return { a: { x, y }, b: { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len } };
    });
    const fog: Point[][] = Array.from({ length: 100 }, () => {
      const cx = rand() * 3000, cy = rand() * 3000, r = 30 + rand() * 120;
      return Array.from({ length: 64 }, (_, k) => ({ x: cx + Math.cos((k / 64) * Math.PI * 2) * r, y: cy + Math.sin((k / 64) * Math.PI * 2) * r }));
    });
    prepareSightBlockers(walls, fog);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      prepareSightBlockers(walls, fog);
      best = Math.min(best, performance.now() - start);
    }
    console.log(`prepareSightBlockers, 1500 walls + 100x64 fog: ${best.toFixed(2)} ms`);
    // The design's budget is 50 ms; the gate leaves room for slow CI machines.
    expect(best).toBeLessThan(150);
  });
});
