import { FOG_FEATHER_CELLS } from "./fogTexture";

/**
 * Where the fog's puffs and wisps sit (flowing-fog) and how each moves. Pure: the board turns
 * these into particles (`boardView.ts`) over the painted art (`fogArt.ts`). Everything comes from
 * the fog regions alone, which players already have, so the particles reveal nothing.
 */

type Pt = { x: number; y: number };

/** Painted puffs and wisps (`public/img/fog`). */
export const PUFF_ART = 8;
export const WISP_ART = 4;
/** How far a puff's mist reaches from its centre, as a share of its size (its picture's side). */
export const PUFF_REACH = 0.45;
/** Where a wisp's thick end sits along its picture, as a share of its width: the point on its seat. */
export const WISP_ANCHOR = 0.1;

/** Cells between puffs over a region's body, between puffs along its edges, and between wisps. */
const BODY_SPACING = 2;
const EDGE_SPACING = 0.9;
const WISP_SPACING = 1.8;
/** Largest scale a puff or wisp grows to over its cycle, and a wisp's sway either way, in radians. */
const PUFF_GROWTH = 0.12;
const WISP_STRETCH = 0.25;
const WISP_SWAY = 0.1;
/** The fog's shared wind: body puffs drift along it. */
const WIND = { x: 0.94, y: 0.33 };
/** Kept this far inside the border's fade, so no puff or wisp ever reaches its end. */
const REACH_LIMIT = 0.97 * FOG_FEATHER_CELLS;

export interface FogPuff {
  kind: "puff" | "wisp";
  /** Which picture: 0 to `PUFF_ART - 1` or `WISP_ART - 1`. */
  art: number;
  /** Its seat, board pixels: a puff's centre, a wisp's thick end. */
  x: number;
  y: number;
  /** Board pixels: a puff's side, a wisp's length. */
  size: number;
  /** Radians; a wisp points its thin end this way. */
  angle: number;
  /** Radians per second. */
  spin: number;
  /** 0 the fog's bank colour, 1 its mist colour. */
  shade: number;
  /** Opacity at the height of its cycle. */
  peak: number;
  /** Seconds to fade in and out once, and how far through that cycle it starts. */
  period: number;
  phase: number;
  /** Board pixels drifted over one cycle, along (dirX, dirY). */
  drift: number;
  dirX: number;
  dirY: number;
  /** How far from its seat it may settle each cycle, board pixels. */
  wander: number;
  seed: number;
}

export interface PuffPose {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  alpha: number;
}

/**
 * Puffs on a jittered grid over each region's body, smaller puffs along every edge, and wisps
 * along the edges pointing out. Edges on the board's own border get none. Over `budget`, the
 * layout spreads out and its puffs grow, so the fog stays covered with fewer of them.
 */
export function layoutFogPuffs(
  regions: ReadonlyArray<ReadonlyArray<Pt>>,
  board: { width: number; height: number },
  cell: number,
  budget: number,
): FogPuff[] {
  const shapes = regions.filter((points) => points.length >= 3);
  if (shapes.length === 0 || budget <= 0) return [];
  cell = Math.max(1, cell);
  const random = generator(hashRegions(shapes));
  const edges = shapes.flatMap((points) => outerEdges(points, board, cell));
  const area = shapes.reduce((sum, points) => sum + Math.abs(signedArea(points)), 0);
  const rim = edges.reduce((sum, e) => sum + e.length, 0);
  const estimate = (thin: number) =>
    area / (BODY_SPACING * cell * thin) ** 2 + rim / (EDGE_SPACING * cell * thin) + rim / (WISP_SPACING * cell * thin);
  let thin = 1;
  while (estimate(thin) > budget) thin *= 1.05;
  const grow = Math.min(1.6, Math.sqrt(thin));

  const puffs: FogPuff[] = [];
  const add = (p: Omit<FogPuff, "seed" | "phase">) => puffs.push({ ...p, phase: random(), seed: Math.floor(random() * 0x7fffffff) });
  // Nothing clips the particles to the board, so each puff is sized to stay on it.
  const onBoard = (x: number, y: number, slack: number) =>
    (Math.min(x, y, board.width - x, board.height - y) - slack) / (PUFF_REACH * (1 + PUFF_GROWTH / 2));

  // The body: a jittered grid, each puff only as big as its depth inside the region allows.
  const step = BODY_SPACING * cell * thin;
  for (const points of shapes) {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let gy = y0 + step / 2; gy < y1; gy += step) {
      for (let gx = x0 + step / 2; gx < x1; gx += step) {
        const x = gx + (random() - 0.5) * 0.8 * step;
        const y = gy + (random() - 0.5) * 0.8 * step;
        const art = Math.floor(random() * PUFF_ART);
        const wanted = (2.2 + 1.4 * random()) * cell * grow;
        if (!insidePolygon(points, x, y)) continue;
        const depth = edgeDistance(points, x, y);
        const wander = Math.min(0.3 * step, 0.6 * cell);
        const drift = 0.8 * cell;
        const size = Math.min(
          wanted,
          (REACH_LIMIT * cell + depth - wander - drift / 2) / (PUFF_REACH * (1 + PUFF_GROWTH / 2)),
          onBoard(x, y, wander + drift / 2),
        );
        if (size < 1.2 * cell) continue;
        add({
          kind: "puff", art, x, y, size, angle: random() * Math.PI * 2, spin: (random() - 0.5) * 0.06,
          shade: 0.45 + 0.55 * random(), peak: 0.35 + 0.25 * random(), period: 10 + 8 * random(),
          drift, dirX: WIND.x, dirY: WIND.y, wander,
        });
      }
    }
  }

  // The border: puffs straddling each edge, and wisps reaching out from it.
  for (const e of edges) {
    const puffCount = Math.max(1, Math.round(e.length / (EDGE_SPACING * cell * thin)));
    for (let k = 0; k < puffCount; k++) {
      const t = (k + 0.5 + (random() - 0.5) * 0.6) / puffCount;
      const out = (-0.3 + 0.8 * random()) * cell;
      const sign = random() < 0.5 ? -1 : 1;
      const wander = 0.15 * cell;
      const drift = 0.4 * cell;
      const wanted = (1.3 + 0.8 * random()) * cell * grow;
      const x = e.a.x + (e.b.x - e.a.x) * t + e.nx * out, y = e.a.y + (e.b.y - e.a.y) * t + e.ny * out;
      const size = Math.min(
        wanted,
        (REACH_LIMIT * cell - Math.max(0, out) - wander - drift / 2) / (PUFF_REACH * (1 + PUFF_GROWTH / 2)),
        onBoard(x, y, wander + drift / 2),
      );
      const art = Math.floor(random() * PUFF_ART), angle = random() * Math.PI * 2, spin = (random() - 0.5) * 0.08;
      const shade = 0.55 + 0.45 * random(), peak = 0.5 + 0.25 * random(), period = 8 + 6 * random();
      if (size < 0.5 * cell) continue;
      add({ kind: "puff", art, x, y, size, angle, spin, shade, peak, period, drift, dirX: e.tx * sign, dirY: e.ty * sign, wander });
    }
    const wispCount = Math.max(1, Math.round(e.length / (WISP_SPACING * cell * thin)));
    for (let k = 0; k < wispCount; k++) {
      const t = (k + 0.5 + (random() - 0.5) * 0.5) / wispCount;
      const x = e.a.x + (e.b.x - e.a.x) * t - e.nx * 0.15 * cell;
      const y = e.a.y + (e.b.y - e.a.y) * t - e.ny * 0.15 * cell;
      const angle = Math.atan2(e.ny, e.nx) + (random() - 0.5) * 0.6;
      const size = Math.min((1.4 + 0.6 * random()) * cell, (REACH_LIMIT * cell) / ((1 + WISP_STRETCH / 5) * (1 - WISP_ANCHOR)));
      const art = Math.floor(random() * WISP_ART);
      const shade = 0.6 + 0.4 * random(), peak = 0.55 + 0.25 * random(), period = 7 + 5 * random();
      // Its thin end must stay on the board whichever way it sways.
      const reach = size * (1 + WISP_STRETCH / 5) * (1 - WISP_ANCHOR);
      const onBoard = [-WISP_SWAY, WISP_SWAY].every((sway) => {
        const tx = x + Math.cos(angle + sway) * reach, ty = y + Math.sin(angle + sway) * reach;
        return tx >= 0 && ty >= 0 && tx <= board.width && ty <= board.height;
      });
      if (!onBoard) continue;
      add({ kind: "wisp", art, x, y, size, angle, spin: 0, shade, peak, period, drift: 0, dirX: e.tx, dirY: e.ty, wander: 0 });
    }
  }

  if (puffs.length <= budget) return puffs;
  // Still over: keep an even spread.
  return puffs.filter((_, i) => Math.floor((i * budget) / puffs.length) !== Math.floor(((i - 1) * budget) / puffs.length));
}

/**
 * A puff or wisp `seconds` into the fog's life. It fades in and out once per cycle; while it is
 * invisible, at the turn of a cycle, it settles on a new spot near its seat. Over the cycle a puff
 * drifts, turns and grows a little, as mist spreads; a wisp sways and stretches outward.
 */
export function puffPose(p: FogPuff, seconds: number): PuffPose {
  const cycle = seconds / p.period + p.phase;
  const turn = Math.floor(cycle);
  const f = cycle - turn;
  const life = Math.sin(Math.PI * f) ** 2;
  const heading = hash01(p.seed, turn) * Math.PI * 2;
  const away = Math.sqrt(hash01(p.seed ^ 0x5bd1e995, turn)) * p.wander;
  const along = (f - 0.5) * p.drift;
  const x = p.x + Math.cos(heading) * away + p.dirX * along;
  const y = p.y + Math.sin(heading) * away + p.dirY * along;
  if (p.kind === "wisp") {
    const rotation = p.angle + WISP_SWAY * Math.sin(seconds * 0.5 + p.phase * Math.PI * 2);
    return { x, y, rotation, scale: 1 - WISP_STRETCH * 0.8 + WISP_STRETCH * f, alpha: p.peak * life };
  }
  return { x, y, rotation: p.angle + p.spin * seconds, scale: 1 - PUFF_GROWTH / 2 + PUFF_GROWTH * f, alpha: p.peak * life };
}

interface Edge {
  a: Pt;
  b: Pt;
  length: number;
  /** Unit tangent from a to b, and the unit normal pointing out of the region. */
  tx: number;
  ty: number;
  nx: number;
  ny: number;
}

/** The region's edges that face the board, each with its outward normal. */
function outerEdges(points: ReadonlyArray<Pt>, board: { width: number; height: number }, cell: number): Edge[] {
  const edges: Edge[] = [];
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!, b = points[(k + 1) % points.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) continue;
    const tx = (b.x - a.x) / length, ty = (b.y - a.y) / length;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let nx = ty, ny = -tx;
    if (insidePolygon(points, mid.x + nx * 0.25 * cell, mid.y + ny * 0.25 * cell)) { nx = -nx; ny = -ny; }
    // An edge along the board's own border has nothing outside it to fade into.
    const ox = mid.x + nx * 0.5 * cell, oy = mid.y + ny * 0.5 * cell;
    if (ox < 0 || oy < 0 || ox > board.width || oy > board.height) continue;
    edges.push({ a, b, length, tx, ty, nx, ny });
  }
  return edges;
}

function insidePolygon(points: ReadonlyArray<Pt>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the nearest edge of a polygon. */
function edgeDistance(points: ReadonlyArray<Pt>, x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!, b = points[(k + 1) % points.length]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  return best;
}

function signedArea(points: ReadonlyArray<Pt>): number {
  let sum = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!, b = points[(k + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** The same fog always gets the same particles: a seed from its corners. */
function hashRegions(regions: ReadonlyArray<ReadonlyArray<Pt>>): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => { h = Math.imul(h ^ n, 0x01000193); };
  for (const points of regions) {
    mix(points.length);
    for (const p of points) { mix(Math.round(p.x * 4)); mix(Math.round(p.y * 4)); }
  }
  return h >>> 0;
}

/** Small deterministic generator in [0, 1), like `fogTexture.ts`'s lattice. */
function generator(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A number in [0, 1) for a puff and one of its cycles. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
