import type { AttackRange } from "./attackPresets";
import type { Footprint, GridSpec } from "./geometry";
import type { DiagonalRule } from "./state";

/**
 * Squares walked for `dx` across and `dy` down under a Diagonals rule (ADR 0055): equal cost
 * counts a diagonal as one, alternating as one then two, Euclidean as √2. The board ruler and
 * attack range both count with this, so they always agree (ADR 0067).
 */
export function diagonalSteps(dx: number, dy: number, rule: DiagonalRule): number {
  if (rule === "euclidean") return Math.hypot(dx, dy);
  const long = Math.max(dx, dy), short = Math.min(dx, dy);
  return long + (rule === "alternating" ? Math.floor(short / 2 + 1e-9) : 0);
}

/** The squares a token stands on: columns and rows, inclusive. */
export interface SquareSpan {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

const EPSILON = 1e-6;

/**
 * The squares whose centres lie inside the token's square (`size` squares a side, centred on its
 * position). On an axis where none do, as for a token smaller than one square, the square its
 * centre is in.
 */
export function footprintSquares(token: Footprint, grid: Pick<GridSpec, "cellSize" | "offsetX" | "offsetY">): SquareSpan {
  const half = token.size / 2;
  const axis = (v: number, offset: number) => {
    const centre = (v - offset) / grid.cellSize;
    // Square c's centre is at c + 0.5; inside means strictly between the token's edges.
    const min = Math.ceil(centre - half - 0.5 + EPSILON);
    const max = Math.floor(centre + half - 0.5 - EPSILON);
    if (min <= max) return [min, max] as const;
    const own = Math.floor(centre);
    return [own, own] as const;
  };
  const [minCol, maxCol] = axis(token.position.x, grid.offsetX);
  const [minRow, maxRow] = axis(token.position.y, grid.offsetY);
  return { minCol, maxCol, minRow, maxRow };
}

/** Columns and rows between the nearest squares of two footprints: 0 on an axis where they overlap. */
function gap(a: SquareSpan, b: SquareSpan) {
  return {
    dx: Math.max(0, b.minCol - a.maxCol, a.minCol - b.maxCol),
    dy: Math.max(0, b.minRow - a.maxRow, a.minRow - b.maxRow),
  };
}

/**
 * The distance from one token to another (attack-range): from the nearest square one stands on to
 * the nearest square the other stands on, under the room's Diagonals rule, in the room's units.
 */
export function attackDistance(a: Footprint, b: Footprint, grid: GridSpec, rule: DiagonalRule): number {
  const { dx, dy } = gap(footprintSquares(a, grid), footprintSquares(b, grid));
  return diagonalSteps(dx, dy, rule) * grid.unitsPerCell;
}

/** The two tokens' squares touch at a side or a corner, or overlap, whatever the Diagonals rule. */
export function isAdjacent(a: Footprint, b: Footprint, grid: GridSpec): boolean {
  const { dx, dy } = gap(footprintSquares(a, grid), footprintSquares(b, grid));
  return dx <= 1 && dy <= 1;
}

/**
 * Whether `target` is in range of an attack from `attacker` (attack-range). Range only changes
 * what the attack panel shows; it never stops a roll.
 */
export function inRange(range: AttackRange | undefined, attacker: Footprint, target: Footprint, grid: GridSpec, rule: DiagonalRule): boolean {
  if (!range) return true;
  const within = (limit: number) => attackDistance(attacker, target, grid, rule) <= limit + EPSILON;
  if (range.kind === "melee") return isAdjacent(attacker, target, grid) || (range.reach !== undefined && within(range.reach));
  return within(range.distance);
}
