import { describe, expect, it } from "vitest";
import {
  Command, DEFAULT_GRID, decide, describeUndo, DomainEvent, formatActivity, inverseOf,
  reduce, reduceCommitted, replayTo, undoableAction, UNDO_HISTORY_LIMIT,
  type CommandInput, type CommittedEvent, type DomainEvent as Event, type GridSpec, type RoomState,
} from "../src";
import { alice, baseRoom, ctx, gm, run } from "./fixtures";

const oldMap = { url: "/old.png", width: 1000, height: 800, assetId: "old-asset" };
const map = { url: "/new.png", width: 500, height: 400, assetId: "new-asset" };
const grid: GridSpec = { ...DEFAULT_GRID, cellSize: 40, offsetX: 3, offsetY: 5, unitLabel: "m", unitsPerCell: 2, lineColor: "#abcdef", lineWidth: 2, lineOpacity: 0.5 };
let commandNumber = 0;

function act(state: RoomState, command: CommandInput) {
  const decision = decide(state, gm, Command.parse(command), ctx);
  if (!decision.ok) throw new Error(decision.message);
  const commandId = `map-${++commandNumber}`;
  const next = decision.events.reduce((s, e) => reduce(s, e, { commandId, actorId: gm.id }), state);
  return { state: next, events: decision.events, commandId };
}

function setup(first = false) {
  let state = first ? baseRoom() : run(baseRoom(), gm, { type: "scene.setMap", map: oldMap }).state;
  state = run(state, gm, { type: "token.create", name: "Free", position: { x: -123.456, y: 987.654 }, ownerIds: [alice.id] }).state;
  state = run(state, gm, { type: "token.create", name: "Secret", position: { x: 105, y: 105 }, hidden: true, size: 1 }).state;
  state = run(state, gm, { type: "token.create", name: "Unadjusted", position: { x: 35, y: 35 }, size: 1 }).state;
  const ids = Object.fromEntries(Object.values(state.tokens).map((t) => [t.name, t.id]));
  return { state, free: ids.Free!, secret: ids.Secret!, untouched: ids.Unadjusted! };
}

function refusal(state: RoomState, commandId: string) {
  return decide(state, gm, Command.parse({ type: "history.undo", commandId }), ctx);
}

describe("composite map undo (KAN-66, FR-REC-02, FR-REC-03)", () => {
  it("restores exact map, complete grid and recorded positions in one inverse plus ActionUndone", () => {
    const before = setup().state;
    const applied = act(before, { type: "scene.setMap", map, grid });
    const entry = undoableAction(applied.state.undo, applied.commandId)!;
    expect(entry.events).toHaveLength(1);
    const event = entry.events[0]!;
    const inverse = inverseOf(event)[0]!;
    expect(DomainEvent.safeParse(inverse).success).toBe(true);
    const undone = act(applied.state, { type: "history.undo", commandId: applied.commandId });
    expect(undone.events).toEqual([inverse, { type: "ActionUndone", commandId: applied.commandId }]);
    expect(undone.state.scene).toEqual(before.scene);
    expect(undone.state.tokens).toEqual(before.tokens);
    expect(undoableAction(undone.state.undo, applied.commandId)).toBeUndefined();
    expect(undoableAction(undone.state.undo, undone.commandId)).toBeUndefined();
  });

  it("restores null on first-map undo and exact outside coordinates without old geometry validation", () => {
    const before = setup(true).state;
    const applied = act(before, { type: "scene.setMap", map, grid });
    const undone = act(applied.state, { type: "history.undo", commandId: applied.commandId });
    expect(undone.events[0]).toMatchObject({ type: "MapSet", map: null, previous: map, gridChange: { grid: DEFAULT_GRID, previous: grid } });
    expect(undone.state.scene).toEqual(before.scene);
    expect(undone.state.tokens).toEqual(before.tokens);
  });

  it("records omitted-grid actions and empty adjustments as undoable", () => {
    const applied = act(baseRoom(), { type: "scene.setMap", map });
    expect(undoableAction(applied.state.undo, applied.commandId)?.events).toMatchObject([{ type: "MapSet", tokenChanges: [] }]);
    expect(act(applied.state, { type: "history.undo", commandId: applied.commandId }).state.scene.map).toBeNull();
  });

  it("rejects changed map values, including an asset ID change", () => {
    const applied = act(setup().state, { type: "scene.setMap", map, grid });
    const changed = act(applied.state, { type: "scene.setMap", map: { ...map, assetId: "different" }, tokenPolicy: "keep" });
    expect(refusal(changed.state, applied.commandId)).toMatchObject({ ok: false, code: "invalid", message: "Can't undo: the map has changed since." });
  });

  it.each([
    { cellSize: 41 }, { offsetX: 4 }, { offsetY: 6 }, { unitsPerCell: 3 }, { unitLabel: "ft" },
    { lineColor: "#123456" }, { lineWidth: 3 }, { lineOpacity: 0.6 },
  ])("rejects changes to any complete applied grid value %j", (changes) => {
    const applied = act(setup().state, { type: "scene.setMap", map, grid });
    const changed = act(applied.state, { type: "scene.setGrid", grid: { ...grid, ...changes } });
    expect(refusal(changed.state, applied.commandId)).toMatchObject({ ok: false, code: "invalid", message: "Can't undo: the grid has changed since." });
  });

  it("rejects moved adjusted tokens", () => {
    const { state, free } = setup();
    const applied = act(state, { type: "scene.setMap", map, grid });
    const changed = act(applied.state, { type: "token.move", tokenId: free, to: { x: 111, y: 222 } });
    expect(refusal(changed.state, applied.commandId)).toMatchObject({ ok: false, code: "invalid", message: "Can't undo: Free has changed since." });
  });

  it("rejects deleted adjusted tokens with the recorded name", () => {
    const { state, secret } = setup();
    const applied = act(state, { type: "scene.setMap", map, grid });
    const changed = act(applied.state, { type: "token.delete", tokenId: secret });
    expect(refusal(changed.state, applied.commandId)).toMatchObject({ ok: false, code: "invalid", message: "Can't undo: Secret no longer exists." });
  });

  it("preserves unrelated token fields and newly created tokens even if sizes now exceed old geometry", () => {
    const { state, free } = setup();
    const applied = act(state, { type: "scene.setMap", map, grid });
    const position = applied.state.tokens[free]!.position;
    const edited = act(applied.state, { type: "token.configure", tokenId: free, changes: {
      name: "Renamed", size: 10, position, rotation: 45, hidden: true,
      stats: { hp: 2, maxHp: 8, ac: 13 }, ownerIds: [], conditions: ["prone"],
      attacks: [{ name: "Bite", toHit: null, damage: { terms: [{ count: 1, sides: 6 }], modifier: 1 } }],
    } });
    const added = act(edited.state, { type: "token.create", name: "New", position: { x: 2000, y: 2000 } });
    const undone = act(added.state, { type: "history.undo", commandId: applied.commandId });
    expect(undone.state.tokens[free]).toEqual({ ...edited.state.tokens[free], position: state.tokens[free]!.position });
    expect(Object.values(undone.state.tokens).find((t) => t.name === "New")).toEqual(Object.values(added.state.tokens).find((t) => t.name === "New"));
  });

  it("does not guard or overwrite a token absent from the adjustment array", () => {
    const { state, untouched } = setup();
    const applied = act(state, { type: "scene.setMap", map });
    const event = applied.events[0]!;
    if (event.type !== "MapSet") throw new Error("expected map");
    expect(event.tokenChanges?.some((c) => c.tokenId === untouched)).toBe(false);
    const changed = act(applied.state, { type: "token.move", tokenId: untouched, to: { x: 111, y: 222 } });
    const undone = act(changed.state, { type: "history.undo", commandId: applied.commandId });
    expect(undone.state.tokens[untouched]?.position).toEqual({ x: 111, y: 222 });
  });

  it("allows undo when guarded values return to their recorded results", () => {
    const { state, free } = setup();
    const applied = act(state, { type: "scene.setMap", map, grid });
    const away = act(applied.state, { type: "token.move", tokenId: free, to: { x: 111, y: 222 } });
    const back = act(away.state, { type: "token.move", tokenId: free, to: applied.state.tokens[free]!.position });
    expect(refusal(back.state, applied.commandId)).toMatchObject({ ok: true });
  });

  it("rebuilds complete undo entries after log replay and only appends compensation", () => {
    const before = setup().state;
    const applied = act(before, { type: "scene.setMap", map, grid });
    const prelude: Event[] = [
      { type: "RoomCreated", name: before.name },
      ...Object.values(before.participants).map((participant): Event => ({ type: "ParticipantJoined", participant })),
      { type: "MapSet", map: before.scene.map, previous: null, gridChange: { grid: before.scene.grid, previous: DEFAULT_GRID } },
      ...Object.values(before.tokens).map((token): Event => ({ type: "TokenCreated", token })),
    ];
    const log: CommittedEvent[] = [...prelude, ...applied.events].map((event, i) => ({
      seq: i + 1, at: "2026-10-05T00:00:00.000Z", actorId: gm.id, event,
      ...(i >= prelude.length ? { commandId: applied.commandId } : {}),
    }));
    const reloaded = replayTo(before.roomId, log, log.length);
    expect(undoableAction(reloaded.undo, applied.commandId)).toEqual(undoableAction(applied.state.undo, applied.commandId));
    const undo = refusal(reloaded, applied.commandId);
    if (!undo.ok) throw new Error(undo.message);
    const appended = [...log, ...undo.events.map((event, i) => ({ seq: log.length + i + 1, at: "now", actorId: gm.id, commandId: "undo-command", event }))];
    expect(appended.slice(0, log.length)).toEqual(log);
    const replayed = appended.reduce(reduceCommitted, baseRoom());
    expect(replayed.scene).toEqual(before.scene);
    expect(replayed.tokens).toEqual(before.tokens);
    expect(undoableAction(replayed.undo, applied.commandId)).toBeUndefined();
  });

  it("keeps map actions within the existing history bound", () => {
    let state = baseRoom();
    const ids: string[] = [];
    for (let i = 0; i < UNDO_HISTORY_LIMIT + 5; i++) {
      const applied = act(state, { type: "scene.setMap", map: { ...map, url: `/map-${i}.png` } });
      state = applied.state;
      ids.push(applied.commandId);
    }
    expect(state.undo).toHaveLength(UNDO_HISTORY_LIMIT + 1);
    expect(undoableAction(state.undo, ids[0]!)).toBeUndefined();
    expect(undoableAction(state.undo, ids.at(-1)!)).toBeDefined();
  });

  it("provides map placement/replacement/removal labels and counts for the Activity log", () => {
    const placed = act(setup(true).state, { type: "scene.setMap", map, grid });
    const entry = undoableAction(placed.state.undo, placed.commandId)!;
    expect(describeUndo(entry, placed.state.tokens)).toEqual({ verb: "map placement and 3 token positions", noun: "the map placement and 3 token positions" });
    expect(formatActivity(placed.events[0]!, "GM", placed.state)).toBe("GM set the map and grid, adjusting 3 tokens");
    const replacement = act(setup().state, { type: "scene.setMap", map, grid });
    expect(describeUndo(undoableAction(replacement.state.undo, replacement.commandId)!, replacement.state.tokens).verb).toContain("map replacement");
    const removal = inverseOf(entry.events[0]!)[0]!;
    expect(formatActivity(removal, "GM", placed.state)).toBe("GM removed the map, restoring the grid and 3 token positions");
    expect(describeUndo({ ...entry, events: [DomainEvent.parse(removal) as typeof entry.events[0]] }, placed.state.tokens).verb).toContain("map removal");
  });
});
