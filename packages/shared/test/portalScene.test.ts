import { describe, expect, it } from "vitest";
import { Command, decide, reduce, tableOf, type DomainEvent, type PreparedUvttScene, type RoomState, type Wall } from "../src";
import { alice, baseRoom, ctx, gm } from "./fixtures";

const map = { url: "/map.png", width: 700, height: 700 };
const wall: Wall = { id: "portal", a: { x: 140, y: 0 }, b: { x: 140, y: 700 }, uvttPortal: { position: { x: 120, y: 10 }, rotation: 1.2, closed: true, freestanding: true } };
function act(state: RoomState, input: unknown, actor = gm, preparedUvtt?: PreparedUvttScene) {
  const decision = decide(state, actor, Command.parse(input), { ...ctx, preparedUvtt });
  if (!decision.ok) throw new Error(decision.message);
  return { state: decision.events.reduce((s, e) => reduce(s, e, { commandId: Command.parse(input).type === "wall.update" ? "edit" : "action", actorId: actor.id }), state), events: decision.events };
}
const initial = () => ({ ...baseRoom(), scene: { ...baseRoom().scene, map }, walls: { [wall.id]: wall } });

describe("portal scene application and undo (FR-GM-06/09, FR-REC-02, FR-GM-23)", () => {
  it("updates a portal with its full previous value; open portals allow player paths and placement", () => {
    let state: RoomState = initial();
    const created = act(state, { type: "token.create", name: "Aria", ownerIds: [alice.id], position: { x: 105, y: 105 } });
    state = created.state; const tokenId = Object.keys(state.tokens)[0]!;
    expect(decide(state, alice, Command.parse({ type: "token.move", tokenId, to: { x: 175, y: 105 } }), ctx).ok).toBe(false);
    const edited = act(state, { type: "wall.update", wall: { ...wall, uvttPortal: { ...wall.uvttPortal, closed: false } } });
    expect(edited.events).toEqual([{ type: "WallUpdated", wall: { ...wall, uvttPortal: { ...wall.uvttPortal, closed: false } }, previous: wall }]);
    expect(decide(edited.state, alice, Command.parse({ type: "token.move", tokenId, to: { x: 175, y: 105 } }), ctx).ok).toBe(true);
    expect(decide(edited.state, gm, Command.parse({ type: "token.create", name: "Across", position: { x: 140, y: 105 } }), ctx).ok).toBe(true);
    expect(decide(state, alice, Command.parse({ type: "wall.update", wall }), ctx)).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(edited.state, { type: "history.undo", commandId: "edit" }).state.walls).toEqual(state.walls);
  });
  it("imports one full event and reverses first placement exactly; later wall edits guard undo", () => {
    const state = baseRoom();
    const preparation: PreparedUvttScene = { map, grid: state.scene.grid, walls: [wall], baseline: { map: null, grid: state.scene.grid, walls: state.walls, fog: state.fog, terrainRevision: state.terrainRevision ?? 0 } };
    const applied = act(state, { type: "scene.importUVTT", importId: "prep", revision: 1 }, gm, preparation);
    expect(applied.events).toHaveLength(1);
    expect(applied.events[0]).toMatchObject({ type: "MapSet", wallChange: { previous: [], walls: [expect.objectContaining({ uvttPortal: wall.uvttPortal })] } });
    const restored = act(applied.state, { type: "history.undo", commandId: "action" });
    expect(tableOf(restored.state)).toEqual(tableOf(state));
    const id = Object.keys(applied.state.walls)[0]!;
    const changed = reduce(applied.state, { type: "WallUpdated", previous: applied.state.walls[id]!, wall: { ...applied.state.walls[id]!, uvttPortal: { closed: false } } });
    expect(decide(changed, gm, Command.parse({ type: "history.undo", commandId: "action" }), ctx)).toMatchObject({ ok: false, code: "invalid" });
  });
  it("rejects changed baselines and accepts token-only movement; legacy replay does not clear", () => {
    const state = initial();
    const prep = { map, grid: state.scene.grid, walls: [], baseline: { map, grid: state.scene.grid, walls: state.walls, fog: state.fog, terrainRevision: state.terrainRevision ?? 0 } };
    expect(decide({ ...state, walls: {} }, gm, Command.parse({ type: "scene.importUVTT", importId: "p", revision: 1 }), { ...ctx, preparedUvtt: prep })).toMatchObject({ ok: false, code: "invalid" });
    const legacy: DomainEvent = { type: "MapSet", map: { ...map, url: "/other.png" }, previous: map };
    expect(reduce(state, legacy).walls).toEqual(state.walls);
  });
  it("checkpoint restoration preserves portal metadata and guards undo of wall additions after editing", () => {
    const state = initial();
    const restored = reduce({ ...state, walls: {} }, { type: "CheckpointRestored", checkpointId: "c", name: "Portals", restored: tableOf(state), previous: tableOf({ ...state, walls: {} }) });
    expect(restored.walls).toEqual(state.walls);
    const added = reduce({ ...state, walls: {} }, { type: "WallsAdded", walls: [wall] }, { commandId: "add", actorId: gm.id });
    const changed = reduce(added, { type: "WallUpdated", previous: wall, wall: { ...wall, b: { x: 150, y: 700 } } });
    expect(decide(changed, gm, Command.parse({ type: "history.undo", commandId: "add" }), ctx)).toMatchObject({ ok: false, code: "invalid" });
  });
  it("normalizes a moved portal's bounds and undoes all affected solid segments exactly", () => {
    const portal: Wall = { id: "p", a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, uvttPortal: { closed: false } };
    const solid: Wall = { id: "s", a: { x: 200, y: 100 }, b: { x: 700, y: 100 }, source: "objects_line_of_sight" };
    const state: RoomState = { ...initial(), walls: { p: portal, s: solid } };
    const changed = act(state, { type: "wall.update", wall: { ...portal, b: { x: 250, y: 100 } } });
    expect(changed.events.map((e) => e.type)).toEqual(["WallUpdated", "WallsRemoved", "WallsAdded"]);
    const remaining = Object.values(changed.state.walls).filter((w) => !w.uvttPortal);
    expect(remaining).toEqual([expect.objectContaining({ a: { x: 250, y: 100 }, b: solid.b, source: solid.source })]);
    expect(act(changed.state, { type: "history.undo", commandId: "edit" }).state.walls).toEqual(state.walls);
  });
  it("drawing leaves an open portal gap, while partial endpoint overlap is refused", () => {
    const portal: Wall = { id: "p", a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, uvttPortal: { closed: false } };
    const solid: Wall = { id: "s", a: { x: 200, y: 100 }, b: { x: 700, y: 100 } };
    const state: RoomState = { ...initial(), walls: { p: portal, s: solid } };
    const added = act(state, { type: "wall.add", walls: [{ a: { x: 0, y: 100 }, b: { x: 700, y: 100 } }] });
    expect(added.events).toMatchObject([{ type: "WallsAdded", walls: [{ a: { x: 0, y: 100 }, b: portal.a }, { a: portal.b, b: { x: 700, y: 100 } }] }]);
    expect(decide(state, gm, Command.parse({ type: "wall.update", wall: { ...solid, a: { x: 150, y: 100 } } }), ctx)).toMatchObject({ ok: false, code: "invalid", message: expect.stringContaining("overlaps") });
    expect(decide(state, gm, Command.parse({ type: "wall.update", wall: { ...solid, id: "__proto__" } }), ctx)).toMatchObject({ ok: false, code: "not_found" });
    expect(decide(state, gm, Command.parse({ type: "wall.remove", wallIds: ["constructor"] }), ctx)).toMatchObject({ ok: false, code: "not_found" });
  });
});
