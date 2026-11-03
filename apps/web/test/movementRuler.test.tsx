// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { measure } from "../src/board/tools";
import { budgetLabel, defaultMovementSettings, isMovementSettings } from "../src/board/movementRuler";
import { MovementControls } from "../src/board/MovementControls";
import { readStored } from "../src/ui/usePersistentState";

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
  it("describes remaining, exact and excess budgets in text", () => {
    expect(budgetLabel(20, 30, grid)).toBe("20 / 30 ft · 10 ft remaining");
    expect(budgetLabel(30, 30, grid)).toBe("30 / 30 ft · 0 ft remaining");
    expect(budgetLabel(40, 30, grid)).toBe("40 / 30 ft · 10 ft over");
  });
  it("validates persisted preferences and recovers from malformed storage", () => {
    const fallback = defaultMovementSettings(grid);
    expect(fallback).toEqual({ allowance: 30, rule: "equal" });
    for (const allowance of [0, -1, NaN, Infinity, 100001, "30"]) expect(isMovementSettings({ allowance, rule: "equal" })).toBe(false);
    expect(isMovementSettings({ allowance: 100000, rule: "alternating" })).toBe(true);
    for (const raw of ["{", '{"allowance":0,"rule":"equal"}', '{"allowance":30,"rule":"unknown"}']) {
      expect(readStored({ getItem: () => raw, setItem: () => {} }, "room", fallback, isMovementSettings)).toEqual(fallback);
    }
  });
  it("keeps the last valid allowance while explaining invalid input", () => {
    const onChange = vi.fn();
    render(<MovementControls roomId="one" grid={grid} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Movement (ft)" });
    fireEvent.change(input, { target: { value: "45" } });
    expect(onChange).toHaveBeenLastCalledWith({ allowance: 45, rule: "equal" });
    fireEvent.change(input, { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toContain("positive");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(onChange).toHaveBeenLastCalledWith({ allowance: 45, rule: "equal" });
    fireEvent.change(screen.getByRole("combobox", { name: "Diagonals" }), { target: { value: "alternating" } });
    expect(onChange).toHaveBeenLastCalledWith({ allowance: 45, rule: "alternating" });
  });
  it("remembers valid settings only in their room", () => {
    const onChange = vi.fn();
    const { unmount } = render(<MovementControls roomId="one" grid={grid} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "50" } });
    unmount();
    const second = render(<MovementControls roomId="two" grid={grid} onChange={onChange} />);
    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "30");
    second.unmount();
    render(<MovementControls roomId="one" grid={grid} onChange={onChange} />);
    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "50");
  });
});
