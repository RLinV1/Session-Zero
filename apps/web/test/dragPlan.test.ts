import { describe, expect, it } from "vitest";
import { emptyRoomState, filterStateForViewer, type Participant, type RoomState, type TerrainRun, type Token } from "@vtt/shared";
import { dragPlan } from "../src/board/movementRuler";

const gm: Participant = { id: "g", role: "gm", displayName: "G" };
const player: Participant = { id: "p", role: "player", displayName: "P" };
const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
const hero: Token = { id: "t", name: "Hero", position: at(0, 1), size: 1, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [player.id], hidden: false, conditions: [], stats: { hp: null, maxHp: null, ac: null } };
const cells = (kind: "blocked" | "difficult", ...squares: [number, number][]): TerrainRun[] => squares.map(([col, row]) => ({ row, start: col, end: col, kind }));

function room(runs: TerrainRun[] = [], extra: Partial<RoomState> = {}): RoomState {
  const base = emptyRoomState("r");
  return { ...base, scene: { ...base.scene, grid, map: { url: "/m.png", width: 700, height: 700 } }, tokens: { t: hero }, terrain: { base: runs, effects: [] }, ...extra };
}
const plan = (state: RoomState, to: { x: number; y: number }, you = gm, free = false, reposition = false) => dragPlan(state, you, hero, hero.position, to, free, reposition);

describe("token drag plans (FR-TAC-03, ADR 0055)", () => {
  it("costs A, D1, D2, B per the room's Difficult terrain rule, as plain distance", () => {
    // Columns 1 and 2 are Difficult from top to bottom, so there is no cheaper way round.
    const crossing = cells("difficult", ...Array.from({ length: 10 }, (_, row) => [[1, row], [2, row]] as [number, number][]).flat());
    expect(plan(room(crossing), at(3, 1))).toMatchObject({ via: [], label: "25 ft · 2 difficult", obstruction: "clear" });
    expect(plan(room(crossing, { difficultTerrain: "both" }), at(3, 1)).label).toBe("30 ft · 3 difficult");
  });

  it("follows the path around a Blocked wall of squares and sends its turns", () => {
    const wall = cells("blocked", [2, 0], [2, 1], [2, 2]);
    const result = plan(room(wall), at(4, 1));
    expect(result.via.length).toBeGreaterThan(0);
    expect(result.points[0]).toEqual(hero.position);
    expect(result.points.at(-1)).toEqual(at(4, 1));
  });

  it("falls back to a straight line, marked blocked, into a square ringed by Blocked terrain", () => {
    const ring = cells("blocked", [4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]);
    expect(plan(room(ring), at(5, 5))).toMatchObject({ points: [hero.position, at(5, 5)], via: [], obstruction: "blocked" });
  });

  it("detours around Difficult squares when that is cheaper", () => {
    const patch = cells("difficult", [1, 1], [2, 1]);
    const result = plan(room(patch), at(3, 1));
    expect(result.via.length).toBeGreaterThan(0);
    // Under Equal cost a diagonal step costs 1, so diagonal, straight, diagonal around the patch is 15 ft.
    expect(result.label).toBe("15 ft");
  });

  it("hugs the straight line, and turns least when hugging it would need too many turns", () => {
    const close = plan(room(), at(4, 3));
    expect(close.via.length).toBeGreaterThan(1);
    // 150 across and 75 down on a big map: the line-hugging staircase turns far more than 64 times.
    const big = room([], { scene: { ...room().scene, map: { url: "/m.png", width: 20000, height: 20000 } } });
    const far = plan(big, at(150, 76));
    expect(far.via.length).toBeGreaterThan(0);
    expect(far.via.length).toBeLessThanOrEqual(64);
  });

  it("keeps a straight line showing distance only when dragged with Alt or Repositioned", () => {
    const crossing = cells("difficult", [1, 1], [2, 1]);
    expect(plan(room(crossing), at(3, 1), gm, true)).toMatchObject({ via: [], points: [hero.position, at(3, 1)], label: "15 ft" });
    expect(plan(room(crossing), at(3, 1), gm, false, true)).toMatchObject({ via: [], label: "15 ft · Reposition" });
  });

  it("prices a player's path through fog from what they hold, never \"Cost unknown\"", () => {
    const fogged = room([], { fog: { f: { id: "f", shape: "rect", points: [{ x: 140, y: 0 }, { x: 280, y: 0 }, { x: 280, y: 700 }, { x: 140, y: 700 }] } } });
    const seen = filterStateForViewer(fogged, player);
    expect(plan(seen, at(5, 1), player)).toMatchObject({ label: "25 ft", obstruction: "clear" });
  });

  it("labels a drag with its cost alone, never the allowance or what remains", () => {
    expect(plan(room(), at(3, 1)).label).toBe("15 ft");
  });
});
