import { describe, expect, it } from "vitest";
import {
  cheapestPath,
  emptyRoomState,
  movementBlocked,
  terrainCells,
  type DiagonalRule,
  type DifficultTerrainMode,
  type PathResult,
  type Point,
  type RoomState,
  type TerrainRun,
  type Token,
  type Wall,
} from "../src";

const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const map = { width: 200, height: 200 };
const rules = (diagonal: DiagonalRule = "equal", difficult: DifficultTerrainMode = "entry") => ({ diagonal, difficult });
/** The centre of a token of `size` squares whose top-left square is (col, row). */
const at = (col: number, row: number, size = 1): Point => ({ x: (col + size / 2) * 10, y: (row + size / 2) * 10 });
const cells = (kind: "blocked" | "difficult", ...squares: [number, number][]): TerrainRun[] => squares.map(([col, row]) => ({ row, start: col, end: col, kind }));
const wall = (id: string, a: Point, b: Point): Wall => ({ id, a, b });

function path(from: Point, to: Point, runs: TerrainRun[] = [], walls: Wall[] = [], size = 1, r = rules()): PathResult | null {
  return cheapestPath(from, to, size, grid, r, { kinds: terrainCells(runs), walls, map });
}

/** The server's own check, leg by leg: every path offered must pass it. */
function serverAccepts(from: Point, result: PathResult, to: Point, runs: TerrainRun[], walls: Wall[], size = 1): boolean {
  const base = emptyRoomState("r");
  const state: RoomState = {
    ...base,
    scene: { ...base.scene, grid, map: { url: "/m.png", ...map } },
    terrain: { base: runs, effects: [] },
    walls: Object.fromEntries(walls.map((w) => [w.id, w])),
  };
  const token: Token = { id: "t", name: "T", position: from, size, rotation: 0, color: "#000", imageUrl: null, ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [] };
  const points = [from, ...result.via, to];
  return points.slice(1).every((p, i) => !movementBlocked(state, { ...token, position: points[i]! }, p));
}

describe("cheapest path (FR-TAC-03, ADR 0055)", () => {
  it("goes straight over open ground with no turns", () => {
    const result = path(at(0, 0), at(5, 0))!;
    expect(result.via).toEqual([]);
    expect(result.cost).toBe(25);
  });

  it("routes around a Blocked wall of squares, and the server accepts every leg", () => {
    const runs = cells("blocked", [3, 0], [3, 1], [3, 2]);
    const result = path(at(0, 1), at(6, 1), runs)!;
    expect(result).not.toBeNull();
    expect(result.cells.some((c) => c.col === 3 && c.row <= 2)).toBe(false);
    expect(serverAccepts(at(0, 1), result, at(6, 1), runs, [])).toBe(true);
  });

  it("takes a longer route with no Difficult squares over a shorter Difficult one", () => {
    // Straight along row 0 crosses three Difficult squares (cost 3 extra); a detour through row 1 costs nothing extra.
    const runs = cells("difficult", [2, 0], [3, 0], [4, 0]);
    const result = path(at(0, 0), at(6, 0), runs)!;
    expect(result.difficult).toBe(0);
    expect(result.cost).toBe(30);
  });

  it("never cuts a corner past a Blocked square or along a wall", () => {
    const runs = cells("blocked", [1, 0]);
    // From (0,0) to (1,1): the diagonal would sweep (1,0); the path must go through (0,1) instead.
    const result = path(at(0, 0), at(1, 1), runs)!;
    expect(result.cells).toEqual([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]);
    const walls = [wall("w", { x: 10, y: 0 }, { x: 10, y: 10 })];
    const byWall = path(at(0, 0), at(1, 1), [], walls)!;
    expect(serverAccepts(at(0, 0), byWall, at(1, 1), [], walls)).toBe(true);
    expect(byWall.cells.map((c) => `${c.col},${c.row}`)).not.toContain("1,0");
  });

  it("finds no path into a square ringed by Blocked terrain", () => {
    const ring = cells("blocked", [4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]);
    expect(path(at(0, 0), at(5, 5), ring)).toBeNull();
  });

  it("chooses the same path every time and, among equal costs, hugs the straight line", () => {
    const a = path(at(0, 0), at(4, 2));
    const b = path(at(0, 0), at(4, 2));
    expect(a).toEqual(b);
    // Four steps either way under Equal cost; the default stays within half a square of the line.
    expect(a!.cost).toBe(20);
    const offLine = (c: { col: number; row: number }) => Math.abs(c.col * 2 - c.row * 4) / Math.hypot(4, 2);
    expect(Math.max(...a!.cells.map(offLine))).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("turns as little as possible when asked to", () => {
    const fewest = cheapestPath(at(0, 0), at(4, 2), 1, grid, rules(), { kinds: terrainCells([]), walls: [], map }, "turns")!;
    expect(fewest.cost).toBe(20);
    expect(fewest.via).toHaveLength(1);
  });

  it("only takes a two-square token through gaps two squares wide", () => {
    // A column of Blocked at col 5 with a one-square gap at row 3 and a two-square gap at rows 8-9.
    const column = cells("blocked", ...[0, 1, 2, 4, 5, 6, 7, 10, 11, 12].map((row): [number, number] => [5, row]));
    const small = path(at(0, 3), at(8, 3), column)!;
    expect(small.cells.some((c) => c.col === 5 && c.row === 3)).toBe(true);
    const large = path(at(0, 2, 2), at(8, 2, 2), column, [], 2)!;
    expect(large.cells.some((c) => c.col === 5 && c.row === 3)).toBe(false);
    expect(large.cells.some((c) => c.col === 5 && c.row === 8)).toBe(true);
    expect(serverAccepts(at(0, 2, 2), large, at(8, 2, 2), column, [], 2)).toBe(true);
  });

  it("uses the Alternating rule: three diagonals cost 20 ft", () => {
    expect(path(at(0, 0), at(3, 3), [], [], 1, rules("alternating"))!.cost).toBe(20);
  });

  it("treats ground the client knows nothing about as passable Normal ground", () => {
    // A player's client holds no terrain for these squares: the path goes straight through.
    expect(path(at(0, 0), at(5, 0))!.via).toEqual([]);
  });

  it("only ever offers paths the server accepts, on random layouts", () => {
    // A fixed pseudo-random sequence, so the test is repeatable.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let checked = 0;
    for (let layout = 0; layout < 40; layout++) {
      const blocked = Array.from({ length: 18 }, (): [number, number] => [Math.floor(rand() * 14), Math.floor(rand() * 14)]);
      const runs = cells("blocked", ...blocked);
      const walls = Array.from({ length: 6 }, (_, i) => {
        const x = Math.floor(rand() * 14) * 10, y = Math.floor(rand() * 14) * 10;
        return rand() < 0.5 ? wall(`w${i}`, { x, y }, { x: x + 30, y }) : wall(`w${i}`, { x, y }, { x, y: y + 30 });
      });
      const size = rand() < 0.3 ? 2 : 1;
      const from = at(Math.floor(rand() * 12), Math.floor(rand() * 12), size), to = at(Math.floor(rand() * 12), Math.floor(rand() * 12), size);
      const start = terrainCells(runs);
      const clearStart = [0, 1].slice(0, size).every((dr) => [0, 1].slice(0, size).every((dc) => start.get(`${Math.floor(from.y / 10 - size / 2) + dr}:${Math.floor(from.x / 10 - size / 2) + dc}`) !== "blocked"));
      if (!clearStart) continue;
      const result = path(from, to, runs, walls, size);
      if (!result) continue;
      checked++;
      expect(serverAccepts(from, result, to, runs, walls, size), `layout ${layout}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("gives up within its search limit instead of searching a huge open map forever", () => {
    const ring = cells("blocked", [80, 80], [81, 80], [82, 80], [80, 81], [82, 81], [80, 82], [81, 82], [82, 82]);
    const started = performance.now();
    const result = cheapestPath(at(0, 0), at(81, 81), 1, grid, rules(), { kinds: terrainCells(ring), walls: [], map: { width: 2000, height: 2000 } });
    expect(result).toBeNull();
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("finds long diagonal paths under every Diagonals rule well within its limit", () => {
    const wide = { kinds: terrainCells([]), walls: [], map: { width: 3000, height: 3000 } };
    for (const diagonal of ["equal", "alternating", "euclidean"] as const) {
      const result = cheapestPath(at(0, 0), at(60, 60), 1, grid, rules(diagonal), wide);
      expect(result, diagonal).not.toBeNull();
    }
    expect(cheapestPath(at(0, 0), at(60, 60), 1, grid, rules("alternating"), wide)!.cost).toBe(90 * 5);
  });

  it("refuses a target off the map", () => {
    expect(path(at(0, 0), { x: 500, y: 5 })).toBeNull();
  });
});
