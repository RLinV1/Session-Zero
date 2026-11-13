import { areaShape, pointInArea, templateArea, DEFAULT_AREA_COLOR, MAX_LINE_WIDTH_CELLS, pointInPolygon, snapTokenCenter, type AreaColor, type AreaGeometry, type AreaShape, type AreaTemplate, type Command, type DrawColor, type Drawing, type DrawingShape, type DiagonalRule, type FogRegion, type GridSpec, type Point, type PortalState, type TerrainKind, type TemplateGeometry, type Token, type Wall } from "@vtt/shared";

export type { AreaShape };
import type { StrokeShape } from "./terrainStroke";

/**
 * Board tools (KAN-69): the tool rail's Measure, Draw, Area and Eraser tools. Pure geometry in board
 * coordinates (invariant 8), so it is testable without Pixi. Rulers stay local to the viewer;
 * areas (ADR 0007) and drawings (ADR 0064) are shared with the table.
 */

/** `brush` is freehand: a stroke, simplified before it is shared (ADR 0064). */
export type DrawShape = "brush" | "line" | "rect" | "circle";

export type BoardTool =
  | { kind: "select" }
  /** Range: one straight line, plain distance. Movement: a clicked route, costed like a drag. */
  | { kind: "measure"; mode: MeasureMode }
  | { kind: "draw"; shape: DrawShape; color: number }
  | {
      kind: "area";
      shape: AreaShape;
      /** A line's width in whole cells, 1 to `MAX_LINE_WIDTH_CELLS` (KAN-35, aoe-tool-refinements). */
      lineCells: number;
      /** The colour everyone sees it in (ADR 0040). */
      color: AreaColor;
      /** GM only: place it where players can't see it (ADR 0007). */
      gmOnly: boolean;
    }
  | { kind: "erase" }
  /** GM only (FR-GM-17, ADR 0016): conceal a rectangle or polygon, or reveal (remove) a fogged region. */
  | { kind: "fog"; mode: FogMode }
  /** GM only (board-terrain-tool): paint Base terrain on the live board; `paint` null erases to Normal ground. */
  | { kind: "terrain"; shape: StrokeShape; paint: TerrainKind | null }
  /** GM only (board-doors-tool): change a door's or window's state by clicking it. */
  | { kind: "doors"; mode: DoorsMode }
  /** Picking whom `attackerId` attacks (attack-targeting). Started from a token's Attack button, not the rail. */
  | { kind: "attack"; attackerId: string }
  /** GM only: picking a placed template whose tokens to select (ADR 0046). Started from From template, not the rail. */
  | { kind: "pickTemplate" };

/** What a Doors-tool click does: Open/Close, or Lock/Unlock (board-doors-tool). */
export type DoorsMode = "toggle" | "lock";

/**
 * The state a Doors-tool click sets: Open/Close opens a closed or locked portal and closes an open
 * one; Lock/Unlock locks an open or closed portal and unlocks a locked one to closed.
 */
export function doorsTarget(mode: DoorsMode, current: PortalState): PortalState {
  if (mode === "toggle") return current === "open" ? "closed" : "open";
  return current === "locked" ? "closed" : "locked";
}

/** What the Measure tool measures: plain range, or a route's movement cost (ruler-modes). */
export type MeasureMode = "range" | "movement";
export const isMeasureMode = (v: unknown): v is MeasureMode => v === "range" || v === "movement";

/** What the Fog tool does: drag a rectangle, click out a polygon, or click a region to remove it. */
export type FogMode = "rect" | "polygon" | "reveal";

/** A fog region as the Fog tool sends it (FR-GM-17, ADR 0016). */
export type FogDraft = Extract<Command, { type: "fog.add" }>["region"];

/**
 * What the map editor's Walls step does (map-editor): chain walls, remove one, detect walls like a
 * clicked one, or make a wall a door or window (ADR 0030).
 */
export type WallMode = "draw" | "erase" | "sample" | "portal";

/** The nearest point to `p` on the segment from `a` to `b`. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** The wall nearest `p` within `tolerance` board pixels, or null (the Walls tool's Erase). */
export function wallAt(walls: Record<string, Wall>, p: Point, tolerance: number): Wall | null {
  let best: Wall | null = null;
  let bestDistance = tolerance;
  for (const wall of Object.values(walls)) {
    const q = closestOnSegment(p, wall.a, wall.b);
    const distance = Math.hypot(q.x - p.x, q.y - p.y);
    if (distance <= bestDistance) {
      best = wall;
      bestDistance = distance;
    }
  }
  return best;
}

/** The door or window nearest `p` within `tolerance` board pixels, or null (FR-GM-18, ADR 0030). */
export function portalAt(walls: Record<string, Wall>, p: Point, tolerance: number): Wall | null {
  return wallAt(Object.fromEntries(Object.entries(walls).filter(([, w]) => w.portal)), p, tolerance);
}

/**
 * Where a drawn wall's end goes (wall-editing): onto an existing wall's end within `reach` board
 * pixels, so walls join, else onto the nearest grid corner. `free` (Alt held) leaves it as is.
 */
export function wallPoint(p: Point, walls: Record<string, Wall>, grid: GridSpec, reach: number, free: boolean): Point {
  if (free) return p;
  let best: Point | null = null;
  let bestDistance = reach;
  for (const wall of Object.values(walls)) {
    for (const end of [wall.a, wall.b]) {
      const distance = Math.hypot(end.x - p.x, end.y - p.y);
      if (distance <= bestDistance) {
        best = end;
        bestDistance = distance;
      }
    }
  }
  return best ?? snapToIntersection(p, grid);
}

/** The topmost fog region under `p` (the last added wins), or null. */
export function fogRegionAt(fog: Record<string, FogRegion>, p: Point): FogRegion | null {
  const regions = Object.values(fog);
  for (let i = regions.length - 1; i >= 0; i--) if (pointInPolygon(p, regions[i]!.points)) return regions[i]!;
  return null;
}

/** The corners of a fog draft, as `decide` will store them (a rectangle becomes four corners). */
export function fogDraftPoints(region: FogDraft): Point[] {
  if (region.shape === "polygon") return region.points;
  const { from, to } = region;
  const [x0, x1] = [Math.min(from.x, to.x), Math.max(from.x, to.x)];
  const [y0, y1] = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/**
 * Colours offered by the Draw tool: `id` is what a shared drawing stores (ADR 0064), `name` a
 * catalog id read with `t()` when shown, `value` the shade the board draws it in.
 */
export const DRAW_COLORS = [
  { id: "red", name: "colour.red", value: 0xe74c3c },
  { id: "yellow", name: "colour.yellow", value: 0xf1c40f },
  { id: "green", name: "colour.green", value: 0x2ecc71 },
  { id: "blue", name: "colour.blue", value: 0x3498db },
  { id: "white", name: "colour.white", value: 0xecf0f1 },
] as const satisfies ReadonlyArray<{ id: DrawColor; name: string; value: number }>;

/** The stored colour for a Draw tool shade; red for a shade the tool doesn't offer. */
export function drawColorId(value: number): DrawColor {
  return DRAW_COLORS.find((c) => c.value === value)?.id ?? "red";
}

/** The shade a stored drawing colour is drawn in. */
export function drawShade(color: DrawColor): number {
  return DRAW_COLORS.find((c) => c.id === color)?.value ?? DRAW_COLORS[0].value;
}

/** A shared drawing as a mark, for drawing and hit testing (ADR 0064). */
export function drawingMark(d: Drawing): Extract<Mark, { kind: "draw" | "stroke" }> {
  if (d.kind === "stroke") {
    const points = Array.from({ length: d.points.length / 2 }, (_, i) => ({ x: d.points[2 * i]!, y: d.points[2 * i + 1]! }));
    return { kind: "stroke", color: drawShade(d.color), points };
  }
  return { kind: "draw", shape: d.kind, color: drawShade(d.color), from: d.from, to: d.to };
}

/**
 * What the Draw tool shares for a finished line, box or circle: whole map pixels, with any point
 * past the map's edge pulled onto it, since the server refuses points off the map (ADR 0064).
 */
export function drawnShape(
  shape: Exclude<DrawShape, "brush">,
  color: number,
  from: Point,
  to: Point,
  map: { width: number; height: number },
): DrawingShape {
  const clamp = (p: Point) => ({ x: Math.round(Math.min(map.width, Math.max(0, p.x))), y: Math.round(Math.min(map.height, Math.max(0, p.y))) });
  return { kind: shape, color: drawColorId(color), from: clamp(from), to: clamp(to) };
}

/** A mark as the viewer made it: raw points, so a grid change re-derives snapping and sizes. */
export type Mark =
  | { kind: "measure"; from: Point; to: Point; free: boolean; tokenSize?: number }
  | { kind: "draw"; shape: Exclude<DrawShape, "brush">; color: number; from: Point; to: Point }
  | { kind: "stroke"; color: number; points: Point[] }
  /** A Movement-mode ruler route: square centres, start first; `done` once Enter finishes it. */
  | { kind: "route"; points: Point[]; done: boolean }
  | { kind: "area"; shape: AreaShape; size: number; origin: Point; toward: Point; free: boolean; gmOnly?: boolean; width?: number; color?: AreaColor };

/** A placed, shared template as a mark, for drawing and hit testing. Its origin is already snapped. */
export function templateMark(t: AreaTemplate): Extract<Mark, { kind: "area" }> {
  return { kind: "area", shape: t.shape, size: t.size, origin: t.origin, toward: t.toward, free: true, gmOnly: t.gmOnly, width: t.width, color: t.color };
}

/** The shade each area colour is drawn in (ADR 0040). Shared state names the colour; the board picks the shade. */
export const AREA_SHADES: Record<AreaColor, number> = {
  red: 0xe74c3c,
  orange: 0xe67e22,
  yellow: 0xf1c40f,
  green: 0x2ecc71,
  blue: 0x3498db,
  purple: 0x9b59b6,
  grey: 0x95a5a6,
};

/** An area's shade; one placed before colours existed is orange. */
export function areaColorValue(color?: AreaColor): number {
  return AREA_SHADES[color ?? DEFAULT_AREA_COLOR];
}

export function snapToCellCenter(p: Point, grid: GridSpec): Point {
  return snapTokenCenter(p, 1, grid);
}

export function snapToIntersection(p: Point, grid: GridSpec): Point {
  const snap = (v: number, offset: number) => Math.round((v - offset) / grid.cellSize) * grid.cellSize + offset;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/** `25 ft`, `7.5 ft`: one decimal at most, no trailing `.0`. */
export function formatDistance(units: number, grid: GridSpec): string {
  const rounded = Math.round(units * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${grid.unitLabel}`;
}

/** Existing callers retain equal-cost cell-centre measurement; a ruler may preserve a token's exact centre. */
export function measure(from: Point, to: Point, grid: GridSpec, free: boolean, rule: DiagonalRule = "equal", tokenSize?: number) {
  const a = free || tokenSize !== undefined ? from : snapToCellCenter(from, grid);
  // Match token.move's destination snapping without shifting an off-grid origin.
  const b = free ? to : snapTokenCenter(to, tokenSize ?? 1, grid);
  const rawDx = Math.abs(b.x - a.x) / grid.cellSize;
  const rawDy = Math.abs(b.y - a.y) / grid.cellSize;
  const dx = free || tokenSize !== undefined ? rawDx : Math.round(rawDx);
  const dy = free || tokenSize !== undefined ? rawDy : Math.round(rawDy);
  const cells = free || rule === "euclidean" ? Math.hypot(dx, dy)
    : Math.max(dx, dy) + (rule === "alternating" ? Math.floor(Math.min(dx, dy) / 2 + 1e-9) : 0);
  const units = cells * grid.unitsPerCell;
  return { from: a, to: b, units, label: formatDistance(units, grid) };
}

export { areaShape, templateArea, type AreaGeometry };

/**
 * The tokens whose footprint (their size in cells, a square centred on their position) overlaps
 * `area`, in the order given (ADR 0046). Touching only at an edge or a corner does not count.
 */
export function tokensTouchingArea<T extends Pick<Token, "position" | "size">>(area: AreaGeometry, tokens: readonly T[], grid: GridSpec): T[] {
  return tokens.filter((token) => {
    const h = (token.size * grid.cellSize) / 2;
    const { x, y } = token.position;
    if (area.kind === "circle") {
      // The nearest point of the square to the centre must be strictly inside the circle.
      const nx = Math.max(x - h, Math.min(area.center.x, x + h));
      const ny = Math.max(y - h, Math.min(area.center.y, y + h));
      return Math.hypot(nx - area.center.x, ny - area.center.y) < area.radius;
    }
    const square = [{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }];
    return convexOverlap(area.points, square);
  });
}

/** Separating-axis test for two convex polygons; true only when they share some area. */
function convexOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  const EPSILON = 1e-9;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const axis = { x: q.y - p.y, y: p.x - q.x };
      if (axis.x === 0 && axis.y === 0) continue;
      const project = (points: readonly Point[]) => {
        let min = Infinity;
        let max = -Infinity;
        for (const v of points) {
          const d = v.x * axis.x + v.y * axis.y;
          min = Math.min(min, d);
          max = Math.max(max, d);
        }
        return { min, max };
      };
      const pa = project(a);
      const pb = project(b);
      // Projections that only meet at a point are an edge or corner contact.
      if (pa.max <= pb.min + EPSILON || pb.max <= pa.min + EPSILON) return false;
    }
  }
  return true;
}

/**
 * Where an area's origin lands: the nearest half-cell point (a corner, an edge midpoint or a
 * cell centre, so an aura can sit on a token), unless placed freely (Alt).
 */
export function areaOrigin(p: Point, grid: GridSpec, free: boolean): Point {
  if (free) return p;
  const half = grid.cellSize / 2;
  const snap = (v: number, offset: number) => Math.round((v - offset) / half) * half + offset;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/**
 * An area's size from a drag, in grid units, so the pointer sits on the shape's far edge: the
 * distance from the origin, or twice it for a box, which is centred on its origin (ADR 0040).
 * Snapped to whole cells (at least one) unless free.
 */
export function areaSizeFromDrag(origin: Point, to: Point, grid: GridSpec, free: boolean, shape?: AreaShape): number {
  const cells = (Math.hypot(to.x - origin.x, to.y - origin.y) / grid.cellSize) * (shape === "box" ? 2 : 1);
  if (free) return Math.max(0.1, Math.round(cells * grid.unitsPerCell * 10) / 10);
  return Math.max(1, Math.round(cells)) * grid.unitsPerCell;
}

/** How big an area placed with a click is, in cells of the room's grid (ADR 0058). A drag sizes it instead. */
export const DEFAULT_AREA_CELLS = 2;

/** The size of an area placed with a click, in the room's units: 10 ft on a 5 ft grid. */
export function defaultAreaSize(grid: GridSpec): number {
  return DEFAULT_AREA_CELLS * grid.unitsPerCell;
}

/** The shape and geometry of a placed area, as the handles need it. */
export type EditableArea = Pick<AreaTemplate, "shape" | "origin" | "toward" | "size" | "width">;

/**
 * A grip on a selected area (ADR 0058). `aim` sets size and, but for a circle, direction: on a
 * circle's rim, at a cone's or line's far end, at a square's front corner. `width` sits on each
 * long edge of a line.
 */
export type TemplateHandle = { kind: "aim" | "width"; at: Point };

/** How a selected area is being changed: dragged by its body from a point, or by one of its handles. */
export type TemplateEdit = { kind: "body"; grab: Point } | { kind: "aim" } | { kind: "width" };

/** An area's facing as a unit vector and its normal; a zero-length aim points right. */
function facing(t: EditableArea): { dir: Point; perp: Point } {
  const dx = t.toward.x - t.origin.x;
  const dy = t.toward.y - t.origin.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  return { dir, perp: { x: -dir.y, y: dir.x } };
}

/** Where a selected area's handles are, in board pixels. */
export function templateHandles(t: EditableArea, grid: GridSpec): TemplateHandle[] {
  const length = (t.size / grid.unitsPerCell) * grid.cellSize;
  const { dir, perp } = facing(t);
  const at = (along: number, across: number): Point => ({
    x: t.origin.x + dir.x * along + perp.x * across,
    y: t.origin.y + dir.y * along + perp.y * across,
  });
  if (t.shape === "box") return [{ kind: "aim", at: at(length / 2, length / 2) }];
  const handles: TemplateHandle[] = [{ kind: "aim", at: at(length, 0) }];
  if (t.shape === "line") {
    const half = (((t.width ?? grid.unitsPerCell) / grid.unitsPerCell) * grid.cellSize) / 2;
    handles.push({ kind: "width", at: at(length / 2, -half) }, { kind: "width", at: at(length / 2, half) });
  }
  return handles;
}

/**
 * The geometry an edit gives a placed area with the pointer at `pointer` (ADR 0058), snapped as
 * placing is unless `free` (Alt):
 * - body: moves the origin by the drag, snapped to half cells, and the aim with it, keeping its facing
 * - aim: the size from the origin to the pointer, as a placement drag; a cone, line or square also
 *   turns to face it (a square's handle is its corner, 45° off its facing)
 * - width: a line's width, twice the pointer's distance from its centre line, in whole cells from 1
 *   to `MAX_LINE_WIDTH_CELLS` even with Alt
 */
export function editedGeometry(t: EditableArea, edit: TemplateEdit, pointer: Point, grid: GridSpec, free: boolean): TemplateGeometry {
  const same = { origin: t.origin, toward: t.toward, size: t.size, ...(t.width !== undefined && { width: t.width }) };
  if (edit.kind === "body") {
    const origin = areaOrigin({ x: t.origin.x + pointer.x - edit.grab.x, y: t.origin.y + pointer.y - edit.grab.y }, grid, free);
    const dx = origin.x - t.origin.x, dy = origin.y - t.origin.y;
    return { ...same, origin, toward: { x: t.toward.x + dx, y: t.toward.y + dy } };
  }
  const dx = pointer.x - t.origin.x, dy = pointer.y - t.origin.y;
  if (edit.kind === "width") {
    if (t.shape !== "line") return same;
    const { perp } = facing(t);
    const across = Math.abs(dx * perp.x + dy * perp.y);
    const cells = Math.min(MAX_LINE_WIDTH_CELLS, Math.max(1, Math.round((2 * across) / grid.cellSize)));
    return { ...same, width: cells * grid.unitsPerCell };
  }
  if (dx === 0 && dy === 0) return same;
  if (t.shape === "circle") return { ...same, size: areaSizeFromDrag(t.origin, pointer, grid, free, "circle") };
  if (t.shape !== "box") return { ...same, toward: pointer, size: areaSizeFromDrag(t.origin, pointer, grid, free, t.shape) };
  // The corner is half a diagonal from the centre: side = distance × √2, facing 45° back from the pointer.
  const cells = (Math.hypot(dx, dy) * Math.SQRT2) / grid.cellSize;
  const size = free ? Math.max(0.1, Math.round(cells * grid.unitsPerCell * 10) / 10) : Math.max(1, Math.round(cells)) * grid.unitsPerCell;
  const angle = Math.atan2(dy, dx) - Math.PI / 4;
  return { ...same, size, toward: { x: t.origin.x + Math.cos(angle) * grid.cellSize, y: t.origin.y + Math.sin(angle) * grid.cellSize } };
}

/** Whether `p` is inside an area's outline: no edge reach, unlike the eraser's `hitMark`. */
export const insideArea = pointInArea;

/**
 * Points every `step` board pixels from `from` to `to`, both ends included, so a fast eraser
 * drag is tested along its whole path and not only where the pointer events landed.
 */
export function sweepPoints(from: Point, to: Point, step: number): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  }));
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearPolygon(p: Point, points: Point[], tolerance: number): boolean {
  return pointInPolygon(p, points) || points.some((a, i) => distanceToSegment(p, a, points[(i + 1) % points.length]!) <= tolerance);
}

/**
 * Whether the eraser at `p` touches a mark: within `tolerance` board pixels of a line, or on or
 * inside a closed shape (rectangle, circle, area).
 */
export function hitMark(mark: Mark, p: Point, tolerance: number, grid: GridSpec): boolean {
  switch (mark.kind) {
    case "measure": {
      const m = measure(mark.from, mark.to, grid, mark.free, "equal", mark.tokenSize);
      return distanceToSegment(p, m.from, m.to) <= tolerance;
    }
    case "draw": {
      const { from, to } = mark;
      if (mark.shape === "line") return distanceToSegment(p, from, to) <= tolerance;
      if (mark.shape === "circle") return Math.hypot(p.x - from.x, p.y - from.y) <= Math.hypot(to.x - from.x, to.y - from.y) + tolerance;
      return (
        p.x >= Math.min(from.x, to.x) - tolerance && p.x <= Math.max(from.x, to.x) + tolerance &&
        p.y >= Math.min(from.y, to.y) - tolerance && p.y <= Math.max(from.y, to.y) + tolerance
      );
    }
    case "stroke":
    case "route":
      return mark.points.some((a, i) => distanceToSegment(p, a, mark.points[i + 1] ?? a) <= tolerance);
    case "area": {
      const shape = areaShape(mark.shape, areaOrigin(mark.origin, grid, mark.free), mark.toward, mark.size, grid, mark.width);
      if (shape.kind === "circle") return Math.hypot(p.x - shape.center.x, p.y - shape.center.y) <= shape.radius + tolerance;
      return nearPolygon(p, shape.points, tolerance);
    }
  }
}
