import { pointInPolygon, type GridSpec, type Point } from "./geometry";
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
