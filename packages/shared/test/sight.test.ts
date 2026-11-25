import { describe, expect, it } from "vitest";
import { blocksSight, inSight, pointInPolygon, polygonArea, sightBlockers, sightPolygon, splitSegments, viewerSight, type Point, type RoomState, type Segment, type Wall } from "../src";

const bounds = { width: 1000, height: 1000 };
const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const area = (p: Point[]) => Math.abs(polygonArea(p));

describe("line of sight geometry (FR-GM-19)", () => {
  it("sees the whole map in an open room", () => {
    const poly = sightPolygon([], { x: 300, y: 400 }, bounds);
    expect(area(poly)).toBeCloseTo(1_000_000, -2);
  });

  it("casts a shadow behind a single wall", () => {
    const poly = sightPolygon([seg(400, 400, 600, 400)], { x: 500, y: 200 }, bounds);
    expect(pointInPolygon({ x: 500, y: 300 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 600 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 100, y: 600 }, poly)).toBe(true);
  });

  it("is blocked by both legs of an L-shaped corner", () => {
    const walls = [seg(500, 500, 500, 800), seg(500, 500, 800, 500)];
    const poly = sightPolygon(walls, { x: 300, y: 300 }, bounds);
    expect(pointInPolygon({ x: 700, y: 700 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 700, y: 300 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 700 }, poly)).toBe(true);
  });

  it("leaves no gap between collinear walls end to end", () => {
    const walls = [seg(300, 500, 500, 500), seg(500, 500, 700, 500)];
    const poly = sightPolygon(walls, { x: 500, y: 200 }, bounds);
    for (const x of [499, 500, 501]) expect(pointInPolygon({ x, y: 700 }, poly)).toBe(false);
  });

  it("handles a T-junction", () => {
    const walls = [seg(300, 500, 700, 500), seg(500, 500, 500, 800)];
    const poly = sightPolygon(walls, { x: 400, y: 700 }, bounds);
    expect(pointInPolygon({ x: 450, y: 700 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 700 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 450, y: 300 }, poly)).toBe(false);
  });

  it("blocks sight on closed doors but not open doors or windows", () => {
    const wall = (portal?: unknown): Wall => ({ id: "w", a: { x: 400, y: 400 }, b: { x: 600, y: 400 }, portal }) as Wall;
    const door = (state: string) => wall({ kind: "door", state });
    const window = wall({ kind: "window", state: "closed" });
    expect(blocksSight(wall())).toBe(true);
    expect(blocksSight(door("closed"))).toBe(true);
    expect(blocksSight(door("locked"))).toBe(true);
    expect(blocksSight(door("open"))).toBe(false);
    expect(blocksSight(window)).toBe(false);

    const see = (w: Wall) => {
      const segs = [w].filter(blocksSight).map(({ a, b }) => ({ a, b }));
      return pointInPolygon({ x: 500, y: 600 }, sightPolygon(segs, { x: 500, y: 200 }, bounds));
    };
    expect(see(door("closed"))).toBe(false);
    expect(see(door("open"))).toBe(true);
    expect(see(window)).toBe(true);
  });

  it("works with the origin on the map edge", () => {
    expect(area(sightPolygon([], { x: 0, y: 500 }, bounds))).toBeCloseTo(1_000_000, -2);
    expect(area(sightPolygon([], { x: 0, y: 0 }, bounds))).toBeCloseTo(1_000_000, -2);
    const poly = sightPolygon([seg(300, 400, 300, 600)], { x: 0, y: 500 }, bounds);
    expect(pointInPolygon({ x: 600, y: 500 }, poly)).toBe(false);
  });

  it("works with the origin on a wall endpoint and clamps outside origins", () => {
    const onEnd = sightPolygon([seg(500, 500, 700, 500)], { x: 500, y: 500 }, bounds);
    expect(onEnd.length).toBeGreaterThan(3);
    expect(area(sightPolygon([], { x: -50, y: 2000 }, bounds))).toBeCloseTo(1_000_000, -2);
  });

  it("counts points on a polygon edge as in sight, within tolerance only", () => {
    const square: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(inSight([square], { x: 50, y: 50 })).toBe(true);
    expect(inSight([square], { x: 100, y: 50 })).toBe(true);
    expect(inSight([square], { x: 100.5, y: 50 })).toBe(true);
    expect(inSight([square], { x: 105, y: 50 })).toBe(false);
    expect(inSight([], { x: 50, y: 50 })).toBe(false);
  });

  it("does not reveal the direction of hidden wall endpoints (FR-GM-23)", () => {
    const secret = seg(800, 200, 900, 300);
    const walls = [seg(500, 0, 500, 1000), secret];
    for (const origin of [{ x: 100, y: 500 }, { x: 100, y: 100 }]) {
      const poly = sightPolygon(walls, origin, bounds);
      for (const end of [secret.a, secret.b]) {
        const target = Math.atan2(end.y - origin.y, end.x - origin.x);
        for (const v of poly) {
          const diff = Math.atan2(v.y - origin.y, v.x - origin.x) - target;
          expect(Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)))).toBeGreaterThan(1e-6);
        }
      }
      // Only the corners of the visible rectangle remain.
      expect(poly).toHaveLength(4);
      expect(area(poly)).toBeCloseTo(500_000, -2);
    }
  });

  it("limits an open map to a disc of the given radius", () => {
    const R = 200;
    const origin = { x: 500, y: 500 };
    const poly = sightPolygon([], origin, bounds, R);
    for (const v of poly) expect(Math.hypot(v.x - origin.x, v.y - origin.y)).toBeLessThanOrEqual(R + 1);
    expect(Math.abs(area(poly) - Math.PI * R * R) / (Math.PI * R * R)).toBeLessThan(0.03);
  });

  it("still blocks at walls inside the range, and ignores walls beyond it", () => {
    const origin = { x: 500, y: 500 };
    const poly = sightPolygon([seg(400, 400, 600, 400), seg(100, 100, 100, 900)], origin, bounds, 200);
    expect(pointInPolygon({ x: 500, y: 450 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 350 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 650 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 500 }, poly)).toBe(false);
  });

  it("computes 1500 random walls well inside the 5 ms budget (ADR 0044)", () => {
    let seed = 12345;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const big = { width: 5000, height: 5000 };
    const walls = Array.from({ length: 1500 }, () => {
      const x = rnd() * big.width;
      const y = rnd() * big.height;
      return seg(x, y, x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200);
    });
    const origin = { x: 2500, y: 2500 };
    for (let i = 0; i < 15; i++) sightPolygon(walls, origin, big); // let the JIT settle
    // Best of five so a GC pause or a busy CI core does not fail a steady-state budget.
    let elapsed = Infinity;
    let poly: Point[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      poly = sightPolygon(walls, origin, big);
      elapsed = Math.min(elapsed, performance.now() - start);
    }
    console.log(`sightPolygon 1500 walls: ${elapsed.toFixed(2)} ms, ${poly.length} vertices`);
    // The budget is 5 ms standalone; 15 ms leaves room for parallel test files and still catches the ~25 ms unbucketed scan.
    expect(elapsed).toBeLessThan(15);

    for (let i = 0; i < 15; i++) sightPolygon(walls, origin, big, 1000);
    let ranged = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      sightPolygon(walls, origin, big, 1000);
      ranged = Math.min(ranged, performance.now() - start);
    }
    console.log(`sightPolygon 1500 walls, range 1000: ${ranged.toFixed(2)} ms`);
    expect(ranged).toBeLessThan(15);
  });
});

describe("viewerSight (FR-GM-19)", () => {
  const owned = (id: string, x: number, hidden = false) =>
    ({ id, position: { x, y: 500 }, ownerIds: ["p1"], hidden }) as unknown as RoomState["tokens"][string];
  const state = (tokens: RoomState["tokens"], on = true, map: RoomState["scene"]["map"] = { url: "/m.png", width: 1000, height: 1000 }, fog: RoomState["fog"] = {}) =>
    ({ scene: { map, grid: {}, ...(on ? { lineOfSight: true } : {}) }, walls: {}, tokens, fog }) as unknown as RoomState;
  const gmP = { id: "g", role: "gm", displayName: "G" } as const;
  const player = { id: "p1", role: "player", displayName: "P" } as const;

  it("is null for the GM and when line of sight is off", () => {
    expect(viewerSight(state({ a: owned("a", 100) }), gmP)).toBeNull();
    expect(viewerSight(state({ a: owned("a", 100) }, false), player)).toBeNull();
  });
  it("is empty with no owned token, a hidden owned token, or no map", () => {
    expect(viewerSight(state({}), player)).toEqual([]);
    expect(viewerSight(state({ a: owned("a", 100, true) }), player)).toEqual([]);
    expect(viewerSight(state({ a: owned("a", 100) }, true, null), player)).toEqual([]);
  });
  it("gives one polygon per owned token", () => {
    expect(viewerSight(state({ a: owned("a", 100), b: owned("b", 800) }), player)).toHaveLength(2);
  });
  const fogAt = (id: string, x0: number, y0: number, x1: number, y1: number) =>
    ({ [id]: { id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] } }) as unknown as RoomState["fog"];

  describe("fog blocks sight", () => {
    const goblin = { x: 800, y: 500 };
    // Fog patch at x 400..600 between the token (x=100) and the goblin area.
    const patch = fogAt("f", 400, 300, 600, 700);
    const sees = (fog: RoomState["fog"], p: Point) => inSight(viewerSight(state({ a: owned("a", 100) }, true, undefined, fog), player)!, p);

    it("puts an area behind a fog region out of sight, and restores it when the fog is removed", () => {
      expect(sees(patch, goblin)).toBe(false);
      expect(sees({}, goblin)).toBe(true);
    });
    it("never puts a vertex strictly inside a fog region the token is not in", () => {
      const [poly] = viewerSight(state({ a: owned("a", 100) }, true, undefined, patch), player)!;
      for (const v of poly!) {
        const strictlyInside = v.x > 400 + 1e-6 && v.x < 600 - 1e-6 && v.y > 300 + 1e-6 && v.y < 700 - 1e-6;
        expect(strictlyInside).toBe(false);
      }
    });
  });

  describe("a token in fog sees only the fog around it", () => {
    const at = (id: string, x: number, y: number) =>
      ({ id, position: { x, y }, ownerIds: ["p1"], hidden: false }) as unknown as RoomState["tokens"][string];
    const tokens = (...list: RoomState["tokens"][string][]) => Object.fromEntries(list.map((t) => [t.id, t]));
    const regions = (...list: RoomState["fog"][]) => Object.assign({}, ...list) as RoomState["fog"];
    const sightOf = (toks: RoomState["tokens"], fog: RoomState["fog"], walls: RoomState["walls"] = {}) =>
      viewerSight({ ...state(toks, true, undefined, fog), walls }, player)!;
    const sees = (sight: Point[][], x: number, y: number) => inSight(sight, { x, y }, 0);
    const patch = fogAt("f", 400, 400, 600, 600);

    it("hides everything outside the fog from a token hiding in it", () => {
      const sight = sightOf(tokens(at("a", 500, 500)), patch);
      expect(sees(sight, 450, 450)).toBe(true);
      expect(sees(sight, 800, 500)).toBe(false); // a goblin 3 cells outside the fog
      expect(sees(sight, 300, 500)).toBe(false);
      expect(sees(sight, 500, 100)).toBe(false);
    });

    it("sees across the edge of an overlapping stroke, with no seam", () => {
      const sight = sightOf(tokens(at("a", 450, 500)), regions(patch, fogAt("g", 550, 450, 750, 550)));
      expect(sees(sight, 700, 500)).toBe(true);
      expect(sees(sight, 580, 470)).toBe(true);
      expect(sees(sight, 800, 500)).toBe(false);
    });

    it("sees across the shared edge of adjacent regions", () => {
      const sight = sightOf(tokens(at("a", 450, 500)), regions(patch, fogAt("g", 600, 400, 800, 600)));
      expect(sees(sight, 750, 500)).toBe(true);
      expect(sees(sight, 900, 500)).toBe(false);
    });

    it("stops at a wall inside the fog", () => {
      const walls = { w: { id: "w", a: { x: 500, y: 400 }, b: { x: 500, y: 600 } } } as unknown as RoomState["walls"];
      const sight = sightOf(tokens(at("a", 450, 500)), patch, walls);
      expect(sees(sight, 420, 420)).toBe(true);
      expect(sees(sight, 550, 500)).toBe(false);
    });

    it("counts a token on the fog's edge, or just outside it, as in fog", () => {
      for (const x of [400, 399.5]) {
        const [poly] = sightOf(tokens(at("a", x, 500)), patch);
        expect(sees([poly!], 450, 500)).toBe(true);
        expect(sees([poly!], 300, 500)).toBe(false);
        for (const v of poly!) {
          const outside = v.x < 400 - 1e-6 || v.x > 600 + 1e-6 || v.y < 400 - 1e-6 || v.y > 600 + 1e-6;
          expect(outside).toBe(false);
        }
      }
    });

    it("gives normal sight back once the token steps out of the fog", () => {
      const out = at("a", 200, 500);
      const [poly] = sightOf(tokens(out), patch);
      const edges = patch.f!.points.map((a, i, pts) => ({ a, b: pts[(i + 1) % pts.length]! }));
      expect(area(poly!)).toBeCloseTo(area(sightPolygon(edges, out.position, bounds)), 3);
      expect(sees([poly!], 100, 100)).toBe(true);
      expect(sees([poly!], 500, 500)).toBe(false);
    });

    it("adds each token's sight: the fog around one, the hall around the other", () => {
      const sight = sightOf(tokens(at("a", 500, 500), at("b", 100, 100)), patch);
      expect(sight).toHaveLength(2);
      expect(sees([sight[0]!], 450, 450)).toBe(true);
      expect(sees([sight[0]!], 100, 100)).toBe(false);
      expect(sees([sight[1]!], 900, 100)).toBe(true);
      expect(sees([sight[1]!], 500, 500)).toBe(false);
    });

    it("does not limit sight with line of sight off", () => {
      expect(viewerSight(state(tokens(at("a", 500, 500)), false, undefined, patch), player)).toBeNull();
    });

    it("is unchanged for a token outside fog painted in overlapping strokes", () => {
      const rand = seeded(7);
      for (let room = 0; room < 20; room++) {
        const strokes: RoomState["fog"] = {};
        for (let k = 0; k < 10; k++) {
          const x = 300 + rand() * 400, y = 300 + rand() * 400, w = 40 + rand() * 150, h = 40 + rand() * 150;
          Object.assign(strokes, fogAt(`s${k}`, x, y, x + w, y + h));
        }
        const origin = { x: 50 + rand() * 150, y: 50 + rand() * 900 };
        const [withRemoval] = sightOf(tokens(at("a", origin.x, origin.y)), strokes);
        const allEdges = splitSegments(Object.values(strokes).flatMap((f) => f.points.map((a, i, pts) => ({ a, b: pts[(i + 1) % pts.length]!, source: "fog" as const }))));
        const without = sightPolygon(allEdges, origin, bounds);
        expect(area(withRemoval!)).toBeCloseTo(area(without), 0);
      }
    });
  });

  it("splits once per walls and fog object, and re-splits when walls change (fix-sight-crossing-walls)", () => {
    const walls = { w: { id: "w", a: { x: 300, y: 0 }, b: { x: 300, y: 1000 }, portal: { kind: "door", state: "closed" } } } as unknown as RoomState["walls"];
    const room = { ...state({ a: owned("a", 100) }), walls };
    expect(sightBlockers(room)).toBe(sightBlockers(room));
    expect(viewerSight(room, player)).toEqual(viewerSight(room, player));
    expect(inSight(viewerSight(room, player)!, { x: 600, y: 500 })).toBe(false);
    const opened = { ...room, walls: { w: { ...walls.w!, portal: { kind: "door", state: "open" } } } as unknown as RoomState["walls"] };
    expect(sightBlockers(opened)).not.toBe(sightBlockers(room));
    expect(inSight(viewerSight(opened, player)!, { x: 600, y: 500 })).toBe(true);
  });
});

/** A small seeded random number generator (mulberry32), so random rooms are the same every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whether open segment p-q properly crosses segment s (touching at an end does not count). */
function crosses(p: Point, q: Point, s: Segment): boolean {
  const o = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = o(p, q, s.a), d2 = o(p, q, s.b), d3 = o(s.a, s.b, p), d4 = o(s.a, s.b, q);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const distToSegment = (p: Point, s: Segment) => {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2));
  return Math.hypot(s.a.x + t * dx - p.x, s.a.y + t * dy - p.y);
};

/**
 * Brute-force sight: `p` is visible from `origin` when the straight line between them crosses no
 * blocking segment. Null where the answer is too close to call: within 1 px of a segment, or with
 * the line passing within 1 px of a segment end or crossing (the edge of a shadow).
 */
function seenByBruteForce(origin: Point, p: Point, segments: readonly Segment[], corners: readonly Point[]): boolean | null {
  if (segments.some((s) => distToSegment(p, s) < 1)) return null;
  if (corners.some((c) => distToSegment(c, { a: origin, b: p }) < 1)) return null;
  return !segments.some((s) => crosses(origin, p, s));
}

describe("crossing and overlapping walls (FR-GM-19)", () => {
  const player = { id: "p1", role: "player", displayName: "P" } as const;
  type WallSpec = [number, number, number, number, ("door" | undefined)?];
  /** The reported doorway: a wall face at x=300 open from y=300 to 370, corridor walls east along y=300 and y=370. */
  const doorway: WallSpec[] = [[300, 0, 300, 300], [300, 370, 300, 1000], [300, 300, 500, 300], [300, 370, 500, 370]];
  const token = { x: 265, y: 335 };
  const room = (specs: WallSpec[], fog: RoomState["fog"] = {}): RoomState =>
    ({
      scene: { map: { url: "/m.png", width: 1000, height: 1000 }, grid: {}, lineOfSight: true },
      walls: Object.fromEntries(specs.map(([ax, ay, bx, by, door], i) => [`w${i}`, { id: `w${i}`, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...(door ? { portal: { kind: "door", state: "closed" } } : {}) }])),
      tokens: { t: { id: "t", position: token, ownerIds: ["p1"], hidden: false } },
      fog,
    }) as unknown as RoomState;
  const sightIn = (r: RoomState) => viewerSight(r, player)!;
  const lit = (r: RoomState, x: number, y: number) => inSight(sightIn(r), { x, y }, 0);
  /** The doorway floor up to the door is lit, and the corridor beyond the door is dark. */
  const expectDoorwayLit = (r: RoomState) => {
    expect(lit(r, 320, 310)).toBe(true);
    expect(lit(r, 320, 360)).toBe(true);
    expect(lit(r, 332, 335)).toBe(true);
    expect(lit(r, 400, 335)).toBe(false);
  };

  it("lights the doorway when the door overshoots the bottom corridor wall by 6 px", () => {
    expectDoorwayLit(room([...doorway, [335, 300, 335, 376, "door"]]));
  });

  it("lights the doorway when the door overshoots both corridor walls by 5 px", () => {
    expectDoorwayLit(room([...doorway, [335, 295, 335, 375, "door"]]));
  });

  it("gives the same sight for a wall drawn twice, reversed or partly overlapping", () => {
    const door: WallSpec = [335, 300, 335, 370, "door"];
    expectDoorwayLit(room([...doorway, door]));
    expectDoorwayLit(room([...doorway, door, [300, 300, 500, 300]]));
    expectDoorwayLit(room([...doorway, door, [500, 300, 300, 300]]));
    expectDoorwayLit(room([...doorway, door, [400, 300, 600, 300]]));
    expect(lit(room([...doorway, door, [400, 300, 600, 300]]), 450, 250)).toBe(false);
  });

  it("leaves no gap at the ends of a door drawn on a longer plain wall", () => {
    const r = room([...doorway, [335, 250, 335, 420], [335, 300, 335, 370, "door"]]);
    expectDoorwayLit(r);
    expect(lit(r, 345, 302)).toBe(false);
    expect(lit(r, 345, 368)).toBe(false);
  });

  it("lights the door's front when two walls 0.01 px apart cross it", () => {
    expectDoorwayLit(room([...doorway, [300, 300.01, 500, 300.01], [335, 300, 335, 370, "door"]]));
  });

  it("leaves no wedge where a fog edge crosses a wall, for a token outside the fog", () => {
    // The fog's west edge runs from behind the top corridor wall (hidden) down into the doorway.
    const fog = { f: { id: "f", shape: "rect", points: [{ x: 335, y: 280 }, { x: 450, y: 280 }, { x: 450, y: 360 }, { x: 335, y: 360 }] } } as unknown as RoomState["fog"];
    // No door: where the fog edge crosses the corridor wall is then no segment's end.
    const r = room(doorway, fog);
    const segments = doorway.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } }));
    const fogEdges = fog.f!.points.map((a, i, pts) => ({ a, b: pts[(i + 1) % pts.length]! }));
    const blockers = [...segments, ...fogEdges];
    const corners = splitSegments(blockers.map((s) => ({ ...s, source: "wall" as const }))).flatMap((s) => [s.a, s.b]);
    const sight = sightIn(r);
    let checked = 0;
    for (let x = 266.37; x < 340; x += 2.13) {
      for (let y = 280.41; y < 380; y += 2.29) {
        const truth = seenByBruteForce(token, { x, y }, blockers, corners);
        if (truth === null) continue;
        checked++;
        expect(inSight(sight, { x, y }, 0), `(${x.toFixed(2)}, ${y.toFixed(2)})`).toBe(truth);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("reveals nothing about walls crossing in a room the token can't see", () => {
    const box: WallSpec[] = [[600, 600, 800, 600], [800, 600, 800, 800], [800, 800, 600, 800], [600, 800, 600, 600]];
    const crossing = room([...box, [620, 620, 780, 780], [620, 780, 780, 620]]);
    const apart = room([...box, [620, 620, 690, 690], [710, 710, 780, 780]]);
    expect(sightIn(crossing)).toEqual(sightIn(apart));
  });

  it("matches brute-force sight in 200 random rooms with crossing, duplicate and collinear walls", () => {
    const rand = seeded(416);
    let checked = 0;
    for (let n = 0; n < 200; n++) {
      const specs: WallSpec[] = [];
      while (specs.length < 40) {
        const x = rand() * 1000, y = rand() * 1000, angle = rand() * Math.PI * 2, len = 50 + rand() * 250;
        const spec: WallSpec = [x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len];
        specs.push(spec);
        const roll = rand();
        if (roll < 0.1) specs.push([...spec]); // an exact duplicate
        else if (roll < 0.2) specs.push([spec[2], spec[3], spec[0], spec[1]]); // reversed
        else if (roll < 0.3) {
          // A wall on the same line, overlapping this one's far half and running past it.
          const f = 0.5 + rand() * 0.4;
          specs.push([spec[0] + (spec[2] - spec[0]) * f, spec[1] + (spec[3] - spec[1]) * f, spec[0] + (spec[2] - spec[0]) * (1 + f), spec[1] + (spec[3] - spec[1]) * (1 + f)]);
        }
      }
      const r = room(specs);
      const segments = specs.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } }));
      let origin = { x: rand() * 1000, y: rand() * 1000 };
      while (segments.some((s) => distToSegment(origin, s) < 2)) origin = { x: rand() * 1000, y: rand() * 1000 };
      (r.tokens.t as { position: Point }).position = origin;
      const corners = [...splitSegments(segments.map((s) => ({ ...s, source: "wall" as const }))).flatMap((s) => [s.a, s.b]), { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 1000 }];
      const sight = viewerSight(r, player)!;
      for (let x = 13.7; x < 1000; x += 47.3) {
        for (let y = 21.9; y < 1000; y += 51.1) {
          const truth = seenByBruteForce(origin, { x, y }, segments, corners);
          if (truth === null) continue;
          checked++;
          if (inSight(sight, { x, y }, 0) !== truth) {
            expect.fail(`room ${n}: (${x.toFixed(1)}, ${y.toFixed(1)}) from (${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}) should be ${truth ? "lit" : "dark"}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20_000);
  });
});
