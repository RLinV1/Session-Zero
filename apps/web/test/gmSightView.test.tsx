// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATS, type RoomState, type Token, type Wall } from "@vtt/shared";
import { BoardFilters } from "../src/board/BoardFilters";
import { gmSightPolygons, sightKey, viewedTokenIds } from "../src/board/gmSightView";
import { room } from "./mapEditorHarness";

afterEach(cleanup);

const tok = (id: string, x: number, hidden = false): Token => ({
  id, name: id, position: { x, y: 300 }, size: 1, rotation: 0, color: "#fff", imageUrl: null, ownerIds: [], hidden, stats: EMPTY_STATS, conditions: [],
});
// A wall splits the 800x600 map at x=400.
const wall: Wall = { id: "w", a: { x: 400, y: 0 }, b: { x: 400, y: 600 } } as Wall;

function state(los = true): RoomState {
  const s = room({ walls: [wall] });
  s.scene = { ...s.scene, lineOfSight: los };
  s.tokens = Object.fromEntries([tok("a", 100), tok("b", 700), tok("c", 200, true)].map((t) => [t.id, t]));
  return s;
}

describe("GM token view (FR-GM-19)", () => {
  it("is the viewed token's own sight, even when hidden, and nothing with none viewed", () => {
    const s = state();
    expect(gmSightPolygons(s, [])).toBeNull();
    const b = gmSightPolygons(s, ["b"])!;
    expect(b).toHaveLength(1);
    expect(Math.min(...b[0]!.map((p) => p.x))).toBeGreaterThanOrEqual(400); // the wall hides the left half
    expect(gmSightPolygons(s, ["c"])).toHaveLength(1);
  });

  it("is the union of several viewed tokens", () => {
    const polygons = gmSightPolygons(state(), ["a", "b"])!;
    expect(polygons).toHaveLength(2);
    const xs = polygons.flatMap((p) => p.map((q) => q.x));
    expect(Math.min(...xs)).toBeLessThan(400);
    expect(Math.max(...xs)).toBeGreaterThan(400);
  });

  it("is off when line of sight is off, and a deleted token drops out", () => {
    const s = state();
    expect(viewedTokenIds(s, ["b", "a"])).toEqual(["b", "a"]);
    expect(gmSightPolygons(state(false), ["b"])).toBeNull();
    delete s.tokens.b;
    expect(viewedTokenIds(s, ["b", "a"])).toEqual(["a"]);
    expect(gmSightPolygons(s, ["b"])).toBeNull();
  });

  it("the Show menu has a Token view checkbox only when given sight, hints at Shift-click, and sends no filter change", () => {
    const flags = { fog: false, walls: true, portals: false };
    const onChange = vi.fn();
    const pick = vi.fn();
    const { rerender } = render(<BoardFilters value={flags} available={flags} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.queryByLabelText("Token view")).toBeNull();
    rerender(<BoardFilters value={flags} available={flags} onChange={onChange} sight={{ checked: false, onChange: pick }} />);
    expect(screen.queryByText("Shift-click to add tokens")).toBeNull();
    fireEvent.click(screen.getByLabelText("Token view"));
    expect(pick).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<BoardFilters value={flags} available={flags} onChange={onChange} sight={{ checked: true, onChange: pick }} />);
    expect(screen.getByText("Shift-click to add tokens")).toBeTruthy();
  });
});

describe("sightKey (FR-GM-19)", () => {
  it("is stable for unrelated changes and changes when a viewed token moves", () => {
    const s = state();
    const key = sightKey(s, ["a"]);
    expect(sightKey({ tokens: { ...s.tokens, b: tok("b", 650) } }, ["a"])).toBe(key);
    expect(sightKey({ tokens: { ...s.tokens, a: tok("a", 120) } }, ["a"])).not.toBe(key);
    expect(sightKey({ tokens: { ...s.tokens, a: tok("a", 100, true) } }, ["a"])).not.toBe(key);
  });
});
