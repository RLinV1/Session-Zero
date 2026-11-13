import { describe, expect, it } from "vitest";
import {
  Command,
  decide,
  Drawing,
  filterEventForViewer,
  filterStateForViewer,
  MAX_DRAWING_POINTS,
  MAX_DRAWINGS,
  MAX_STROKE_POINTS,
  reduce,
  TableState,
  tableOf,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DrawingShape,
  type Participant,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, bob, ctx, gm, run } from "./fixtures";

const MAP = { url: "/u/map.png", width: 1400, height: 1000 };
const withMap = (): RoomState => run(baseRoom(), gm, { type: "scene.setMap", map: MAP }).state;

const line: DrawingShape = { kind: "line", color: "red", from: { x: 100, y: 100 }, to: { x: 300, y: 200 } };
const stroke = (points: number): DrawingShape => ({
  kind: "stroke",
  color: "blue",
  points: Array.from({ length: points }, (_, i) => [10 + (i % 1000), 10 + (i % 900)]).flat(),
});
const add = (drawing: DrawingShape): CommandInput => ({ type: "drawing.add", drawing });
const added = (state: RoomState, actor: Participant, drawing: DrawingShape) => {
  const { state: next, events } = run(state, actor, add(drawing));
  const event = events[0];
  if (event?.type !== "DrawingAdded") throw new Error("expected DrawingAdded");
  return { state: next, drawing: event.drawing };
};
const committed = (event: CommittedEvent["event"], seq = 10): CommittedEvent => ({ seq, at: "2026-11-12T00:00:00.000Z", actorId: gm.id, event });

/** Like the server: decide, then reduce every event of the batch under one command id, so undo is tracked. */
let batch = 0;
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `draw-cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, commandId: meta.commandId };
}

describe("shared drawings: schema (FR-TAC-04, ADR 0064)", () => {
  it("accepts a two-point line and a stroke of whole pixels", () => {
    expect(Command.safeParse(add(line)).success).toBe(true);
    expect(Command.safeParse(add(stroke(2))).success).toBe(true);
    expect(Command.safeParse(add(stroke(MAX_STROKE_POINTS))).success).toBe(true);
  });

  it("rejects odd, too long or fractional strokes and unknown colours", () => {
    expect(Command.safeParse(add({ kind: "stroke", color: "blue", points: [1, 2, 3, 4, 5] })).success).toBe(false);
    expect(Command.safeParse(add({ kind: "stroke", color: "blue", points: [1, 2] })).success).toBe(false);
    expect(Command.safeParse(add(stroke(MAX_STROKE_POINTS + 1))).success).toBe(false);
    expect(Command.safeParse(add({ kind: "stroke", color: "blue", points: [1, 2, 3.5, 4] })).success).toBe(false);
    expect(Command.safeParse(add({ ...line, from: { x: 1.5, y: 2 } } as DrawingShape)).success).toBe(false);
    expect(Command.safeParse({ type: "drawing.add", drawing: { ...line, color: "#ff0000" } }).success).toBe(false);
  });

  it("parses a table saved before drawings were shared", () => {
    const { drawings: _none, ...old } = tableOf(baseRoom());
    expect(TableState.safeParse(old).success).toBe(true);
  });
});

describe("shared drawings: adding (FR-TAC-04, ADR 0064)", () => {
  it("lets any participant draw for everyone, owned by them", () => {
    const { state, drawing } = added(withMap(), alice, line);
    expect(drawing).toMatchObject({ ...line, ownerId: alice.id });
    expect(Drawing.parse(drawing)).toEqual(drawing);
    expect(state.drawings[drawing.id]).toEqual(drawing);
    expect(filterStateForViewer(state, bob).drawings[drawing.id]).toEqual(drawing);
  });

  it("refuses a drawing with no map, or with a point off the map", () => {
    expect(attempt(baseRoom(), alice, add(line))).toMatchObject({ ok: false, code: "invalid" });
    const off = { ...line, to: { x: MAP.width + 1, y: 10 } };
    expect(attempt(withMap(), alice, add(off))).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(withMap(), alice, add({ kind: "stroke", color: "red", points: [10, 10, 20, -1] }))).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(withMap(), alice, add({ kind: "stroke", color: "red", points: [10, 10, 20, MAP.height + 5] }))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses a drawing past the scene's point budget, with a message", () => {
    let state = withMap();
    // 40 strokes of 500 points fill the 20,000-point budget exactly.
    for (let i = 0; i < MAX_DRAWING_POINTS / MAX_STROKE_POINTS; i++) state = added(state, alice, stroke(MAX_STROKE_POINTS)).state;
    const refused = attempt(state, bob, add(line));
    expect(refused).toMatchObject({ ok: false, code: "invalid" });
    expect(refused.ok ? "" : refused.message).toMatch(/too many drawings/i);
  });

  it("refuses a drawing past the scene's drawing count", () => {
    let state = withMap();
    for (let i = 0; i < MAX_DRAWINGS; i++) state = added(state, alice, line).state;
    expect(attempt(state, alice, add(line))).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("shared drawings: erasing (FR-TAC-04, ADR 0064)", () => {
  it("lets the drawer or the GM erase, but not another player", () => {
    const { state, drawing } = added(withMap(), alice, line);
    expect(attempt(state, bob, { type: "drawing.remove", drawingId: drawing.id })).toMatchObject({ ok: false, code: "forbidden" });

    const byOwner = run(state, alice, { type: "drawing.remove", drawingId: drawing.id });
    expect(byOwner.events[0]).toEqual({ type: "DrawingRemoved", drawing });
    expect(byOwner.state.drawings[drawing.id]).toBeUndefined();

    expect(run(state, gm, { type: "drawing.remove", drawingId: drawing.id }).state.drawings[drawing.id]).toBeUndefined();
  });

  it("answers a missing drawing with not_found", () => {
    expect(attempt(withMap(), gm, { type: "drawing.remove", drawingId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("shared drawings: not undoable (FR-TAC-04, ADR 0064)", () => {
  it("never appears among the GM's undoable actions", () => {
    const drawn = act(withMap(), alice, add(line));
    expect(undoableAction(drawn.state.undo, drawn.commandId)).toBeFalsy();
    const id = Object.keys(drawn.state.drawings)[0]!;
    const erased = act(drawn.state, gm, { type: "drawing.remove", drawingId: id });
    expect(undoableAction(erased.state.undo, erased.commandId)).toBeFalsy();
  });
});

describe("shared drawings: scenes (FR-TAC-04, ADR 0064)", () => {
  it("keeps each scene's drawings and starts a new scene with none", () => {
    const { state, drawing } = added(withMap(), alice, line);
    const created = run(state, gm, { type: "scene.create", name: "Cellar" }).state;
    expect(created.drawings).toEqual({});
    const back = run(created, gm, { type: "scene.switch", sceneId: Object.keys(created.savedScenes ?? {})[0]! }).state;
    expect(back.drawings).toEqual({ [drawing.id]: drawing });
  });
});

describe("shared drawings: visibility (FR-TAC-04, ADR 0064)", () => {
  it("sends the GM's drawing over fog to players, in snapshots and as events", () => {
    let state = run(withMap(), gm, {
      type: "fog.add",
      region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 1400, y: 1000 } },
    }).state;
    const before = state;
    const result = added(state, gm, line);
    state = result.state;
    expect(filterStateForViewer(state, alice).drawings[result.drawing.id]).toEqual(result.drawing);
    expect(filterEventForViewer(committed({ type: "DrawingAdded", drawing: result.drawing }), before, alice)).toMatchObject({ kind: "event" });
    expect(filterEventForViewer(committed({ type: "DrawingRemoved", drawing: result.drawing }), state, bob)).toMatchObject({ kind: "event" });
  });
});
