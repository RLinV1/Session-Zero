// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { measure } from "../src/board/tools";
import { emptyRoomState, filterStateForViewer, type Participant, type RoomState, type TerrainRun } from "@vtt/shared";
import { costLabel, rangeMeasure, routePlan } from "../src/board/movementRuler";
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
  it("counts Difficult squares on a run", () => {
    expect(routePlan(board(runs("difficult", [1, 0], [2, 0])), gm, [square(0, 0), square(3, 0)]).label).toBe("25 ft · 2 difficult");
  });
  it("reads Blocked when a run steps onto Blocked ground", () => {
    expect(routePlan(board(runs("blocked", [2, 0])), gm, [square(0, 0), square(3, 0)]).label).toBe("Blocked");
  });
  it("costs fogged Difficult squares as Normal for a player", () => {
    const fog = { f: { id: "f", shape: "rect" as const, points: [{ x: 70, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 70 }, { x: 70, y: 70 }] } };
    const s = board(runs("difficult", [1, 0], [2, 0]), { fog, participants: { p: player } });
    expect(routePlan(filterStateForViewer(s, player), player, [square(0, 0), square(3, 0)]).label).toBe("15 ft");
  });
});
