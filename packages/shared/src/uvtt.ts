import { z } from "zod";
import { GridSpec, Point, type Segment } from "./geometry";
import { canRenderGrid } from "./gridRenderLimit";
import { Id, MapImage, MAX_WALLS, Wall, type RoomState } from "./state";
import { wallsFitMap } from "./wallDetection";

export const MAX_UVTT_BYTES = 40 * 1024 * 1024;
export const MAX_UVTT_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_UVTT_PIXELS = 32_000_000;
export const MAX_UVTT_EDGE = 16_384;
export const MAX_UVTT_ISSUES = 20;

export const UvttIssue = z.object({
  code: z.string().max(60), path: z.string().max(160), message: z.string().max(240),
  severity: z.enum(["error", "warning"]),
});
export type UvttIssue = z.infer<typeof UvttIssue>;
export class UvttError extends Error {
  constructor(readonly issues: UvttIssue[]) { super(issues[0]?.message ?? "Invalid UVTT file."); }
}
export function uvttError(code: string, path: string, message: string): never {
  throw new UvttError([{ code, path, message, severity: "error" }]);
}

const RawPortal = z.object({
  bounds: z.array(Point).length(2),
  position: Point.optional(), rotation: z.number().finite().optional(),
  closed: z.boolean().optional(), freestanding: z.boolean().optional(),
}).passthrough();
// A container is bounded before JSON parsing. Bound individual arrays too, before normalization.
const MAX_INPUT_POINTS = 10_000;
const Polyline = z.array(Point).min(2).max(MAX_INPUT_POINTS);
export const UvttFile = z.object({
  format: z.union([z.literal(0.2), z.literal(0.3), z.literal(1)]),
  resolution: z.object({
    map_origin: Point,
    map_size: z.object({ x: z.number().positive().finite(), y: z.number().positive().finite() }),
    pixels_per_grid: z.number().int().positive().max(2000),
  }).passthrough(),
  image: z.string().min(1).max(Math.ceil(MAX_UVTT_IMAGE_BYTES / 3) * 4),
  line_of_sight: z.array(Polyline).max(MAX_INPUT_POINTS).optional(),
  objects_line_of_sight: z.array(Polyline).max(MAX_INPUT_POINTS).optional(),
  portals: z.array(RawPortal).max(MAX_INPUT_POINTS).optional(),
}).passthrough();
export type UvttFile = z.infer<typeof UvttFile>;
export const UvttGeometry = Wall.omit({ id: true }).strict();
export type UvttGeometry = z.infer<typeof UvttGeometry>;

export const UvttDraftEdit = z.object({
  revision: z.number().int().positive(), grid: GridSpec,
  walls: z.array(UvttGeometry).max(MAX_WALLS),
}).strict();
export type UvttDraftEdit = z.infer<typeof UvttDraftEdit>;
export const UvttPreparation = z.object({
  id: Id, revision: z.number().int().positive(), map: MapImage, grid: GridSpec,
  walls: z.array(UvttGeometry).max(MAX_WALLS), diagnostics: z.array(UvttIssue).max(MAX_UVTT_ISSUES),
});
export type UvttPreparation = z.infer<typeof UvttPreparation>;
export interface UvttBaseline {
  map: RoomState["scene"]["map"]; grid: GridSpec; walls: RoomState["walls"]; fog: RoomState["fog"];
  /** Monotonic edit fence, including undo/restores; absent room revisions are captured as zero. */
  terrainRevision: number;
}
export interface PreparedUvttScene { map: z.infer<typeof MapImage>; grid: GridSpec; walls: UvttGeometry[]; baseline: UvttBaseline }

export const positiveModulo = (n: number, divisor: number) => ((n % divisor) + divisor) % divisor;
export function uvttToBoard(p: Point, origin: Point, size: number): Point {
  return { x: (p.x - origin.x) * size, y: (p.y - origin.y) * size };
}
export function boardToUvtt(p: Point, origin: Point, size: number): Point {
  return { x: p.x / size + origin.x, y: p.y / size + origin.y };
}

export function parseUvtt(value: unknown): UvttFile {
  const result = UvttFile.safeParse(value);
  if (!result.success) {
    throw new UvttError(result.error.issues.slice(0, MAX_UVTT_ISSUES).map((i) => ({
      code: i.path[0] === "format" ? "unsupported_format" : "invalid_field",
      path: i.path.map((p, n) => typeof p === "number" ? `[${p}]` : `${n ? "." : ""}${String(p)}`).join("").slice(0, 160),
      // Do not include Zod's messages, which can echo unbounded supplied values.
      message: i.path[0] === "format" ? "Supported UVTT formats are 0.2, 0.3 and 1.0." : "Required field is missing or has an invalid type or value.",
      severity: "error",
    })));
  }
  return result.data;
}

/** Liang-Barsky clipping keeps direction and precision; does not snap endpoints. */
export function clipUvttSegment(segment: Segment, map: { width: number; height: number }): Segment | null {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, segment.a.x], [dx, map.width - segment.a.x], [-dy, segment.a.y], [dy, map.height - segment.a.y]]) {
    if (p === 0) { if (q! < 0) return null; continue; }
    const t = q! / p!;
    if (p! < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  if (hi <= lo) return null;
  return { a: { x: segment.a.x + lo * dx, y: segment.a.y + lo * dy }, b: { x: segment.a.x + hi * dx, y: segment.a.y + hi * dy } };
}

/** Subtract only collinear overlap; crossing walls keep their geometry. */
function subtractPortal<T extends Segment>(wall: T, portal: Segment): T[] {
  const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, len2 = dx * dx + dy * dy;
  if (!(len2 > 0) || !Number.isFinite(len2)) return [wall];
  const cross = (p: Point) => dx * (p.y - wall.a.y) - dy * (p.x - wall.a.x);
  const tolerance = 1e-6 * Math.sqrt(len2);
  if (Math.abs(cross(portal.a)) > tolerance || Math.abs(cross(portal.b)) > tolerance) return [wall];
  const project = (p: Point) => ((p.x - wall.a.x) * dx + (p.y - wall.a.y) * dy) / len2;
  const t1 = project(portal.a), t2 = project(portal.b);
  const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(1, Math.max(t1, t2));
  if (hi <= lo) return [wall];
  const point = (t: number) => ({ x: wall.a.x + t * dx, y: wall.a.y + t * dy });
  return [ ...(lo > 0 ? [{ ...wall, b: point(lo) }] : []), ...(hi < 1 ? [{ ...wall, a: point(hi) }] : []) ];
}

/** Portal bounds take precedence over collinear solid LoS, including after endpoint edits. */
export const hasPortalBounds = (wall: { portal?: unknown; uvttPortal?: unknown }) => wall.portal !== undefined || wall.uvttPortal !== undefined;
export function removePortalOverlaps<T extends Segment & { portal?: unknown; uvttPortal?: unknown }>(walls: readonly T[]): T[] {
  const portals = walls.filter(hasPortalBounds);
  return walls.flatMap((wall) => {
    if (hasPortalBounds(wall)) return [wall];
    let parts = [wall];
    for (const portal of portals) parts = parts.flatMap((part) => subtractPortal(part, portal));
    return parts;
  });
}

export function normalizeUvtt(file: UvttFile, map: { width: number; height: number }, inheritedGrid: GridSpec) {
  const { map_origin: origin, pixels_per_grid: size } = file.resolution;
  const grid = GridSpec.parse({ ...inheritedGrid, cellSize: size,
    offsetX: positiveModulo(-origin.x * size, size), offsetY: positiveModulo(-origin.y * size, size) });
  if (!canRenderGrid(grid.cellSize, map)) uvttError("grid_limit", "resolution.pixels_per_grid", "Grid creates too many lines. Increase pixels per grid.");
  const diagnostics: UvttIssue[] = [];
  const warn = (code: string, path: string, message: string) => {
    if (diagnostics.length < MAX_UVTT_ISSUES) diagnostics.push({ code, path, message, severity: "warning" });
  };
  for (const key of Object.keys(file)) if (!["format", "resolution", "image", "line_of_sight", "objects_line_of_sight", "portals"].includes(key)) {
    warn("unsupported_data", key.slice(0, 160), "Lighting, environment and extension data are not imported or included in the supported round trip.");
  }
  for (const key of Object.keys(file.resolution)) if (!["map_origin", "map_size", "pixels_per_grid"].includes(key)) warn("unsupported_data", `resolution.${key}`.slice(0, 160), "Resolution extension data is excluded from the supported round trip.");
  let pointCount = 0;
  const toBoard = (p: Point) => {
    if (++pointCount > MAX_INPUT_POINTS) uvttError("geometry_limit", "line_of_sight", "Too many geometry points to process.");
    const result = uvttToBoard(p, origin, size);
    if (!Point.safeParse(result).success) uvttError("coordinate_range", "resolution", "Coordinate conversion exceeds the supported numeric range.");
    return result;
  };
  const clip = (wall: UvttGeometry, path: string): UvttGeometry | null => {
    if (wall.a.x === wall.b.x && wall.a.y === wall.b.y) uvttError("zero_segment", path, "A segment needs two different endpoints.");
    const clipped = clipUvttSegment(wall, map);
    if (!clipped || clipped.a.x !== wall.a.x || clipped.a.y !== wall.a.y || clipped.b.x !== wall.b.x || clipped.b.y !== wall.b.y) {
      warn("geometry_clipped", path, "Geometry outside the image crop was clipped or removed.");
    }
    return clipped ? { ...wall, ...clipped } : null;
  };
  const portals: UvttGeometry[] = [];
  for (const [i, p] of (file.portals ?? []).entries()) {
    const { bounds, position, rotation, closed, freestanding } = p;
    const metadata = { ...(rotation !== undefined ? { rotation } : {}), ...(closed !== undefined ? { closed } : {}), ...(freestanding !== undefined ? { freestanding } : {}) };
    for (const key of Object.keys(p)) if (!["bounds", "position", "rotation", "closed", "freestanding"].includes(key)) warn("unsupported_data", `portals[${i}].${key}`.slice(0, 160), "Portal extension data is excluded from the supported round trip.");
    const wall = clip({ a: toBoard(bounds[0]!), b: toBoard(bounds[1]!), uvttPortal: { ...metadata, ...(position ? { position: toBoard(position) } : {}) } }, `portals[${i}].bounds`);
    if (wall) portals.push(wall);
  }
  const solids: UvttGeometry[] = [];
  for (const source of ["line_of_sight", "objects_line_of_sight"] as const) {
    for (const [i, polyline] of (file[source] ?? []).entries()) {
      const points = polyline.map(toBoard);
      for (let n = 1; n < points.length; n++) {
        const wall = clip({ a: points[n - 1]!, b: points[n]!, source }, `${source}[${i}][${n}]`);
        if (!wall) continue;
        let parts = [wall];
        for (const portal of portals) parts = parts.flatMap((part) => subtractPortal(part, portal));
        solids.push(...parts);
        if (solids.length + portals.length > MAX_WALLS) uvttError("wall_limit", source, `Normalized geometry exceeds ${MAX_WALLS} walls. Reduce geometry in the exporter.`);
      }
    }
  }
  const walls = [...solids, ...portals];
  validateUvttDraft(grid, walls, map);
  return { grid, walls, diagnostics };
}

export function validateUvttDraft(grid: GridSpec, walls: readonly UvttGeometry[], map: { width: number; height: number }) {
  if (!GridSpec.safeParse(grid).success || !canRenderGrid(grid.cellSize, map)) uvttError("invalid_grid", "grid", "Use a valid grid that can render on this image.");
  if (walls.length > MAX_WALLS) uvttError("wall_limit", "walls", `A map can hold at most ${MAX_WALLS} walls.`);
  if (!wallsFitMap(walls, map)) uvttError("outside_map", "walls", "Wall endpoints must lie on the image.");
  if (walls.some((w) => w.a.x === w.b.x && w.a.y === w.b.y)) uvttError("zero_segment", "walls", "A wall needs two different endpoints.");
}

/** Image supplied by the server after safe resolution; no other room data is serialized. */
export function serializeUvtt(map: { width: number; height: number }, grid: GridSpec, walls: readonly UvttGeometry[], image: string) {
  if (!Number.isInteger(grid.cellSize)) uvttError("fractional_grid", "grid.cellSize", "UVTT export needs an integer grid cell size. In Edit map → Grid, choose an integer pixel size and apply it, then export again.");
  validateUvttDraft(grid, walls, map);
  const origin = { x: positiveModulo(-grid.offsetX / grid.cellSize, 1), y: positiveModulo(-grid.offsetY / grid.cellSize, 1) };
  const convert = (p: Point) => boardToUvtt(p, origin, grid.cellSize);
  return {
    format: 0.3,
    resolution: { map_origin: origin, map_size: { x: map.width / grid.cellSize, y: map.height / grid.cellSize }, pixels_per_grid: grid.cellSize },
    line_of_sight: walls.filter((w) => !hasPortalBounds(w) && w.source !== "objects_line_of_sight").map((w) => [convert(w.a), convert(w.b)]),
    objects_line_of_sight: walls.filter((w) => !hasPortalBounds(w) && w.source === "objects_line_of_sight").map((w) => [convert(w.a), convert(w.b)]),
    portals: walls.filter(hasPortalBounds).map((w) => ({
      ...w.uvttPortal,
      ...(w.uvttPortal?.position ? { position: convert(w.uvttPortal.position) } : {}),
      ...(w.portal ? { closed: w.portal.state !== "open" } : {}),
      bounds: [convert(w.a), convert(w.b)],
    })),
    image,
  };
}
