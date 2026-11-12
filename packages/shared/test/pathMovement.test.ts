import { beforeEach, describe, expect, it } from "vitest";
import {
  Command,
  decide,
  reduce,
  type CommandInput,
  type Participant,
  type RoomState,
  diagonalRuleOf,
  difficultTerrainOf,
  filterEventForViewer,
  movementFeedbackForViewer,
  visibleStretches,
  type CommittedEvent,
  type DomainEvent,
} from "../src";
import { alice, attempt, baseRoom, ctx, gm, resetRandom, run } from "./fixtures";

let batch = 0;
/** Like the server: decide, then reduce the batch under one command id, so it can be undone. */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}

const committed = (event: DomainEvent, seq = 1): CommittedEvent => ({ seq, at: "2026-11-11T12:00:00.000Z", actorId: gm.id, event });

beforeEach(resetRandom);

describe("path movement: the Diagonals and Difficult terrain rules (FR-GM-15, ADR 0055)", () => {
  it("reads Equal cost and On entry in a room that never set them", () => {
    const room = baseRoom();
    expect([diagonalRuleOf(room), difficultTerrainOf(room)]).toEqual(["equal", "entry"]);
  });

  it("lets only the GM change them, refuses an unchanged value, and records what each replaced", () => {
    const room = baseRoom();
    for (const command of [{ type: "room.setDiagonalRule", rule: "alternating" }, { type: "room.setDifficultTerrain", mode: "both" }] as const) {
      expect(attempt(room, alice, command)).toMatchObject({ ok: false, code: "forbidden" });
    }
    expect(attempt(room, gm, { type: "room.setDiagonalRule", rule: "equal" })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(room, gm, { type: "room.setDifficultTerrain", mode: "entry" })).toMatchObject({ ok: false, code: "invalid" });
    const diagonal = run(room, gm, { type: "room.setDiagonalRule", rule: "alternating" });
    expect(diagonal.events).toEqual([{ type: "DiagonalRuleSet", rule: "alternating", previous: "equal" }]);
    expect(diagonalRuleOf(diagonal.state)).toBe("alternating");
    const difficult = run(diagonal.state, gm, { type: "room.setDifficultTerrain", mode: "both" });
    expect(difficult.events).toEqual([{ type: "DifficultTerrainSet", mode: "both", previous: "entry" }]);
    expect(difficultTerrainOf(difficult.state)).toBe("both");
  });

  it("shows both rules to every player", () => {
    const room = baseRoom();
    for (const event of [{ type: "DiagonalRuleSet", rule: "euclidean", previous: "equal" }, { type: "DifficultTerrainSet", mode: "exit", previous: "entry" }] as const) {
      expect(filterEventForViewer(committed(event), room, alice).kind).toBe("event");
    }
  });
});

describe("path movement: moves carry their path (FR-TAC-02, ADR 0055)", () => {
  // 70 px squares; a wall at x = 210 from y = 0 to y = 210 separates columns 2 and 3 on rows 0-2.
  const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
  const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
  function room() {
    const base = baseRoom();
    let state: RoomState = { ...base, scene: { ...base.scene, grid, map: { url: "/m.png", width: 700, height: 700 } } };
    state = run(state, gm, { type: "wall.add", walls: [{ a: { x: 210, y: 0 }, b: { x: 210, y: 210 } }] }).state;
    const created = run(state, gm, { type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [alice.id] });
    return { state: created.state, token: created.events[0]!.type === "TokenCreated" ? created.events[0]!.token : undefined! };
  }

  it("accepts a path around the wall and records it", () => {
    const { state, token } = room();
    // Straight through the wall is refused; down, across and up is not.
    expect(attempt(state, alice, { type: "token.move", tokenId: token.id, to: at(4, 1) })).toMatchObject({ ok: false });
    const via = [at(1, 3), at(4, 3)];
    const moved = run(state, alice, { type: "token.move", tokenId: token.id, to: at(4, 1), via });
    expect(moved.events).toEqual([{ type: "TokenMoved", tokenId: token.id, from: at(1, 1), to: at(4, 1), via }]);
    expect(moved.state.tokens[token.id]!.position).toEqual(at(4, 1));
  });

  it("refuses the whole move when any leg crosses the wall", () => {
    const { state, token } = room();
    const refused = attempt(state, alice, { type: "token.move", tokenId: token.id, to: at(4, 3), via: [at(1, 2), at(4, 2)] });
    expect(refused).toMatchObject({ ok: false, code: "invalid", message: "That move is unavailable." });
  });

  it("refuses a point off the map and a Reposition that carries a path", () => {
    const { state, token } = room();
    expect(attempt(state, alice, { type: "token.move", tokenId: token.id, to: at(4, 3), via: [{ x: -5, y: 35 }] })).toMatchObject({ ok: false });
    expect(attempt(state, gm, { type: "token.move", tokenId: token.id, to: at(4, 1), via: [at(1, 3)], reposition: true })).toMatchObject({ ok: false });
  });

  it("undoes a path move straight back to where it started", () => {
    const { state, token } = room();
    const moved = act(state, gm, { type: "token.move", tokenId: token.id, to: at(4, 1), via: [at(1, 3), at(4, 3)] });
    const undone = act(moved.state, gm, { type: "history.undo", commandId: moved.commandId });
    expect(undone.state.tokens[token.id]!.position).toEqual(at(1, 1));
    const inverse = undone.events.find((e) => e.type === "TokenMoved");
    expect(inverse).toEqual({ type: "TokenMoved", tokenId: token.id, from: at(4, 1), to: at(1, 1) });
  });

  it("records no path for a straight move", () => {
    const { state, token } = room();
    expect(run(state, alice, { type: "token.move", tokenId: token.id, to: at(1, 3), via: [] }).events[0]).not.toHaveProperty("via");
  });
});

describe("path movement: the private drag check judges whole paths (FR-GM-23, ADR 0055)", () => {
  const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
  const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
  function room(fogged = false) {
    const base = baseRoom();
    let state: RoomState = { ...base, scene: { ...base.scene, grid, map: { url: "/m.png", width: 700, height: 700 } } };
    state = run(state, gm, { type: "wall.add", walls: [{ a: { x: 210, y: 0 }, b: { x: 210, y: 210 } }] }).state;
    if (fogged) state = run(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 420 }, to: { x: 700, y: 700 } } }).state;
    const created = run(state, gm, { type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [alice.id] });
    const token = Object.values(created.state.tokens)[0]!;
    return { state: created.state, token };
  }
  const ask = (state: RoomState, tokenId: string, to: { x: number; y: number }, via?: { x: number; y: number }[]) =>
    movementFeedbackForViewer(state, alice, { type: "tokenMovePreview", requestId: "r1", tokenId, from: at(1, 1), to, ...(via && { via }), boardEpoch: 0 });

  it("is clear for a path around the wall and blocked when a leg crosses it", () => {
    const { state, token } = room();
    expect(ask(state, token.id, at(4, 1), [at(1, 3), at(4, 3)])).toBe("clear");
    expect(ask(state, token.id, at(4, 3), [at(1, 2), at(4, 2)])).toBe("blocked");
  });

  it("is unknown when any leg leaves what the player can see, whatever is there", () => {
    const { state, token } = room(true);
    // Row 6 is under fog: the middle legs pass through it.
    expect(ask(state, token.id, at(4, 1), [at(1, 7), at(4, 7)])).toBe("unknown");
  });

  it("is unknown for a point off the map", () => {
    const { state, token } = room();
    expect(ask(state, token.id, at(4, 1), [{ x: -10, y: 35 }])).toBe("unknown");
  });
});

describe("path movement: a path's turns reveal nothing hidden (FR-GM-23, ADR 0055)", () => {
  const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
  const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });
  function room(lineOfSight = false) {
    const base = baseRoom();
    let state: RoomState = { ...base, scene: { ...base.scene, grid, map: { url: "/m.png", width: 700, height: 700 }, ...(lineOfSight && { lineOfSight: true }) } };
    // Rows 5 and below are under fog.
    state = run(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 350 }, to: { x: 700, y: 700 } } }).state;
    const goblin = run(state, gm, { type: "token.create", name: "Goblin", position: at(1, 1) });
    const aria = run(goblin.state, gm, { type: "token.create", name: "Aria", position: at(8, 1), ownerIds: [alice.id] });
    return { state: aria.state, goblin: Object.values(goblin.state.tokens)[0]!, aria: Object.values(aria.state.tokens).find((t) => t.name === "Aria")! };
  }
  const moved = (tokenId: string, from: { x: number; y: number }, to: { x: number; y: number }, via: { x: number; y: number }[]): DomainEvent => ({ type: "TokenMoved", tokenId, from, to, via });

  it("sends only the stretches outside fog, with a gap across the one under it", () => {
    const { state, goblin } = room();
    // Down from (1,1) into the fog at row 5 (y = 350), across under it, and back up to (4,1).
    const event = moved(goblin.id, at(1, 1), at(4, 1), [at(1, 6), at(4, 6)]);
    const shown = filterEventForViewer(committed(event), state, alice);
    expect(shown.kind === "event" && shown.committed.event).toEqual({
      type: "TokenMoved", tokenId: goblin.id, from: at(1, 1), to: at(4, 1),
      via: [{ x: 105, y: 350 }, { x: 315, y: 350 }], gaps: [1],
    });
    // The GM sees the whole path.
    const forGm = filterEventForViewer(committed(event), state, gm);
    expect(forGm.kind === "event" && forGm.committed.event).toEqual(event);
  });

  it("sends no path at all when every stretch is hidden", () => {
    const { state, aria } = room();
    // Aria is Alice's, so Alice sees her anywhere; the GM moves her entirely under the fog.
    const event = moved(aria.id, at(8, 6), at(8, 8), [at(7, 7)]);
    const inFog = { ...state, tokens: { ...state.tokens, [aria.id]: { ...aria, position: at(8, 6) } } };
    const shown = filterEventForViewer(committed(event), inFog, alice);
    expect(shown.kind === "event" && shown.committed.event).toEqual({ type: "TokenMoved", tokenId: aria.id, from: at(8, 6), to: at(8, 8) });
  });

  it("keeps the turns of a move entirely in view, with no gaps", () => {
    const { state, goblin } = room();
    const event = moved(goblin.id, at(1, 1), at(4, 1), [at(1, 3), at(4, 3)]);
    const shown = filterEventForViewer(committed(event), state, alice);
    expect(shown.kind === "event" && shown.committed.event).toEqual(event);
  });

  it("still resyncs an owner's own move under line of sight", () => {
    const { state, aria } = room(true);
    expect(filterEventForViewer(committed(moved(aria.id, at(8, 1), at(8, 3), [at(7, 2)])), state, alice).kind).toBe("resync");
  });
});

describe("path movement: cutting a path at what a viewer can see (FR-GM-23, ADR 0055)", () => {
  it("cuts at the edge of sight, and keeps nothing out of sight", () => {
    // Sight is the square 0..200 x 0..200; the path leaves it to the right and comes back.
    const sight = [[{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }]];
    const result = visibleStretches([{ x: 50, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 150 }, { x: 50, y: 150 }], { fog: {}, sight });
    expect(result.points).toEqual([{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 150 }, { x: 50, y: 150 }]);
    expect(result.gaps).toEqual([1]);
  });

  it("returns a path in full view unchanged", () => {
    const path = [{ x: 10, y: 10 }, { x: 10, y: 90 }, { x: 90, y: 90 }];
    expect(visibleStretches(path, { fog: {}, sight: null })).toEqual({ points: path, gaps: [] });
  });
});
