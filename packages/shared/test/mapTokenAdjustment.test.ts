import { describe, expect, it } from "vitest";
import {
  adjustMapTokens, Command, DEFAULT_GRID, DomainEvent, filterEventForViewer, filterStateForViewer,
  isReversible, isSnapped, placementCandidates, reduce, reduceCommitted, undoableAction,
  type GridSpec, type MapTokenPolicy, type Point, type RoomState,
  isDiceRoll
} from "../src";
import { alice, attempt, baseRoom, bob, gm, run } from "./fixtures";

const oldMap = { url: "/old.png", width: 1000, height: 800 };
const newMap = { url: "/new.png", width: 500, height: 400 };
const grid: GridSpec = { ...DEFAULT_GRID, cellSize: 20 };
const token = (id: string, position: Point, size = 1) => ({ id, position, size });

function positions(
  tokens: ReturnType<typeof token>[], map = newMap, policy: MapTokenPolicy = "scale",
  previous: typeof oldMap | null = oldMap, nextGrid = grid,
) {
  const result = adjustMapTokens(tokens, previous, map, grid, nextGrid, policy);
  if (!result.ok) throw new Error(`oversized ${result.tokenId}`);
  return tokens.map((t) => result.changes.find((c) => c.tokenId === t.id)?.to ?? t.position);
}

describe("map token geometry (KAN-66, FR-GM-02, FR-TAC-02)", () => {
  it.each([
    [{ ...newMap, width: 500, height: 400 }, { x: 120.5, y: 80.5 }],
    [{ ...newMap, width: 2000, height: 1600 }, { x: 482, y: 322 }],
    [{ ...newMap, width: 2000, height: 400 }, { x: 482, y: 80.5 }],
  ])("scales each axis independently on %j", (map, expected) => {
    expect(positions([token("a", { x: 241, y: 161 })], map)).toEqual([expected]);
  });

  it("preserves fitting free positions when dimensions are unchanged", () => {
    expect(adjustMapTokens([token("a", { x: 241, y: 161 })], oldMap, oldMap, grid, grid)).toEqual({ ok: true, changes: [] });
  });

  it.each(["scale", "keep", "recenter"] as const)("preserves first-map candidates for %s and bounds outside positions", (policy) => {
    expect(positions([token("a", { x: 241, y: 161 }), token("b", { x: -9, y: 9999 }, 2)], newMap, policy, null))
      .toEqual([{ x: 241, y: 161 }, { x: 20, y: 380 }]);
  });

  it("keep preserves fitting free tokens and clamps outside ones", () => {
    expect(positions([token("a", { x: 241, y: 161 }), token("b", { x: 900, y: -40 })], newMap, "keep"))
      .toEqual([{ x: 241, y: 161 }, { x: 490, y: 10 }]);
  });

  it("resnaps aligned centers on the scaled candidate with offsets", () => {
    const next = { ...grid, cellSize: 30, offsetX: 5, offsetY: 7 };
    const at = positions([token("a", { x: 250, y: 170 })], newMap, "scale", oldMap, next)[0]!;
    expect(at).toEqual({ x: 140, y: 82 });
    expect(isSnapped(at, 1, next)).toBe(true);
  });

  it("chooses a fitting grid point instead of clamping an outside snap", () => {
    const next = { ...grid, cellSize: 100, offsetX: 20, offsetY: 30 };
    expect(positions([token("a", { x: 490, y: 390 })], { ...newMap, width: 240, height: 250 }, "keep", oldMap, next))
      .toEqual([{ x: 170, y: 180 }]);
  });

  it("prioritizes bounds on only the axis without a fitting lattice point", () => {
    const next = { ...grid, cellSize: 100, offsetX: 20 };
    expect(positions([token("a", { x: 30, y: 170 })], { ...newMap, width: 100, height: 350 }, "keep", oldMap, next))
      .toEqual([{ x: 50, y: 150 }]);
  });

  it("permits a footprint exactly as wide and high as the map", () => {
    expect(positions([token("a", { x: -9, y: 999 })], { ...newMap, width: 20, height: 20 }, "keep"))
      .toEqual([{ x: 10, y: 10 }]);
  });

  it("does not snap deliberately free positions even when the grid changes", () => {
    const next = { ...grid, cellSize: 50, offsetX: 4, offsetY: 6 };
    expect(positions([token("a", { x: 241, y: 161 })], newMap, "scale", oldMap, next)).toEqual([{ x: 120.5, y: 80.5 }]);
  });

  it.each([0.5, 1.5, 2, 3])("bounds the square footprint of size %s", (size) => {
    expect(positions([token("a", { x: -7.1, y: 900.3 }, size)], newMap, "keep"))
      .toEqual([{ x: size * 10, y: 400 - size * 10 }]);
  });

  it("retains even and fractional alignment under the existing snap convention", () => {
    const next = { ...grid, cellSize: 30, offsetX: 5, offsetY: 7 };
    expect(positions([token("a", { x: 40, y: 60 }, 2), token("b", { x: 40, y: 60 }, 1.5)], newMap, "keep", oldMap, next))
      .toEqual([{ x: 35, y: 67 }, { x: 35, y: 67 }]);
  });

  it("handles fractional pixels without letting a footprint cross bounds", () => {
    const next = { ...grid, cellSize: 23.3, offsetX: 1.7, offsetY: 4.1 };
    const tokens = [token("a", { x: -30, y: 10010 }, 1), token("b", { x: -40, y: 10000 }, 2)];
    const result = positions(tokens, { ...newMap, width: 101, height: 79 }, "keep", oldMap, next);
    for (const [i, p] of result.entries()) {
      const half = tokens[i]!.size * next.cellSize / 2;
      expect(p.x).toBeGreaterThanOrEqual(half);
      expect(p.y).toBeLessThanOrEqual(79 - half);
      expect(isSnapped(p, tokens[i]!.size, next)).toBe(true);
    }
  });

  it("clamps extreme finite coordinates even if scaling overflows", () => {
    const at = positions([token("a", { x: Number.MAX_VALUE, y: -Number.MAX_VALUE })], { ...newMap, width: 2000, height: 1600 })[0]!;
    expect(at).toEqual({ x: 1990, y: 10 });
  });

  it.each(["scale", "keep", "recenter"] as const)("rejects oversize before placing any token under %s", (policy) => {
    const tokens = [token("a", { x: -10, y: -20 }), token("z", { x: 100, y: 100 }, 3)];
    expect(adjustMapTokens(tokens, oldMap, { width: 500, height: 50 }, grid, grid, policy))
      .toEqual({ ok: false, tokenId: "z", footprint: 60 });
    expect(tokens[0]!.position).toEqual({ x: -10, y: -20 });
  });

  it("recenters in stable ID order and avoids mixed-size overlaps", () => {
    const tokens = [token("a", { x: 1, y: 1 }, 2), token("b", { x: 1, y: 1 }), token("c", { x: 1, y: 1 })];
    const map = { ...newMap, width: 200, height: 200 };
    const result = adjustMapTokens(tokens, oldMap, map, grid, grid, "recenter");
    expect(result).toEqual(adjustMapTokens([...tokens].reverse(), oldMap, map, grid, grid, "recenter"));
    expect(positions(tokens, map, "recenter")).toEqual([{ x: 100, y: 100 }, { x: 60, y: 60 }, { x: 80, y: 60 }]);
  });

  it("preserves aligned and free intent when recentering", () => {
    const tokens = [token("a", { x: 30, y: 30 }), token("b", { x: 1, y: 1 })];
    const next = { ...grid, offsetX: 3, offsetY: 7 };
    const [aligned, free] = positions(tokens, { ...newMap, width: 210, height: 210 }, "recenter", oldMap, next);
    expect(isSnapped(aligned!, 1, next)).toBe(true);
    expect(isSnapped(free!, 1, next)).toBe(false);
  });

  it("allows central overlap under crowding", () => {
    expect(positions([token("a", { x: 1, y: 1 }), token("b", { x: 2, y: 2 })], { ...newMap, width: 20, height: 20 }, "recenter"))
      .toEqual([{ x: 10, y: 10 }, { x: 10, y: 10 }]);
  });

  it("falls back centrally when the bounded search exhausts despite distant free space", () => {
    const tokens = [token("a", { x: 1, y: 1 }, 10), token("b", { x: 2, y: 2 }, 0.01)];
    expect(positions(tokens, { ...newMap, width: 100000, height: 100000 }, "recenter"))
      .toEqual([{ x: 50000, y: 50000 }, { x: 50000, y: 50000 }]);
    expect([...placementCandidates({ x: 0, y: 0 }, 0.2, null)]).toHaveLength(1681);
  });
});

function place(state: RoomState, name: string, position: Point, size = 1, hidden = false) {
  const result = run(state, gm, { type: "token.create", name, position, size, hidden });
  const created = result.events[0]!;
  if (created.type !== "TokenCreated") throw new Error("expected token");
  return { state: result.state, id: created.token.id };
}

describe("map command, reduction and visibility (KAN-66, FR-GM-15, FR-GM-23)", () => {
  it("accepts omitted and supported policies, rejects invalid policy and nullable command map", () => {
    expect(Command.parse({ type: "scene.setMap", map: newMap })).not.toHaveProperty("tokenPolicy");
    for (const tokenPolicy of ["scale", "keep", "recenter"]) expect(Command.safeParse({ type: "scene.setMap", map: newMap, tokenPolicy }).success).toBe(true);
    for (const tokenPolicy of ["bad", "", null, 1]) expect(Command.safeParse({ type: "scene.setMap", map: newMap, tokenPolicy }).success).toBe(false);
    expect(Command.safeParse({ type: "scene.setMap", map: null }).success).toBe(false);
  });

  it("records one complete event with unchanged effective grid and an empty array", () => {
    expect(run(baseRoom(), gm, { type: "scene.setMap", map: newMap }).events).toEqual([{
      type: "MapSet", map: newMap, previous: null,
      gridChange: { grid: DEFAULT_GRID, previous: DEFAULT_GRID }, tokenChanges: [], wallChange: { walls: [], previous: [] }, fogChange: { fog: [], previous: [] },
    }]);
  });

  it("records all replaced map/grid/positions in one event and preserves token properties", () => {
    let state = run(baseRoom(), gm, { type: "scene.setMap", map: oldMap, grid }).state;
    const a = place(state, "Free", { x: 241, y: 161 }, 1.5);
    const b = place(a.state, "Hidden", { x: 750, y: 550 }, 2, true);
    state = b.state;
    const nextGrid = { ...grid, cellSize: 40, lineColor: "#abcdef" };
    const applied = run(state, gm, { type: "scene.setMap", map: newMap, grid: nextGrid });
    expect(applied.events).toEqual([{
      type: "MapSet", map: newMap, previous: oldMap, gridChange: { grid: nextGrid, previous: grid },
      wallChange: { walls: [], previous: [] }, fogChange: { fog: [], previous: [] },
      tokenChanges: expect.arrayContaining([
        { tokenId: a.id, from: { x: 241, y: 161 }, to: { x: 120.5, y: 80.5 } },
        { tokenId: b.id, from: { x: 750, y: 550 }, to: { x: 375, y: 275 } },
      ]),
    }]);
    expect(applied.state.tokens[a.id]).toEqual({ ...state.tokens[a.id], position: { x: 120.5, y: 80.5 } });
    expect(applied.state.tokens[b.id]?.hidden).toBe(true);
    expect(applied.state.scene).toEqual({ map: newMap, grid: nextGrid });
  });

  it("authorizes before checking hidden footprints, and rejects a hidden oversized token", () => {
    const placed = place(baseRoom(), "Secret giant", { x: 0, y: 0 }, 10, true);
    expect(attempt(placed.state, alice, { type: "scene.setMap", map: newMap })).toEqual({ ok: false, code: "forbidden", message: "You are not allowed to do that" });
    expect(attempt(placed.state, gm, { type: "scene.setMap", map: newMap })).toMatchObject({
      ok: false, code: "invalid", message: expect.stringMatching(/Secret giant.*700 px.*larger map.*grid cell size.*token's size/),
    });
    expect(placed.state.scene.map).toBeNull();
  });

  it("applies recorded values without recalculating geometry and throws atomically for missing tokens", () => {
    const placed = place(baseRoom(), "A", { x: 0, y: 0 });
    const event = DomainEvent.parse({
      type: "MapSet", map: { ...newMap, width: 10, height: 10 }, previous: null,
      gridChange: { grid, previous: DEFAULT_GRID },
      tokenChanges: [{ tokenId: placed.id, from: { x: 999, y: 999 }, to: { x: -123, y: 456 } }],
    });
    const applied = reduce(placed.state, event);
    expect(applied.tokens[placed.id]?.position).toEqual({ x: -123, y: 456 });
    expect(placed.state.tokens[placed.id]?.position).toEqual({ x: 0, y: 0 });
    if (event.type !== "MapSet") throw new Error("expected map");
    expect(() => reduce(placed.state, { ...event, tokenChanges: [...event.tokenChanges!, { tokenId: "missing", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }] })).toThrow(/missing entity/);
    expect(placed.state.scene.map).toBeNull();
  });

  it("parses and replays old map plus move batches without geometry or enabling undo", () => {
    const placed = place(baseRoom(), "A", { x: -15, y: 900 });
    const events = [
      DomainEvent.parse({ type: "MapSet", map: newMap, previous: null, gridChange: { grid, previous: DEFAULT_GRID } }),
      DomainEvent.parse({ type: "TokenMoved", tokenId: placed.id, from: { x: -15, y: 900 }, to: { x: -20, y: 990 } }),
    ];
    const state = events.reduce((s, event, i) => reduceCommitted(s, { event, seq: i + 1, at: "now", actorId: gm.id, commandId: "legacy-map" }), placed.state);
    expect(state.tokens[placed.id]?.position).toEqual({ x: -20, y: 990 });
    expect(undoableAction(state.undo, "legacy-map")).toBeUndefined();
    for (const event of [events[0]!, DomainEvent.parse({ type: "MapSet", map: newMap, previous: null, tokenChanges: [] })]) expect(isReversible(event)).toBe(false);
    expect(DomainEvent.parse({ type: "MapSet", map: newMap, previous: null })).not.toHaveProperty("tokenChanges");
  });

  it("resyncs players for composite changes and inverses including empty arrays, retaining legacy filtering", () => {
    const event = run(baseRoom(), gm, { type: "scene.setMap", map: newMap }).events[0]!;
    for (const map of [newMap, null]) {
      const committed = { event: { ...event, map } as typeof event, seq: 8, at: "now", actorId: gm.id, commandId: "secret-command" };
      expect(filterEventForViewer(committed, baseRoom(), alice)).toEqual({ kind: "resync" });
      expect(filterEventForViewer(committed, baseRoom(), gm)).toEqual({ kind: "event", committed });
    }
    const legacy = { event: { type: "MapSet" as const, map: newMap, previous: null }, seq: 8, at: "now", actorId: gm.id, commandId: "old-command" };
    expect(filterEventForViewer(legacy, baseRoom(), alice)).toEqual({ kind: "event", committed: { event: legacy.event, seq: 8, at: "now", actorId: gm.id } });
  });

  it("retains fog on same-image changes and permanently conceals attack sides moved into fog", () => {
    const initial = run(baseRoom(), gm, { type: "scene.setMap", map: oldMap, grid }).state;
    const hero = place(initial, "Hero", { x: 800, y: 600 });
    const foe = place(hero.state, "Foe", { x: 240, y: 160 });
    let state = run(foe.state, gm, { type: "token.setOwners", tokenId: hero.id, ownerIds: [alice.id] }).state;
    state = run(state, gm, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: hero.id, targetTokenId: foe.id } }).state;
    state = run(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 60 }, to: { x: 150, y: 110 } } }).state;
    state = run(state, bob, { type: "template.place", shape: "circle", origin: { x: 120, y: 80 }, toward: { x: 120, y: 80 }, size: 10 }).state;
    const before = state;
    const applied = run(state, gm, { type: "scene.setMap", map: { ...newMap, url: oldMap.url } });
    expect(applied.state.fog).toEqual(before.fog);
    expect(applied.state.templates).toEqual(before.templates);
    expect(applied.state.rolls.filter(isDiceRoll).at(-1)?.attack?.target?.hidden).toBe(true);
    expect(filterStateForViewer(applied.state, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
    const deleted = run(applied.state, gm, { type: "token.delete", tokenId: foe.id }).state;
    expect(filterStateForViewer(deleted, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
  });
});
