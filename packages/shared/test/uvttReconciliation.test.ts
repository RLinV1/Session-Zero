import { describe, expect, it } from "vitest";
import { Command, decide, filterEventForViewer, filterStateForViewer, reduce, serializeUvtt, tableOf, type CommandInput, type PreparedUvttScene, type RoomState, type Wall } from "../src";
import { alice, baseRoom, ctx, gm } from "./fixtures";

const map = { url: "/uvtt.png", width: 700, height: 700 };
const imported: Wall = { id: "p", a: { x: 140, y: 70 }, b: { x: 140, y: 210 }, uvttPortal: { position: { x: 8, y: -25 }, rotation: 1.2, closed: true, freestanding: true }, source: "objects_line_of_sight" };
const initial = (): RoomState => ({ ...baseRoom(), scene: { ...baseRoom().scene, map }, walls: { p: imported } });
const preparationFor = (state: RoomState): PreparedUvttScene => ({
  map: { ...map, url: "/import.png" }, grid: state.scene.grid, walls: [imported],
  baseline: { map: state.scene.map, grid: state.scene.grid, walls: state.walls, fog: state.fog, terrainRevision: state.terrainRevision ?? 0 },
});
function apply(state: RoomState, command: CommandInput, id: string, actor = gm, prep?: PreparedUvttScene) {
  const result = decide(state, actor, Command.parse(command), { ...ctx, preparedUvtt: prep });
  if (!result.ok) throw new Error(result.message);
  return { events: result.events, state: result.events.reduce((s, event) => reduce(s, event, { commandId: id, actorId: actor.id }), state) };
}

describe("UVTT reconciled with native portals and fog (FR-GM-06/12/18/23, FR-REC-02)", () => {
  it("keeps generic imports private and preserves metadata while native designation uses existing player controls", () => {
    const state = initial();
    // A closed import in view arrives as a bare piece: no metadata, no real id (ADR 0041, ADR 0056).
    expect(filterStateForViewer(state, alice).walls).toEqual({ "seen:0": { id: "seen:0", a: imported.a, b: imported.b } });
    expect(decide(state, alice, Command.parse({ type: "portal.setState", wallId: "p", state: "open" }), ctx)).toMatchObject({ ok: false, code: "not_found" });
    const designated = apply(state, { type: "portal.set", wallId: "p", portal: { kind: "door", state: "closed" } }, "designate").state;
    expect(designated.walls.p!.uvttPortal).toEqual(imported.uvttPortal);
    expect(filterStateForViewer(designated, alice).walls).toEqual({ p: { id: "p", a: imported.a, b: imported.b, portal: { kind: "door", state: "closed" } } });
    const opened = apply(designated, { type: "portal.setState", wallId: "p", state: "open" }, "open", alice);
    expect(opened.events[0]).toMatchObject({ type: "PortalChanged" });
    expect(opened.state.walls.p!.uvttPortal).toEqual(imported.uvttPortal);
    const exported = serializeUvtt(map, state.scene.grid, Object.values(opened.state.walls), "image");
    expect(exported.portals[0]).toMatchObject({ closed: false, rotation: 1.2, freestanding: true });
    expect(exported.portals[0]).not.toHaveProperty("kind");
    expect(exported.line_of_sight).toEqual([]); expect(exported.objects_line_of_sight).toEqual([]);
    expect(apply(opened.state, { type: "history.undo", commandId: "open" }, "undo").state.walls).toEqual(designated.walls);
  });
  it("resyncs visible endpoint updates and hides metadata; fog conceals a native portal only when it covers all of it", () => {
    const state = initial(); state.walls.p = { ...imported, portal: { kind: "window", state: "locked" } };
    const edited = { ...state.walls.p, b: { x: 150, y: 210 } };
    const event = { type: "WallUpdated" as const, wall: edited, previous: state.walls.p };
    const committed = { event, seq: 3, at: "now", actorId: gm.id, commandId: "private" };
    expect(filterEventForViewer(committed, state, alice)).toEqual({ kind: "resync" });
    const next = reduce(state, event);
    expect(JSON.stringify(filterStateForViewer(next, alice).walls)).not.toMatch(/uvttPortal|source|freestanding|rotation/);
    // Partly outside fog: the whole portal still arrives (ADR 0056).
    const partly = apply(next, { type: "fog.add", region: { shape: "rect", from: { x: 130, y: 100 }, to: { x: 170, y: 180 } } }, "partly").state;
    expect(Object.keys(filterStateForViewer(partly, alice).walls)).toEqual(["p"]);
    const fogged = apply(next, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 50 }, to: { x: 200, y: 250 } } }, "fog").state;
    expect(filterStateForViewer(fogged, alice).walls).toEqual({});
    expect(decide(fogged, alice, Command.parse({ type: "portal.setState", wallId: "p", state: "open" }), ctx)).toMatchObject({ ok: false, code: "not_found" });
    expect(serializeUvtt(map, state.scene.grid, [state.walls.p], "image").portals[0]?.closed).toBe(true);
  });
  it("clears walls and fog in one ordinary map event and restores their full values with undo", () => {
    let state = initial(); state.walls.p = { ...imported, portal: { kind: "door", state: "locked" } };
    state = apply(state, { type: "fog.add", region: { shape: "rect", from: { x: 70, y: 70 }, to: { x: 210, y: 210 } } }, "fog").state;
    const replacement = apply(state, { type: "scene.setMap", map: { ...map, url: "/next.png" } }, "replace");
    expect(replacement.events).toHaveLength(1);
    expect(replacement.events[0]).toMatchObject({ type: "MapSet", wallChange: { previous: [state.walls.p], walls: [] }, fogChange: { previous: Object.values(state.fog), fog: [] } });
    expect(replacement.state.fog).toEqual({}); expect(replacement.state.walls).toEqual({});
    expect(tableOf(apply(replacement.state, { type: "history.undo", commandId: "replace" }, "undo").state)).toEqual(tableOf(state));
    const later = apply(replacement.state, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } }, "later").state;
    expect(decide(later, gm, Command.parse({ type: "history.undo", commandId: "replace" }), ctx)).toMatchObject({ ok: false, message: expect.stringContaining("fog") });
  });
  it("guards draft fog and runtime portal edits while preserving legacy replay and first-map null undo", () => {
    const state = initial();
    const prep = preparationFor(state);
    const fogged = apply(state, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } }, "fog").state;
    expect(decide(fogged, gm, Command.parse({ type: "scene.importUVTT", importId: "p", revision: 1 }), { ...ctx, preparedUvtt: prep })).toMatchObject({ ok: false, message: expect.stringContaining("fog") });
    const fresh = baseRoom();
    const first = apply(fresh, { type: "scene.importUVTT", importId: "p", revision: 1 }, "import", gm, preparationFor(fresh));
    expect(tableOf(apply(first.state, { type: "history.undo", commandId: "import" }, "undo").state)).toEqual(tableOf(fresh));
    const designated = apply(first.state, { type: "portal.set", wallId: Object.keys(first.state.walls)[0]!, portal: { kind: "door", state: "open" } }, "designate").state;
    expect(decide(designated, gm, Command.parse({ type: "history.undo", commandId: "import" }), ctx)).toMatchObject({ ok: false, message: expect.stringContaining("portals") });
    expect(reduce(state, { type: "MapSet", map: prep.map, previous: map }).fog).toEqual(state.fog);
    expect(reduce(state, { type: "MapSet", map: prep.map, previous: map }).walls).toEqual(state.walls);
  });
  it.each(["map", "grid", "walls", "fog"] as const)("still guards changed %s independently of the terrain revision", (field) => {
    const state = initial();
    const changed: Record<typeof field, RoomState> = {
      map: { ...state, scene: { ...state.scene, map: { ...map, url: "/other.png" } } },
      grid: { ...state, scene: { ...state.scene, grid: { ...state.scene.grid, offsetX: 1 } } },
      walls: { ...state, walls: {} },
      fog: { ...state, fog: { f: { id: "f", shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] } } },
    };
    expect(decide(changed[field], gm, Command.parse({ type: "scene.importUVTT", importId: "p", revision: 1 }), { ...ctx, preparedUvtt: preparationFor(state) })).toMatchObject({ ok: false, code: "invalid", message: expect.stringContaining("changed") });
  });
  it.each([
    { name: "absent terrain", terrain: undefined },
    { name: "explicit Normal terrain", terrain: { base: [], effects: [] } },
    { name: "existing terrain", terrain: { base: [{ row: 0, start: 0, end: 0, kind: "difficult" as const }], effects: [] } },
  ])("treats an absent revision as zero for legacy rooms with $name (FR-TAC-03)", ({ terrain }) => {
    const state: RoomState = { ...initial(), terrain };
    expect(state.terrainRevision).toBeUndefined();
    const prep = preparationFor(state);
    const command = { type: "scene.importUVTT" as const, importId: "p", revision: 1 };
    expect(apply(state, command, "import", gm, prep).state.terrain).toBeUndefined();
    expect(decide({ ...state, terrainRevision: 0 }, gm, Command.parse(command), { ...ctx, preparedUvtt: prep }).ok).toBe(true);
    const painted = apply(state, { type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 1, end: 1, kind: "blocked" }], context: { boardEpoch: 0, revision: 0 } }, "paint").state;
    expect(painted.terrainRevision).toBe(1);
    expect(decide(painted, gm, Command.parse(command), { ...ctx, preparedUvtt: prep })).toMatchObject({ ok: false, code: "invalid", message: expect.stringContaining("terrain") });
  });
});
