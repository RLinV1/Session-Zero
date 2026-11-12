import { cellAt, clearanceSweepTouchesWall, clearanceTouchesWall, type GridSpec, type Point, type Segment } from "./geometry";
import { blocksMovement } from "./portals";
import { effectiveTerrain, emptyTerrain, movementTerrain, terrainCells, type TerrainKind, type TerrainRun } from "./terrain";
import { diagonalRuleOf, difficultTerrainOf, type DiagonalRule, type DifficultTerrainMode, type RoomState, type Token, type Wall } from "./state";

function footprintBlocked(grid: GridSpec, walls: Wall[], terrain: TerrainRun[], size: number, to: Point): boolean {
  return clearanceTouchesWall(to, size, grid, walls) || movementTerrain(to, to, size, grid, terrain).blocked;
}

/** A resize or Reposition must end clear of physical obstructions, regardless of its origin. */
export function destinationBlocked(state: RoomState, size: number, to: Point): boolean {
  return footprintBlocked(state.scene.grid, Object.values(state.walls).filter(blocksMovement), effectiveTerrain(state.terrain ?? emptyTerrain()), size, to);
}

/** What obstructs movement in a room: blocking walls and effective terrain. Worked out once per move (ADR 0055). */
export interface MovementObstacles { walls: Wall[]; terrain: TerrainRun[] }
export function movementObstacles(state: Pick<RoomState, "walls" | "terrain">): MovementObstacles {
  return { walls: Object.values(state.walls).filter(blocksMovement), terrain: effectiveTerrain(state.terrain ?? emptyTerrain()) };
}

/**
 * Physical restrictions for an authorized move; fog and sight only conceal, never obstruct. Pass
 * `obstacles` when checking several legs of one path, so they are worked out once.
 */
export function movementBlocked(state: RoomState, token: Token, to: Point, reposition = false, obstacles: MovementObstacles = movementObstacles(state)): boolean {
  const grid = state.scene.grid;
  const { walls, terrain } = obstacles;
  if (footprintBlocked(grid, walls, terrain, token.size, to)) return true;
  if (reposition) return false;
  if (movementTerrain(token.position, to, token.size, grid, terrain).blocked) return true;
  const ahead = walls.filter((w) => !clearanceTouchesWall(token.position, token.size, grid, [w]));
  return clearanceSweepTouchesWall(token.position, to, token.size, grid, ahead);
}

/** The room's movement rules a step is costed under (ADR 0055). */
export interface StepRules { diagonal: DiagonalRule; difficult: DifficultTerrainMode }
export const stepRulesOf = (state: Pick<RoomState, "diagonalRule" | "difficultTerrain">): StepRules => ({ diagonal: diagonalRuleOf(state), difficult: difficultTerrainOf(state) });

export interface Cell { col: number; row: number }
/** The top-left square of a token of `size` squares centred at `center`. */
export function anchorOf(center: Point, size: number, grid: GridSpec): Cell {
  return cellAt({ x: center.x - ((size - 1) * grid.cellSize) / 2, y: center.y - ((size - 1) * grid.cellSize) / 2 }, grid);
}
/** Where a token of `size` squares is centred when its top-left square is `anchor`. */
export function centerOf(anchor: Cell, size: number, grid: GridSpec): Point {
  return { x: grid.offsetX + (anchor.col + size / 2) * grid.cellSize, y: grid.offsetY + (anchor.row + size / 2) * grid.cellSize };
}
function footprint(anchor: Cell, size: number, kinds: ReadonlyMap<string, TerrainKind>): { difficult: boolean; blocked: boolean } {
  let difficult = false, blocked = false;
  for (let row = anchor.row; row < anchor.row + size; row++) {
    for (let col = anchor.col; col < anchor.col + size; col++) {
      const kind = kinds.get(`${row}:${col}`);
      if (kind === "blocked") blocked = true;
      else if (kind === "difficult") difficult = true;
    }
  }
  return { difficult, blocked };
}

/**
 * One footprint step's cost in squares (ADR 0055), or null when it lands on Blocked ground.
 * `from` and `to` are adjacent anchors; `diagonalIndex` counts this move's diagonals from 1, so
 * Alternating makes every second one cost 2. Difficult doubles the step at most once: under the
 * landing footprint (entry), the leaving one (exit), or either (both). `kinds` is the viewer's terrain.
 */
export function stepCost(step: { from: Cell; to: Cell; diagonalIndex: number }, size: number, rules: StepRules, kinds: ReadonlyMap<string, TerrainKind>): number | null {
  const diagonal = step.from.col !== step.to.col && step.from.row !== step.to.row;
  const base = !diagonal ? 1 : rules.diagonal === "euclidean" ? Math.SQRT2 : rules.diagonal === "alternating" && step.diagonalIndex % 2 === 0 ? 2 : 1;
  const landing = footprint(step.to, size, kinds);
  if (landing.blocked) return null;
  const leaving = rules.difficult === "entry" ? false : footprint(step.from, size, kinds).difficult;
  const doubled = rules.difficult === "entry" ? landing.difficult : rules.difficult === "exit" ? leaving : landing.difficult || leaving;
  return doubled ? base * 2 : base;
}

const MAX_RULER_STEPS = 5000;

/**
 * Ruler cost over painted terrain (FR-TAC-03): steps square by square along the straight line,
 * each costed by `stepCost` under the room's rules; a step onto Blocked ground flags the path and
 * counts its base length. `runs` must already be viewer-filtered (effective terrain for the GM,
 * `terrainView.runs` otherwise). `difficult` counts the doubled steps.
 */
export function rulerPathCost(from: Point, to: Point, grid: GridSpec, rules: StepRules, runs: readonly TerrainRun[]): RouteCost {
  return routeCost([from, to], grid, rules, runs);
}

export interface RouteCost { cells: number; cost: number; difficult: number; blocked: boolean }

/**
 * The cost of a placed route (ruler Movement mode): a straight run of squares between each pair of
 * points, every step costed as `rulerPathCost` does, with one Alternating diagonal count across the
 * whole route so it continues around turns. Each run is capped at the ruler's step limit.
 */
export function routeCost(points: readonly Point[], grid: GridSpec, rules: StepRules, runs: readonly TerrainRun[]): RouteCost {
  const kinds = terrainCells(runs);
  const out = { cells: 0, cost: 0, difficult: 0, blocked: false };
  let diagonals = 0;
  for (let leg = 1; leg < points.length; leg++) {
    const a = cellAt(points[leg - 1]!, grid), b = cellAt(points[leg]!, grid);
    const dc = b.col - a.col, dr = b.row - a.row, n = Math.min(Math.max(Math.abs(dc), Math.abs(dr)), MAX_RULER_STEPS);
    let at: Cell = a;
    for (let i = 1; i <= n; i++) {
      const next = { col: a.col + Math.round(dc * i / n), row: a.row + Math.round(dr * i / n) };
      if (next.col !== at.col && next.row !== at.row) diagonals++;
      const cost = stepCost({ from: at, to: next, diagonalIndex: diagonals }, 1, rules, kinds);
      const base = stepCost({ from: at, to: next, diagonalIndex: diagonals }, 1, rules, NO_TERRAIN)!;
      if (cost === null) { out.blocked = true; out.cost += base; } else { if (cost > base + 1e-9) out.difficult++; out.cost += cost; }
      at = next;
    }
    out.cells += n;
  }
  out.cost *= grid.unitsPerCell;
  return out;
}
const NO_TERRAIN: ReadonlyMap<string, TerrainKind> = new Map();

/** Search states (square x Alternating parity x heading) the path search may settle before giving up. */
export const MAX_PATH_NODES = 60_000;
/** How far, in squares, the search may stray outside the box around the start and the goal. */
const PATH_MARGIN = 16;
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

/** What the mover's client holds: terrain by square, and the walls that block movement. */
export interface PathKnowledge { kinds: ReadonlyMap<string, TerrainKind>; walls: readonly Segment[]; map: { width: number; height: number } }
export interface PathResult {
  /** Every square the token's top-left passes through, start first. */
  cells: Cell[];
  /** The token centres where the path turns, start and end excluded: what `token.move` carries. */
  via: Point[];
  /** Movement cost in grid units. */
  cost: number;
  /** Steps doubled by Difficult terrain. */
  difficult: number;
}

/** Walls bucketed by the squares their bounding boxes touch, so a step tests only nearby walls. */
function wallIndex(walls: readonly Segment[], grid: GridSpec): (min: Cell, max: Cell) => Segment[] {
  const buckets = new Map<string, Segment[]>();
  for (const w of walls) {
    const a = cellAt({ x: Math.min(w.a.x, w.b.x), y: Math.min(w.a.y, w.b.y) }, grid);
    const b = cellAt({ x: Math.max(w.a.x, w.b.x), y: Math.max(w.a.y, w.b.y) }, grid);
    if ((b.col - a.col + 1) * (b.row - a.row + 1) > 4096) { (buckets.get("*") ?? buckets.set("*", []).get("*")!).push(w); continue; }
    for (let row = a.row; row <= b.row; row++) for (let col = a.col; col <= b.col; col++) {
      const key = `${row}:${col}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(w);
    }
  }
  return (min, max) => {
    const found = new Set<Segment>(buckets.get("*") ?? []);
    for (let row = min.row - 1; row <= max.row + 1; row++) for (let col = min.col - 1; col <= max.col + 1; col++) for (const w of buckets.get(`${row}:${col}`) ?? []) found.add(w);
    return [...found];
  };
}

/** How the search breaks ties between paths of equal cost: hugging the straight line, or turning least. */
export type PathPreference = "line" | "turns";

/**
 * The cheapest path for a token of whole-number `size` from the square it is centred on to the one
 * centred at `to` (ADR 0055), costed by `stepCost`. Among equal costs, `prefer` picks the one whose
 * squares stay closest to the straight line from start to end ("line"), or the one with fewest turns
 * ("turns"). A step must land clear of Blocked terrain and walls and sweep past neither, by the same
 * rules the server applies to each leg, so a path offered here is never refused for what the client
 * knows. Null when there is none or the search is too large. `via` may exceed MAX_MOVE_VIA; the caller
 * decides what to do then.
 */
export function cheapestPath(from: Point, to: Point, size: number, grid: GridSpec, rules: StepRules, knowledge: PathKnowledge, prefer: PathPreference = "line"): PathResult | null {
  const start = anchorOf(from, size, grid), goal = anchorOf(to, size, grid);
  const centre = (c: Cell) => centerOf(c, size, grid);
  const onMap = (c: Cell) => { const p = centre(c); return p.x >= 0 && p.y >= 0 && p.x <= knowledge.map.width && p.y <= knowledge.map.height; };
  if (!onMap(goal)) return null;
  const box = {
    minCol: Math.min(start.col, goal.col) - PATH_MARGIN, maxCol: Math.max(start.col, goal.col) + PATH_MARGIN,
    minRow: Math.min(start.row, goal.row) - PATH_MARGIN, maxRow: Math.max(start.row, goal.row) + PATH_MARGIN,
  };
  const near = wallIndex(knowledge.walls, grid);
  const passable = new Map<string, boolean>();
  /** Whether the footprint may step from `a` to the adjacent `b`: sweeps no Blocked square and no wall, lands clear. */
  const canStep = (a: Cell, b: Cell): boolean => {
    const key = `${a.col},${a.row}>${b.col},${b.row}`;
    const cached = passable.get(key);
    if (cached !== undefined) return cached;
    // One square's sweep covers the whole box around both footprints, diagonal or not.
    const min = { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) };
    const max = { col: Math.max(a.col, b.col) + size - 1, row: Math.max(a.row, b.row) + size - 1 };
    let ok = true;
    for (let row = min.row; ok && row <= max.row; row++) for (let col = min.col; ok && col <= max.col; col++) if (knowledge.kinds.get(`${row}:${col}`) === "blocked") ok = false;
    if (ok) {
      const walls = near(min, max);
      if (walls.length) {
        const pa = centre(a), pb = centre(b);
        const ahead = walls.filter((w) => !clearanceTouchesWall(pa, size, grid, [w]));
        ok = !clearanceTouchesWall(pb, size, grid, walls) && !clearanceSweepTouchesWall(pa, pb, size, grid, ahead);
      }
    }
    passable.set(key, ok);
    return ok;
  };

  // A* over (square, Alternating parity), plus the heading when turns are counted; heading 8 is
  // "not moved yet". Cost first, then the tie-break: turns, or distance from the straight line.
  type Node = { col: number; row: number; parity: number; dir: number; g: number; turns: number; f: number; diagonals: number; difficult: number; parent: Node | null };
  const byTurns = prefer === "turns";
  const lineX = goal.col - start.col, lineY = goal.row - start.row, lineLength = Math.hypot(lineX, lineY);
  /** How far a square sits from the straight line between the start and the goal, in squares. */
  const offLine = (c: Cell) => (lineLength === 0 ? 0 : Math.abs((c.col - start.col) * lineY - (c.row - start.row) * lineX) / lineLength);
  // A lower bound on the cost left under the Diagonals rule, so the search heads straight for the goal.
  const heuristic = (c: Cell) => {
    const dx = Math.abs(c.col - goal.col), dy = Math.abs(c.row - goal.row), long = Math.max(dx, dy), short = Math.min(dx, dy);
    return rules.diagonal === "euclidean" ? long - short + Math.SQRT2 * short : rules.diagonal === "alternating" ? long + Math.floor(short / 2) : long;
  };
  const keyOf = (col: number, row: number, parity: number, dir: number) => `${col},${row},${parity},${byTurns ? dir : 0}`;
  const best = new Map<string, { g: number; turns: number }>();
  const heap: Node[] = [];
  const less = (x: Node, y: Node) => x.f < y.f - 1e-9 || (Math.abs(x.f - y.f) <= 1e-9 && x.turns < y.turns - 1e-9);
  const push = (n: Node) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!less(heap[i]!, heap[p]!)) break; [heap[i], heap[p]] = [heap[p]!, heap[i]!]; i = p; }
  };
  const pop = (): Node => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!]; i = m;
      }
    }
    return top;
  };
  const alternating = rules.diagonal === "alternating";
  push({ ...start, parity: 0, dir: 8, g: 0, turns: 0, f: heuristic(start), diagonals: 0, difficult: 0, parent: null });
  let settled = 0, found: Node | null = null;
  while (heap.length) {
    const n = pop();
    const seen = best.get(keyOf(n.col, n.row, n.parity, n.dir));
    if (seen && (seen.g < n.g - 1e-9 || (Math.abs(seen.g - n.g) <= 1e-9 && seen.turns < n.turns - 1e-9))) continue;
    if (n.col === goal.col && n.row === goal.row) { found = n; break; }
    if (++settled > MAX_PATH_NODES) return null;
    for (let d = 0; d < 8; d++) {
      const [dc, dr] = DIRECTIONS[d]!;
      const next = { col: n.col + dc, row: n.row + dr };
      if (next.col < box.minCol || next.col > box.maxCol || next.row < box.minRow || next.row > box.maxRow || !onMap(next)) continue;
      const diagonal = dc !== 0 && dr !== 0;
      const diagonals = n.diagonals + (diagonal ? 1 : 0);
      const cost = stepCost({ from: n, to: next, diagonalIndex: diagonals }, size, rules, knowledge.kinds);
      if (cost === null || !canStep(n, next)) continue;
      const base = stepCost({ from: n, to: next, diagonalIndex: diagonals }, size, rules, NO_TERRAIN)!;
      // `turns` carries the tie-break: turns taken, or the summed distance from the straight line.
      const g = n.g + cost, turns = n.turns + (byTurns ? (n.dir !== 8 && n.dir !== d ? 1 : 0) : offLine(next));
      const parity = alternating ? diagonals % 2 : 0;
      const key = keyOf(next.col, next.row, parity, d);
      const prior = best.get(key);
      if (prior && (prior.g < g - 1e-9 || (Math.abs(prior.g - g) <= 1e-9 && prior.turns <= turns + 1e-9))) continue;
      best.set(key, { g, turns });
      push({ ...next, parity, dir: d, g, turns, f: g + heuristic(next), diagonals, difficult: n.difficult + (cost > base + 1e-9 ? 1 : 0), parent: n });
    }
  }
  if (!found) return null;
  const chain: Node[] = [];
  for (let n: Node | null = found; n; n = n.parent) chain.push(n);
  chain.reverse();
  const via: Point[] = [];
  for (let i = 1; i < chain.length - 1; i++) if (chain[i]!.dir !== chain[i + 1]!.dir) via.push(centre(chain[i]!));
  return { cells: chain.map(({ col, row }) => ({ col, row })), via, cost: found.g * grid.unitsPerCell, difficult: found.difficult };
}
