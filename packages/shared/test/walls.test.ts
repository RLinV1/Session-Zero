import { describe, expect, it } from "vitest";
import {
  Command,
  decide,
  DEFAULT_GRID,
  describeUndo,
  filterEventForViewer,
  filterStateForViewer,
  DOUBTFUL_WALL_CONFIDENCE,
  footprintCrossesWall,
  isDoubtfulWall,
  MAX_WALLS,
  pathCrossesWall,
  reduce,
  segmentCrossesRect,
  segmentsCross,
  spreadPositions,
  undoableAction,
  WallDetectionRequest,
  WallDetectionResult,
  wallsFitMap,
  type CommandInput,
  type CommittedEvent,
  type DecideContext,
  type DetectedWall,
  type Participant,
  type RoomState,
} from "../src";
import { alice, baseRoom, ctx, gm } from "./fixtures";

const MAP = { url: "/uploads/map.png", width: 700, height: 700 };
/** A wall along the edge between columns 1 and 2 (x = 140), the full height of the map. */
const EDGE_WALL: DetectedWall = { a: { x: 140, y: 0 }, b: { x: 140, y: 700 } };
/** A short wall across the middle of cell (3, 3), whose centre is (245, 245). */
const CELL_WALL: DetectedWall = { a: { x: 220, y: 245 }, b: { x: 270, y: 245 } };

let batch = 0;
/** Like the server: decide with the detection hook, then reduce the batch under one command id (ADR 0013). */
function act(state: RoomState, actor: Participant, input: CommandInput, detected: DetectedWall[] | null = null, resultId = "result-a") {
  const context: DecideContext = { ...ctx, detectedWalls: (url) => (url === MAP.url && detected ? { resultId, walls: detected } : null) };
  const decision = decide(state, actor, Command.parse(input), context);
  if (!decision.ok) return { ok: false as const, code: decision.code, message: decision.message, state };
  const meta = { commandId: `wall-cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { ok: true as const, state: next, events: decision.events, commandId: meta.commandId };
}

function must(result: ReturnType<typeof act>) {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

/** A room with the map, Alice's token in cell (1, 1) at (105, 105), and the given walls applied. */
function roomWithWalls(walls: DetectedWall[] = [EDGE_WALL]) {
  let state = must(act(baseRoom(), gm, { type: "scene.setMap", map: MAP })).state;
  const created = must(act(state, gm, { type: "token.create", name: "Aria", position: { x: 105, y: 105 }, ownerIds: [alice.id] }));
  state = created.state;
  const token = Object.values(state.tokens)[0]!;
  if (walls.length > 0) state = must(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url }, walls)).state;
  return { state, token };
}

describe("wall geometry (FR-GM-11, ADR 0029)", () => {
  it("tells crossing segments from parallel and disjoint ones", () => {
    const h = { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
    expect(segmentsCross(h, { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } })).toBe(true);
    expect(segmentsCross(h, { a: { x: 0, y: 6 }, b: { x: 10, y: 6 } })).toBe(false);
    expect(segmentsCross(h, { a: { x: 11, y: 0 }, b: { x: 11, y: 10 } })).toBe(false);
    // Touching counts: a path that ends on a wall has reached it.
    expect(segmentsCross(h, { a: { x: 10, y: 5 }, b: { x: 20, y: 5 } })).toBe(true);
  });

  it("clips a segment against a rectangle", () => {
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(segmentCrossesRect({ a: { x: -5, y: 5 }, b: { x: 15, y: 5 } }, rect)).toBe(true);
    expect(segmentCrossesRect({ a: { x: 2, y: 2 }, b: { x: 3, y: 3 } }, rect)).toBe(true);
    expect(segmentCrossesRect({ a: { x: 11, y: -5 }, b: { x: 11, y: 15 } }, rect)).toBe(false);
    // Along an edge is outside the open rectangle.
    expect(segmentCrossesRect({ a: { x: 10, y: -5 }, b: { x: 10, y: 15 } }, rect)).toBe(false);
  });

  it("lets a token stand beside a wall on its cell edge, but not across it", () => {
    expect(footprintCrossesWall({ x: 105, y: 105 }, 1, DEFAULT_GRID, [EDGE_WALL])).toBe(false);
    expect(footprintCrossesWall({ x: 175, y: 105 }, 1, DEFAULT_GRID, [EDGE_WALL])).toBe(false);
    expect(footprintCrossesWall({ x: 140, y: 105 }, 1, DEFAULT_GRID, [EDGE_WALL])).toBe(true);
    // A large token centred on an intersection spans the edge.
    expect(footprintCrossesWall({ x: 140, y: 140 }, 2, DEFAULT_GRID, [EDGE_WALL])).toBe(true);
    expect(pathCrossesWall({ x: 105, y: 105 }, { x: 175, y: 105 }, [EDGE_WALL])).toBe(true);
    expect(pathCrossesWall({ x: 105, y: 105 }, { x: 105, y: 175 }, [EDGE_WALL])).toBe(false);
  });

  it("skips blocked squares when spreading copies", () => {
    const blocked = (p: { x: number }) => p.x > 140;
    const spots = spreadPositions({ x: 105, y: 105 }, 1, 3, DEFAULT_GRID, MAP, [], blocked);
    expect(spots).toHaveLength(3);
    expect(spots.every((p) => p.x < 140)).toBe(true);
  });

  it("checks a detection result's shape and bounds", () => {
    const result = { walls: [EDGE_WALL], preview: { contentType: "image/jpeg", width: 10, height: 10, data: "AAAA" } };
    expect(WallDetectionResult.safeParse(result).success).toBe(true);
    expect(WallDetectionResult.safeParse({ ...result, walls: Array(MAX_WALLS + 1).fill(EDGE_WALL) }).success).toBe(false);
    expect(wallsFitMap([EDGE_WALL], MAP)).toBe(true);
    expect(wallsFitMap([{ a: { x: 0, y: 0 }, b: { x: 701, y: 0 } }], MAP)).toBe(false);
  });

  it("carries an optional per-wall confidence between 0 and 1 (wall-review, ADR 0038)", () => {
    const preview = { contentType: "image/jpeg", width: 10, height: 10, data: "AAAA" };
    const parse = (confidence?: number) => WallDetectionResult.safeParse({ walls: [{ ...EDGE_WALL, ...(confidence !== undefined && { confidence }) }], preview }).success;
    expect([parse(), parse(0), parse(0.42), parse(1)]).toEqual([true, true, true, true]);
    expect([parse(-0.1), parse(1.1), parse(Number.NaN)]).toEqual([false, false, false]);
  });

  it("flags only walls scored below the threshold as doubtful", () => {
    expect(isDoubtfulWall({})).toBe(false);
    expect(isDoubtfulWall({ confidence: DOUBTFUL_WALL_CONFIDENCE })).toBe(false);
    expect(isDoubtfulWall({ confidence: DOUBTFUL_WALL_CONFIDENCE - 0.01 })).toBe(true);
  });
});

describe("applying and clearing walls (FR-GM-11)", () => {
  it("refuses exclusions from another result with the same wall count", () => {
    const { state } = roomWithWalls();
    const input: CommandInput = { type: "wall.applyDetected", mapUrl: MAP.url, exclude: { resultId: "result-a", indices: [0] } };
    const changed = [CELL_WALL, EDGE_WALL];
    expect(act(state, gm, input, changed, "result-b")).toMatchObject({ ok: false, code: "invalid" });
    const applied = must(act(state, gm, { ...input, exclude: { resultId: "result-b", indices: [0] } }, changed, "result-b"));
    expect(Object.values(applied.state.walls).map(({ a, b }) => ({ a, b }))).toEqual([EDGE_WALL]);
  });

  it("refuses every draft save command after its map changes", () => {
    const { state } = roomWithWalls();
    const wallId = Object.keys(state.walls)[0]!;
    const fogged = must(act(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } })).state;
    const regionId = Object.keys(fogged.fog)[0]!;
    const commands: CommandInput[] = [
      { type: "wall.add", walls: [CELL_WALL] },
      { type: "wall.remove", wallIds: [wallId] },
      { type: "wall.clear" },
      { type: "portal.set", wallId, portal: { kind: "door", state: "locked" } },
      { type: "fog.add", region: { shape: "rect", from: { x: 70, y: 70 }, to: { x: 140, y: 140 } } },
      { type: "fog.remove", regionId },
    ];
    const other = must(act(fogged, gm, { type: "scene.setMap", map: { ...MAP, url: "/uploads/other.png" } })).state;
    for (const command of commands) {
      const guarded = { ...command, expectedMapUrl: MAP.url };
      expect(act(fogged, gm, guarded).ok).toBe(true);
      expect(act(other, gm, guarded)).toMatchObject({ ok: false, code: "invalid", state: other });
      expect(act(other, alice, guarded)).toMatchObject({ ok: false, code: "forbidden" });
    }
  });

  it("refuses undoing an addition after its wall geometry or portal changes", () => {
    const { state } = roomWithWalls([]);
    const added = must(act(state, gm, { type: "wall.add", walls: [EDGE_WALL] }));
    const wallId = Object.keys(added.state.walls)[0]!;
    const marked = must(act(added.state, gm, { type: "portal.set", wallId, portal: { kind: "door", state: "locked" } }));
    expect(act(marked.state, gm, { type: "history.undo", commandId: added.commandId })).toMatchObject({ ok: false, code: "invalid" });
    const unmarked = must(act(marked.state, gm, { type: "history.undo", commandId: marked.commandId }));
    expect(must(act(unmarked.state, gm, { type: "history.undo", commandId: added.commandId })).state.walls).toEqual({});
    for (const ends of [{ a: { x: 141, y: 0 } }, { b: { x: 141, y: 700 } }]) {
      const moved = { ...added.state, walls: { [wallId]: { ...added.state.walls[wallId]!, ...ends } } };
      expect(act(moved, gm, { type: "history.undo", commandId: added.commandId })).toMatchObject({ ok: false, code: "invalid" });
    }
  });

  it("invalidates wall and portal undo when changing maps, even when returning", () => {
    const { state } = roomWithWalls();
    const wallId = Object.keys(state.walls)[0]!;
    const marked = must(act(state, gm, { type: "portal.set", wallId, portal: { kind: "window", state: "open" } }));
    const cleared = must(act(marked.state, gm, { type: "wall.clear" }));
    const same = must(act(cleared.state, gm, { type: "scene.setMap", map: MAP }));
    expect(must(act(same.state, gm, { type: "history.undo", commandId: cleared.commandId })).state.walls).toEqual(marked.state.walls);
    const other = must(act(cleared.state, gm, { type: "scene.setMap", map: { ...MAP, width: 70, height: 70, url: "/uploads/other.png" } }));
    const returned = must(act(other.state, gm, { type: "scene.setMap", map: MAP }));
    for (const commandId of [marked.commandId, cleared.commandId]) {
      expect(act(other.state, gm, { type: "history.undo", commandId }).ok).toBe(false);
      expect(act(returned.state, gm, { type: "history.undo", commandId }).ok).toBe(false);
    }
  });

  it("applies the detected walls for the current map", () => {
    const { state } = roomWithWalls([EDGE_WALL, CELL_WALL]);
    expect(Object.values(state.walls).map(({ a, b }) => ({ a, b }))).toEqual([EDGE_WALL, CELL_WALL]);
  });

  it("replaces existing walls, and undo puts them back", () => {
    const { state } = roomWithWalls([EDGE_WALL]);
    const before = state.walls;
    const applied = must(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url }, [CELL_WALL, CELL_WALL]));
    expect(applied.events.map((e) => e.type)).toEqual(["WallsRemoved", "WallsAdded"]);
    expect(Object.keys(applied.state.walls)).toHaveLength(2);
    const entry = undoableAction(applied.state.undo, applied.commandId)!;
    expect(describeUndo(entry, applied.state.tokens).noun).toBe("applying 2 walls");
    const undone = must(act(applied.state, gm, { type: "history.undo", commandId: applied.commandId }));
    expect(undone.state.walls).toEqual(before);
  });

  it("never stores confidence in the room's walls (wall-review)", () => {
    const { state } = roomWithWalls([{ ...EDGE_WALL, confidence: 0.3 }, CELL_WALL]);
    for (const wall of Object.values(state.walls)) expect(wall).not.toHaveProperty("confidence");
  });

  it("leaves out the detected walls the GM erased on the preview (FR-GM-11)", () => {
    const { state } = roomWithWalls();
    const found = [EDGE_WALL, CELL_WALL, { a: { x: 0, y: 70 }, b: { x: 140, y: 70 } }];
    const applied = must(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url, exclude: { resultId: "result-a", indices: [1] } }, found));
    expect(Object.values(applied.state.walls).map(({ a, b }) => ({ a, b }))).toEqual([found[0], found[2]]);
    const undone = must(act(applied.state, gm, { type: "history.undo", commandId: applied.commandId }));
    expect(undone.state.walls).toEqual(state.walls);
    // A list made against a different result, an index past the end, or every wall erased is refused.
    for (const exclude of [{ resultId: "result-b", indices: [0] }, { resultId: "result-a", indices: [3] }, { resultId: "result-a", indices: [0, 1, 2] }]) {
      expect(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url, exclude }, found)).toMatchObject({ ok: false, code: "invalid" });
    }
  });

  it("refuses walls for another map, a missing result, or an empty one", () => {
    const { state } = roomWithWalls();
    expect(act(state, gm, { type: "wall.applyDetected", mapUrl: "/uploads/other.png" }, [EDGE_WALL]))
      .toMatchObject({ ok: false, code: "invalid", message: "Those walls were detected for a different map." });
    expect(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url }, null)).toMatchObject({ ok: false, code: "invalid" });
    expect(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url }, [])).toMatchObject({ ok: false, code: "invalid" });
    expect(act(state, gm, { type: "wall.applyDetected", mapUrl: MAP.url }, [{ a: { x: 0, y: 0 }, b: { x: 900, y: 0 } }]))
      .toMatchObject({ ok: false, code: "invalid" });
  });

  it("removes chosen walls and clears the rest, each undoable", () => {
    const { state } = roomWithWalls([EDGE_WALL, CELL_WALL]);
    const [first] = Object.keys(state.walls);
    const removed = must(act(state, gm, { type: "wall.remove", wallIds: [first!] }));
    expect(Object.keys(removed.state.walls)).toHaveLength(1);
    expect(act(removed.state, gm, { type: "wall.remove", wallIds: [first!] })).toMatchObject({ ok: false, code: "not_found" });
    const cleared = must(act(removed.state, gm, { type: "wall.clear" }));
    expect(cleared.state.walls).toEqual({});
    expect(must(act(cleared.state, gm, { type: "wall.clear" })).events).toEqual([]);
    const undone = must(act(cleared.state, gm, { type: "history.undo", commandId: cleared.commandId }));
    expect(undone.state.walls).toEqual(removed.state.walls);
  });

  it("refuses wall commands from players", () => {
    const { state } = roomWithWalls();
    expect(act(state, alice, { type: "wall.clear" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(state, alice, { type: "wall.applyDetected", mapUrl: MAP.url }, [EDGE_WALL])).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(state, alice, { type: "wall.remove", wallIds: Object.keys(state.walls) })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("removes the walls with the map they describe", () => {
    const { state } = roomWithWalls();
    const same = must(act(state, gm, { type: "scene.setMap", map: MAP }));
    expect(Object.keys(same.state.walls)).toHaveLength(1);
    const other = must(act(state, gm, { type: "scene.setMap", map: { ...MAP, url: "/uploads/next.png" } }));
    expect(other.events.map((e) => e.type)).toEqual(["MapSet"]);
    expect(other.state.walls).toEqual({});
  });

  it("restores walls with a checkpoint, and an old table without walls means none", () => {
    const { state } = roomWithWalls();
    const restored = reduce(state, {
      type: "CheckpointRestored", checkpointId: "c1", name: "Before",
      restored: { scene: state.scene, tokens: state.tokens, templates: {}, fog: {}, initiative: null },
      previous: { scene: state.scene, tokens: state.tokens, templates: {}, fog: {}, initiative: null, walls: state.walls },
    });
    expect(restored.walls).toEqual({});
  });
});

describe("walls block tokens (FR-GM-11, ADR 0029)", () => {
  it.each(["horizontal", "vertical"])("rejects fallback copies across a %s wall and preserves clear stacking", (direction) => {
    const small = { ...MAP, width: 70, height: 70 };
    const state = must(act(baseRoom(), gm, { type: "scene.setMap", map: small })).state;
    const created = must(act(state, gm, { type: "token.create", name: "Aria", position: { x: 35, y: 35 } }));
    const tokenId = Object.keys(created.state.tokens)[0]!;
    const duplicate: CommandInput = { type: "token.duplicate", tokenId, count: 2 };
    const stacked = must(act(created.state, gm, duplicate));
    expect(Object.values(stacked.state.tokens).map((t) => t.position)).toEqual(Array(3).fill({ x: 35, y: 35 }));
    const wall = direction === "horizontal"
      ? { a: { x: 0, y: 35 }, b: { x: 70, y: 35 } }
      : { a: { x: 35, y: 0 }, b: { x: 35, y: 70 } };
    const blocked = must(act(created.state, gm, { type: "wall.add", walls: [wall] })).state;
    expect(act(blocked, gm, duplicate)).toMatchObject({ ok: false, code: "invalid", state: blocked });
    expect(act(blocked, gm, { type: "token.create", name: "Goblin", position: { x: 35, y: 35 }, count: 2 })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses dropping a token across a wall, for the GM and players alike", () => {
    const { state, token } = roomWithWalls();
    for (const actor of [gm, alice]) {
      expect(act(state, actor, { type: "token.move", tokenId: token.id, to: { x: 140, y: 105 } }))
        .toMatchObject({ ok: false, code: "invalid", message: "That move is unavailable." });
    }
    expect(act(state, gm, { type: "token.create", name: "Goblin", position: { x: 140, y: 245 } }))
      .toMatchObject({ ok: false, message: "That spot is blocked by a wall." });
    expect(act(state, gm, { type: "token.configure", tokenId: token.id, changes: { position: { x: 140, y: 105 } } }))
      .toMatchObject({ ok: false, message: "That move is unavailable." });
  });

  it("accepts a token in the cell beside a wall", () => {
    const { state, token } = roomWithWalls();
    expect(act(state, alice, { type: "token.move", tokenId: token.id, to: { x: 105, y: 175 } }).ok).toBe(true);
  });

  it("refuses a player's move through a wall but lets the GM reposition across it", () => {
    const { state, token } = roomWithWalls();
    const through = { type: "token.move" as const, tokenId: token.id, to: { x: 175, y: 105 } };
    expect(act(state, alice, through)).toMatchObject({ ok: false, code: "invalid", message: "That move is unavailable." });
    expect(act(state, gm, through).ok).toBe(false);
    expect(act(state, gm, { ...through, reposition: true }).ok).toBe(true);
  });

  it("lets a token caught by new walls step out", () => {
    // A wall applied straight through Aria's cell after she was placed.
    const { state, token } = roomWithWalls([{ a: { x: 105, y: 80 }, b: { x: 105, y: 130 } }]);
    expect(act(state, alice, { type: "token.move", tokenId: token.id, to: { x: 105, y: 175 } }).ok).toBe(true);
  });

  it("spreads copies onto squares clear of walls", () => {
    const { state } = roomWithWalls([CELL_WALL]);
    const created = must(act(state, gm, { type: "token.create", name: "Goblin", position: { x: 175, y: 245 }, count: 5 }));
    for (const e of created.events) {
      if (e.type !== "TokenCreated") continue;
      expect(footprintCrossesWall(e.token.position, 1, DEFAULT_GRID, Object.values(state.walls))).toBe(false);
    }
  });
});

describe("drawing walls by hand (FR-GM-09, wall-editing)", () => {
  it("adds drawn walls as one undoable action", () => {
    const { state } = roomWithWalls([]);
    const drawn = must(act(state, gm, { type: "wall.add", walls: [{ a: { x: 70, y: 70 }, b: { x: 210, y: 70 } }] }));
    expect(drawn.events).toEqual([{ type: "WallsAdded", walls: [expect.objectContaining({ a: { x: 70, y: 70 }, b: { x: 210, y: 70 } })] }]);
    expect(Object.keys(drawn.state.walls)).toHaveLength(1);
    const undone = must(act(drawn.state, gm, { type: "history.undo", commandId: drawn.commandId }));
    expect(undone.state.walls).toEqual({});
  });

  it("refuses players, zero-length walls, walls off the map, and walls past the cap", () => {
    const { state } = roomWithWalls([]);
    const wall = { a: { x: 70, y: 70 }, b: { x: 210, y: 70 } };
    expect(act(state, alice, { type: "wall.add", walls: [wall] })).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(state, gm, { type: "wall.add", walls: [{ a: wall.a, b: wall.a }] })).toMatchObject({ ok: false, code: "invalid" });
    expect(act(state, gm, { type: "wall.add", walls: [{ a: wall.a, b: { x: 900, y: 70 } }] })).toMatchObject({ ok: false, code: "invalid" });
    const full = { ...state, walls: Object.fromEntries(Array.from({ length: MAX_WALLS }, (_, i) => [`w${i}`, { id: `w${i}`, ...wall }])) };
    expect(act(full, gm, { type: "wall.add", walls: [wall] })).toMatchObject({ ok: false, code: "invalid" });
    expect(() => Command.parse({ type: "wall.add", walls: Array(51).fill(wall) })).toThrow();
  });

  it("needs a map to draw on", () => {
    expect(act(baseRoom(), gm, { type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 } }] }))
      .toMatchObject({ ok: false, code: "invalid" });
  });

  it("accepts a sample point on a detection request, and nothing else", () => {
    expect(WallDetectionRequest.parse({ sample: { x: 10, y: 20 } })).toEqual({ sample: { x: 10, y: 20 } });
    expect(WallDetectionRequest.parse({})).toEqual({});
    expect(WallDetectionRequest.safeParse({ sample: { x: 10 } }).success).toBe(false);
    expect(WallDetectionRequest.parse({ sample: { x: 1, y: 2 }, tolerance: 20 }).tolerance).toBe(20);
    expect(WallDetectionRequest.safeParse({ tolerance: 20 }).success).toBe(false);
    expect(WallDetectionRequest.parse({ strictness: 0.5, minLength: 2 })).toEqual({ strictness: 0.5, minLength: 2 });
    expect(WallDetectionRequest.parse({ style: "dark" })).toEqual({ style: "dark" });
    expect(WallDetectionRequest.parse({ style: "outlined" })).toEqual({ style: "outlined" });
    for (const bad of [{ strictness: 0.1 }, { strictness: 0.7 }, { minLength: -1 }, { minLength: 7 }, { style: "stone" }]) {
      expect(WallDetectionRequest.safeParse(bad).success).toBe(false);
    }
    expect(WallDetectionRequest.safeParse({ sample: { x: 1, y: 2 }, tolerance: 5 }).success).toBe(false);
    expect(WallDetectionRequest.safeParse({ sample: { x: 1, y: 2 }, tolerance: 61 }).success).toBe(false);
    expect(WallDetectionRequest.safeParse({ colour: "#fff" }).success).toBe(false);
  });
});

describe("walls are GM-only (FR-GM-23, ADR 0029)", () => {
  it("withholds walls from player snapshots and redacts their events", () => {
    const { state } = roomWithWalls();
    expect(filterStateForViewer(state, alice).walls).toEqual({});
    expect(filterStateForViewer(state, gm).walls).toEqual(state.walls);
    const committed: CommittedEvent = {
      seq: 9, at: "2026-10-09T00:00:00.000Z", actorId: gm.id, event: { type: "WallsAdded", walls: Object.values(state.walls) },
    };
    expect(filterEventForViewer(committed, state, alice)).toEqual({ kind: "redacted", seq: 9 });
    expect(filterEventForViewer({ ...committed, event: { type: "WallsRemoved", walls: Object.values(state.walls) } }, state, alice))
      .toEqual({ kind: "redacted", seq: 9 });
    expect(filterEventForViewer(committed, state, gm).kind).toBe("event");
  });
});
