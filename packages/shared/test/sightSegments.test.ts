import { describe, expect, it } from "vitest";
import { clipSegmentsToMap, prepareSightBlockers, splitSegments, type Point, type Segment, type SourcedSegment } from "../src";

const P = (x: number, y: number): Point => ({ x, y });
const wall = (ax: number, ay: number, bx: number, by: number): SourcedSegment => ({ a: P(ax, ay), b: P(bx, by), source: "wall" });
const fog = (ax: number, ay: number, bx: number, by: number): SourcedSegment => ({ ...wall(ax, ay, bx, by), source: "fog" });
/** A piece as a direction-free string, for comparing sets of pieces. */
const key = (s: Segment) => [`${s.a.x},${s.a.y}`, `${s.b.x},${s.b.y}`].sort().join(" ");
const keys = (pieces: readonly Segment[]) => pieces.map(key).sort();
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

describe("sight segment split (FR-GM-19)", () => {
  it("cuts an X crossing into four pieces that share one point", () => {
    const pieces = splitSegments([wall(0, 0, 100, 100), wall(0, 100, 100, 0)]);
    expect(pieces).toHaveLength(4);
    const centres = pieces.flatMap((p) => [p.a, p.b]).filter((p) => Math.abs(p.x - 50) < 1e-9 && Math.abs(p.y - 50) < 1e-9);
    expect(centres).toHaveLength(4);
    // One shared point: the same coordinates on every piece.
    expect(new Set(centres.map((p) => `${p.x},${p.y}`)).size).toBe(1);
  });

  it("cuts only the crossed segment at a T-junction, at the stem's exact end", () => {
    const pieces = splitSegments([wall(0, 0, 100, 0), wall(40, 0, 40, 50)]);
    expect(keys(pieces)).toEqual(keys([wall(0, 0, 40, 0), wall(40, 0, 100, 0), wall(40, 0, 40, 50)]));
  });

  it("collapses an exact duplicate and a reversed duplicate to one piece", () => {
    expect(splitSegments([wall(0, 0, 100, 0), wall(0, 0, 100, 0)])).toHaveLength(1);
    expect(splitSegments([wall(0, 0, 100, 0), wall(100, 0, 0, 0)])).toHaveLength(1);
  });

  it("turns partly overlapping walls on one line into three pieces with no duplicates", () => {
    const pieces = splitSegments([wall(0, 0, 150, 0), wall(50, 0, 200, 0)]);
    expect(keys(pieces)).toEqual(keys([wall(0, 0, 50, 0), wall(50, 0, 150, 0), wall(150, 0, 200, 0)]));
  });

  it("splits a longer wall under a door so their ends match exactly", () => {
    const pieces = splitSegments([wall(35, -50, 35, 120), wall(35, 0, 35, 70)]);
    expect(keys(pieces)).toEqual(keys([wall(35, -50, 35, 0), wall(35, 0, 35, 70), wall(35, 70, 35, 120)]));
  });

  it("keeps parallel walls 0.01 px apart separate and uncut", () => {
    const pieces = splitSegments([wall(0, 0, 100, 0), wall(0, 0.01, 100, 0.01)]);
    expect(keys(pieces)).toEqual(keys([wall(0, 0, 100, 0), wall(0, 0.01, 100, 0.01)]));
  });

  it("drops a zero-length segment", () => {
    expect(splitSegments([wall(5, 5, 5, 5), wall(0, 0, 10, 0)])).toHaveLength(1);
  });

  it("adds no sliver where a crossing lands exactly on a segment's end", () => {
    const pieces = splitSegments([wall(0, 0, 100, 0), wall(100, -50, 100, 50)]);
    expect(keys(pieces)).toEqual(keys([wall(0, 0, 100, 0), wall(100, -50, 100, 0), wall(100, 0, 100, 50)]));
    for (const p of pieces) expect(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)).toBeGreaterThan(1);
  });

  it("keeps a wall lying on a fog edge as a wall", () => {
    const pieces = splitSegments([fog(0, 0, 100, 0), wall(0, 0, 100, 0)]);
    expect(pieces).toEqual([expect.objectContaining({ source: "wall" })]);
  });

  it("cuts a recessed door that overshoots a corridor wall where it crosses", () => {
    const pieces = splitSegments([wall(300, 370, 500, 370), wall(335, 302, 335, 376)]);
    expect(keys(pieces)).toEqual(keys([wall(300, 370, 335, 370), wall(335, 370, 500, 370), wall(335, 302, 335, 370), wall(335, 370, 335, 376)]));
  });
});

describe("clipping blockers to the map (FR-GM-19)", () => {
  it("cuts a wall running off the map at the map's edge, and drops one wholly off it", () => {
    const got = clipSegmentsToMap([wall(50, 900, 50, 1100), wall(-10, -10, -5, -50), wall(10, 10, 20, 20)], 1000, 1000);
    expect(got).toEqual([{ a: P(50, 900), b: P(50, 1000) }, { a: P(10, 10), b: P(20, 20) }].map((s) => expect.objectContaining(s)));
  });
});

describe("fog's outer edge (FR-GM-19)", () => {
  const outline = (regions: Point[][], walls: Segment[] = []) => keys(prepareSightBlockers(walls, regions).segments);

  it("leaves only the union's outline for two overlapping rectangles", () => {
    const got = outline([rect(0, 0, 100, 100), rect(50, 50, 150, 150)]);
    const want = keys([
      wall(0, 0, 100, 0), wall(100, 0, 100, 50), wall(100, 50, 150, 50), wall(150, 50, 150, 150),
      wall(150, 150, 50, 150), wall(50, 150, 50, 100), wall(50, 100, 0, 100), wall(0, 100, 0, 0),
    ]);
    expect(got).toEqual(want);
  });

  it("drops the shared edge of two rectangles side by side", () => {
    const got = outline([rect(0, 0, 100, 100), rect(100, 0, 200, 100)]);
    expect(got).not.toContain(key(wall(100, 0, 100, 100)));
    expect(got).toHaveLength(6);
  });

  it("keeps a wall lying on an edge that is inside the fog", () => {
    const got = outline([rect(0, 0, 100, 100), rect(100, 0, 200, 100)], [wall(100, 0, 100, 100)]);
    expect(got).toContain(key(wall(100, 0, 100, 100)));
  });

  it("keeps every edge of a lone region, with normals pointing into it", () => {
    const { segments, fogBoundary } = prepareSightBlockers([], [rect(0, 0, 100, 100)]);
    expect(segments).toHaveLength(4);
    expect(fogBoundary).toHaveLength(4);
    for (const piece of fogBoundary) {
      const mid = P((piece.a.x + piece.b.x) / 2 + piece.inward.x, (piece.a.y + piece.b.y) / 2 + piece.inward.y);
      expect(mid.x > 0 && mid.x < 100 && mid.y > 0 && mid.y < 100).toBe(true);
    }
  });
});
