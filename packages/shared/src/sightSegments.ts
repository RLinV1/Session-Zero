import { pointInPolygon, type Point, type Segment } from "./geometry";

/**
 * Preparing sight's blocking lines (FR-GM-19, ADR 0044). `sightPolygon` aims rays only at segment
 * ends, so it needs segments that meet only at their ends; walls as drawn can cross, touch
 * mid-length or lie on top of each other. This splits them, then keeps only the outer edge of the
 * fogged area. Pure and deterministic: board pixels in, board pixels out.
 */

/** Where a blocking line came from: a wall (or closed door), or a fog region's edge. */
export type SegmentSource = "wall" | "fog";

export interface SourcedSegment extends Segment {
  source: SegmentSource;
}

/** Distance tolerance, in board pixels. */
const EPS = 1e-6;
/** Two segments are parallel when the sine of the angle between them is below this. */
const PARALLEL_SINE = 1e-9;

interface Cut {
  t: number;
  p: Point;
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Splits `segments` wherever they cross, touch or overlap, so the pieces meet only at their ends
 * (design Decision 3 of fix-sight-crossing-walls). A crossing point is computed once and shared by
 * both pieces, and a cut made by another segment's end uses that end's exact coordinates, so
 * pieces meet with no hairline gap. Zero-length input and slivers shorter than 1e-6 px are dropped.
 * Pieces lying exactly on each other (either direction) are kept once, as a wall if any was a wall.
 */
export function splitSegments(segments: readonly SourcedSegment[]): SourcedSegment[] {
  const segs = segments.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > EPS);
  const n = segs.length;
  const cuts: Cut[][] = segs.map((s) => [{ t: 0, p: s.a }, { t: 1, p: s.b }]);
  const minX = segs.map((s) => Math.min(s.a.x, s.b.x));
  const maxX = segs.map((s) => Math.max(s.a.x, s.b.x));
  const minY = segs.map((s) => Math.min(s.a.y, s.b.y));
  const maxY = segs.map((s) => Math.max(s.a.y, s.b.y));
  // Sweep by left edge: a pair is tested only when their boxes (grown by EPS) overlap.
  const order = [...segs.keys()].sort((i, j) => minX[i]! - minX[j]! || i - j);
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi]!;
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj]!;
      if (minX[j]! > maxX[i]! + EPS) break;
      if (minY[j]! > maxY[i]! + EPS || minY[i]! > maxY[j]! + EPS) continue;
      cutPair(segs, cuts, i, j);
    }
  }

  const out = new Map<string, SourcedSegment>();
  segs.forEach((s, i) => {
    const sorted = cuts[i]!.sort((u, v) => u.t - v.t);
    // Merge cuts within EPS of each other, keeping the ends and the first of each cluster.
    const kept: Point[] = [sorted[0]!.p];
    for (let k = 1; k < sorted.length - 1; k++) {
      const p = sorted[k]!.p;
      const last = kept.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) > EPS) kept.push(p);
    }
    const end = sorted.at(-1)!.p;
    const last = kept.at(-1)!;
    if (kept.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) <= EPS) kept.pop();
    kept.push(end);
    for (let k = 0; k + 1 < kept.length; k++) {
      const a = kept[k]!;
      const b = kept[k + 1]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue;
      const ka = `${a.x},${a.y}`;
      const kb = `${b.x},${b.y}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const seen = out.get(key);
      if (!seen) out.set(key, { a, b, source: s.source });
      else if (s.source === "wall" && seen.source !== "wall") seen.source = "wall";
    }
  });
  return [...out.values()];
}

/** Records the cuts segments `i` and `j` make on each other. */
function cutPair(segs: readonly SourcedSegment[], cuts: Cut[][], i: number, j: number) {
  const si = segs[i]!;
  const sj = segs[j]!;
  const rx = si.b.x - si.a.x;
  const ry = si.b.y - si.a.y;
  const sx = sj.b.x - sj.a.x;
  const sy = sj.b.y - sj.a.y;
  const li = Math.hypot(rx, ry);
  const lj = Math.hypot(sx, sy);
  const ti = EPS / li;
  const tj = EPS / lj;
  const denom = cross(rx, ry, sx, sy);
  const qx = sj.a.x - si.a.x;
  const qy = sj.a.y - si.a.y;

  if (Math.abs(denom) > PARALLEL_SINE * li * lj) {
    const t = cross(qx, qy, sx, sy) / denom;
    const u = cross(qx, qy, rx, ry) / denom;
    if (t < -ti || t > 1 + ti || u < -tj || u > 1 + tj) return;
    const tEnd = t <= ti || t >= 1 - ti;
    const uEnd = u <= tj || u >= 1 - tj;
    if (tEnd && uEnd) return; // they meet at ends already
    // One point for both pieces: an existing end where there is one, else the crossing itself.
    const p = uEnd ? (u <= tj ? sj.a : sj.b) : tEnd ? (t <= ti ? si.a : si.b) : { x: si.a.x + t * rx, y: si.a.y + t * ry };
    if (!tEnd) cuts[i]!.push({ t, p });
    if (!uEnd) cuts[j]!.push({ t: u, p });
    return;
  }

  // Parallel: only lines on the same line can overlap. Each is cut at the other's ends inside it.
  if (Math.abs(cross(qx, qy, rx, ry)) / li > EPS) return;
  if (Math.abs(cross(sj.b.x - si.a.x, sj.b.y - si.a.y, rx, ry)) / li > EPS) return;
  const inside = (seg: SourcedSegment, len2: number, tol: number, e: Point) => {
    const t = ((e.x - seg.a.x) * (seg.b.x - seg.a.x) + (e.y - seg.a.y) * (seg.b.y - seg.a.y)) / len2;
    return t > tol && t < 1 - tol ? t : null;
  };
  for (const e of [sj.a, sj.b]) {
    const t = inside(si, li * li, ti, e);
    if (t !== null) cuts[i]!.push({ t, p: e });
  }
  for (const e of [si.a, si.b]) {
    const t = inside(sj, lj * lj, tj, e);
    if (t !== null) cuts[j]!.push({ t, p: e });
  }
}

/** A fog piece on the fog's outer edge, with the unit normal pointing into the fog. */
export interface FogBoundaryPiece extends Segment {
  inward: Point;
}

/** The lines sight stops at, and which of them bound the fogged area. */
export interface SightBlockers {
  /** Every line that blocks sight: wall pieces, and fog pieces on the fogged area's outer edge. */
  segments: readonly SourcedSegment[];
  /** The fog pieces (not walls) with fog on exactly one side: the edges a token may step in across. */
  fogBoundary: readonly FogBoundaryPiece[];
}

/**
 * How far either side of a piece's midpoint the fog test looks. Small, so a gap between two fog
 * regions, or a region itself, must be under 1e-3 px wide to be misjudged (visibility audit).
 */
const SIDE_STEP = 1e-3;

/**
 * Splits walls and fog edges together, then drops fog pieces with fog on both sides: where fog
 * regions overlap or share an edge (design Decision 2). What remains blocks every token alike: a
 * token outside fog is stopped at the fog's outer edge, and a token in fog sees only the fog.
 */
export function prepareSightBlockers(walls: readonly Segment[], fogRegions: readonly (readonly Point[])[]): SightBlockers {
  const input: SourcedSegment[] = walls.map((w) => ({ a: w.a, b: w.b, source: "wall" }));
  for (const points of fogRegions) {
    for (let k = 0; k < points.length; k++) input.push({ a: points[k]!, b: points[(k + 1) % points.length]!, source: "fog" });
  }
  const boxes = fogRegions.map((points) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  });
  const inFog = (p: Point) =>
    fogRegions.some((points, k) => {
      const b = boxes[k]!;
      return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && pointInPolygon(p, points);
    });

  const segments: SourcedSegment[] = [];
  const fogBoundary: FogBoundaryPiece[] = [];
  for (const piece of splitSegments(input)) {
    if (fogRegions.length === 0) {
      segments.push(piece);
      continue;
    }
    const dx = piece.b.x - piece.a.x;
    const dy = piece.b.y - piece.a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (piece.a.x + piece.b.x) / 2;
    const my = (piece.a.y + piece.b.y) / 2;
    const left = inFog({ x: mx + nx * SIDE_STEP, y: my + ny * SIDE_STEP });
    const right = inFog({ x: mx - nx * SIDE_STEP, y: my - ny * SIDE_STEP });
    // Inside the fogged area. A piece with fog on neither side (a degenerate sliver) is kept:
    // a fog edge that wrongly blocks only hides more.
    if (piece.source === "fog" && left && right) continue;
    segments.push(piece);
    if (piece.source === "fog" && left !== right) fogBoundary.push({ a: piece.a, b: piece.b, inward: left ? { x: nx, y: ny } : { x: -nx, y: -ny } });
  }
  return { segments, fogBoundary };
}

/** Whether segments p-q and s touch or cross, ends included. */
function touches(p: Point, q: Point, s: Segment): boolean {
  const o = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = o(p, q, s.a), d2 = o(p, q, s.b), d3 = o(s.a, s.b, p), d4 = o(s.a, s.b, q);
  if (d1 === 0 && d2 === 0) {
    // On one line: they touch if their extents overlap.
    return Math.max(Math.min(p.x, q.x), Math.min(s.a.x, s.b.x)) <= Math.min(Math.max(p.x, q.x), Math.max(s.a.x, s.b.x)) &&
      Math.max(Math.min(p.y, q.y), Math.min(s.a.y, s.b.y)) <= Math.min(Math.max(p.y, q.y), Math.max(s.a.y, s.b.y));
  }
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

/**
 * The parts of `segments` on the map (Liang-Barsky). The map's edge bounds every ray, so a wall
 * running off the map crosses that edge part-way along: clipping makes the crossing an end, a
 * corner sight can aim at, instead of a chord cutting across the lit floor (design Decision 8).
 */
export function clipSegmentsToMap(segments: readonly Segment[], width: number, height: number): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (const [p, q] of [[-dx, s.a.x], [dx, width - s.a.x], [-dy, s.a.y], [dy, height - s.a.y]] as const) {
      if (p === 0) {
        if (q < 0) inside = false;
        continue;
      }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
    if (!inside || t0 >= t1) continue;
    if (t0 === 0 && t1 === 1) {
      out.push(s);
      continue;
    }
    const a = t0 === 0 ? s.a : { x: s.a.x + t0 * dx, y: s.a.y + t0 * dy };
    const b = t1 === 1 ? s.b : { x: s.a.x + t1 * dx, y: s.a.y + t1 * dy };
    if (Math.hypot(b.x - a.x, b.y - a.y) > EPS) out.push({ a, b });
  }
  return out;
}

/** How far inside the fog a token on its edge casts from (design Decision 7). */
const EDGE_STEP = 1;

/**
 * Where a token casts its sight from. A token in fog (`inFog`) whose centre is within 1 px of the
 * fog's outer edge would otherwise cast from on or just outside that edge, and see out of the fog;
 * it casts from 1 px inside instead, along the edge's normal (the normals' sum at a corner).
 * Everyone else casts from their centre.
 */
export function sightOrigin(centre: Point, inFog: boolean, blockers: SightBlockers, fogRegions: readonly (readonly Point[])[]): Point {
  if (!inFog) return centre;
  const step = stepInto(centre, blockers.fogBoundary);
  if (!step) return centre;
  // Never step through a wall, and land strictly inside the fog: halve the step for thin fog.
  for (let d = EDGE_STEP; d >= 1e-3; d /= 2) {
    const o = { x: step.q.x + step.dir.x * d, y: step.q.y + step.dir.y * d };
    if (!fogRegions.some((points) => pointInPolygon(o, points))) continue;
    if (blockers.segments.some((s) => s.source === "wall" && touches(centre, o, s))) return centre;
    return o;
  }
  return centre;
}

/** The nearest fog edge within 1 px of `centre`, and the direction into the fog (the normals' sum at a corner). */
function stepInto(centre: Point, fogBoundary: readonly FogBoundaryPiece[]): { q: Point; dir: Point } | null {
  let best = Infinity;
  const near: { q: Point; d: number; inward: Point }[] = [];
  for (const piece of fogBoundary) {
    const dx = piece.b.x - piece.a.x;
    const dy = piece.b.y - piece.a.y;
    const len2 = dx * dx + dy * dy;
    const t = Math.min(1, Math.max(0, ((centre.x - piece.a.x) * dx + (centre.y - piece.a.y) * dy) / len2));
    const q = { x: piece.a.x + t * dx, y: piece.a.y + t * dy };
    const d = Math.hypot(centre.x - q.x, centre.y - q.y);
    if (d > EDGE_STEP) continue;
    near.push({ q, d, inward: piece.inward });
    best = Math.min(best, d);
  }
  if (near.length === 0) return null;
  const closest = near.filter((c) => c.d <= best + EPS);
  let nx = 0, ny = 0;
  for (const c of closest) {
    nx += c.inward.x;
    ny += c.inward.y;
  }
  const len = Math.hypot(nx, ny);
  if (len < EPS) return null;
  return { q: closest[0]!.q, dir: { x: nx / len, y: ny / len } };
}
