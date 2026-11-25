import { describe, expect, it } from "vitest";
import { inSight, viewerSight, type Point, type RoomState } from "../src";

const player = { id: "p1", role: "player", displayName: "P" } as const;
const rect = (id: string, x0: number, y0: number, x1: number, y1: number) =>
  ({ [id]: { id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] } });

function sight(at: Point, fog: object, walls: Record<string, { a: Point; b: Point; portal?: object }> = {}): Point[][] {
  const room = {
    scene: { map: { url: "/m.png", width: 1000, height: 1000 }, grid: {}, lineOfSight: true },
    walls: Object.fromEntries(Object.entries(walls).map(([id, w]) => [id, { id, ...w }])),
    tokens: { t: { id: "t", position: at, ownerIds: ["p1"], hidden: false } },
    fog,
  } as unknown as RoomState;
  return viewerSight(room, player)!;
}
const sees = (s: Point[][], x: number, y: number) => inSight(s, { x, y }, 0);

describe("sight never leaks into fog (FR-GM-19, FR-GM-23, fix-sight-crossing-walls)", () => {
  const fogRoom = rect("f", 500, 0, 1000, 1000);
  const inner = { a: { x: 700, y: 200 }, b: { x: 900, y: 200 } };

  it("does not step a token's sight through a wall lying on the fog's edge", () => {
    for (const portal of [undefined, { kind: "door", state: "locked" }]) {
      const s = sight({ x: 499.5, y: 500 }, fogRoom, { edge: { a: { x: 500, y: 0 }, b: { x: 500, y: 1000 }, ...(portal ? { portal } : {}) }, inner });
      expect(sees(s, 800, 500)).toBe(false);
      for (const v of s.flat()) expect(v.x).toBeLessThanOrEqual(500 + 1e-6);
    }
  });

  it("keeps the facing edges of two fog regions 0.3 px apart, so no channel opens between them", () => {
    const fog = { ...rect("a", 300, 300, 700, 500), ...rect("b", 300, 500.3, 700, 700) };
    const s = sight({ x: 100, y: 520 }, fog, { w: { a: { x: 500, y: 470 }, b: { x: 500, y: 495 } } });
    expect(sees(s, 500, 480)).toBe(false);
    expect(sees(s, 650, 465)).toBe(false);
    // The gap itself is open ground and may be seen along; nothing strictly inside either region may.
    const strictlyIn = (v: Point, y0: number, y1: number) => v.x > 300 + 1e-6 && v.x < 700 - 1e-6 && v.y > y0 + 1e-6 && v.y < y1 - 1e-6;
    for (const v of s.flat()) expect(strictlyIn(v, 300, 500) || strictlyIn(v, 500.3, 700)).toBe(false);
  });

  it("still blocks sight at a fog region 0.4 px wide", () => {
    expect(sees(sight({ x: 100, y: 500 }, rect("f", 500, 0, 500.4, 1000)), 900, 500)).toBe(false);
  });

  it("keeps a token in fog 0.8 px thin from seeing out either side", () => {
    const thin = rect("f", 0, 500, 1000, 500.8);
    for (const y of [500.2, 501.5]) {
      const s = sight({ x: 500, y }, thin);
      expect(sees(s, 500, 900)).toBe(false);
      expect(sees(s, 500, 100)).toBe(false);
    }
  });
});
