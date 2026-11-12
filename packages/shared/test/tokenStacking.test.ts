import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, footprintsOverlap, isDowned, overlapsToken, type RoomState, type Token } from "../src";
import { attempt, baseRoom, gm, run } from "./fixtures";

/** The centre of square (col, row) on the default 70 px grid. */
const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
const MAP = { url: "/uploads/map.png", width: 700, height: 700 };
const tokenAt = (id: string, position: { x: number; y: number }, size = 1, hp: number | null = null): Token => ({
  id, name: id, position, size, rotation: 0, color: "#445566", imageUrl: null, ownerIds: [], hidden: false, conditions: [], stats: { hp, maxHp: null, ac: null },
});

function roomWith(...tokens: Token[]): RoomState {
  const state = run(baseRoom(), gm, { type: "scene.setMap", map: MAP }).state;
  return { ...state, tokens: Object.fromEntries(tokens.map((t) => [t.id, t])) };
}

describe("what occupies a square (FR-TAC-02, token-no-stacking)", () => {
  it("counts shared area, never a shared edge or corner", () => {
    const one = { position: at(1, 1), size: 1 };
    expect(footprintsOverlap(one, { position: at(2, 1), size: 1 }, DEFAULT_GRID)).toBe(false);
    expect(footprintsOverlap(one, { position: at(2, 2), size: 1 }, DEFAULT_GRID)).toBe(false);
    expect(footprintsOverlap(one, { position: at(1, 1), size: 1 }, DEFAULT_GRID)).toBe(true);
    // A Large token centred on the corner of (1, 1) and (2, 2) covers square (1, 1).
    expect(footprintsOverlap(one, { position: { x: 140, y: 140 }, size: 2 }, DEFAULT_GRID)).toBe(true);
  });

  it("lets downed tokens give up their square, and never blocks a token on itself", () => {
    expect(isDowned(tokenAt("a", at(0, 0), 1, 0))).toBe(true);
    expect(isDowned(tokenAt("a", at(0, 0), 1, -3))).toBe(true);
    expect(isDowned(tokenAt("a", at(0, 0), 1, null))).toBe(false);
    const tokens = { up: tokenAt("up", at(1, 1), 1, 5), down: tokenAt("down", at(3, 1), 1, 0), none: tokenAt("none", at(5, 1)) };
    expect(overlapsToken(tokens, at(1, 1), 1, DEFAULT_GRID)).toBe(true);
    expect(overlapsToken(tokens, at(3, 1), 1, DEFAULT_GRID)).toBe(false);
    expect(overlapsToken(tokens, at(5, 1), 1, DEFAULT_GRID)).toBe(true);
    expect(overlapsToken(tokens, at(1, 1), 1, DEFAULT_GRID, "up")).toBe(false);
  });
});

describe("new tokens go on empty squares (FR-TAC-02, token-no-stacking)", () => {
  it("refuses a new token on an occupied square, hidden tokens included", () => {
    const state = roomWith({ ...tokenAt("goblin", at(2, 2)), hidden: true });
    expect(attempt(state, gm, { type: "token.create", name: "Orc", position: at(2, 2) }))
      .toMatchObject({ ok: false, code: "invalid", message: "Another token is already there." });
  });

  it("refuses free (Alt) placement overlapping a token", () => {
    const state = roomWith(tokenAt("goblin", at(2, 2)));
    expect(attempt(state, gm, { type: "token.create", name: "Orc", position: { x: 190, y: 190 } }))
      .toMatchObject({ ok: false, message: "Another token is already there." });
  });

  it("places a new token on a downed token's square", () => {
    const state = roomWith(tokenAt("goblin", at(2, 2), 1, 0));
    expect(attempt(state, gm, { type: "token.create", name: "Orc", position: at(2, 2) }).ok).toBe(true);
  });

  it("refuses duplicating onto the original", () => {
    const state = roomWith(tokenAt("goblin", at(2, 2)));
    expect(attempt(state, gm, { type: "token.duplicate", tokenId: "goblin", position: at(2, 2) }))
      .toMatchObject({ ok: false, message: "Another token is already there." });
    expect(attempt(state, gm, { type: "token.duplicate", tokenId: "goblin", position: at(3, 2) }).ok).toBe(true);
  });

  it("refuses several copies that can't all have an empty square, and creates nothing", () => {
    // A map three squares long and one high: room for 3.
    const blocked = run(baseRoom(), gm, { type: "scene.setMap", map: { ...MAP, width: 210, height: 70 } }).state;
    expect(attempt(blocked, gm, { type: "token.create", name: "Goblin", position: at(0, 0), count: 5 }))
      .toMatchObject({ ok: false, message: "There's no empty square nearby." });
    expect(attempt(blocked, gm, { type: "token.create", name: "Goblin", position: at(0, 0), count: 3 }).ok).toBe(true);
  });

  it("still spreads duplicates onto empty squares around a lone token", () => {
    const state = roomWith(tokenAt("goblin", at(4, 4)));
    const result = attempt(state, gm, { type: "token.duplicate", tokenId: "goblin", count: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.events.flatMap((e) => (e.type === "TokenCreated" ? [e.token.position] : []));
    expect(placed).toHaveLength(4);
    expect(new Set(placed.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    expect(placed).not.toContainEqual(at(4, 4));
  });
});
