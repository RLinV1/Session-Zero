/**
 * Polyhedral dice for the 3D roll animation (FR-TAC-09).
 *
 * Presentation only: the server has already rolled by the time any of this runs, and the
 * animation just lands each die on the face the server chose. Nothing here feeds back
 * into room state.
 *
 * Coordinates are CSS's: x right, y down, z toward the viewer. Each face gets an
 * orthonormal frame (u, v, n) with u × v = n and n pointing outward, so a flat element
 * laid onto the face with `matrix3d` reads the right way round and `backface-visibility`
 * culls it when it turns away.
 */

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export type BodyName = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

export interface Face {
  /** Outward unit normal. */
  n: Vec3;
  /** In-plane axes. v points "down" for the face's numeral. */
  u: Vec3;
  v: Vec3;
  /** Centroid. */
  c: Vec3;
  /** Corners in the face's own (u, v) coordinates, in winding order. */
  polygon: [number, number][];
  /** The body's vertex index for each corner of `polygon`. */
  corners: number[];
  /** Distance from the centroid to the nearest edge: how much room the numeral has. */
  inradius: number;
}

export interface Body {
  name: BodyName;
  vertices: Vec3[];
  faces: Face[];
  /** faces[i] and faces[opposite[i]] are parallel and face away from each other; -1 if none. */
  opposite: number[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

function signs(n: number): number[][] {
  return Array.from({ length: 2 ** n }, (_, i) => Array.from({ length: n }, (_, b) => ((i >> b) & 1 ? -1 : 1)));
}

/** Pentagonal trapezohedron: two staggered rings and two apexes, with every kite planar. */
function trapezohedron(): Vec3[] {
  const ring = 0.12;
  // Planarity fixes the apex height: the apex, the midpoint of two upper-ring corners and
  // the lower-ring corner between them must be collinear in the kite's plane of symmetry.
  const c36 = Math.cos(Math.PI / 5);
  const apex = (ring * (1 + c36)) / (1 - c36);
  const stretch = 0.95;
  const vs: Vec3[] = [
    [0, -apex * stretch, 0],
    [0, apex * stretch, 0],
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    const b = a + Math.PI / 5;
    vs.push([Math.cos(a), -ring * stretch, Math.sin(a)]);
    vs.push([Math.cos(b), ring * stretch, Math.sin(b)]);
  }
  return vs;
}

function vertices(name: BodyName): Vec3[] {
  switch (name) {
    case "d4":
      return [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ];
    case "d6":
      return signs(3).map(([x, y, z]) => [x!, y!, z!]);
    case "d8":
      return [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
    case "d10":
      return trapezohedron();
    case "d12": {
      const vs: Vec3[] = signs(3).map(([x, y, z]) => [x!, y!, z!]);
      for (const [a, b] of signs(2)) {
        vs.push([0, a! / PHI, b! * PHI], [a! / PHI, b! * PHI, 0], [a! * PHI, 0, b! / PHI]);
      }
      return vs;
    }
    case "d20": {
      const vs: Vec3[] = [];
      for (const [a, b] of signs(2)) vs.push([0, a!, b! * PHI], [a!, b! * PHI, 0], [a! * PHI, 0, b!]);
      return vs;
    }
  }
}

const EPS = 1e-6;

/**
 * The faces of a convex hull, found by brute force: a plane through three corners is a
 * face exactly when every other corner lies on one side of it. At most 20 corners, and
 * each body is built once, so the cubic search is cheap and needs no face tables.
 */
function hullFaces(vs: Vec3[]): number[][] {
  const faces: number[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++)
      for (let k = j + 1; k < vs.length; k++) {
        const nRaw = cross(sub(vs[j]!, vs[i]!), sub(vs[k]!, vs[i]!));
        if (length(nRaw) < EPS) continue;
        const n = normalize(nRaw);
        const d = dot(n, vs[i]!);
        const side = vs.map((p) => dot(n, p) - d);
        const above = side.some((s) => s > EPS);
        const below = side.some((s) => s < -EPS);
        if (above && below) continue;
        const on = side.flatMap((s, idx) => (Math.abs(s) <= EPS ? [idx] : []));
        const key = on.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push(on);
      }
  return faces;
}

function buildFace(name: BodyName, idx: number[], all: Vec3[]): Face {
  const corners = idx.map((i) => all[i]!);
  const c = scale(corners.reduce(add, [0, 0, 0]), 1 / corners.length);
  let n = normalize(cross(sub(corners[1]!, corners[0]!), sub(corners[2]!, corners[0]!)));
  if (dot(n, c) < 0) n = scale(n, -1);

  // Wind the corners around the centroid so the outline is a simple polygon.
  const ref = normalize(sub(corners[0]!, c));
  const side = cross(n, ref);
  const angle = (i: number) => {
    const a = sub(all[i]!, c);
    return Math.atan2(dot(a, side), dot(a, ref));
  };
  const order = [...idx].sort((p, q) => angle(p) - angle(q));
  const ordered = order.map((i) => all[i]!);

  // Which way is "down" for the numeral. A d10's kite reads with its pole at the top;
  // every other face sits on an edge, so triangles and pentagons point up.
  let down: Vec3;
  if (name === "d10") {
    const pole = all.find((p) => Math.abs(p[0]) < EPS && Math.abs(p[2]) < EPS && dot(p, n) > 0)!;
    down = sub(c, pole);
  } else {
    down = sub(scale(add(ordered[0]!, ordered[1]!), 0.5), c);
  }
  down = normalize(sub(down, scale(n, dot(down, n))));
  const v = down;
  const u = cross(v, n);

  const polygon = ordered.map((p): [number, number] => {
    const d = sub(p, c);
    return [dot(d, u), dot(d, v)];
  });

  let inradius = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % polygon.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    inradius = Math.min(inradius, Math.abs(ax * by - ay * bx) / len);
  }

  return { n, u, v, c, polygon, corners: order, inradius };
}

/**
 * How big each body is drawn, relative to a die slot's half-width. Circumradius alone
 * makes a cube look small beside a d20, so each body is sized to look like a set.
 */
const SIZE: Record<BodyName, number> = { d4: 1.08, d6: 1.12, d8: 1.0, d10: 1.0, d12: 0.98, d20: 0.98 };

const bodies = new Map<BodyName, Body>();

export function body(name: BodyName): Body {
  const cached = bodies.get(name);
  if (cached) return cached;

  const raw = vertices(name);
  const r = Math.max(...raw.map(length));
  const vs = raw.map((p) => scale(p, SIZE[name] / r));
  const faces = hullFaces(vs).map((idx) => buildFace(name, idx, vs));
  // A stable order, so labels land on the same faces every time: top to bottom, then around.
  faces.sort((a, b) => a.c[1] - b.c[1] || Math.atan2(a.c[2], a.c[0]) - Math.atan2(b.c[2], b.c[0]));
  const opposite = faces.map((f) => faces.findIndex((g) => dot(f.n, g.n) < -1 + EPS));

  const built = { name, vertices: vs, faces, opposite };
  bodies.set(name, built);
  return built;
}

const STANDARD: [number, BodyName][] = [
  [4, "d4"],
  [6, "d6"],
  [8, "d8"],
  [10, "d10"],
  [12, "d12"],
  [20, "d20"],
];

/**
 * The body a die is drawn as. Standard dice are themselves. A d2 or d3 is a d6 numbered
 * over again, as the real ones are; anything else borrows the smallest body with enough
 * faces, and anything past twenty is drawn as a d20.
 */
export function bodyFor(sides: number): Body {
  if (sides <= 3) return body("d6");
  const fit = STANDARD.find(([n]) => n >= sides);
  return body(fit ? fit[1] : "d20");
}

/**
 * Standard numbering: opposite faces sum to faces + 1, as on a real die. A d4 has no
 * opposite faces, so it is numbered in order.
 */
export function standardLabels(b: Body): number[] {
  const count = b.faces.length;
  const labels = new Array<number>(count).fill(0);
  let next = 1;
  for (let i = 0; i < count; i++) {
    if (labels[i] !== 0) continue;
    labels[i] = next;
    const o = b.opposite[i]!;
    if (o >= 0 && labels[o] === 0) labels[o] = count + 1 - next;
    next++;
  }
  return labels;
}

/** A number printed on a face. */
export interface Numeral {
  /** Its centre, in the face's (u, v) coordinates. */
  u: number;
  v: number;
  /** Clockwise turn from upright, in degrees. */
  angle: number;
  value: number;
  /** How much room it has, in the same units as `Face.inradius`: sets the font size. */
  room: number;
}

export interface LabelledDie {
  body: Body;
  /** What is printed on each face. */
  numerals: Numeral[][];
  /** The rotation that brings the result to the viewer, numerals upright. */
  rest: Mat3;
  /** The face that reads the result head-on, or -1 for a d4, which is read at its top corner. */
  front: number;
}

/**
 * Numbers a die with `sides` and chooses how it lands to show `value`. `pick` chooses among
 * several faces that carry the value (a d3 has two 2s), so dice in one roll can land on
 * different faces of the same number.
 */
export function labelDie(sides: number, value: number, pick = 0): LabelledDie {
  const b = bodyFor(sides);
  if (b.name === "d4") return cornerDie(b, value);

  const count = b.faces.length;
  const std = standardLabels(b);
  let labels: number[];
  let front: number;

  if (sides <= count) {
    labels = std.map((l) => ((l - 1) % sides) + 1);
    const candidates = labels.flatMap((l, i) => (l === value ? [i] : []));
    front = candidates[Math.abs(pick) % candidates.length] ?? 0;
  } else {
    // More sides than faces (a d100): spread the range across the faces for the look of
    // it, then make the face nearest the result carry the result.
    labels = std.map((l) => Math.round(1 + ((l - 1) * (sides - 1)) / (count - 1)));
    front = 0;
    for (let i = 1; i < count; i++) {
      if (Math.abs(labels[i]! - value) < Math.abs(labels[front]! - value)) front = i;
    }
    labels[front] = value;
  }

  return {
    body: b,
    numerals: b.faces.map((f, j) => [{ u: 0, v: 0, angle: 0, value: labels[j]!, room: f.inradius }]),
    rest: facingRotation(b.faces[front]!),
    front,
  };
}

/**
 * A d4 lands on a face, so no face points at the viewer: it is read at the corner that
 * points up. Each corner carries its number on all three faces that meet there, turned to
 * point at it.
 *
 * Seen straight down its top corner a tetrahedron is three steep faces that read as one
 * flat triangle, so it rests as a pyramid seen from the side instead: top corner up the
 * screen and still nearest the viewer, two faces showing, each with the result at its tip.
 */
function cornerDie(b: Body, value: number): LabelledDie {
  const top = Math.min(Math.max(value, 1), b.vertices.length) - 1;
  const numerals = b.faces.map((f) =>
    f.polygon.map(([pu, pv], k): Numeral => ({
      u: pu * 0.52,
      v: pv * 0.52,
      angle: (Math.atan2(pu, -pv) * 180) / Math.PI,
      value: f.corners[k]! + 1,
      room: f.inradius * 0.75,
    })),
  );

  // The top corner at the viewer and the edge to the next corner pointing down, then
  // tipped back so that corner rises up the screen and the edge comes forward.
  const n = normalize(b.vertices[top]!);
  const edge = sub(b.vertices[(top + 1) % b.vertices.length]!, b.vertices[top]!);
  const v = normalize(sub(edge, scale(n, dot(edge, n))));
  return { body: b, numerals, rest: mul(rotateX(D4_TIP), [cross(v, n), v, n]), front: -1 };
}

/** How far a d4 is tipped back from corner-on, in degrees. */
const D4_TIP = 40;

/** Row-major 3×3 product. */
export function mul(a: Mat3, b: Mat3): Mat3 {
  const col = (j: number): Vec3 => [b[0][j]!, b[1][j]!, b[2][j]!];
  const row = (r: Vec3): Vec3 => [dot(r, col(0)), dot(r, col(1)), dot(r, col(2))];
  return [row(a[0]), row(a[1]), row(a[2])];
}

export function apply(m: Mat3, p: Vec3): Vec3 {
  return [dot(m[0], p), dot(m[1], p), dot(m[2], p)];
}

/**
 * The rotation that brings `face` to the front, numeral upright: it maps the face's
 * (u, v, n) frame onto the screen's (x, y, z). The frame is orthonormal, so this is just
 * its transpose.
 */
export function facingRotation(face: Face): Mat3 {
  return [face.u, face.v, face.n];
}

/** CSS's rotateX/Y/Z matrices, so lighting can be computed in the same space the page renders. */
export function rotateX(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

export function rotateY(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

export function rotateZ(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

const fmt = (x: number) => (Math.abs(x) < 1e-9 ? "0" : x.toFixed(6));

/** A rotation as a CSS `matrix3d`, which is column-major. */
export function rotationCss(m: Mat3): string {
  const cols = [0, 1, 2].map((j) => [m[0][j]!, m[1][j]!, m[2][j]!, 0]);
  return `matrix3d(${[...cols.flat(), 0, 0, 0, 1].map(fmt).join(",")})`;
}

/**
 * Lays a face element onto its face. The element's top-left corner sits at the die's
 * centre with `transform-origin: 0 0`; `radius` is the slot's half-width in px and `bleed`
 * grows the outline slightly so neighbouring faces overlap instead of showing a seam.
 * `pad` leaves room inside the element for the outline's stroke.
 */
export function faceLayout(face: Face, radius: number, bleed = 0.6, pad = 1) {
  const pts = face.polygon.map(([pu, pv]): [number, number] => {
    const d = Math.hypot(pu, pv) * radius;
    const k = d > 0 ? (d + bleed) / d : 1;
    return [pu * radius * k, pv * radius * k];
  });
  const minU = Math.min(...pts.map((p) => p[0])) - pad;
  const minV = Math.min(...pts.map((p) => p[1])) - pad;
  const width = Math.max(...pts.map((p) => p[0])) + pad - minU;
  const height = Math.max(...pts.map((p) => p[1])) + pad - minV;

  // Element pixel (x, y) is face point (minU + x, minV + y), so the translation carries
  // the element's corner to that point in 3D.
  const origin = add(add(scale(face.c, radius), scale(face.u, minU)), scale(face.v, minV));
  const transform = `matrix3d(${[...face.u, 0, ...face.v, 0, ...face.n, 0, ...origin, 1].map(fmt).join(",")})`;
  const points = pts.map(([x, y]) => `${(x - minU).toFixed(2)},${(y - minV).toFixed(2)}`).join(" ");

  return {
    width,
    height,
    transform,
    /** The outline, in the element's own pixels, for an SVG `<polygon>`. */
    points,
    /** Where the centroid falls inside the element, for the numeral. */
    labelX: -minU,
    labelY: -minV,
  };
}

/** How long one die takes from leaving the hand to rest, in milliseconds. */
export const THROW_MS = 1150;

/** The gap between dice leaving the hand, so a handful doesn't land as one. */
export const throwStagger = (count: number) => Math.min(60, 420 / Math.max(1, count));

/** Keyframe samples per throw; a bounce is sampled, not eased. */
const THROW_SAMPLES = 36;

/** Floor contacts after the drop: [start, end, bounce height as a fraction of the drop]. */
const BOUNCES: [number, number, number][] = [
  [0.34, 0.58, 0.3],
  [0.58, 0.74, 0.1],
  [0.74, 0.84, 0.03],
];

/**
 * Each time a die strikes the surface, as a fraction of `THROW_MS`, and the height (a fraction of
 * the drop) it fell from to get there: the drop itself, then each bounce coming down. The dice
 * sound (`board/fxSound.ts`) clacks on these.
 */
export const THROW_CONTACTS: ReadonlyArray<{ at: number; fall: number }> = [
  { at: BOUNCES[0]![0], fall: 1 },
  ...BOUNCES.map(([, end, peak]) => ({ at: end, fall: peak })),
];
/** After the last contact the die slides to rest, until the end of the throw. */
export const THROW_SLIDE_FROM = BOUNCES[BOUNCES.length - 1]![1];

/** How one die travels to rest, in px of the surface it lands on. */
export interface ThrowPath {
  /** Where the die leaves the hand, relative to where it comes to rest. */
  offset: { x: number; y: number };
  /** How high above the surface it starts. */
  drop: number;
  /** Extra degrees about x, y and z, wound down to nothing by the time it rests. */
  turns: readonly [number, number, number];
}

/** A throw's tumble: a turn and a half or so about each axis, in random directions. */
export function throwTurns(rng: () => number): [number, number, number] {
  const [x, y, z] = [0, 1, 2].map((axis) => (rng() < 0.5 ? -1 : 1) * (axis === 2 ? 200 : 460) + (rng() - 0.5) * 240);
  return [x!, y!, z!];
}

/** Height above the surface at time t in [0, 1]: a drop, then three shrinking bounces. */
function throwHeight(t: number, drop: number): number {
  const [first] = BOUNCES[0]!;
  if (t < first) return drop * (1 - (t / first) ** 2);
  for (const [a, b, peak] of BOUNCES) {
    if (t < b) {
      const s = (t - a) / (b - a);
      return 4 * peak * drop * s * (1 - s);
    }
  }
  return 0;
}

/**
 * Keyframes for one die thrown along `path` onto a surface, for the three parts `Die3D` draws:
 * the tumble (`spin`), the travel and height (`flight`) and the shadow on the surface.
 *
 * The tumble is extra rotations composed in front of the rest transform and wound down to
 * zero, so the final frame is exactly the rest pose and the die lands on its result. Travel
 * bleeds off speed as it goes, so the die slides the last stretch.
 */
export function throwKeyframes(rest: string, path: ThrowPath): { spin: Keyframe[]; flight: Keyframe[]; shadow: Keyframe[] } {
  const spin: Keyframe[] = [];
  const flight: Keyframe[] = [];
  const shadow: Keyframe[] = [];
  for (let k = 0; k <= THROW_SAMPLES; k++) {
    const t = k / THROW_SAMPLES;
    const h = throwHeight(t, path.drop);
    const travel = (1 - t) ** 2.4;
    const x = path.offset.x * travel;
    const y = path.offset.y * travel;
    const unwind = (1 - t) ** 2.6;
    const lift = path.drop > 0 ? h / path.drop : 0;
    const [a, b, c] = path.turns;
    spin.push({
      offset: t,
      // Same function list in every frame, so the angles interpolate turn by turn.
      transform: `rotateX(${a * unwind}deg) rotateY(${b * unwind}deg) rotateZ(${c * unwind}deg) ${rest}`,
    });
    flight.push({ offset: t, transform: `translate3d(${x}px, ${y - h}px, 0) scale(${1 + 0.18 * lift})` });
    shadow.push({ offset: t, transform: `translate(${x}px, ${y}px) scale(${1 - 0.45 * lift})`, opacity: 1 - 0.7 * lift });
  }
  return { spin, flight, shadow };
}

/**
 * A small seeded generator (mulberry32), keyed by text such as a roll id. Decorative only: it
 * picks resting angles and throw paths, and it is seeded so a re-render does not reshuffle a
 * die that is already on the table.
 */
export function seed(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
