import { describe, expect, it } from "vitest";
import { Command, formatActivity, reduce, Scene, DEFAULT_GRID, filterStateForViewer, buildingsForScene } from "../src";
import { alice, attempt, baseRoom, gm, run } from "./fixtures";

const ON = { type: "scene.setIsometric", enabled: true } as const;

describe("2.5D map style (FR-GM-19)", () => {
  it("saves editable buildings only in isometric mode, preserving previous heights", () => {
    const flat = run(baseRoom(), gm, { type: "scene.setMap", map: { url: "/map", width: 700, height: 700 } }).state;
    const building = { id: "house", name: "House", height: 2, footprint: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] };
    const command = { type: "scene.setBuildings" as const, expectedMapUrl: "/map", buildings: [building] };
    expect(attempt(flat, gm, command)).toMatchObject({ ok: false, code: "invalid" });
    const iso = run(flat, gm, ON).state;
    const first = run(iso, gm, command);
    expect(buildingsForScene(first.state.scene)).toEqual([building]);
    const next = run(first.state, gm, { ...command, buildings: [{ ...building, height: 3 }] });
    expect(next.events[0]).toMatchObject({ type: "BuildingsSet", from: { items: [{ height: 2 }] }, to: { items: [{ height: 3 }] } });
    expect(attempt(next.state, alice, command)).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(next.state, gm, { ...command, expectedMapUrl: "/other" })).toMatchObject({ ok: false, code: "invalid" });
    expect(Command.safeParse({ ...command, buildings: [{ ...building, height: -1 }] }).success).toBe(false);
    const replaced = run(next.state, gm, { type: "scene.setMap", map: { url: "/new", width: 700, height: 700 } }).state;
    expect(buildingsForScene(replaced.scene)).toEqual([]);
  });

  it("withholds concealed outlines and all building geometry in flat player views", () => {
    const building = { id: "house", name: "Secret house", height: 2, footprint: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] };
    const state = baseRoom();
    state.scene = { ...state.scene, map: { url: "/map", width: 700, height: 700 }, isometric: true, isometricBuildings: { mapUrl: "/map", items: [building] } };
    expect(buildingsForScene(filterStateForViewer(state, alice).scene)).toEqual([building]);
    state.fog.hidden = { id: "hidden", shape: "rect", points: [{ x: 150, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 200 }, { x: 150, y: 200 }] };
    expect(filterStateForViewer(state, alice).scene.isometricBuildings).toBeUndefined();
    state.fog = {};
    state.scene.isometric = false;
    expect(filterStateForViewer(state, alice).scene.isometricBuildings).toBeUndefined();
  });
  it("defaults to flat for scenes from before the field existed", () => {
    expect(buildingsForScene(baseRoom().scene)).toEqual([]);
    expect(Scene.parse({ map: null, grid: DEFAULT_GRID }).isometric).toBeUndefined();
    expect(run(baseRoom(), gm, ON).events[0]).toMatchObject({ from: false });
  });

  it("lets the GM set it, recording the replaced value", () => {
    const { state, events } = run(baseRoom(), gm, ON);
    expect(events).toEqual([{ type: "IsometricSet", from: false, to: true }]);
    expect(state.scene.isometric).toBe(true);
    expect(reduce(state, { type: "IsometricSet", from: true, to: false }, { commandId: "c", actorId: gm.id }).scene.isometric).toBe(false);
  });

  it("forbids players and rejects a no-op", () => {
    expect(attempt(baseRoom(), alice, ON)).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(baseRoom(), gm, { type: "scene.setIsometric", enabled: false })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects a forged payload", () => {
    expect(Command.safeParse({ type: "scene.setIsometric", enabled: "yes" }).success).toBe(false);
    expect(Command.safeParse({ ...ON, extra: 1 }).success).toBe(false);
  });

  it("writes the activity line", () => {
    expect(formatActivity({ type: "IsometricSet", from: false, to: true }, "Mara", baseRoom())).toBe("Mara set the map style to 2.5D isometric");
  });
});
