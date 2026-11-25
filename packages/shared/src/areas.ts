import { pointInPolygon, type Footprint, type GridSpec, type Point } from "./geometry";
import type { AreaShape, AreaTemplate } from "./state";

/**
 * Area outlines (FR-TAC-06, ADR 0059): one definition for the server, which decides from it whether
 * any part of an area is visible to a player, and the board, which draws it.
 */
export type AreaGeometry =
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "polygon"; points: Point[] };

/**
 * An area's outline in board pixels. Size is in grid units. A circle's size is its radius; a
 * cone starts at the origin and is as wide as it is long at its far end; a line starts at the
 * origin and runs toward the aim; a box is a square centred on the origin, turned to face the aim
 * (ADR 0040). A zero-length aim points right.
 */
export function areaShape(shape: AreaShape, origin: Point, toward: Point, size: number, grid: GridSpec, width?: number): AreaGeometry {
  const length = (size / grid.unitsPerCell) * grid.cellSize;
  if (shape === "circle") return { kind: "circle", center: origin, radius: length };

  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };
  const at = (along: number, across: number): Point => ({
    x: origin.x + dir.x * along + perp.x * across,
    y: origin.y + dir.y * along + perp.y * across,
  });

  if (shape === "cone") return { kind: "polygon", points: [origin, at(length, -length / 2), at(length, length / 2)] };
  if (shape === "line") {
    // Starts at the origin and runs `size` toward the aim, `width` across (one cell by default) (KAN-35).
    const half = (((width ?? grid.unitsPerCell) / grid.unitsPerCell) * grid.cellSize) / 2;
    return { kind: "polygon", points: [at(0, -half), at(length, -half), at(length, half), at(0, half)] };
  }
  // A box is centred on its origin, turned to face the aim (ADR 0040).
  const h = length / 2;
  return { kind: "polygon", points: [at(-h, -h), at(h, -h), at(h, h), at(-h, h)] };
}

/** Where a placed template is on the board, as `areaShape` draws it. */
export function templateArea(t: Pick<AreaTemplate, "shape" | "origin" | "toward" | "size" | "width">, grid: GridSpec): AreaGeometry {
  return areaShape(t.shape, t.origin, t.toward, t.size, grid, t.width);
}

/** Board pixels the drawn disc stays inside a token's square, so neighbours' discs never touch. */
const TOKEN_DISC_INSET = 2;

/**
 * The disc the board draws for a token (ADR 0082): centred on its position, `size` cells across
 * less a 2 px inset. One definition for the board and for the filters that decide whether any
 * part of a token is visible to a player, so the two can't drift apart.
 */
export function tokenDisc(token: Pick<Footprint, "position" | "size">, grid: Pick<GridSpec, "cellSize">): AreaGeometry & { kind: "circle" } {
  return { kind: "circle", center: token.position, radius: Math.max(0, (token.size * grid.cellSize) / 2 - TOKEN_DISC_INSET) };
}

/**
 * How far inside the drawn disc a token's visibility is judged, in cells (ADR 0082): a token is
 * sent only once a little more than a sliver of it shows, so fog drawn a few pixels short of a
 * grid line doesn't give away the token beside it.
 */
const TOKEN_DETECTION_INSET_CELLS = 1 / 16;

/** The disc the filters test for whether any part of a token is visible: `tokenDisc`, slightly shrunk. */
export function tokenDetectionDisc(token: Pick<Footprint, "position" | "size">, grid: Pick<GridSpec, "cellSize">): AreaGeometry & { kind: "circle" } {
  const disc = tokenDisc(token, grid);
  return { ...disc, radius: Math.max(0, disc.radius - grid.cellSize * TOKEN_DETECTION_INSET_CELLS) };
}

/** Whether `p` is inside an area's outline (no edge reach). */
export function pointInArea(area: AreaGeometry, p: Point): boolean {
  return area.kind === "circle" ? Math.hypot(p.x - area.center.x, p.y - area.center.y) <= area.radius : pointInPolygon(p, area.points);
}

/** Most lattice points `areaSamples` takes inside one area, so a huge area can't stall a filter. */
const MAX_AREA_SAMPLES = 4096;

/**
 * Points spread over an area, for asking whether any part of it is visible (ADR 0059): its
 * corners (16 points round a circle's rim), its centre or apex, and a lattice inside it every half
 * cell, coarser for a very large area. A visible sliver narrower than the spacing can be missed.
 */
export function areaSamples(area: AreaGeometry, grid: GridSpec): Point[] {
  const edge: Point[] = area.kind === "circle"
    ? [area.center, ...Array.from({ length: 16 }, (_, i) => ({
        x: area.center.x + area.radius * Math.cos((i * Math.PI) / 8),
        y: area.center.y + area.radius * Math.sin((i * Math.PI) / 8),
      }))]
    : area.points;
  const xs = area.kind === "circle" ? [area.center.x - area.radius, area.center.x + area.radius] : area.points.map((p) => p.x);
  const ys = area.kind === "circle" ? [area.center.y - area.radius, area.center.y + area.radius] : area.points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const step = Math.max(grid.cellSize / 2, Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_AREA_SAMPLES), 1);
  const inside: Point[] = [];
  // Each coordinate from an integer index, so a step lost to rounding at a huge coordinate can't loop forever.
  const cols = Math.ceil((maxX - minX) / step), rows = Math.ceil((maxY - minY) / step);
  for (let j = 0; j < rows; j++) {
    const y = minY + step / 2 + j * step;
    if (!(y < maxY)) break;
    for (let i = 0; i < cols; i++) {
      const x = minX + step / 2 + i * step;
      if (!(x < maxX)) break;
      const p = { x, y };
      if (pointInArea(area, p)) inside.push(p);
    }
  }
  return [...edge, ...inside];
}
