import { describe, expect, it } from "vitest";
import { sampleCleanup } from "../src/ui/tutorialExample";
import type { MapDraft } from "../src/pages/mapEditor/mapDraft";
import { applyToDraft } from "../src/pages/mapEditor/mapDraft";

const base: MapDraft = { mapUrl: "/map", walls: { original: { id: "original", a: { x: 0, y: 0 }, b: { x: 70, y: 0 } } }, fog: {}, lineOfSight: false, isometric: false, sightRange: null, terrain: { base: [{ row: 0, start: 0, end: 1, kind: "blocked" }], effects: [] } };
describe("tutorial sample cleanup", () => {
  it("restores an existing wall split by the sample door", () => {
    const before = { ...base, walls: { original: { id: "original", a: { x: 350, y: 0 }, b: { x: 350, y: 420 } } } };
    let id = 0;
    const newId = () => `n${++id}`;
    const after = applyToDraft(before, { type: "wall.add", walls: [{ a: { x: 350, y: 70 }, b: { x: 350, y: 280 }, portal: { kind: "door", state: "closed" } }] }, newId)!;
    let cleared = after;
    for (const command of sampleCleanup(before, after, after)) cleared = applyToDraft(cleared, command, newId)!;
    expect(Object.values(cleared.walls).map(({ id: _id, ...wall }) => wall)).toEqual([{ a: { x: 350, y: 0 }, b: { x: 350, y: 420 } }]);
  });
  it("removes only sample walls, preserving existing and subsequently edited walls", () => {
    const wall = { id: "sample", a: { x: 0, y: 0 }, b: { x: 70, y: 0 } };
    const after = { ...base, walls: { ...base.walls, sample: wall } };
    expect(sampleCleanup(base, after, after)).toEqual([{ type: "wall.remove", wallIds: ["sample"] }]);
    expect(sampleCleanup(base, after, { ...after, walls: { ...after.walls, sample: { ...wall, b: { x: 140, y: 0 } } } })).toEqual([]);
  });
  it("restores the previous terrain only where the guest has not changed the sample", () => {
    const after = { ...base, terrain: { base: [{ row: 0, start: 0, end: 1, kind: "difficult" as const }], effects: [] } };
    const current = { ...after, terrain: { base: [{ row: 0, start: 0, end: 0, kind: "difficult" as const }], effects: [] } };
    expect(sampleCleanup(base, after, current)).toEqual([{ type: "terrain.paint", layerId: "base", context: { boardEpoch: 0, revision: 0 }, paint: [{ row: 0, start: 0, end: 0, kind: "blocked" }] }]);
  });
});
