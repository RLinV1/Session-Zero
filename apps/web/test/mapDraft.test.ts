import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, MAX_WALLS_PER_ADD, type FogRegion, type Wall } from "@vtt/shared";
import { applyToDraft, draftDirty, draftFrom, planDraftSave, withDetectedWalls, type MapDraft } from "../src/pages/mapEditor/mapDraft";

/** Inspect the edits inside the single atomic save; envelope/context tests live in preparationSave. */
const plannedEdits = (...args: Parameters<typeof planDraftSave>) => {
  const plan = planDraftSave(...args);
  expect(plan.length).toBeLessThanOrEqual(1);
  expect(plan.every((command) => command.type === "scene.savePreparation")).toBe(true);
  return plan.flatMap((command) => command.type === "scene.savePreparation" ? command.edits : []);
};

const wall = (id: string, x0: number, y0: number, x1: number, y1: number): Wall => ({ id, a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
const rect = (id: string, x0: number, y0: number, x1: number, y1: number): FogRegion => ({
  id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const expectedMapUrl = "/uploads/map.png";
const scene = { map: { url: expectedMapUrl, width: 700, height: 700 }, grid: DEFAULT_GRID };
const room = { scene, walls: { w1: wall("w1", 0, 0, 100, 0), w2: wall("w2", 0, 0, 0, 100) }, fog: { f1: rect("f1", 0, 0, 70, 70) } };
const fresh = (): MapDraft => ({ mapUrl: "/uploads/map.png", ...room, lineOfSight: false, isometric: false, sightRange: null });
let n = 0;
const newId = () => `draft:${++n}`;

describe("map editor drafts (map-editor-drafts)", () => {
  it("captures scene identity and refuses a same-map draft from another scene", () => {
    const source = { ...room, activeSceneId: "tavern" };
    const draft = { ...draftFrom(source), fog: {} };
    expect(planDraftSave(source, draft)).toEqual([{
      type: "scene.savePreparation", expectedMapUrl, expectedSceneId: "tavern", context: { boardEpoch: 0, revision: 0 },
      edits: [{ type: "fog.replace", expectedMapUrl, expectedSceneId: "tavern", removeIds: ["f1"], add: [] }],
    }]);
    expect(() => planDraftSave({ ...source, activeSceneId: "cellar" }, draft)).toThrow("The scene changed");
  });
  it("preserves overlapping wall and fog multiplicity through add, save, and erase", () => {
    const reversed = { ...room.walls.w1, a: room.walls.w1.b, b: room.walls.w1.a };
    let draft = applyToDraft(fresh(), { type: "wall.add", walls: [reversed] }, newId)!;
    draft = applyToDraft(draft, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } }, newId)!;
    expect(plannedEdits(room, draft).map((c) => c.type)).toEqual(["wall.add", "fog.replace"]);
    const saved = { ...room, walls: { ...room.walls, w3: { ...reversed, id: "w3" } }, fog: { ...room.fog, f2: { ...room.fog.f1, id: "f2" } } };
    expect(plannedEdits(saved, draft)).toEqual([]);
    const savedDraft = { mapUrl: expectedMapUrl, walls: saved.walls, fog: saved.fog, lineOfSight: false, isometric: false, sightRange: null };
    let erased = applyToDraft(savedDraft, { type: "wall.remove", wallIds: ["w1"] }, newId)!;
    erased = applyToDraft(erased, { type: "fog.remove", regionId: "f1" }, newId)!;
    expect(draftDirty(saved, erased)).toBe(true);
    expect(plannedEdits(saved, erased)).toEqual([
      { type: "wall.remove", expectedMapUrl, wallIds: ["w1"] },
      { type: "fog.replace", expectedMapUrl, removeIds: ["f1"], add: [] },
    ]);
  });

  it("keeps portal edits attached to the retained overlapping wall", () => {
    const closed = { kind: "door", state: "closed" } as const;
    const open = { kind: "window", state: "open" } as const;
    const saved = { ...room, walls: { w1: { ...room.walls.w1, portal: closed }, w2: { ...room.walls.w1, id: "w2", portal: open } } };
    const draft = applyToDraft({ mapUrl: expectedMapUrl, ...saved, lineOfSight: false, isometric: false, sightRange: null }, { type: "portal.set", wallId: "w1", portal: { kind: "door", state: "locked" } }, newId)!;
    expect(plannedEdits(saved, draft)).toEqual([{ type: "portal.set", expectedMapUrl, wallId: "w1", portal: { kind: "door", state: "locked" } }]);
    const detected = withDetectedWalls(draft, [room.walls.w1, room.walls.w1], newId);
    expect(Object.keys(detected.walls)).toEqual(["w1"]);
    expect(detected.walls.w1!.portal).toEqual({ kind: "door", state: "locked" });
  });

  it("refuses planning against another map and binds every save command to its map", () => {
    const draft = applyToDraft(fresh(), { type: "wall.add", walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }] }, newId)!;
    expect(plannedEdits(room, draft).every((c) => "expectedMapUrl" in c && c.expectedMapUrl === expectedMapUrl)).toBe(true);
    const other = { ...room, scene: { ...scene, map: { ...scene.map, url: "/uploads/other.png" } } };
    expect(() => plannedEdits(other, draft)).toThrow(/map changed/i);
    expect(draftDirty(other, draft)).toBe(false);
  });

  it("has nothing to save until the draft changes", () => {
    expect(plannedEdits(room, fresh())).toEqual([]);
    expect(draftDirty(room, fresh())).toBe(false);
  });

  it("changes walls first, then swaps fog in one command", () => {
    let draft = fresh();
    draft = applyToDraft(draft, { type: "fog.remove", expectedMapUrl, regionId: "f1" }, newId)!;
    draft = applyToDraft(draft, { type: "fog.add", expectedMapUrl, region: { shape: "rect", from: { x: 140, y: 140 }, to: { x: 70, y: 70 } } }, newId)!;
    draft = applyToDraft(draft, { type: "wall.remove", expectedMapUrl, wallIds: ["w1"] }, newId)!;
    draft = applyToDraft(draft, { type: "wall.add", expectedMapUrl, walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }, { a: { x: 9, y: 9 }, b: { x: 9, y: 90 } }] }, newId)!;
    expect(plannedEdits(room, draft)).toEqual([
      { type: "wall.remove", expectedMapUrl, wallIds: ["w1"] },
      { type: "wall.add", expectedMapUrl, walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }, { a: { x: 9, y: 9 }, b: { x: 9, y: 90 } }] },
      { type: "fog.replace", expectedMapUrl, removeIds: ["f1"], add: [{ shape: "rect", from: { x: 70, y: 70 }, to: { x: 140, y: 140 } }] },
    ]);
  });

  it("matches walls by geometry, either way round, so a detection keeps existing walls", () => {
    const detected = [{ a: { x: 100, y: 0 }, b: { x: 0, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } }];
    expect(plannedEdits(room, withDetectedWalls(fresh(), detected, newId))).toEqual([]);
  });

  it("keeps the doors and windows of stored walls through apply and save (FR-GM-09)", () => {
    const stored = [
      { a: { x: 10, y: 10 }, b: { x: 10, y: 80 }, portal: { kind: "door", state: "locked" } as const },
      { a: { x: 20, y: 10 }, b: { x: 20, y: 80 }, portal: { kind: "window", state: "closed" } as const },
    ];
    const save = plannedEdits(room, withDetectedWalls(fresh(), stored, newId));
    const added = save.flatMap((c) => (c.type === "wall.add" ? c.walls : []));
    expect(added.map((w) => w.portal)).toEqual([{ kind: "door", state: "locked" }, { kind: "window", state: "closed" }]);
  });

  it("counts a wall the detection found twice once", () => {
    const twice = [{ a: { x: 1, y: 1 }, b: { x: 1, y: 9 } }, { a: { x: 1, y: 9 }, b: { x: 1, y: 1 } }];
    expect(Object.keys(withDetectedWalls(fresh(), twice, newId).walls)).toHaveLength(1);
  });

  it("keeps the window when a stored segment comes plain and then with one, and puts it on a plain draft wall", () => {
    const window = { kind: "window", state: "closed" } as const;
    const found = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, portal: window }];
    expect(Object.values(withDetectedWalls(fresh(), found, newId).walls).map((w) => w.portal)).toEqual([window]);
    const onPlain = withDetectedWalls({ ...fresh(), walls: { w1: room.walls.w1 } }, [found[1]!], newId);
    expect(onPlain.walls).toEqual({ w1: { ...room.walls.w1, portal: window } });
  });

  it("clears with one command when every wall goes", () => {
    expect(plannedEdits(room, applyToDraft(fresh(), { type: "wall.clear", expectedMapUrl }, newId)!)).toEqual([{ type: "wall.clear", expectedMapUrl }]);
  });

  it("sends a big detection in batches within the per-command limit", () => {
    const detected = Array.from({ length: MAX_WALLS_PER_ADD * 2 + 3 }, (_, i) => ({ a: { x: i, y: 200 }, b: { x: i, y: 300 } }));
    const plan = plannedEdits({ scene, walls: {}, fog: room.fog }, withDetectedWalls(fresh(), detected, newId));
    expect(plan.map((c) => (c.type === "wall.add" ? c.walls.length : 0))).toEqual([MAX_WALLS_PER_ADD, MAX_WALLS_PER_ADD, 3]);
  });

  it("agrees with the room again once a save has reached it, whatever ids the room gave", () => {
    const draft = applyToDraft(fresh(), { type: "fog.add", expectedMapUrl, region: { shape: "rect", from: { x: 0, y: 140 }, to: { x: 70, y: 210 } } }, newId)!;
    const saved = { ...room, fog: { ...room.fog, f9: rect("f9", 0, 140, 70, 210) } };
    expect(plannedEdits(saved, draft)).toEqual([]);
  });
});

describe("doors and windows in the draft (FR-GM-09, ADR 0030)", () => {
  const door = { kind: "door", state: "closed" } as const;

  it("marks a kept wall in the draft and saves it with portal.set", () => {
    const draft = applyToDraft(fresh(), { type: "portal.set", expectedMapUrl, wallId: "w1", portal: door }, newId)!;
    expect(draft.walls.w1!.portal).toEqual(door);
    expect(plannedEdits(room, draft)).toEqual([{ type: "portal.set", expectedMapUrl, wallId: "w1", portal: door }]);
    const plain = applyToDraft(draft, { type: "portal.set", expectedMapUrl, wallId: "w1", portal: null }, newId)!;
    expect(plain.walls.w1).toEqual(room.walls.w1);
    expect(draftDirty(room, plain)).toBe(false);
  });

  it("adds a new wall with its door in one wall.add", () => {
    let draft = applyToDraft(fresh(), { type: "wall.add", expectedMapUrl, walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }] }, newId)!;
    const id = Object.keys(draft.walls).find((k) => k.startsWith("draft:"))!;
    draft = applyToDraft(draft, { type: "portal.set", expectedMapUrl, wallId: id, portal: door }, newId)!;
    expect(plannedEdits(room, draft)).toEqual([{ type: "wall.add", expectedMapUrl, walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 }, portal: door }] }]);
  });

  it("keeps a door when detection finds the same wall again", () => {
    const marked = { scene, walls: { ...room.walls, w1: { ...room.walls.w1, portal: door } }, fog: room.fog };
    const detected = [{ a: { x: 100, y: 0 }, b: { x: 0, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } }];
    const draft = withDetectedWalls({ mapUrl: "/uploads/map.png", ...marked, lineOfSight: false, isometric: false, sightRange: null }, detected, newId);
    expect(plannedEdits(marked, draft)).toEqual([]);
  });
});


describe("UVTT metadata in the existing private editor (FR-GM-06/09)", () => {
  const imported: Wall = { ...room.walls.w1, uvttPortal: { position: { x: 5, y: 7 }, rotation: 1.2, closed: false, freestanding: true }, source: "objects_line_of_sight" };
  it("preserves metadata through designation, detection and full endpoint save", () => {
    const saved = { ...room, walls: { w1: imported } };
    let draft = applyToDraft({ mapUrl: expectedMapUrl, ...saved, lineOfSight: false, isometric: false, sightRange: null }, { type: "portal.set", wallId: "w1", portal: { kind: "door", state: "locked" } }, newId)!;
    expect(draft.walls.w1!.uvttPortal).toEqual(imported.uvttPortal);
    expect(plannedEdits(saved, draft)).toEqual([{ type: "portal.set", expectedMapUrl, wallId: "w1", portal: { kind: "door", state: "locked" } }]);
    expect(withDetectedWalls(draft, [imported], newId).walls.w1).toEqual(draft.walls.w1);
    draft = applyToDraft(draft, { type: "wall.update", wall: { ...draft.walls.w1!, b: { x: 160.0000001, y: 0 } } }, newId)!;
    expect(plannedEdits(saved, draft)).toEqual([{ type: "wall.update", expectedMapUrl, wall: draft.walls.w1 }]);
  });
  it("adds a new imported portal with metadata and normalizes overlap in the draft", () => {
    const empty = { ...room, walls: {} };
    let draft = applyToDraft({ mapUrl: expectedMapUrl, ...empty, lineOfSight: false, isometric: false, sightRange: null }, { type: "wall.add", walls: [imported] }, newId)!;
    expect(plannedEdits(empty, draft)[0]).toMatchObject({ type: "wall.add", walls: [expect.objectContaining({ uvttPortal: imported.uvttPortal, source: imported.source })] });
    draft = applyToDraft(draft, { type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }] }, newId)!;
    expect(Object.values(draft.walls).filter((w) => !w.uvttPortal)).toEqual([expect.objectContaining({ a: { x: 100, y: 0 }, b: { x: 200, y: 0 } })]);
  });
});

describe("moving and reshaping fog in the draft (map editor Fog step)", () => {
  it("swaps one region for its new corners in one step, and Save sends it as a fog.replace", () => {
    const moved = [{ x: 100, y: 100 }, { x: 170, y: 100 }, { x: 170, y: 170 }, { x: 100, y: 170 }];
    const draft = applyToDraft(fresh(), { type: "fog.replace", removeIds: ["f1"], add: [{ shape: "polygon", points: moved }] }, newId)!;
    expect(Object.keys(draft.fog)).toHaveLength(1);
    expect(draft.fog.f1).toBeUndefined();
    expect(Object.values(draft.fog)[0]?.points).toEqual(moved);
    const plan = plannedEdits(room, draft);
    expect(plan.map((c) => c.type)).toEqual(["fog.replace"]);
    expect(plan[0]).toMatchObject({ removeIds: ["f1"] });
  });

  it("holds line of sight and sight range in the draft and saves them after walls and fog (FR-GM-19)", () => {
    let draft = applyToDraft(fresh(), { type: "scene.setLineOfSight", enabled: true }, newId)!;
    draft = applyToDraft(draft, { type: "scene.setSightRange", range: 60 }, newId)!;
    draft = applyToDraft(draft, { type: "fog.remove", regionId: "f1" }, newId)!;
    expect(draft).toMatchObject({ lineOfSight: true, sightRange: 60 });
    expect(draftDirty(room, draft)).toBe(true);
    expect(plannedEdits(room, draft)).toEqual([
      { type: "fog.replace", expectedMapUrl, removeIds: ["f1"], add: [] },
      { type: "scene.setLineOfSight", enabled: true },
      { type: "scene.setSightRange", range: 60 },
    ]);
    const saved = { ...room, scene: { ...scene, lineOfSight: true, sightRange: 60 } };
    expect(plannedEdits(saved, { ...draft, fog: room.fog })).toEqual([]);
    const unlimited = applyToDraft({ ...draft, fog: room.fog }, { type: "scene.setSightRange", range: null }, newId)!;
    expect(plannedEdits(saved, unlimited)).toEqual([{ type: "scene.setSightRange", range: null }]);
  });
});

describe("room terrain layers in the map editor draft (FR-GM-15)", () => {
  const ctx = { boardEpoch: 2, revision: 5 };
  const withTerrain = (terrain: NonNullable<MapDraft["terrain"]>): MapDraft => ({ ...fresh(), terrain, terrainContext: ctx });
  const roomWith = (terrain: NonNullable<MapDraft["terrain"]>) => ({ ...room, terrain, boardEpoch: 2, terrainRevision: 5 });
  const cell = { row: 0, start: 1, end: 2, kind: "difficult" } as const;

  it("creates a layer and paints it by the same client-chosen id, advancing the revision", () => {
    let draft = withTerrain({ base: [], effects: [] });
    draft = applyToDraft(draft, { type: "terrain.effect.create", name: "Ice", context: ctx }, newId)!;
    const id = draft.terrain!.effects[0]!.id;
    draft = applyToDraft(draft, { type: "terrain.paint", layerId: id, paint: [cell], context: ctx }, newId)!;
    draft = applyToDraft(draft, { type: "terrain.paint", layerId: "base", paint: [cell], context: ctx }, newId)!;
    const edits = plannedEdits(roomWith({ base: [], effects: [] }), draft);
    expect(edits.map((e) => e.type)).toEqual(["terrain.effect.create", "terrain.paint", "terrain.paint"]);
    const create = edits[0] as Extract<typeof edits[number], { type: "terrain.effect.create" }>;
    expect(create.name).toBe("Ice");
    expect(create.effectId).toBeDefined();
    expect(create.effectId).not.toBe(id);
    expect(edits[1]).toMatchObject({ layerId: "base", context: { boardEpoch: 2, revision: 6 } });
    expect(edits[2]).toMatchObject({ layerId: create.effectId, context: { boardEpoch: 2, revision: 7 } });
    expect(create.context).toEqual({ boardEpoch: 2, revision: 5 });
  });

  it("renames and removes room layers", () => {
    const saved = roomWith({ base: [], effects: [{ id: "e1", name: "Ice", runs: [cell] }, { id: "e2", name: "Mud", runs: [] }] });
    let draft = draftFrom(saved);
    draft = applyToDraft(draft, { type: "terrain.effect.rename", effectId: "e1", name: "Black ice", context: ctx }, newId)!;
    draft = applyToDraft(draft, { type: "terrain.effect.remove", effectId: "e2", context: ctx }, newId)!;
    expect(plannedEdits(saved, draft)).toEqual([
      { type: "terrain.effect.remove", effectId: "e2", context: { boardEpoch: 2, revision: 5 } },
      { type: "terrain.effect.rename", effectId: "e1", name: "Black ice", context: { boardEpoch: 2, revision: 6 } },
    ]);
  });

  it("caps layers at 32 and ignores paint on an unknown layer", () => {
    let draft = withTerrain({ base: [], effects: [] });
    for (let i = 0; i < 33; i++) draft = applyToDraft(draft, { type: "terrain.effect.create", name: `L${i}`, context: ctx }, newId)!;
    expect(draft.terrain!.effects).toHaveLength(32);
    expect(applyToDraft(draft, { type: "terrain.paint", layerId: "nope", paint: [cell], context: ctx }, newId)).toBe(draft);
  });
});
