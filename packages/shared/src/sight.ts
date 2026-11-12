import { inFogRegion, pointInPolygon, type Point, type Segment } from "./geometry";
import { blocksMovement } from "./portals";
import type { Participant, RoomState, Wall } from "./state";

/**
 * Line of sight (FR-GM-19, ADR 0044). Pure geometry shared by server and clients, so both agree
 * on what a token sees.
 */

/** Whether a wall stops sight: walls and closed or locked doors do; open doors and windows don't. */
export const blocksSight = (wall: Pick<Wall, "portal" | "uvttPortal">): boolean =>
  wall.portal?.kind !== "window" && blocksMovement(wall);

const ANGLE_EPSILON = 1e-4;
const EDGE_EPSILON = 1e-9;
/** Angular buckets: a ray only tests the walls that overlap its bucket. */
const BUCKETS = 720;
/** Extra rays around a range-limited polygon: one every 4 degrees. */
const ARC_RAYS = 90;

/**
 * The area visible from `origin`, as polygon vertices in angle order, clipped to the map
 * rectangle. Rays go at every wall endpoint and a hair either side, so the polygon turns the
 * corners of each shadow. Walls are bucketed by the angle they cover, so each ray tests only a
 * handful of walls. With `maxDistance`, no ray goes further and the open boundary is an arc of rays
 * 4 degrees apart; endpoints beyond it are skipped (ADR 0044, sight range).
 */
export function sightPolygon(
  segments: readonly Segment[],
  origin: Point,
  bounds: { width: number; height: number },
  maxDistance?: number,
): Point[] {
  const { width, height } = bounds;
  const ox = Math.min(Math.max(origin.x, 0), width);
  const oy = Math.min(Math.max(origin.y, 0), height);
  const all = segments.filter((s) => s.a.x !== s.b.x || s.a.y !== s.b.y);
  const n = all.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  all.forEach((w, i) => {
    ax[i] = w.a.x - ox;
    ay[i] = w.a.y - oy;
    sx[i] = w.b.x - w.a.x;
    sy[i] = w.b.y - w.a.y;
  });

  const bucketOf = (angle: number) => {
    const k = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * BUCKETS);
    return ((k % BUCKETS) + BUCKETS) % BUCKETS;
  };
  // Each wall's bucket range as [first, count]; a wall through (or starting at) the origin covers every direction.
  const first = new Int32Array(n);
  const span = new Int32Array(n);
  const starts = new Int32Array(BUCKETS + 1);
  for (let i = 0; i < n; i++) {
    const a1 = Math.atan2(ay[i]!, ax[i]!);
    const a2 = Math.atan2(ay[i]! + sy[i]!, ax[i]! + sx[i]!);
    let d = a2 - a1;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    const whole = Math.abs(d) >= Math.PI - 1e-6 || (ax[i] === 0 && ay[i] === 0) || (ax[i]! + sx[i]! === 0 && ay[i]! + sy[i]! === 0);
    first[i] = whole ? 0 : bucketOf((d >= 0 ? a1 : a2) - 2 * ANGLE_EPSILON);
    span[i] = whole ? BUCKETS : Math.min(BUCKETS, Math.ceil((Math.abs(d) + 4 * ANGLE_EPSILON) / ((2 * Math.PI) / BUCKETS)) + 1);
    for (let k = 0; k < span[i]!; k++) starts[((first[i]! + k) % BUCKETS) + 1]!++;
  }
  for (let b = 0; b < BUCKETS; b++) starts[b + 1]! += starts[b]!;
  const fill = starts.slice(0, BUCKETS);
  const members = new Int32Array(starts[BUCKETS]!);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < span[i]!; k++) members[fill[(first[i]! + k) % BUCKETS]!++] = i;
  }

  /** Nearest wall hit along the ray, or Infinity. */
  const wallHit = (angle: number) => {
    const bucket = bucketOf(angle);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    for (let k = starts[bucket]!; k < starts[bucket + 1]!; k++) {
      const i = members[k]!;
      const denom = dx * sy[i]! - dy * sx[i]!;
      if (denom === 0) continue; // parallel: the ray grazes this wall, neighbours bound it
      const t = (ax[i]! * sy[i]! - ay[i]! * sx[i]!) / denom;
      const u = (ax[i]! * dy - ay[i]! * dx) / denom;
      // t ~ 0 is the origin sitting on the wall itself: that wall doesn't hide anything from there.
      if (t > EDGE_EPSILON && t < best && u >= -EDGE_EPSILON && u <= 1 + EDGE_EPSILON) best = t;
    }
    return best;
  };

  // Rays go only at endpoints and map corners the origin can see: a ray at a hidden one would leave
  // a vertex whose bearing points at it (ADR 0044). The base ray's hit is kept for the main pass.
  const raw = new Float64Array(n * 6 + 12 + ARC_RAYS);
  let r = 0;
  const baseHit = new Map<number, number>();
  const cast = (x: number, y: number) => {
    if (maxDistance !== undefined && Math.hypot(x, y) > maxDistance) return;
    const base = Math.atan2(y, x);
    const hit = wallHit(base);
    if (hit < Math.hypot(x, y) * (1 - 1e-9) - 1e-6) return; // strictly nearer wall: hidden
    baseHit.set(base, hit);
    raw[r++] = base - ANGLE_EPSILON;
    raw[r++] = base;
    raw[r++] = base + ANGLE_EPSILON;
  };
  for (let i = 0; i < n; i++) {
    cast(ax[i]!, ay[i]!);
    cast(ax[i]! + sx[i]!, ay[i]! + sy[i]!);
  }
  for (const [cx, cy] of [[0, 0], [width, 0], [width, height], [0, height]] as const) cast(cx - ox, cy - oy);
  if (maxDistance !== undefined) for (let k = 0; k < ARC_RAYS; k++) raw[r++] = -Math.PI + (k * 2 * Math.PI) / ARC_RAYS;
  const angles = raw.subarray(0, r).sort();

  const out: Point[] = [];
  const hitAngles: number[] = [];
  for (let j = 0; j < angles.length; j++) {
    const angle = angles[j]!;
    if (j > 0 && angle === angles[j - 1]) continue;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // The map edge is the farthest a ray can go; zero means the ray points off the map.
    let best = Math.min(dx > 0 ? (width - ox) / dx : dx < 0 ? -ox / dx : Infinity, dy > 0 ? (height - oy) / dy : dy < 0 ? -oy / dy : Infinity);
    if (best <= EDGE_EPSILON) continue;
    best = Math.min(best, baseHit.get(angle) ?? wallHit(angle), maxDistance ?? Infinity);
    out.push({ x: ox + dx * best, y: oy + dy * best });
    hitAngles.push(angle);
  }
  // On the map border the outward rays hit nothing, so close the polygon through the origin.
  if (ox === 0 || ox === width || oy === 0 || oy === height) {
    const m = hitAngles.length;
    for (let i = 0; i < m; i++) {
      const next = i + 1 < m ? hitAngles[i + 1]! : hitAngles[0]! + 2 * Math.PI;
      if (next - hitAngles[i]! > Math.PI) {
        out.splice(i + 1, 0, { x: ox, y: oy });
        break;
      }
    }
  }
  return dropCollinear(out);
}

/**
 * Drops duplicate and collinear vertices (cyclic, repeated to a fixpoint). Rays cast at hidden wall
 * endpoints leave vertices on visible walls whose directions would reveal those endpoints (ADR 0044).
 */
function dropCollinear(points: Point[]): Point[] {
  let p = points;
  for (;;) {
    const m = p.length;
    if (m < 3) return p;
    const kept = p.filter((b, i) => {
      const a = p[(i + m - 1) % m]!;
      const c = p[(i + 1) % m]!;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = c.x - b.x;
      const bcy = c.y - b.y;
      const cross = abx * bcy - aby * bcx;
      // |cross| > 1e-9·|ab|·|bc|, squared to skip two square roots per vertex.
      return cross * cross > 1e-18 * (abx * abx + aby * aby) * (bcx * bcx + bcy * bcy);
    });
    if (kept.length === m) return p;
    p = kept;
  }
}

/** Whether `p` is inside any sight polygon or within `tolerance` board pixels of an edge. */
export function inSight(polygons: readonly (readonly Point[])[], p: Point, tolerance = 1): boolean {
  return polygons.some((poly) => {
    if (pointInPolygon(p, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= tolerance) return true;
    }
    return false;
  });
}

/**
 * What `viewer` can see with line of sight on (ADR 0044): one polygon per visible token they own.
 * Null means no limit: the GM, or line of sight off. Empty means the viewer sees nothing, as with
 * no map or no (unhidden) token of their own.
 */
/** Whether the viewer owns a token the GM hasn't hidden: a sight origin, and their way onto the board (ADR 0054). */
export function ownsVisibleToken(state: Pick<RoomState, "tokens">, viewer: Participant): boolean {
  return Object.values(state.tokens).some((t) => !t.hidden && t.ownerIds.includes(viewer.id));
}

export function viewerSight(state: Pick<RoomState, "scene" | "walls" | "tokens" | "fog" | "hideMapWithoutToken">, viewer: Participant): Point[][] | null {
  if (viewer.role === "gm") return null;
  // "Hide map from players without a token": no sight at all, with or without line of sight (ADR 0054).
  if (state.hideMapWithoutToken && !ownsVisibleToken(state, viewer)) return [];
  if (state.scene.lineOfSight !== true) return null;
  const map = state.scene.map;
  if (!map) return [];
  const walls = Object.values(state.walls).filter(blocksSight);
  // Fog edges block sight like walls (ADR 0044): otherwise the polygon would outline the plain walls under fog.
  const fogEdges = Object.values(state.fog).map((f) => ({ points: f.points, edges: f.points.map((a, i) => ({ a, b: f.points[(i + 1) % f.points.length]! })) }));
  const { grid, sightRange } = state.scene;
  const maxDistance = sightRange === undefined ? undefined : (sightRange / grid.unitsPerCell) * grid.cellSize;
  return Object.values(state.tokens)
    .filter((t) => !t.hidden && t.ownerIds.includes(viewer.id))
    // A token standing inside a fog region is not blinded by it, so that region's edges are skipped for it.
    .map((t) => sightPolygon([...walls, ...fogEdges.filter((f) => !inFogRegion(f.points, t.position)).flatMap((f) => f.edges)], t.position, map, maxDistance));
}
