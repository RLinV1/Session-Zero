import { MAX_STROKE_POINTS, type Point } from "@vtt/shared";

/**
 * A freehand stroke made ready to share (shared-drawings, ADR 0064): Ramer–Douglas–Peucker drops
 * the points that sit within `tolerance` board pixels of the line through their neighbours, then
 * each kept point is rounded to a whole map pixel. A stroke still over `MAX_STROKE_POINTS` is
 * simplified again with twice the tolerance until it fits. Returns the flat `[x0, y0, x1, y1, ...]`
 * list `drawing.add` takes, at least two points long. Pure.
 */
export function simplifyStroke(points: readonly Point[], tolerance: number): number[] {
  if (points.length === 0) return [];
  let tol = Math.max(0.5, tolerance);
  for (;;) {
    const kept = rdp(points, tol);
    const flat = dedupe(kept.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
    // A dot still needs two points to be a stroke.
    if (flat.length === 1) flat.push({ ...flat[0]! });
    if (flat.length <= MAX_STROKE_POINTS) return flat.flatMap((p) => [p.x, p.y]);
    tol *= 2;
  }
}

/** Consecutive equal points, as rounding makes them, add nothing. */
function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
}

/** Ramer–Douglas–Peucker, iterative so a long stroke can't overflow the stack. */
function rdp(points: readonly Point[], tolerance: number): Point[] {
  const n = points.length;
  if (n <= 2) return [...points];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([first, worst], [worst, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
