import { describe, expect, it } from "vitest";
import {
  concealmentFor,
  EMPTY_STATS,
  filterEventForViewer,
  filterStateForViewer,
  wallPiecesForViewer,
  wallSeen,
  type CommittedEvent,
  type FogRegion,
  type RoomState,
  type Token,
  type Wall,
} from "../src";
import { alice, baseRoom, gm } from "./fixtures";

const commit = (seq: number, event: CommittedEvent["event"]): CommittedEvent => ({
  seq, at: new Date(0).toISOString(), actorId: gm.id, commandId: "c", event,
});

const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Wall =>
  ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });

const fogRect = (id: string, x0: number, y0: number, x1: number, y1: number): FogRegion =>
  ({ id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });

const hero: Token = {
  id: "hero", name: "hero", position: { x: 500, y: 200 }, size: 1, rotation: 0, color: "#ff0000", imageUrl: null,
  ownerIds: [alice.id], hidden: false, stats: EMPTY_STATS, conditions: [],
};

function room(walls: Wall[], extra: Partial<RoomState> = {}): RoomState {
  const s = baseRoom();
  return {
    ...s,
    scene: { ...s.scene, map: { url: "/m.png", width: 1000, height: 1000 } },
    tokens: { hero },
    walls: Object.fromEntries(walls.map((w) => [w.id, w])),
    ...extra,
  };
}

const pieces = (s: RoomState) => Object.values(filterStateForViewer(s, alice).walls).filter((w) => !w.portal);

describe("players receive the walls they can see (FR-GM-23, ADR 0056)", () => {
  it("sends every plain wall with no fog and line of sight off", () => {
    const walls = Array.from({ length: 12 }, (_, i) => wall(`w${i}`, 10 + i * 50, 600, 40 + i * 50, 600));
    const got = pieces(room(walls));
    expect(got).toHaveLength(12);
    expect(got.map((w) => [w.a, w.b])).toEqual(walls.map((w) => [w.a, w.b]));
  });

  it("cuts a wall running into fog at the fog's edge", () => {
    const s = room([wall("w", 0, 600, 400, 600)], { fog: { f: fogRect("f", 200, 500, 500, 700) } });
    expect(pieces(s)).toEqual([{ id: "seen:0", a: { x: 0, y: 600 }, b: { x: 200, y: 600 } }]);
  });

  it("splits a wall crossing fog into unlinked pieces and sends no point inside the fog", () => {
    const s = room([wall("w", 0, 600, 600, 600)], { fog: { f: fogRect("f", 200, 500, 400, 700) } });
    const got = pieces(s);
    expect(got).toEqual([
      { id: "seen:0", a: { x: 0, y: 600 }, b: { x: 200, y: 600 } },
      { id: "seen:1", a: { x: 400, y: 600 }, b: { x: 600, y: 600 } },
    ]);
    expect(JSON.stringify(filterStateForViewer(s, alice).walls)).not.toMatch(/"w"|300/);
  });

  it("withholds a wall behind another wall from every owned token with line of sight on", () => {
    const s = room([wall("front", 0, 500, 1000, 500), wall("behind", 300, 800, 700, 800)]);
    const los = { ...s, scene: { ...s.scene, lineOfSight: true } };
    const got = pieces(los);
    expect(got.some((w) => w.a.y === 800 || w.b.y === 800)).toBe(false);
    // The wall the token faces lies on its sight edge, and its visible face arrives.
    expect(got.some((w) => w.a.y === 500 && w.b.y === 500)).toBe(true);
  });

  it("sends no pieces under \"Hide map from players without a token\" when the player owns none", () => {
    const s = room([wall("w", 0, 600, 400, 600)], { hideMapWithoutToken: true, tokens: {} });
    expect(pieces(s)).toEqual([]);
  });

  it("does not send an open imported portal", () => {
    const open = wall("u", 0, 600, 400, 600, { uvttPortal: { position: { x: 200, y: 600 }, rotation: 0, closed: false, freestanding: false } });
    expect(pieces(room([open]))).toEqual([]);
  });

  it("gives pieces only an opaque id and two ends", () => {
    const imported = wall("u", 0, 600, 400, 600, { uvttPortal: { position: { x: 200, y: 600 }, rotation: 0, closed: true, freestanding: false }, source: "objects_line_of_sight" });
    const got = filterStateForViewer(room([wall("a", 0, 0, 10, 0), imported]), alice).walls;
    expect(got).toEqual({
      "seen:0": { id: "seen:0", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      "seen:1": { id: "seen:1", a: { x: 0, y: 600 }, b: { x: 400, y: 600 } },
    });
  });

  it("keeps portals under their real ids beside the pieces", () => {
    const s = room([wall("w", 0, 600, 400, 600), wall("door", 400, 600, 500, 600, { portal: { kind: "door", state: "closed" } })]);
    expect(Object.keys(filterStateForViewer(s, alice).walls)).toEqual(["door", "seen:0"]);
  });

  it("leaves the GM's walls unchanged", () => {
    const s = room([wall("w", 0, 600, 600, 600)], { fog: { f: fogRect("f", 200, 500, 400, 700) } });
    expect(filterStateForViewer(s, gm).walls).toBe(s.walls);
    expect(wallPiecesForViewer(s, gm, concealmentFor(s, gm))).toEqual([]);
    expect(wallSeen(concealmentFor(s, gm), s.walls.w!, gm)).toBe(true);
  });
});

describe("wall pieces follow what the player sees (FR-GM-23, ADR 0056)", () => {
  const fogged = room([wall("w", 0, 600, 400, 600)], { fog: { f: fogRect("f", 600, 600, 900, 900) } });

  it("resyncs a player when a wall is drawn in view", () => {
    expect(filterEventForViewer(commit(1, { type: "WallsAdded", walls: [wall("n", 0, 300, 100, 300)] }), fogged, alice)).toEqual({ kind: "resync" });
  });

  it("redacts a wall drawn wholly under fog", () => {
    expect(filterEventForViewer(commit(2, { type: "WallsAdded", walls: [wall("n", 650, 700, 850, 700)] }), fogged, alice)).toEqual({ kind: "redacted", seq: 2 });
  });

  it("resyncs when a seen wall is removed or edited out of view", () => {
    expect(filterEventForViewer(commit(3, { type: "WallsRemoved", walls: [fogged.walls.w!] }), fogged, alice)).toEqual({ kind: "resync" });
    const moved = wall("w", 650, 700, 850, 700);
    expect(filterEventForViewer(commit(4, { type: "WallUpdated", wall: moved, previous: fogged.walls.w! }), fogged, alice)).toEqual({ kind: "resync" });
    const hidden = room([moved], { fog: fogged.fog });
    expect(filterEventForViewer(commit(5, { type: "WallUpdated", wall: { ...moved, b: { x: 860, y: 700 } }, previous: moved }), hidden, alice)).toEqual({ kind: "redacted", seq: 5 });
  });

  it("resyncs when a visible door becomes a plain wall", () => {
    const s = room([wall("d", 0, 600, 100, 600, { portal: { kind: "door", state: "closed" } })]);
    expect(filterEventForViewer(commit(6, { type: "PortalChanged", wallId: "d", from: { kind: "door", state: "closed" }, to: null }), s, alice)).toEqual({ kind: "resync" });
  });

  it("still delivers a visible door opening as a live event", () => {
    const s = room([wall("d", 0, 600, 100, 600, { portal: { kind: "door", state: "closed" } })]);
    expect(filterEventForViewer(commit(7, { type: "PortalChanged", wallId: "d", from: { kind: "door", state: "closed" }, to: { kind: "door", state: "open" } }), s, alice).kind).toBe("event");
  });

  it("redacts a door under fog turning into a plain wall", () => {
    const s = room([wall("d", 650, 700, 750, 700, { portal: { kind: "door", state: "closed" } })], { fog: fogged.fog });
    expect(filterEventForViewer(commit(8, { type: "PortalChanged", wallId: "d", from: { kind: "door", state: "closed" }, to: null }), s, alice)).toEqual({ kind: "redacted", seq: 8 });
  });
});

describe("players receive every door with any part in view (FR-GM-18, FR-GM-23, ADR 0056)", () => {
  const door = wall("d", 100, 600, 300, 600, { portal: { kind: "door", state: "closed" } });

  it("sends a door whole when only part of it is outside fog, midpoint included", () => {
    const s = room([door], { fog: { f: fogRect("f", 150, 500, 400, 700) } });
    expect(filterStateForViewer(s, alice).walls).toEqual({ d: { id: "d", a: door.a, b: door.b, portal: door.portal } });
  });

  it("withholds a door wholly under fog", () => {
    const s = room([door], { fog: { f: fogRect("f", 50, 500, 400, 700) } });
    expect(filterStateForViewer(s, alice).walls).toEqual({});
  });

  it("sends a door with line of sight on when part of it is in sight", () => {
    // A wall hides the door's left half from the hero at (500, 200).
    const s = room([wall("w", 0, 400, 380, 400), door]);
    const los = { ...s, scene: { ...s.scene, lineOfSight: true } };
    expect(Object.keys(filterStateForViewer(los, alice).walls)).toContain("d");
  });
});
