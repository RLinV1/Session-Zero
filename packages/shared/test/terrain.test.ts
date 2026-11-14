import { describe, expect, it } from "vitest";
import { Command, Terrain, englishText, TerrainRuns, cellRect, effectiveTerrain, emptyTerrain, filterEventForViewer, filterStateForViewer, isReversible, inverseOf, movementFeedbackForViewer, movementTerrain, paintTerrain, reduce, reduceCommitted, sweptCrossesPolygon, clearanceSweepTouchesWall, tableOf, terrainCellKnown, undoConflict, type CommandInput, type MovementPreviewRequest, type RoomState, type TerrainRun, type Token } from "../src";
import { alice, attempt, baseRoom, gm, run, withToken } from "./fixtures";
const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const one = (kind: "blocked" | "difficult", col = 1, row = 0): TerrainRun[] => [{ row, start: col, end: col, kind }];
function setup() {
  const { state, token } = withToken(baseRoom(), { ownerIds: [alice.id] });
  const t = { ...token, position: { x: 5, y: 5 } };
  return { token: t, state: { ...state, scene: { map: { url: "/map", width: 100, height: 100 }, grid }, tokens: { [t.id]: t } } } satisfies { state: RoomState; token: typeof t };
}
const context = (s: RoomState) => ({ boardEpoch: s.boardEpoch ?? 0, revision: s.terrainRevision ?? 0 });
const paint = (s: RoomState, kind: "blocked" | "difficult" | null = "difficult", col = 1) => run(s, gm, { type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: col, end: col, kind }], context: context(s) });

type ResizeCommand = Extract<CommandInput, { type: "token.configure" | "token.setAppearance" }>;
const resize = (type: ResizeCommand["type"], token: Token, size: number): ResizeCommand => type === "token.configure"
  ? { type, tokenId: token.id, changes: { size } }
  : { type, tokenId: token.id, name: token.name, size, rotation: token.rotation };
const unavailable = { ok: false, code: "invalid", message: "That move is unavailable." };

describe.each(["token.configure", "token.setAppearance"] as const)("%s resize destinations (FR-TAC-03, FR-GM-15)", (type) => {
  it.each(["base", "temporary"])("refuses anchored growth into %s Blocked terrain", (layer) => {
    const { state, token } = setup();
    const terrain = layer === "base"
      ? { base: one("blocked"), effects: [] }
      : { base: one("difficult"), effects: [{ id: "trap", name: "Trap", runs: one("blocked") }] };
    expect(attempt({ ...state, terrain }, gm, resize(type, token, 2))).toMatchObject(unavailable);
  });
  it.each([
    { name: "wall", portal: undefined, allowed: false },
    ...(["door", "window"] as const).flatMap((kind) => (["closed", "locked", "open"] as const).map((state) => ({ name: `${state} ${kind}`, portal: { kind, state }, allowed: state === "open" }))),
  ])("checks the final footprint against a $name", ({ portal, allowed }) => {
    const { state, token } = setup();
    const walls = { w: { id: "w", a: { x: 15, y: 0 }, b: { x: 15, y: 20 }, ...(portal ? { portal } : {}) } };
    const result = attempt({ ...state, walls }, gm, resize(type, token, 2));
    if (allowed) expect(result.ok).toBe(true);
    else expect(result).toMatchObject(unavailable);
  });
  it.each([
    { name: "integer", from: 1, to: 2, position: { x: 5, y: 5 }, expected: { x: 10, y: 10 } },
    { name: "integer to fractional", from: 1, to: 1.5, position: { x: 5, y: 5 }, expected: { x: 5, y: 5 } },
    { name: "fractional enlargement", from: .5, to: .75, position: { x: 7.5, y: 5 }, expected: { x: 7.5, y: 5 } },
    { name: "fractional to integer", from: 1.5, to: 2, position: { x: 7.5, y: 5 }, expected: { x: 7.5, y: 5 } },
    { name: "off-grid", from: 1, to: 2, position: { x: 7, y: 6 }, expected: { x: 7, y: 6 } },
    { name: "offset grid", from: 1, to: 2, position: { x: 8, y: 3 }, expected: { x: 13, y: 8 }, offset: true },
  ])("validates $name growth and preserves its positioning rule", ({ from, to, position, expected, offset }) => {
    const { state, token } = setup();
    const current = { ...token, size: from, position };
    const ready = { ...state, scene: { ...state.scene, grid: offset ? { ...grid, offsetX: 3, offsetY: -2 } : grid }, tokens: { [token.id]: current } };
    const command = resize(type, current, to);
    expect(run(ready, gm, command).state.tokens[token.id]).toMatchObject({ size: to, position: expected });
    expect(attempt({ ...ready, terrain: { base: one("blocked"), effects: [] } }, gm, command)).toMatchObject(unavailable);
  });
  it("allows Difficult, boundary contact, wall clearance and fog without sweeping automatic anchoring", () => {
    const { state, token } = setup();
    const ready: RoomState = {
      ...state,
      terrain: { base: [...one("blocked", -1), ...one("difficult", 0), ...one("blocked", 2)], effects: [{ id: "ice", name: "Ice", runs: one("difficult") }] },
      walls: { edge: { id: "edge", a: { x: 19, y: 0 }, b: { x: 19, y: 20 } } },
      fog: { f: { id: "f", shape: "rect", points: [{ x: 8, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 20 }, { x: 8, y: 20 }] } },
    };
    // A sweep of size 2 from the old centre would overlap the Blocked cell on the left.
    expect(movementTerrain(token.position, { x: 10, y: 10 }, 2, grid, effectiveTerrain(ready.terrain!)).blocked).toBe(true);
    const result = run(ready, gm, resize(type, token, 2));
    expect(result.state.tokens[token.id]).toMatchObject({ size: 2, position: { x: 10, y: 10 } });
    expect(result.state.fog).toEqual(ready.fog);
  });
  it.each(["terrain", "wall"])("allows shrinking out of %s only when the result is clear", (obstacle) => {
    const { state, token } = setup();
    const current = { ...token, size: 2, position: { x: 10, y: 10 } };
    const ready = { ...state, tokens: { [token.id]: current } };
    const obstructed = (clear: boolean): RoomState => obstacle === "terrain"
      ? { ...ready, terrain: { base: one("blocked", clear ? 1 : 0), effects: [] } }
      : { ...ready, walls: { w: { id: "w", a: { x: clear ? 15 : 5, y: 0 }, b: { x: clear ? 15 : 5, y: 20 } } } };
    const result = run(obstructed(true), gm, resize(type, current, 1));
    expect(result.state.tokens[token.id]).toMatchObject({ size: 1, position: { x: 5, y: 5 } });
    expect(attempt(obstructed(false), gm, resize(type, current, 1))).toMatchObject(unavailable);
  });
  it("permits unchanged geometry and metadata edits while terrain and walls cover the token", () => {
    const { state, token } = setup();
    const ready = { ...state, terrain: { base: one("blocked", 0), effects: [] }, walls: { w: { id: "w", a: { x: 5, y: 0 }, b: { x: 5, y: 10 } } } };
    const command = resize(type, token, token.size);
    expect(attempt(ready, gm, command)).toEqual({ ok: true, events: [] });
    const edited: CommandInput = command.type === "token.configure"
      ? { ...command, changes: { size: token.size, position: token.position, name: "Renamed", rotation: 90 } }
      : { ...command, name: "Renamed", rotation: 90 };
    expect(run(ready, gm, edited).state.tokens[token.id]).toMatchObject({ name: "Renamed", rotation: 90, size: token.size, position: token.position });
    expect(attempt(ready, gm, { type: "token.configure", tokenId: token.id, changes: { stats: { hp: 2, maxHp: 3, ac: 10 } } }).ok).toBe(true);
  });
});

describe("combined resize and position (FR-TAC-03)", () => {
  it.each(["terrain", "wall"])("sweeps the resulting size through %s on explicit displacement", (obstacle) => {
    const { state, token } = setup();
    const ready: RoomState = obstacle === "terrain"
      ? { ...state, terrain: { base: one("blocked", 2, 1), effects: [] } }
      : { ...state, walls: { w: { id: "w", a: { x: 20, y: 10 }, b: { x: 20, y: 20 } } } };
    const move = { type: "token.configure" as const, tokenId: token.id, changes: { position: { x: 45, y: 5 } } };
    expect(attempt(ready, gm, move).ok).toBe(true);
    expect(attempt(ready, gm, { ...move, changes: { ...move.changes, size: 2 } })).toMatchObject(unavailable);
    expect(run(state, gm, { ...move, changes: { ...move.changes, size: 2 } }).state.tokens[token.id]).toMatchObject({ size: 2, position: move.changes.position });
  });
  it("honors an explicit unchanged centre without a route, but still checks the resized destination", () => {
    const { state, token } = setup();
    const command = { type: "token.configure" as const, tokenId: token.id, changes: { size: 2, position: token.position } };
    expect(run(state, gm, command).state.tokens[token.id]).toMatchObject({ size: 2, position: token.position });
    expect(attempt({ ...state, terrain: { base: one("blocked"), effects: [] } }, gm, command)).toMatchObject(unavailable);
    const large = { ...token, size: 2, position: { x: 15, y: 5 } };
    const ready = { ...state, tokens: { [token.id]: large }, terrain: { base: one("blocked", 0), effects: [] } };
    expect(run(ready, gm, { ...command, changes: { size: .5, position: large.position } }).state.tokens[token.id]).toMatchObject({ size: .5, position: large.position });
  });
});

describe("terrain geometry (FR-TAC-03, FR-PL-04)", () => {
  it("costs Normal distance and the agreed 10 ft crossing 20 ft", () => {
    expect(movementTerrain({ x: 5, y: 5 }, { x: 25, y: 5 }, 1, grid, []).cost).toBe(10);
    expect(movementTerrain({ x: 5, y: 5 }, { x: 25, y: 5 }, 1, grid, one("difficult"))).toEqual({ distance: 10, cost: 20, affected: 1, blocked: false });
  });
  it("merges Difficult intervals and keeps actual off-grid origin", () => {
    const t = { base: one("difficult"), effects: [{ id: "ice", name: "Ice", runs: one("difficult") }] };
    expect(movementTerrain({ x: 5, y: 5 }, { x: 45, y: 5 }, 1, grid, effectiveTerrain(t)).cost).toBe(30);
    expect(movementTerrain({ x: 6, y: 5 }, { x: 25, y: 5 }, 1, grid, []).distance).toBe(9.5);
    expect(movementTerrain({ x: 5, y: 5 }, { x: 15, y: 15 }, 1, grid, [], true).distance).toBeCloseTo(Math.sqrt(50));
  });
  it("has proportional partial cost and excludes boundary-only contact", () => {
    expect(movementTerrain({ x: 0, y: 5 }, { x: 10, y: 5 }, 1, grid, one("difficult")).cost).toBe(7.5);
    expect(movementTerrain({ x: 5, y: 15 }, { x: 25, y: 15 }, 1, grid, one("difficult")).cost).toBe(10);
    expect(movementTerrain({ x: 5, y: 5 }, { x: 25, y: 25 }, 2, grid, one("blocked", 2, 0)).blocked).toBe(true);
  });
  it("catches a large token's off-centre sample points at walls with the centre path clear (ADR 0063)", () => {
    expect(clearanceSweepTouchesWall({ x: 5, y: 5 }, { x: 35, y: 5 }, 2, grid, [{ a: { x: 20, y: 9 }, b: { x: 20, y: 20 } }])).toBe(true);
    expect(clearanceSweepTouchesWall({ x: 5, y: 5 }, { x: 35, y: 5 }, 1, grid, [{ a: { x: 20, y: 10 }, b: { x: 20, y: 20 } }])).toBe(false);
  });
  it("catches a thin fog polygon between clear endpoints and handles concavity", () => {
    const fog = [{ x: 19, y: 0 }, { x: 19.1, y: 0 }, { x: 19.1, y: 10 }, { x: 19, y: 10 }];
    expect(sweptCrossesPolygon({ x: 5, y: 5 }, { x: 35, y: 5 }, 5, fog)).toBe(true);
    expect(sweptCrossesPolygon({ x: 5, y: 15 }, { x: 35, y: 15 }, 5, fog)).toBe(false);
    expect(cellRect(-1, -1, grid)).toEqual({ minX: -10, minY: -10, maxX: 0, maxY: 0 });
  });
});
describe("terrain decisions and recovery (FR-GM-15, FR-REC-02)", () => {
  it("composes layers, erases just one and bounds old/new schemas", () => {
    expect(Terrain.safeParse(emptyTerrain()).success).toBe(true);
    expect(TerrainRuns.safeParse([{ row: 0, start: 0, end: 10000, kind: "blocked" }]).success).toBe(false);
    expect(TerrainRuns.safeParse([...one("blocked"), ...one("difficult")]).success).toBe(false);
    const t = { base: one("blocked"), effects: [{ id: "ice", name: "Ice", runs: one("difficult") }] };
    expect(effectiveTerrain(t)).toEqual(one("blocked"));
    expect(paintTerrain(t.base, [{ row: 0, start: 1, end: 1, kind: null }])).toEqual([]);
    expect(Command.safeParse({ type: "token.move", tokenId: "t", to: { x: 1, y: 1 } }).success).toBe(true);
  });
  it("enforces physical routes on GM and players; Reposition is GM-only and destination checked", () => {
    const { state, token } = setup();
    const blocked = paint(state, "blocked").state;
    const cmd = { type: "token.move" as const, tokenId: token.id, to: { x: 35, y: 5 } };
    expect(attempt(blocked, alice, cmd).ok).toBe(false);
    expect(attempt(blocked, gm, cmd).ok).toBe(false);
    expect(attempt(blocked, alice, { ...cmd, reposition: true }).ok).toBe(false);
    expect(attempt(blocked, gm, { ...cmd, reposition: true }).ok).toBe(true);
    expect(attempt(blocked, gm, { ...cmd, to: { x: 15, y: 5 }, reposition: true }).ok).toBe(false);
    const fog = { ...state, fog: { f: { id: "f", shape: "polygon" as const, points: [{ x: 19, y: 0 }, { x: 19.1, y: 0 }, { x: 19.1, y: 10 }, { x: 19, y: 10 }] } } };
    expect(attempt(fog, alice, cmd).ok).toBe(true);
    expect(attempt(fog, gm, cmd).ok).toBe(true);
    expect(attempt(fog, gm, { ...cmd, to: { x: 19, y: 5 }, reposition: true }).ok).toBe(true);
  });
  it("refuses stale paint/origin/epoch, permits occupied editing, and checks current doors", () => {
    const { state, token } = setup();
    const occupied = paint(state, "blocked", 0).state;
    expect(occupied.tokens[token.id]!.position).toEqual(token.position);
    expect(attempt(occupied, alice, { type: "token.move", tokenId: token.id, to: { x: 35, y: 5 } }).ok).toBe(false);
    expect(attempt(occupied, gm, { type: "terrain.paint", layerId: "base", paint: one("difficult"), context: context(state) }).ok).toBe(false);
    expect(attempt(state, alice, { type: "token.move", tokenId: token.id, to: { x: 35, y: 5 }, expectedOrigin: { x: 6, y: 5 } }).ok).toBe(false);
    expect(attempt(state, alice, { type: "token.move", tokenId: token.id, to: { x: 35, y: 5 }, boardEpoch: 99 }).ok).toBe(false);
    const door = { id: "d", a: { x: 20, y: 0 }, b: { x: 20, y: 10 }, portal: { kind: "door" as const, state: "open" as const } };
    const cmd = { type: "token.move" as const, tokenId: token.id, to: { x: 35, y: 5 } };
    expect(attempt({ ...state, walls: { d: door } }, alice, cmd).ok).toBe(true);
    expect(attempt({ ...state, walls: { d: { ...door, portal: { ...door.portal, state: "closed" } } } }, alice, cmd).ok).toBe(false);
  });
  it("requires grid reset, restores exact terrain and closes previous terrain undo", () => {
    const { state } = setup();
    const e = paint(state).events[0]!;
    let current = reduceCommitted(state, { seq: 1, actorId: gm.id, commandId: "paint", at: "x", event: e });
    expect(attempt(current, gm, { type: "scene.setGrid", grid: { ...grid, cellSize: 20 } }).ok).toBe(false);
    const change = run(current, gm, { type: "scene.setGrid", grid: { ...grid, cellSize: 20 }, resetTerrain: true }).events[0]!;
    current = reduceCommitted(current, { seq: 2, actorId: gm.id, commandId: "grid", at: "x", event: change });
    expect(current.terrain?.base ?? []).toEqual([]);
    expect(current.boardEpoch).toBe(1);
    expect(current.undo.find((a) => a.commandId === "paint")).toBeUndefined();
    const entry = current.undo.at(-1)!;
    for (const inverse of entry.events.flatMap(inverseOf)) current = reduce(current, inverse);
    expect(current.terrain?.base).toEqual(one("difficult"));
  });
  it("undo permits disjoint cells, refuses later edits and keeps epoch outside checkpoint", () => {
    const { state } = setup();
    const event = paint(state).events[0]!;
    const first = reduceCommitted(state, { seq: 1, actorId: gm.id, commandId: "p", at: "x", event });
    expect(undoConflict(paint(first, "blocked", 3).state, first.undo[0]!)).toBeNull();
    expect(englishText(undoConflict(paint(first, "blocked").state, first.undo[0]!)!)).toContain("changed");
    const restored = reduce(first, { type: "CheckpointRestored", checkpointId: "c", name: "C", restored: tableOf(state), previous: tableOf(first) });
    expect(restored.terrain).toBeUndefined();
    expect(restored.terrainRevision).toBeGreaterThan(first.terrainRevision!);
    expect(tableOf(restored)).not.toHaveProperty("boardEpoch");
  });
});
describe("ordinary authorized movement through manual fog (FR-GM-15/17, FR-PL-04)", () => {
  const fog: RoomState["fog"] = { f: { id: "f", shape: "rect", points: [{ x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }] } };
  it.each([
    { name: "into fog", from: 5, to: 15 },
    { name: "entirely within fog", from: 15, to: 25 },
    { name: "across fog between clear endpoints", from: 5, to: 35 },
    { name: "out of fog", from: 25, to: 35 },
    { name: "across a thin fog strip", from: 5, to: 35, thin: true },
  ])("allows owner/GM moves and permitted positional edits $name without changing fog", ({ from, to, thin }) => {
    const { state, token } = setup();
    const current = { ...token, position: { x: from, y: 5 } };
    const fogged = { ...state, fog: thin ? { f: { ...fog.f!, points: [{ x: 19, y: 0 }, { x: 19.1, y: 0 }, { x: 19.1, y: 10 }, { x: 19, y: 10 }] } } : fog, tokens: { [token.id]: current } };
    const command = { type: "token.move" as const, tokenId: token.id, to: { x: to, y: 5 }, expectedOrigin: current.position, boardEpoch: 0 };
    expect(attempt(fogged, gm, command)).toMatchObject({ ok: true, events: [{ type: "TokenMoved", from: current.position, to: command.to }] });
    expect(attempt(fogged, gm, { type: "token.configure", tokenId: token.id, changes: { position: command.to } }).ok).toBe(true);
    expect(filterStateForViewer(fogged, alice).tokens[token.id]).toBeDefined();
    const moved = run(fogged, alice, command);
    expect(moved.events).toEqual([{ type: "TokenMoved", tokenId: token.id, from: current.position, to: command.to }]);
    expect(moved.state.fog).toEqual(fogged.fog);
    expect(filterStateForViewer(moved.state, alice).tokens[token.id]?.position).toEqual(command.to);
    expect(attempt(fogged, alice, { ...command, reposition: true })).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(fogged, alice, { type: "token.configure", tokenId: token.id, changes: { position: command.to } })).toMatchObject({ ok: false, code: "forbidden" });
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "fog", tokenId: token.id, from: current.position, to: command.to, boardEpoch: 0 };
    expect(movementFeedbackForViewer(fogged, gm, request)).toBe("clear");
    expect(movementFeedbackForViewer(fogged, alice, request)).toBe("unknown");
  });
  it("keeps full-footprint fog knowledge checks even when a clear centre path can move", () => {
    const { state, token } = setup();
    const edgeFog: RoomState = { ...state, fog: { f: { id: "f", shape: "rect", points: [{ x: 19, y: 9 }, { x: 19.1, y: 9 }, { x: 19.1, y: 11 }, { x: 19, y: 11 }] } } };
    const command = { type: "token.move" as const, tokenId: token.id, to: { x: 35, y: 5 } };
    expect(attempt(edgeFog, gm, command).ok).toBe(true);
    expect(attempt(edgeFog, alice, command).ok).toBe(true);
    expect(movementFeedbackForViewer(edgeFog, alice, { type: "tokenMovePreview", requestId: "edge", tokenId: token.id, from: token.position, to: command.to, boardEpoch: 0 })).toBe("unknown");
  });
  it.each(["blocked", "wall", "closed", "locked"] as const)("keeps %s route and destination checks under fog, including positional editing", (obstacle) => {
    const { state, token } = setup();
    const wall = { id: "w", a: { x: 20, y: 0 }, b: { x: 20, y: 50 }, ...(obstacle === "closed" || obstacle === "locked" ? { portal: { kind: "door" as const, state: obstacle } } : {}) };
    const restricted: RoomState = { ...state, fog, ...(obstacle === "blocked" ? { terrain: { base: one("blocked"), effects: [] } } : { walls: { w: wall } }) };
    const route = { x: 35, y: 5 }, destination = { x: obstacle === "blocked" ? 15 : 20, y: 5 };
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "obstacle", tokenId: token.id, from: token.position, to: route, boardEpoch: 0 };
    for (const to of [route, destination]) {
      expect(attempt(restricted, gm, { type: "token.move", tokenId: token.id, to })).toMatchObject({ ok: false, message: "That move is unavailable." });
      expect(attempt(restricted, alice, { type: "token.move", tokenId: token.id, to })).toMatchObject({ ok: false, message: "That move is unavailable." });
      expect(attempt(restricted, gm, { type: "token.configure", tokenId: token.id, changes: { position: to } }).ok).toBe(false);
      expect(movementFeedbackForViewer(restricted, gm, { ...request, to })).toBe("blocked");
      expect(movementFeedbackForViewer(restricted, alice, { ...request, to })).toBe("unknown");
    }
    expect(attempt(restricted, gm, { type: "token.move", tokenId: token.id, to: route, reposition: true }).ok).toBe(true);
    expect(attempt(restricted, gm, { type: "token.move", tokenId: token.id, to: destination, reposition: true }).ok).toBe(false);
    expect(movementFeedbackForViewer(restricted, gm, { ...request, reposition: true })).toBe("clear");
    expect(movementFeedbackForViewer(restricted, gm, { ...request, to: destination, reposition: true })).toBe("blocked");
  });
  it("retains wall clearance, starting-wall escape and open portals under fog", () => {
    const { state, token } = setup();
    const command = { type: "token.move" as const, tokenId: token.id, to: { x: 35, y: 5 } };
    const originWall = { id: "origin", a: { x: 5, y: 0 }, b: { x: 5, y: 10 } };
    const ahead = { id: "ahead", a: { x: 20, y: 0 }, b: { x: 20, y: 50 } };
    for (const actor of [gm, alice]) {
      expect(attempt({ ...state, fog, walls: { origin: originWall } }, actor, command).ok).toBe(true);
      expect(attempt({ ...state, fog, walls: { origin: originWall, ahead } }, actor, command).ok).toBe(false);
      expect(attempt({ ...state, fog, walls: { ahead: { ...ahead, portal: { kind: "door", state: "open" } } } }, actor, command).ok).toBe(true);
      expect(attempt({ ...state, fog, walls: { ahead: { ...ahead, a: { x: 20, y: 9.5 } } } }, actor, command).ok).toBe(true);
      const occupied = { ...state, fog, terrain: { base: one("blocked", 0), effects: [] } };
      expect(attempt(occupied, actor, command)).toMatchObject({ ok: false, message: "That move is unavailable." });
    }
  });
  it("retains proportional Difficult cost and stale origin/epoch checks under fog", () => {
    const { state, token } = setup();
    const fogged = { ...state, fog, terrain: { base: one("difficult"), effects: [] } };
    const to = { x: 35, y: 5 };
    const cost = movementTerrain(token.position, to, token.size, grid, effectiveTerrain(fogged.terrain));
    expect(cost.distance).toBe(15); expect(cost.cost).toBeCloseTo(25);
    for (const actor of [gm, alice]) {
      expect(attempt(fogged, actor, { type: "token.move", tokenId: token.id, to }).ok).toBe(true);
      expect(attempt(fogged, actor, { type: "token.move", tokenId: token.id, to, expectedOrigin: { x: 6, y: 5 } }).ok).toBe(false);
      expect(attempt(fogged, actor, { type: "token.move", tokenId: token.id, to, boardEpoch: 99 }).ok).toBe(false);
    }
  });
  it("still refuses unowned, hidden and ownership-revoked tokens under fog", () => {
    const { state, token } = setup();
    const command = { type: "token.move" as const, tokenId: token.id, to: { x: 35, y: 5 } };
    for (const changes of [{ ownerIds: [] }, { hidden: true }]) {
      const restricted = { ...state, fog, tokens: { [token.id]: { ...token, position: { x: 15, y: 5 }, ...changes } } };
      expect(attempt(restricted, alice, command)).toMatchObject({ ok: false, code: "not_found" });
      expect(movementFeedbackForViewer(restricted, alice, { type: "tokenMovePreview", requestId: "private", tokenId: token.id, from: { x: 15, y: 5 }, to: command.to, boardEpoch: 0 })).toBeNull();
    }
    const revoked = run({ ...state, fog }, gm, { type: "token.setOwners", tokenId: token.id, ownerIds: [] }).state;
    expect(attempt(revoked, alice, command)).toMatchObject({ ok: false, code: "forbidden" });
  });
});
describe("terrain bounds and atomic lifecycle (FR-GM-15, FR-REC-02)", () => {
  it("rejects oversized payloads, total cell overflow and a 33rd effect with no mutation", () => {
    const { state } = setup();
    const large: RoomState = { ...state, scene: { ...state.scene, map: { url: "/large", width: 10000, height: 10000 } } };
    const oversized = Array.from({ length: 900 }, (_, row) => ({ row, start: 1, end: 1, kind: "difficult" as const }));
    const before = JSON.stringify(large);
    expect(attempt(large, gm, { type: "terrain.paint", layerId: "base", paint: oversized, context: context(large) })).toMatchObject({ ok: false, message: expect.stringMatching(/too large/) });
    expect(JSON.stringify(large)).toBe(before);
    const full = { ...large, terrain: { base: Array.from({ length: 100 }, (_, row) => ({ row, start: 0, end: 99, kind: "difficult" as const })), effects: [{ id: "e", name: "E", runs: [] }] } };
    expect(attempt(full, gm, { type: "terrain.paint", layerId: "e", paint: one("blocked"), context: context(full) }).ok).toBe(false);
    const layers = { ...large, terrain: { base: [], effects: Array.from({ length: 32 }, (_, i) => ({ id: `e${i}`, name: `E${i}`, runs: [] })) } };
    expect(attempt(layers, gm, { type: "terrain.effect.create", name: "Excess", context: context(layers) }).ok).toBe(false);
    expect(attempt(large, alice, { type: "terrain.paint", layerId: "base", paint: one("blocked"), context: context(large) })).toMatchObject({ code: "forbidden" });
  });
  it("preserves cells for style and units, resets image dimensions, and guards map undo after new paint", () => {
    const { state } = setup();
    const painted = paint(state).state;
    const styled = run(painted, gm, { type: "scene.setGrid", grid: { ...grid, unitLabel: "m", unitsPerCell: 2, lineOpacity: .9 } }).state;
    expect(styled.terrain).toEqual(painted.terrain); expect(styled.boardEpoch).toBe(painted.boardEpoch);
    const changed = run(painted, gm, { type: "scene.setMap", map: { ...painted.scene.map!, height: 101 } });
    expect(changed.state.terrain).toBeUndefined();
    const event = changed.events[0]!; if (!isReversible(event)) throw new Error("Expected reversible map");
    expect(reduce(changed.state, inverseOf(event)[0]!).terrain).toEqual(painted.terrain);
    const fresh = run(state, gm, { type: "scene.setMap", map: { ...state.scene.map!, url: "/other" } }).events[0]!;
    const mapped = reduceCommitted(state, { seq: 1, actorId: gm.id, commandId: "map", at: "x", event: fresh });
    expect(englishText(undoConflict(paint(mapped).state, mapped.undo[0]!)!)).toContain("terrain");
  });
  it("restores a removed effect at its original position and advances the edit revision", () => {
    const { state } = setup();
    const layers = { ...state, terrain: { base: one("blocked"), effects: [{ id: "a", name: "A", runs: one("difficult") }, { id: "b", name: "B", runs: [] }] } };
    const removal = run(layers, gm, { type: "terrain.effect.remove", effectId: "a", context: context(layers) });
    const event = removal.events[0]!; if (!isReversible(event)) throw new Error("Expected reversible effect");
    const restored = reduce(removal.state, inverseOf(event)[0]!);
    expect(restored.terrain).toEqual(layers.terrain); expect(restored.terrainRevision).toBe(2);
    expect(attempt(layers, gm, { type: "scene.setGrid", grid: { ...grid, offsetX: 1 } }).ok).toBe(false);
  });
});
describe("terrain privacy (FR-GM-23)", () => {
  it("filters movement feedback by ownership, current origin, board and committed visibility", () => {
    const { state, token } = setup();
    const wall = { id: "private", a: { x: 20, y: 0 }, b: { x: 20, y: 50 } };
    const blocked = { ...state, walls: { private: wall } };
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "move1", tokenId: token.id, from: token.position, to: { x: 35, y: 5 }, boardEpoch: 0 };
    expect(movementFeedbackForViewer(blocked, alice, request)).toBe("blocked");
    expect(movementFeedbackForViewer(state, alice, request)).toBe("clear");
    // The wall is in view, so the player holds it only as an opaque piece (ADR 0056).
    expect(filterStateForViewer(blocked, alice).walls).toEqual({ "seen:0": { id: "seen:0", a: wall.a, b: wall.b } });
    expect(movementFeedbackForViewer(blocked, alice, { ...request, from: { x: 6, y: 5 } })).toBe("unknown");
    expect(movementFeedbackForViewer(blocked, alice, { ...request, boardEpoch: 1 })).toBe("unknown");
    expect(movementFeedbackForViewer(blocked, alice, { ...request, reposition: true })).toBe("unknown");
    expect(movementFeedbackForViewer(blocked, gm, { ...request, reposition: true })).toBe("clear");
    expect(movementFeedbackForViewer(blocked, { ...alice, id: "other" }, request)).toBeNull();
    expect(movementFeedbackForViewer({ ...blocked, tokens: { [token.id]: { ...token, hidden: true } } }, alice, request)).toBeNull();
    const limited = { ...state, scene: { ...state.scene, lineOfSight: true, sightRange: 5 } };
    expect(movementFeedbackForViewer(limited, alice, request)).toBe("unknown");
    expect(movementFeedbackForViewer({ ...limited, walls: blocked.walls }, alice, request)).toBe("unknown");
  });
  // Square (1, 0) spans x 10..20, y 0..10.
  const fogRect = (x0: number, y0: number, x1: number, y1: number) => ({ f: { id: "f", shape: "rect" as const, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] } });
  it("sends a partly concealed square but keeps movement over it unknown (ADR 0069)", () => {
    const { state } = setup();
    const painted = paint(state).state;
    for (const fog of [fogRect(11, 1, 12, 2), fogRect(15, 0, 20, 10)]) {
      const partly = { ...painted, fog };
      const visible = filterStateForViewer(partly, alice);
      expect(visible).not.toHaveProperty("terrain"); expect(visible).not.toHaveProperty("terrainRevision");
      expect(visible.terrainView?.runs).toEqual(one("difficult"));
      // Movement knowledge keeps the whole-square rule (ADR 0046).
      expect(terrainCellKnown(visible, 1, 0)).toBe(false);
      const event = paint(partly, "blocked").events[0]!;
      expect(filterEventForViewer({ seq: 1, actorId: gm.id, at: "x", event }, partly, alice).kind).toBe("resync");
    }
  });
  it("keeps route feedback unknown over a partly fogged square hiding a wall (ADR 0069)", () => {
    const { state, token } = setup();
    // The wall at x = 20 lies under fog covering the right half of square 1 and the left of square 2.
    const walled = { ...paint(state, "blocked").state, walls: { private: { id: "private", a: { x: 20, y: 0 }, b: { x: 20, y: 50 } } } };
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "move1", tokenId: token.id, from: token.position, to: { x: 35, y: 5 }, boardEpoch: walled.boardEpoch ?? 0 };
    expect(movementFeedbackForViewer(walled, alice, request)).toBe("blocked");
    const fogged = { ...walled, fog: fogRect(15, -1, 25, 51) };
    expect(filterStateForViewer(fogged, alice).terrainView?.runs).toEqual(one("blocked"));
    expect(movementFeedbackForViewer(fogged, alice, request)).toBe("unknown");
  });
  it("sends a square that only touches fog along an edge (ADR 0069)", () => {
    const { state } = setup();
    const edged = { ...paint(state).state, fog: fogRect(20, 0, 30, 10) };
    expect(filterStateForViewer(edged, alice).terrainView?.runs).toEqual(one("difficult"));
  });
  it("withholds a wholly concealed square, all canonical data and unchanged edits", () => {
    const { state } = setup();
    const painted = paint(state).state;
    const hidden = { ...painted, fog: fogRect(9, -1, 21, 11) };
    const visible = filterStateForViewer(hidden, alice);
    expect(visible).not.toHaveProperty("terrain"); expect(visible).not.toHaveProperty("terrainRevision");
    expect(visible.terrainView?.runs).toEqual([]);
    expect(terrainCellKnown(visible, 1, 0)).toBe(false);
    const event = paint(hidden, "blocked").events[0]!;
    expect(filterEventForViewer({ seq: 1, actorId: gm.id, at: "x", event }, hidden, alice).kind).toBe("redacted");
    expect(filterEventForViewer({ seq: 1, actorId: gm.id, at: "x", event }, painted, alice).kind).toBe("resync");
  });
  it("temporary markers never disclose a weaker underlying restriction", () => {
    const { state } = setup();
    const layered = { ...state, terrain: { base: one("blocked"), effects: [{ id: "secret", name: "Private", runs: one("difficult") }] } };
    const projected = filterStateForViewer(layered, alice);
    expect(projected.terrainView).toEqual({ runs: one("blocked"), temporary: one("blocked") });
    const event = { type: "TerrainPainted" as const, layerId: "secret", paint: one("blocked"), previous: one("difficult") };
    expect(filterEventForViewer({ seq: 1, actorId: gm.id, at: "x", event }, layered, alice).kind).toBe("redacted");
  });
  it("outside sight is unknown but unfogged routes stay movable", () => {
    const { state, token } = setup();
    const limited = { ...state, scene: { ...state.scene, lineOfSight: true, sightRange: 5 } };
    const visible = filterStateForViewer(limited, alice);
    expect(terrainCellKnown(visible, 6, 0)).toBe(false);
    expect(attempt(limited, alice, { type: "token.move", tokenId: token.id, to: { x: 65, y: 5 } }).ok).toBe(true);
    expect(state.tokens[token.id]!.position).toEqual({ x: 5, y: 5 });
  });
  it("with line of sight, sends a square partly in sight and withholds one wholly outside it (ADR 0069)", () => {
    const { state } = setup();
    // Sight reaches one square (10 px) from the token at (5, 5): into square 1, not square 2.
    const limited = { ...state, scene: { ...state.scene, lineOfSight: true, sightRange: 5 } };
    const painted = paint(paint(limited, "difficult", 1).state, "blocked", 2).state;
    const visible = filterStateForViewer(painted, alice);
    expect(visible.terrainView?.runs).toEqual(one("difficult"));
    expect(terrainCellKnown(visible, 1, 0)).toBe(false);
  });
});
describe("terrain.effect.create with a client effect id (FR-GM-15)", () => {
  const create = (s: RoomState, effectId?: string) => run(s, gm, { type: "terrain.effect.create", name: "Fire", ...(effectId ? { effectId } : {}), context: context(s) });
  it("uses the supplied id when unused, so a save can paint the layer it creates", () => {
    const { state } = setup();
    const made = create(state, "mine").state;
    expect(made.terrain?.effects.map((e) => e.id)).toEqual(["mine"]);
  });
  it("falls back to a generated id when the supplied id already exists", () => {
    const { state } = setup();
    const once = create(state, "mine").state;
    const twice = create(once, "mine").state;
    const ids = twice.terrain!.effects.map((e) => e.id);
    expect(ids).toHaveLength(2); expect(ids[0]).toBe("mine"); expect(ids[1]).not.toBe("mine");
  });
  it("generates an id when none is supplied", () => {
    const { state } = setup();
    const id = create(state).state.terrain!.effects[0]!.id;
    expect(id).toBeTruthy();
  });
});
