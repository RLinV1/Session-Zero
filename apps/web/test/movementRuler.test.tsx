// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { measure } from "../src/board/tools";
import { emptyRoomState, filterStateForViewer, type Participant, type RoomState, type TerrainRun, type Token, type Wall } from "@vtt/shared";
import { costLabel, dragPlan, rangeMeasure, routePlan } from "../src/board/movementRuler";
import { MovementControls, useRulerMode } from "../src/board/MovementControls";

afterEach(() => { cleanup(); localStorage.clear(); });
const grid = { ...DEFAULT_GRID, offsetX: 10, offsetY: 20 };
const a = { x: 45, y: 55 };
const b = (x: number, y: number) => ({ x: a.x + x * 70, y: a.y + y * 70 });

describe("personal movement ruler (FR-TAC-03)", () => {
  it("retains equal-cost defaults and supports all three diagonal rules", () => {
    expect(measure(a, b(3, 3), grid, false).units).toBe(15);
    expect(measure(a, b(3, 3), grid, false, "alternating").units).toBe(20);
    expect(measure(a, b(4, 4), grid, false, "alternating").units).toBe(30);
    expect(measure(a, b(4, 2), grid, false, "alternating").units).toBe(25);
    expect(measure(a, b(3, 4), grid, false, "euclidean").units).toBe(25);
    for (const rule of ["equal", "alternating", "euclidean"] as const) {
      expect(measure(a, b(6, 0), grid, false, rule).units).toBe(30);
      expect(measure(a, b(3, 4), grid, true, rule).units).toBe(25);
    }
  });
  it("retains exact grid distances on fractional cell sizes", () => {
    const fractional = { ...grid, cellSize: 0.1, offsetX: 0, offsetY: 0 };
    expect(measure({ x: 0.05, y: 0.05 }, { x: 0.35, y: 0.05 }, fractional, false).units).toBe(15);
  });
  it("preserves the exact origin and previews the actual token destination snap", () => {
    const from = { x: 20, y: 20 };
    const m = measure(from, { x: 105, y: 35 }, DEFAULT_GRID, false, "equal", 1);
    expect(m.from).toEqual(from);
    expect(m.to).toEqual({ x: 105, y: 35 });
    expect(m.units).toBeCloseTo(85 / 70 * 5);
    for (const size of [1, 2, 3, 4]) {
      const centre = size % 2 === 0 ? { x: 80, y: 90 } : a;
      const moved = measure(centre, { x: centre.x + 140, y: centre.y }, grid, false, "equal", size);
      expect(moved.from).toEqual(centre);
      expect(moved.to).toEqual({ x: centre.x + 140, y: centre.y });
      expect(moved.units).toBe(10);
      expect(measure(centre, centre, grid, false, "equal", size).units).toBe(0);
    }
    expect(measure(a, b(2, 0), { ...grid, unitsPerCell: 1.5, unitLabel: "m" }, false).label).toBe("3 m");
  });
  it("labels a cost as plain distance, never against the allowance", () => {
    expect(costLabel(20, 0, grid)).toBe("20 ft");
    expect(costLabel(40, 2, grid)).toBe("40 ft · 2 difficult");
  });
});

/** The board's wiring: the remembered mode, passed to the controls. */
function Controls() {
  const [mode, setMode] = useRulerMode();
  return <MovementControls mode={mode} onMode={setMode} />;
}

describe("ruler modes (ruler-modes)", () => {
  it("starts in Range, switches to Movement, and remembers it after a remount", () => {
    const { unmount } = render(<Controls />);
    expect(screen.getByRole("button", { name: "Range" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Movement" }));
    expect(screen.getByRole("button", { name: "Movement" }).getAttribute("aria-pressed")).toBe("true");
    unmount();
    render(<Controls />);
    expect(screen.getByRole("button", { name: "Movement" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers no movement budget in either mode: rulers show length only", () => {
    render(<Controls />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Movement" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});

const gm: Participant = { id: "g", role: "gm", displayName: "G" };
const player: Participant = { id: "p", role: "player", displayName: "P" };
const square = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
const runs = (kind: "blocked" | "difficult", ...cells: [number, number][]): TerrainRun[] => cells.map(([col, row]) => ({ row, start: col, end: col, kind }));
function board(terrain: TerrainRun[] = [], extra: Partial<RoomState> = {}): RoomState {
  const base = emptyRoomState("r");
  return { ...base, scene: { ...base.scene, map: { url: "/m.png", width: 700, height: 700 } }, terrain: { base: terrain, effects: [] }, ...extra };
}

describe("Range mode labels (ruler-modes)", () => {
  it("ignores terrain: three squares across two Difficult squares read 15 ft", () => {
    const s = board(runs("difficult", [1, 0], [2, 0]));
    expect(rangeMeasure(s, square(0, 0), square(3, 0), false).label).toBe("15 ft");
  });
  it("follows the Diagonals rule: three Alternating diagonals read 20 ft", () => {
    expect(rangeMeasure(board([], { diagonalRule: "alternating" }), square(0, 0), square(3, 3), false).label).toBe("20 ft");
  });
});

describe("Movement mode route labels (ruler-modes)", () => {
  it("reads 30 ft for right 3 then down 3 on open ground", () => {
    expect(routePlan(board(), gm, [square(0, 0), square(3, 0), square(3, 3)]).label).toBe("30 ft");
  });
  it("counts Difficult squares on a run with no cheaper way round", () => {
    // Columns 1 and 2 are Difficult top to bottom, so the route must cross them.
    const crossing = runs("difficult", ...Array.from({ length: 10 }, (_, row) => [[1, row], [2, row]] as [number, number][]).flat());
    expect(routePlan(board(crossing), gm, [square(0, 0), square(3, 0)]).label).toBe("25 ft · 2 difficult");
  });
  it("reads Blocked when no path reaches a stop", () => {
    const ring = runs("blocked", [4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]);
    const plan = routePlan(board(ring), gm, [square(0, 0), square(5, 5)]);
    expect(plan).toMatchObject({ label: "Blocked", blocked: true, points: [square(0, 0), square(5, 5)] });
  });
  it("costs fogged Difficult squares as Normal for a player", () => {
    const fog = { f: { id: "f", shape: "rect" as const, points: [{ x: 70, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 70 }, { x: 70, y: 70 }] } };
    const s = board(runs("difficult", [1, 0], [2, 0]), { fog, participants: { p: player } });
    expect(routePlan(filterStateForViewer(s, player), player, [square(0, 0), square(3, 0)]).label).toBe("15 ft");
  });
});

describe("Movement mode routes each leg like a drag (ruler-modes)", () => {
  const token = (size: number, position = square(0, 1)): Token => ({
    id: "t", name: "Hero", position, size, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [player.id], hidden: false,
    conditions: [], stats: { hp: null, maxHp: null, ac: null },
  });
  // A wall down the line between columns 2 and 3, rows 0 to 2, with the way round below it.
  const wall: Wall = { id: "w", a: { x: 210, y: 0 }, b: { x: 210, y: 210 } };

  it("bends around a wall the viewer knows of", () => {
    const plan = routePlan(board([], { walls: { w: wall } }), gm, [square(1, 1), square(4, 1)]);
    expect(plan.blocked).toBe(false);
    expect(plan.points.length).toBeGreaterThan(2);
    expect(plan.points.some((p) => p.y >= square(0, 3).y)).toBe(true);
  });

  it("goes around a Blocked patch without being marked Blocked", () => {
    const plan = routePlan(board(runs("blocked", [2, 0], [2, 1], [2, 2])), gm, [square(0, 1), square(4, 1)]);
    expect(plan.blocked).toBe(false);
    expect(plan.label).not.toBe("Blocked");
  });

  it("shows the same route and cost as dragging the same 2-square token", () => {
    const corner = (col: number, row: number) => ({ x: col * 70, y: row * 70 });
    const hero = token(2, corner(1, 2));
    const s = board(runs("blocked", [3, 0], [3, 1], [3, 2], [3, 3]), { tokens: { t: hero } });
    const drag = dragPlan(s, gm, hero, hero.position, corner(6, 2), false, false);
    const ruler = routePlan(s, gm, [hero.position, corner(6, 2)], 2);
    expect(drag.via.length).toBeGreaterThan(0);
    expect(ruler.points).toEqual(drag.points);
    expect(ruler.label).toBe(drag.label);
  });

  it("passes through every stop", () => {
    const plan = routePlan(board(), gm, [square(0, 0), square(2, 3), square(4, 0)]);
    expect(plan.points).toContainEqual(square(2, 3));
    expect(plan.label).toBe("30 ft");
  });

  it("does not mark a route ending on a token Blocked", () => {
    const goblin = { ...token(1, square(3, 0)), id: "g", name: "Goblin", ownerIds: [] };
    const plan = routePlan(board([], { tokens: { g: goblin } }), gm, [square(0, 0), square(3, 0)]);
    expect(plan).toMatchObject({ label: "15 ft", blocked: false });
  });

  it("runs straight through a wall a player's state doesn't hold", () => {
    const s = board([], { walls: { w: wall }, fog: { f: { id: "f", shape: "rect" as const, points: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 700 }, { x: 0, y: 700 }] } }, participants: { p: player } });
    const view = filterStateForViewer(s, player);
    expect(Object.keys(view.walls)).toHaveLength(0);
    const plan = routePlan(view, player, [square(1, 1), square(4, 1)]);
    expect(plan.points).toEqual([square(1, 1), square(4, 1)]);
    expect(plan.label).toBe("15 ft");
  });

  it("keeps straight legs from a token of fractional size", () => {
    const s = board([], { walls: { w: wall } });
    const plan = routePlan(s, gm, [square(1, 1), square(4, 1)], 1.5);
    expect(plan.points).toEqual([square(1, 1), square(4, 1)]);
  });
});
