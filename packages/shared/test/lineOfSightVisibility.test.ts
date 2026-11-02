import { describe, expect, it } from "vitest";
import {
  concealmentFor,
  filterEventForViewer,
  filterStateForViewer,
  isDiceRoll,
  isGroupRoll,
  viewerSight,
  type AreaTemplate,
  type CommittedEvent,
  type RoomState,
  type Token,
  type Wall,
} from "../src";
import { alice, baseRoom, bob, gm } from "./fixtures";

const commit = (seq: number, event: CommittedEvent["event"]): CommittedEvent => ({
  seq, at: new Date(0).toISOString(), actorId: gm.id, event,
});

const token = (id: string, x: number, y: number, extra: Partial<Token> = {}): Token => ({
  id, name: id, position: { x, y }, size: 1, rotation: 0, color: "#ff0000", imageUrl: null,
  ownerIds: [], hidden: false, stats: {}, conditions: [], ...extra,
} as Token);

const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Wall =>
  ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });

const template = (id: string, x: number, y: number, ownerId: string): AreaTemplate =>
  ({ id, shape: "circle", origin: { x, y }, toward: { x, y }, size: 10, ownerId, gmOnly: false });

/**
 * A 1000x1000 map cut in two by a wall at y=500 with a closed door in the middle. Alice's token
 * stands at (500, 200), above the wall; "goblin" is below it, "orc" above it.
 */
function room(lineOfSight: boolean): RoomState {
  const s = baseRoom();
  return {
    ...s,
    scene: { ...s.scene, map: { url: "/m.png", width: 1000, height: 1000 }, ...(lineOfSight ? { lineOfSight: true } : {}) },
    tokens: Object.fromEntries([
      token("hero", 500, 200, { ownerIds: [alice.id] }),
      token("goblin", 200, 800),
      token("orc", 800, 200),
      token("bobby", 800, 800, { ownerIds: [bob.id] }),
    ].map((t) => [t.id, t])),
    walls: Object.fromEntries([
      wall("w1", 0, 500, 450, 500),
      wall("w2", 550, 500, 1000, 500),
      wall("door", 450, 500, 550, 500, { portal: { kind: "door", state: "closed" } }),
      wall("farDoor", 100, 900, 200, 900, { portal: { kind: "door", state: "closed" } }),
    ].map((w) => [w.id, w])),
    templates: {
      mine: template("mine", 200, 800, alice.id),
      bobs: template("bobs", 200, 800, bob.id),
      bobsNear: template("bobsNear", 200, 200, bob.id),
    },
  };
}

describe("line of sight in player snapshots (FR-GM-19)", () => {
  it("withholds a token behind a wall and keeps one in the room", () => {
    const view = filterStateForViewer(room(true), alice);
    expect(Object.keys(view.tokens).sort()).toEqual(["hero", "orc"]);
  });

  it("always keeps an owned token, even one below the wall", () => {
    const view = filterStateForViewer(room(true), bob);
    expect(view.tokens["bobby"]).toBeDefined();
    expect(view.tokens["hero"]).toBeUndefined();
  });

  it("gives a player with only a hidden token empty sight", () => {
    const s = room(true);
    const hidden = { ...s, tokens: { ...s.tokens, hero: { ...s.tokens["hero"]!, hidden: true } } };
    const view = filterStateForViewer(hidden, alice);
    expect(view.sight).toEqual([]);
    expect(Object.keys(view.tokens)).toEqual([]);
  });

  it("still withholds a token in sight that is under fog", () => {
    const s = room(true);
    const fogged = {
      ...s,
      fog: { f: { id: "f", shape: "rect" as const, points: [{ x: 700, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 300 }, { x: 700, y: 300 }] } },
    } as RoomState;
    expect(filterStateForViewer(fogged, alice).tokens["orc"]).toBeUndefined();
    expect(filterStateForViewer(s, alice).tokens["orc"]).toBeDefined();
  });

  it("withholds a token beyond a fog patch, and never sends plain walls inside a fogged room", () => {
    const s = room(true);
    const fogged = {
      ...s,
      tokens: { ...s.tokens, far: token("far", 900, 200) },
      walls: { ...s.walls, secret: wall("secret", 612.5, 120.25, 612.5, 180.75) },
      fog: { f: { id: "f", shape: "rect" as const, points: [{ x: 600, y: 50 }, { x: 700, y: 50 }, { x: 700, y: 350 }, { x: 600, y: 350 }] } },
    } as RoomState;
    const view = filterStateForViewer(fogged, alice);
    expect(view.tokens["far"]).toBeUndefined();
    expect(view.tokens["orc"]).toBeUndefined(); // orc at 800,200 is also behind the patch
    const json = JSON.stringify(view);
    for (const n of ["612.5", "120.25", "180.75"]) expect(json).not.toContain(n);
  });

  it("withholds a portal outside sight and keeps the one on the sight edge", () => {
    const view = filterStateForViewer(room(true), alice);
    expect(Object.keys(view.walls)).toEqual(["door"]);
    expect(Object.keys(filterStateForViewer(room(false), alice).walls).sort()).toEqual(["door", "farDoor"]);
  });

  it("withholds another player's template outside sight but keeps one's own", () => {
    const view = filterStateForViewer(room(true), alice);
    expect(Object.keys(view.templates).sort()).toEqual(["bobsNear", "mine"]);
  });

  it("omits an out-of-sight token from the turn order", () => {
    const s = room(true);
    const withTurns = { ...s, initiative: { order: ["goblin", "hero", "orc"], activeIndex: 1, round: 1 } } as unknown as RoomState;
    const view = filterStateForViewer(withTurns, alice);
    expect(view.initiative?.order).toEqual(["hero", "orc"]);
    expect(view.initiative?.activeIndex).toBe(0);
  });

  it("blanks an attack side naming an out-of-sight token", () => {
    const s = room(true);
    const roll = {
      id: "r1", expression: "1d20", visibility: "public",
      attack: {
        actor: { tokenId: "hero", name: "hero", hidden: false },
        target: { tokenId: "goblin", name: "goblin", hidden: false },
        label: null, kind: "toHit",
      },
    };
    const view = filterStateForViewer({ ...s, rolls: [roll as unknown as RoomState["rolls"][number]] }, alice);
    expect(view.rolls.filter(isDiceRoll)[0]?.attack?.actor?.name).toBe("hero");
    expect(view.rolls.filter(isDiceRoll)[0]?.attack?.target).toBeNull();
  });

  it("drops group roll entries and area effect targets outside sight (ADR 0046)", () => {
    const s = room(true);
    const entry = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false, dice: [10], total: 10 });
    const roll = { kind: "group", id: "g1", expression: "1d20", visibility: "public", entries: [entry("orc"), entry("goblin")] };
    const effect = (ids: string[]) => ({ id: "e1", label: null, call: null, damage: null, targets: ids.map((tokenId) => ({ tokenId, name: tokenId, hidden: false, roll: null })) });
    const withEffect = (ids: string[]) =>
      ({ ...s, rolls: [roll], areaEffect: effect(ids) }) as unknown as RoomState;
    const view = filterStateForViewer(withEffect(["orc", "goblin"]), alice);
    expect(view.rolls.filter(isGroupRoll)[0]?.entries.map((e) => e.tokenId)).toEqual(["orc"]);
    expect(view.areaEffect?.targets.map((t) => t.tokenId)).toEqual(["orc"]);
    expect(filterStateForViewer(withEffect(["goblin"]), alice).areaEffect).toBeNull();
  });

  it("sets sight only for a player with line of sight on", () => {
    expect(filterStateForViewer(room(true), gm)).not.toHaveProperty("sight");
    expect(filterStateForViewer(room(false), alice)).not.toHaveProperty("sight");
    expect(filterStateForViewer(room(true), alice).sight).toHaveLength(1);
  });

  it("changes nothing with line of sight off", () => {
    const view = filterStateForViewer(room(false), alice);
    expect(Object.keys(view.tokens).sort()).toEqual(["bobby", "goblin", "hero", "orc"]);
  });
});

describe("line of sight in live events (FR-GM-19)", () => {
  const s = room(true);
  const resync = { kind: "resync" };
  const from = { x: 0, y: 0 };

  it("resyncs on any wall, portal or map change", () => {
    const w = wall("w9", 1, 1, 2, 2);
    const door = { kind: "door", state: "open" } as const;
    expect(filterEventForViewer(commit(1, { type: "WallsAdded", walls: [w] }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "WallsRemoved", walls: [w] }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "WallUpdated", previous: w, wall: w }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "PortalChanged", wallId: "door", from: { kind: "door", state: "closed" }, to: door }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "MapSet", map: s.scene.map, previous: s.scene.map }), s, alice)).toEqual(resync);
  });

  it("resyncs when a token the player owns is created, deleted, moved, hidden or handed over", () => {
    const mine = s.tokens["hero"]!;
    expect(filterEventForViewer(commit(1, { type: "TokenCreated", token: mine }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "TokenDeleted", token: mine }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "TokenMoved", tokenId: "hero", from, to: { x: 5, y: 5 } }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "TokenHiddenSet", tokenId: "hero", hidden: true, previous: false }), s, alice)).toEqual(resync);
    // Owner lost, and owner gained, both change what Alice sees.
    expect(filterEventForViewer(commit(1, { type: "TokenOwnersSet", tokenId: "hero", ownerIds: [], previous: [alice.id] }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(1, { type: "TokenOwnersSet", tokenId: "orc", ownerIds: [alice.id], previous: [] }), s, alice)).toEqual(resync);
  });

  it("resyncs on a non-owned token entering sight, redacts one staying out, passes one staying in", () => {
    expect(filterEventForViewer(commit(1, { type: "TokenMoved", tokenId: "goblin", from, to: { x: 300, y: 300 } }), s, alice)).toEqual(resync);
    expect(filterEventForViewer(commit(2, { type: "TokenMoved", tokenId: "goblin", from, to: { x: 300, y: 900 } }), s, alice)).toEqual({ kind: "redacted", seq: 2 });
    expect(filterEventForViewer(commit(3, { type: "TokenMoved", tokenId: "orc", from, to: { x: 700, y: 300 } }), s, alice)).toMatchObject({ kind: "event" });
    expect(filterEventForViewer(commit(4, { type: "TokenMoved", tokenId: "orc", from, to: { x: 700, y: 900 } }), s, alice)).toEqual(resync);
  });

  it("redacts events about a token out of sight", () => {
    expect(filterEventForViewer(commit(5, { type: "TokenCreated", token: s.tokens["goblin"]! }), s, alice)).toEqual({ kind: "redacted", seq: 5 });
    expect(filterEventForViewer(commit(6, { type: "TokenConditionsSet", tokenId: "goblin", conditions: [], previous: [] }), s, alice)).toEqual({ kind: "redacted", seq: 6 });
  });

  it("keeps today's behaviour with line of sight off", () => {
    const off = room(false);
    expect(filterEventForViewer(commit(1, { type: "WallsAdded", walls: [wall("w9", 1, 1, 2, 2)] }), off, alice)).toEqual({ kind: "redacted", seq: 1 });
    expect(filterEventForViewer(commit(2, { type: "TokenMoved", tokenId: "hero", from, to: { x: 5, y: 5 } }), off, alice)).toMatchObject({ kind: "event" });
    expect(filterEventForViewer(commit(3, { type: "TokenMoved", tokenId: "goblin", from, to: { x: 300, y: 300 } }), off, alice)).toMatchObject({ kind: "event" });
  });

  it("builds the same concealment the snapshot uses", () => {
    expect(concealmentFor(s, alice).sight).toHaveLength(1);
    expect(concealmentFor(s, gm).sight).toBeNull();
    expect(viewerSight(s, alice)).toEqual(concealmentFor(s, alice).sight);
  });
});
