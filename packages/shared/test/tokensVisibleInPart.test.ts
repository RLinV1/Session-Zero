import { describe, expect, it } from "vitest";
import {
  concealedFrom,
  concealmentFor,
  filterEventForViewer,
  filterStateForViewer,
  fogConcealsSide,
  isDiceRoll,
  reduce,
  reduceAll,
  tokenDetectionDisc,
  tokenDisc,
  DEFAULT_GRID,
  type CommittedEvent,
  type DomainEvent,
  type FogRegion,
  type RoomState,
  type Token,
} from "../src";
import { alice, baseRoom, gm, run } from "./fixtures";

const committed = (event: DomainEvent, seq = 10): CommittedEvent => ({ seq, at: "2026-11-23T00:00:00.000Z", actorId: gm.id, event });

const token = (id: string, x: number, y: number, extra: Partial<Token> = {}): Token => ({
  id, name: id, position: { x, y }, size: 1, rotation: 0, color: "#ff0000", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
} as Token);

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): FogRegion =>
  ({ id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });

/** A room with 70 px cells, the given fog and tokens, and Alice's hero far from both. */
function room(fog: FogRegion[], tokens: Token[], map: RoomState["scene"]["map"] = null): RoomState {
  const s = baseRoom();
  const hero = token("hero", 595, 595, { ownerIds: [alice.id] });
  return {
    ...s,
    scene: { ...s.scene, map },
    fog: Object.fromEntries(fog.map((f) => [f.id, f])),
    tokens: Object.fromEntries([hero, ...tokens].map((t) => [t.id, t])),
  };
}

const seen = (state: RoomState, id: string) => !concealedFrom(concealmentFor(state, alice), state.tokens[id]!, alice);

describe("a token's drawn disc (ADR 0082)", () => {
  it("is the circle the board draws: size cells across, less 2 px", () => {
    const grid = DEFAULT_GRID; // 70 px cells
    expect(tokenDisc({ position: { x: 35, y: 35 }, size: 1 }, grid)).toEqual({ kind: "circle", center: { x: 35, y: 35 }, radius: 33 });
    expect(tokenDisc({ position: { x: 70, y: 70 }, size: 2 }, grid).radius).toBe(68);
    expect(tokenDisc({ position: { x: 0, y: 0 }, size: 0.5 }, grid).radius).toBe(15.5);
  });

  it("never has a negative radius, however small the token", () => {
    expect(tokenDisc({ position: { x: 0, y: 0 }, size: 0.01 }, DEFAULT_GRID).radius).toBe(0);
    expect(tokenDetectionDisc({ position: { x: 0, y: 0 }, size: 0.05 }, DEFAULT_GRID).radius).toBe(0);
  });

  it("is judged a sixteenth of a cell inside the drawn disc", () => {
    expect(tokenDetectionDisc({ position: { x: 35, y: 35 }, size: 1 }, DEFAULT_GRID).radius).toBe(33 - 70 / 16);
  });
});

describe("a token is sent when any part of its disc is outside fog (FR-GM-17, FR-GM-23)", () => {
  it("sends a goblin whose centre is in fog but whose disc reaches lit ground", () => {
    // The disc reaches x = 153, past the fog's edge at 140.
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70)]);
    expect(seen(state, "goblin")).toBe(true);
    expect(filterStateForViewer(state, alice).tokens["goblin"]).toBeDefined();
  });

  it("withholds a goblin whose whole disc is in fog", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 70, 70, { name: "Goblin" })]);
    expect(seen(state, "goblin")).toBe(false);
    expect(JSON.stringify(filterStateForViewer(state, alice))).not.toContain("Goblin");
  });

  it("withholds a snapped goblin whose square touches a fog edge drawn on the grid line", () => {
    // Square 70..140; disc 37..138, 2 px inside the fog's edge at 140.
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 105, 35)]);
    expect(seen(state, "goblin")).toBe(false);
  });

  it("withholds a snapped goblin when the fog stops a few pixels short of the grid line", () => {
    // The detection disc ends at 133.6, inside fog ending at 136.
    const state = room([rect("f", 0, 0, 136, 140)], [token("goblin", 105, 35)]);
    expect(seen(state, "goblin")).toBe(false);
  });

  it("sends a snapped goblin once more than a sliver of it shows past the fog", () => {
    const state = room([rect("f", 0, 0, 128, 140)], [token("goblin", 105, 35)]);
    expect(seen(state, "goblin")).toBe(true);
  });

  it("doesn't count the part of a disc off the edge of the map", () => {
    // The map ends at the fog's edge; the disc's unfogged part lies past it.
    const fogged = [rect("f", 0, 0, 140, 140)];
    const goblin = token("goblin", 130, 70);
    expect(seen(room(fogged, [goblin], { url: "/m.png", width: 140, height: 700 }), "goblin")).toBe(false);
    expect(seen(room(fogged, [goblin]), "goblin")).toBe(true);
  });

  it("still never sends a hidden token, and always sends a player's own", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [
      token("ghost", 300, 300, { hidden: true }),
      token("mine", 70, 70, { ownerIds: [alice.id] }),
    ]);
    expect(seen(state, "ghost")).toBe(false);
    expect(seen(state, "mine")).toBe(true);
  });
});

describe("fog conceals a side for good only when it covers the whole disc (FR-GM-17, ADR 0082)", () => {
  it("covers a token wholly in fog, not one reaching out of it, and never an owned one", () => {
    const state = room([rect("f", 0, 0, 140, 140)], []);
    expect(fogConcealsSide(state, token("in", 70, 70))).toBe(true);
    expect(fogConcealsSide(state, token("edge", 120, 70))).toBe(false);
    expect(fogConcealsSide(state, token("owned", 70, 70, { ownerIds: [alice.id] }))).toBe(false);
  });

  it("names a goblin half out of fog on an attack, and blanks it once fog covers it whole", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70, { name: "Goblin" })]);
    const rolled = run(state, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "hero", targetTokenId: "goblin" } }).state;
    expect(rolled.rolls.filter(isDiceRoll).at(-1)?.attack?.target).toMatchObject({ name: "Goblin", hidden: false });
    expect(filterStateForViewer(rolled, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toMatchObject({ name: "Goblin" });

    const covered = reduce(rolled, { type: "TokenMoved", tokenId: "goblin", from: { x: 120, y: 70 }, to: { x: 70, y: 70 } });
    expect(filterStateForViewer(covered, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
    // For good: leaving the fog again doesn't bring the name back.
    const out = reduce(covered, { type: "TokenMoved", tokenId: "goblin", from: { x: 70, y: 70 }, to: { x: 400, y: 400 } });
    expect(filterStateForViewer(out, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
  });

  it("marks an area-effect target hidden only once fog covers its whole disc", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70)]);
    const started = run(state, gm, { type: "areaEffect.start", tokenIds: ["goblin"], expression: "1d20", label: "Fireball" }).state;
    expect(started.areaEffect?.targets[0]?.hidden).toBe(false);
    const covered = reduce(started, { type: "TokenMoved", tokenId: "goblin", from: { x: 120, y: 70 }, to: { x: 70, y: 70 } });
    expect(covered.areaEffect?.targets[0]?.hidden).toBe(true);
  });

  it("blanks a side when a smaller size or grid leaves fog covering the whole disc", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70, { name: "Goblin" })]);
    const rolled = run(state, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "hero", targetTokenId: "goblin" } }).state;
    const target = (s: RoomState) => s.rolls.filter(isDiceRoll).at(-1)?.attack?.target;

    // Size 0.5: the disc ends at 135.5.
    const shrunk = reduce(rolled, { type: "TokenAppearanceSet", tokenId: "goblin", name: "Goblin", size: 0.5, rotation: 0, previous: { name: "Goblin", size: 1, rotation: 0 } });
    expect(target(shrunk)?.hidden).toBe(true);

    // 40 px cells: the disc ends at 138.
    const regridded = reduce(rolled, { type: "GridSet", grid: { ...rolled.scene.grid, cellSize: 40 }, previous: rolled.scene.grid });
    expect(target(regridded)?.hidden).toBe(true);
  });
});

describe("a player's turn order follows the disc (FR-GM-17)", () => {
  it("keeps a goblin half out of fog and leaves out an orc wholly in it", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70), token("orc", 70, 70)]);
    const started = run(state, gm, { type: "initiative.start", entries: [
      { tokenId: "goblin", score: 15 }, { tokenId: "orc", score: 12 }, { tokenId: "hero", score: 10 },
    ] }).state;
    expect(filterStateForViewer(started, alice).initiative?.order).toEqual(["goblin", "hero"]);
  });
});

describe("live events follow the disc (FR-GM-17, FR-GM-23)", () => {
  it("delivers a move that takes a goblin half into fog, and resyncs one that buries it", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 300, 70)]);
    const half: DomainEvent = { type: "TokenMoved", tokenId: "goblin", from: { x: 300, y: 70 }, to: { x: 120, y: 70 } };
    expect(filterEventForViewer(committed(half), state, alice)).toMatchObject({ kind: "event" });
    const halfIn = reduce(state, half);
    const whole: DomainEvent = { type: "TokenMoved", tokenId: "goblin", from: { x: 120, y: 70 }, to: { x: 70, y: 70 } };
    expect(filterEventForViewer(committed(whole), halfIn, alice)).toEqual({ kind: "resync" });
  });

  it("resyncs, never sending the new name, when a smaller size buries a token in fog", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70, { name: "Goblin" })]);
    const shrink: DomainEvent = { type: "TokenAppearanceSet", tokenId: "goblin", name: "Secret Lich", size: 0.5, rotation: 0, previous: { name: "Goblin", size: 1, rotation: 0 } };
    expect(filterEventForViewer(committed(shrink), state, alice)).toEqual({ kind: "resync" });
  });

  it("resyncs when a larger size brings a token out of fog, and passes a change that leaves it seen", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 105, 70, { name: "Goblin" })]);
    const grow: DomainEvent = { type: "TokenAppearanceSet", tokenId: "goblin", name: "Goblin", size: 2, rotation: 0, previous: { name: "Goblin", size: 1, rotation: 0 } };
    expect(filterEventForViewer(committed(grow), state, alice)).toEqual({ kind: "resync" });
    const open = room([], [token("goblin", 300, 300, { name: "Goblin" })]);
    expect(filterEventForViewer(committed({ ...grow, name: "Big Goblin" }), open, alice)).toMatchObject({ kind: "event" });
  });

  it("resyncs a grid change that buries a token, and passes one that changes nothing seen", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 120, 70)]);
    const smaller: DomainEvent = { type: "GridSet", grid: { ...state.scene.grid, cellSize: 40 }, previous: state.scene.grid };
    expect(filterEventForViewer(committed(smaller), state, alice)).toEqual({ kind: "resync" });
    const open = room([], [token("goblin", 300, 300)]);
    expect(filterEventForViewer(committed({ ...smaller, previous: open.scene.grid }), open, alice)).toMatchObject({ kind: "event" });
  });
});

describe("token edits order moves by the disc (FR-GM-17, ADR 0016)", () => {
  it("moves first only when the edit buries the whole disc in fog", () => {
    const state = room([rect("f", 0, 0, 140, 140)], [token("goblin", 315, 105, { name: "Goblin" })]);
    const configure = (to: { x: number; y: number }) =>
      run(state, gm, { type: "token.configure", tokenId: "goblin", changes: { name: "Secret Lich", position: to } }).events.map((e) => e.type);
    // Centre in fog, disc reaching out: an ordinary edit, the move last.
    expect(configure({ x: 125, y: 105 })).toEqual(["TokenAppearanceSet", "TokenMoved"]);
    // Wholly in fog: the move first, so the new name is never sent.
    expect(configure({ x: 70, y: 70 })).toEqual(["TokenMoved", "TokenAppearanceSet"]);
  });
});

describe("replaying a log under the disc rule (ADR 0082)", () => {
  it("leaves a side named when only the token's centre entered fog, and keeps sides recorded hidden", () => {
    const start = room([rect("f", 0, 0, 140, 140)], [token("goblin", 300, 70, { name: "Goblin" }), token("lurker", 70, 70, { name: "Lurker" })]);
    const named = run(start, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "hero", targetTokenId: "goblin" } });
    const blanked = run(named.state, gm, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "lurker", targetTokenId: "hero" } });
    const log: DomainEvent[] = [
      ...named.events,
      ...blanked.events,
      // Only the goblin's centre enters fog: its disc still reaches past x = 140.
      { type: "TokenMoved", tokenId: "goblin", from: { x: 300, y: 70 }, to: { x: 120, y: 70 } },
      { type: "FogRemoved", region: start.fog["f"]! },
    ];
    const replayed = filterStateForViewer(reduceAll(start, log), alice).rolls.filter(isDiceRoll);
    expect(replayed[0]?.attack?.target).toMatchObject({ name: "Goblin" });
    // Recorded with the lurker's side hidden; replay and a reveal don't change that.
    expect(blanked.events.find((e) => e.type === "DiceRolled")).toMatchObject({ roll: { attack: { actor: { hidden: true } } } });
    expect(replayed[1]?.attack?.actor).toBeNull();
  });
});
