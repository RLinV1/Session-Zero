import { describe, expect, it } from "vitest";
import {
  Command,
  concealedFrom,
  concealmentFor,
  decide,
  describeUndo,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  isInFog,
  MAX_FOG_REGIONS,
  pointInPolygon,
  reduce,
  reduceAll,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type FogRegion,
  type Participant,
  type RoomState,
  isDiceRoll
} from "../src";
import { alice, attempt, baseRoom, bob, ctx, gm, run, withToken } from "./fixtures";

/** A rectangle over the fixture token's default position (35, 35). */
const OVER_TOKEN: CommandInput = { type: "fog.add", region: { shape: "rect", from: { x: 70, y: 70 }, to: { x: 0, y: 0 } } };

const committed = (event: DomainEvent, seq = 10): CommittedEvent => ({ seq, at: "2026-10-03T00:00:00.000Z", actorId: gm.id, event });

/** The GM adds fog (over the token by default); returns the new state and the region added. */
function addFog(state: RoomState, input: CommandInput = OVER_TOKEN) {
  const { state: next, events } = run(state, gm, input);
  const added = events[0];
  if (added?.type !== "FogAdded") throw new Error("expected FogAdded");
  return { state: next, region: added.region };
}

let batch = 0;
/** Like the server: decide, then reduce the batch under one command id (ADR 0013). */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `fog-cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}

describe("fog geometry (FR-GM-17)", () => {
  it("tests points against a polygon", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    const ell = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
    expect(pointInPolygon({ x: 15, y: 15 }, ell)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 15 }, ell)).toBe(true);
  });
});

describe("fog.add / fog.remove (FR-GM-17, ADR 0016)", () => {
  it("stores a rectangle as its four normalised corners", () => {
    const { state, region } = addFog(baseRoom());
    expect(region).toMatchObject({ shape: "rect", points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] });
    expect(state.fog[region.id]).toEqual(region);
  });

  it("adds a polygon as given", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }];
    const { region } = addFog(baseRoom(), { type: "fog.add", region: { shape: "polygon", points } });
    expect(region).toMatchObject({ shape: "polygon", points });
  });

  it("refuses fog from a player (FR-GM-15)", () => {
    expect(attempt(baseRoom(), alice, OVER_TOKEN)).toMatchObject({ ok: false, code: "forbidden" });
    const { state, region } = addFog(baseRoom());
    expect(attempt(state, alice, { type: "fog.remove", regionId: region.id })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses a region with no area", () => {
    const line: CommandInput = { type: "fog.add", region: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] } };
    expect(attempt(baseRoom(), gm, line)).toMatchObject({ ok: false, code: "invalid" });
    const flat: CommandInput = { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 5 }, to: { x: 50, y: 5 } } };
    expect(attempt(baseRoom(), gm, flat)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses malformed payloads at the schema", () => {
    expect(Command.safeParse({ type: "fog.add", region: { shape: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }).success).toBe(false);
    expect(Command.safeParse({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, id: "forged" }).success).toBe(false);
    expect(Command.safeParse({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: Infinity, y: 1 } } }).success).toBe(false);
  });

  it("caps the number of regions", () => {
    let state = baseRoom();
    for (let i = 0; i < MAX_FOG_REGIONS; i++) state = addFog(state).state;
    expect(attempt(state, gm, OVER_TOKEN)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("removes a region and carries the whole region (invariant 6)", () => {
    const { state, region } = addFog(baseRoom());
    const removed = run(state, gm, { type: "fog.remove", regionId: region.id });
    expect(removed.events).toEqual([{ type: "FogRemoved", region }]);
    expect(removed.state.fog).toEqual({});
    expect(attempt(removed.state, gm, { type: "fog.remove", regionId: region.id })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("reads in the activity log", () => {
    const { region } = addFog(baseRoom());
    expect(formatActivity({ type: "FogAdded", region }, "GM", baseRoom())).toBe("GM added a fog rectangle");
  });
});

describe("content under fog is not sent to players (FR-GM-17, FR-GM-23)", () => {
  it("withholds a token under fog from players, not from the GM", () => {
    const { state: withGoblin, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state } = addFog(withGoblin);
    expect(filterStateForViewer(state, gm).tokens[token.id]).toBeDefined();
    expect(filterStateForViewer(state, alice).tokens[token.id]).toBeUndefined();
    expect(JSON.stringify(filterStateForViewer(state, alice))).not.toContain("Goblin");
  });

  it("lets an owner keep their own token under fog", () => {
    const { state: withHero, token } = withToken(baseRoom(), { name: "Hero", ownerIds: [alice.id] });
    const { state } = addFog(withHero);
    expect(filterStateForViewer(state, alice).tokens[token.id]).toBeDefined();
    expect(filterStateForViewer(state, bob).tokens[token.id]).toBeUndefined();
  });

  it("still withholds a hidden token outside fog", () => {
    const { state, token } = withToken(baseRoom(), { hidden: true });
    expect(concealedFrom(concealmentFor(state, alice), token, alice)).toBe(true);
    expect(concealedFrom(concealmentFor(state, gm), token, gm)).toBe(false);
  });

  it("resyncs players on fog changes, and passes them to the GM", () => {
    const { state, region } = addFog(baseRoom());
    for (const event of [{ type: "FogAdded", region }, { type: "FogRemoved", region }] as DomainEvent[]) {
      expect(filterEventForViewer(committed(event), state, alice)).toEqual({ kind: "resync" });
      expect(filterEventForViewer(committed(event), state, gm)).toMatchObject({ kind: "event" });
    }
  });

  it("sends the fog regions themselves to players: they are the mask", () => {
    const { state, region } = addFog(baseRoom());
    expect(filterStateForViewer(state, alice).fog[region.id]).toEqual(region);
  });

  it("redacts events about a token under fog", () => {
    const { state: withGoblin, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state } = addFog(withGoblin);
    const moveInside: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 40, y: 40 } };
    expect(filterEventForViewer(committed(moveInside), state, alice)).toEqual({ kind: "redacted", seq: 10 });
    const stats: DomainEvent = { type: "TokenStatsSet", tokenId: token.id, stats: { hp: 3, maxHp: 7, ac: null }, previous: token.stats };
    expect(filterEventForViewer(committed(stats), state, alice)).toEqual({ kind: "redacted", seq: 10 });
    expect(filterEventForViewer(committed({ type: "TokenDeleted", token }), state, alice)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("redacts a token created under fog", () => {
    const { state } = addFog(baseRoom());
    const created = run(state, gm, { type: "token.create", name: "Ambusher", position: { x: 35, y: 35 } }).events[0]!;
    expect(filterEventForViewer(committed(created), state, alice)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("resyncs when a token moves into or out of fog, never sending the new position", () => {
    const { state: withGoblin, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state } = addFog(withGoblin);
    const out: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 175, y: 35 } };
    expect(filterEventForViewer(committed(out), state, alice)).toEqual({ kind: "resync" });
    const outside = reduce(state, out);
    const back: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: { x: 175, y: 35 }, to: { x: 35, y: 35 } };
    expect(filterEventForViewer(committed(back), outside, alice)).toEqual({ kind: "resync" });
    // The owner sees their own token move either way.
    const owned = { ...state, tokens: { ...state.tokens, [token.id]: { ...token, ownerIds: [alice.id] } } };
    expect(filterEventForViewer(committed(out), owned, alice)).toMatchObject({ kind: "event" });
  });

  it("resyncs a player who gains or loses a token under fog", () => {
    const { state: withGoblin, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state } = addFog(withGoblin);
    const give: DomainEvent = { type: "TokenOwnersSet", tokenId: token.id, ownerIds: [alice.id], previous: [] };
    expect(filterEventForViewer(committed(give), state, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(committed(give), state, bob)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("withholds other people's templates under fog", () => {
    const { state: fogged } = addFog(baseRoom());
    const placed = run(fogged, bob, { type: "template.place", shape: "circle", origin: { x: 35, y: 35 }, toward: { x: 35, y: 35 }, size: 10 });
    const event = placed.events[0]!;
    if (event.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    expect(filterStateForViewer(placed.state, alice).templates[event.template.id]).toBeUndefined();
    expect(filterStateForViewer(placed.state, bob).templates[event.template.id]).toBeDefined();
    expect(filterEventForViewer(committed(event), fogged, alice)).toEqual({ kind: "redacted", seq: 10 });
    expect(filterEventForViewer(committed(event), fogged, bob)).toMatchObject({ kind: "event" });
  });

  it("blanks an attack side under fog and drops it from the turn order", () => {
    const { state: s1, token: hero } = withToken(baseRoom(), { name: "Hero", ownerIds: [alice.id] });
    const { state: s2, token: goblin } = withToken(s1, { name: "Goblin" });
    const moved = run(s2, gm, { type: "token.move", tokenId: hero.id, to: { x: 175, y: 35 } }).state;
    const started = run(moved, gm, { type: "initiative.start", entries: [{ tokenId: goblin.id, score: 15 }, { tokenId: hero.id, score: 10 }] }).state;
    const rolled = run(started, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: hero.id, targetTokenId: goblin.id } }).state;
    const { state } = addFog(rolled);
    const view = filterStateForViewer(state, alice);
    expect(view.initiative?.order).toEqual([hero.id]);
    expect(view.rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Goblin");
  });
});

describe("fog changes are undoable (FR-GM-17, FR-REC-02)", () => {
  it("undoes an accidental reveal, restoring the same region", () => {
    const { state: withGoblin, token } = withToken(baseRoom(), { name: "Goblin" });
    const added = act(withGoblin, gm, OVER_TOKEN);
    const region = (added.events[0] as Extract<DomainEvent, { type: "FogAdded" }>).region;
    const removed = act(added.state, gm, { type: "fog.remove", regionId: region.id });
    expect(filterStateForViewer(removed.state, alice).tokens[token.id]).toBeDefined();
    const entry = undoableAction(removed.state.undo, removed.commandId)!;
    expect(describeUndo(entry, removed.state.tokens).verb).toBe("remove fog rectangle");
    const undone = act(removed.state, gm, { type: "history.undo", commandId: removed.commandId });
    expect(undone.events[0]).toEqual({ type: "FogAdded", region });
    expect(undone.state.fog[region.id]).toEqual(region);
    expect(filterStateForViewer(undone.state, alice).tokens[token.id]).toBeUndefined();
  });

  it("undoes adding fog, and refuses once it is already gone", () => {
    const added = act(baseRoom(), gm, OVER_TOKEN);
    const region: FogRegion = (added.events[0] as Extract<DomainEvent, { type: "FogAdded" }>).region;
    const undone = act(added.state, gm, { type: "history.undo", commandId: added.commandId });
    expect(undone.state.fog).toEqual({});
    const removed = act(added.state, gm, { type: "fog.remove", regionId: region.id });
    expect(decide(removed.state, gm, Command.parse({ type: "history.undo", commandId: added.commandId }), ctx))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(isInFog(removed.state.fog, { x: 35, y: 35 })).toBe(false);
  });
});

describe("fog review fixes (FR-GM-17, FR-GM-23)", () => {
  it("keeps a fogged attacker blank on old rolls after it is deleted or revealed", () => {
    const { state: s1, token: hero } = withToken(baseRoom(), { name: "Hero", ownerIds: [alice.id] });
    const moved = run(s1, gm, { type: "token.move", tokenId: hero.id, to: { x: 385, y: 385 } }).state;
    const { state: s2, token: lurker } = withToken(moved, { name: "Lurker" });
    const { state: fogged, region } = addFog(s2);
    const rolled = run(fogged, gm, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: lurker.id, targetTokenId: hero.id } }).state;
    expect(filterStateForViewer(rolled, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.actor).toBeNull();
    const deleted = run(rolled, gm, { type: "token.delete", tokenId: lurker.id }).state;
    expect(JSON.stringify(filterStateForViewer(deleted, alice))).not.toContain("Lurker");
    const revealed = run(rolled, gm, { type: "fog.remove", regionId: region.id }).state;
    expect(filterStateForViewer(revealed, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.actor).toBeNull();
  });

  it("marks sides hidden when an unowned token moves into fog after the roll", () => {
    const { state: s1, token: hero } = withToken(baseRoom(), { name: "Hero", ownerIds: [alice.id] });
    const away = run(s1, gm, { type: "token.move", tokenId: hero.id, to: { x: 385, y: 385 } }).state;
    const { state: s2, token: goblin } = withToken(run(away, gm, OVER_TOKEN).state, { name: "Goblin" });
    const out = run(s2, gm, { type: "token.move", tokenId: goblin.id, to: { x: 245, y: 245 } }).state;
    const rolled = run(out, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: hero.id, targetTokenId: goblin.id } }).state;
    const back = run(rolled, gm, { type: "token.move", tokenId: goblin.id, to: { x: 35, y: 35 } }).state;
    const deleted = run(back, gm, { type: "token.delete", tokenId: goblin.id }).state;
    expect(filterStateForViewer(deleted, alice).rolls.filter(isDiceRoll).at(-1)?.attack?.target).toBeNull();
  });

  it("filters the turn order carried by InitiativeEnded", () => {
    const { state: s1, token: hero } = withToken(baseRoom(), { name: "Hero", ownerIds: [alice.id] });
    const away = run(s1, gm, { type: "token.move", tokenId: hero.id, to: { x: 385, y: 385 } }).state;
    const { state: s2, token: shade } = withToken(away, { name: "Shade" });
    const { state } = addFog(run(s2, gm, { type: "initiative.start", entries: [{ tokenId: shade.id, score: 20 }, { tokenId: hero.id, score: 5 }] }).state);
    const ended = run(state, gm, { type: "initiative.end" }).events[0]!;
    const filtered = filterEventForViewer(committed(ended), state, alice);
    expect(filtered.kind).toBe("event");
    expect(JSON.stringify(filtered)).not.toContain(shade.id);
  });

  it("answers commands about a fogged token as if it did not exist", () => {
    const { state: s1, token: goblin } = withToken(baseRoom(), { name: "Goblin" });
    const { state: s2, token: hero } = withToken(s1, { name: "Hero", ownerIds: [alice.id] });
    const away = run(s2, gm, { type: "token.move", tokenId: hero.id, to: { x: 385, y: 385 } }).state;
    const { state } = addFog(away);
    expect(attempt(state, alice, { type: "token.move", tokenId: goblin.id, to: { x: 0, y: 0 } })).toMatchObject({ code: "not_found" });
    expect(attempt(state, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: hero.id, targetTokenId: goblin.id } }))
      .toMatchObject({ code: "not_found" });
    const placed = run(state, bob, { type: "template.place", shape: "circle", origin: { x: 35, y: 35 }, toward: { x: 35, y: 35 }, size: 10 }).events[0]!;
    const id = placed.type === "TemplatePlaced" ? placed.template.id : "";
    const withTemplate = reduce(state, placed);
    expect(attempt(withTemplate, alice, { type: "template.remove", templateId: id })).toMatchObject({ code: "not_found" });
  });

  it("moves a token into fog before renaming it in the same save", () => {
    const { state: s1, token } = withToken(baseRoom(), { name: "Guard" });
    const away = run(s1, gm, { type: "token.move", tokenId: token.id, to: { x: 385, y: 385 } }).state;
    const { state } = addFog(away);
    const events = run(state, gm, { type: "token.configure", tokenId: token.id, changes: { name: "Secret Lich", position: { x: 35, y: 35 } } }).events;
    expect(events.map((e) => e.type)).toEqual(["TokenMoved", "TokenAppearanceSet"]);
    const out = run(reduceAll(state, events), gm, { type: "token.configure", tokenId: token.id, changes: { name: "Guard", position: { x: 385, y: 385 } } }).events;
    expect(out.map((e) => e.type)).toEqual(["TokenAppearanceSet", "TokenMoved"]);
  });

  it("refuses an undo that would push the room past the fog cap", () => {
    let state = baseRoom();
    for (let i = 0; i < MAX_FOG_REGIONS; i++) state = addFog(state).state;
    const first = Object.values(state.fog)[0]!;
    const removed = act(state, gm, { type: "fog.remove", regionId: first.id });
    const refilled = addFog(removed.state).state;
    expect(decide(refilled, gm, Command.parse({ type: "history.undo", commandId: removed.commandId }), ctx)).toMatchObject({ ok: false });
  });
});

describe("fog.replace swaps fog in one action (FR-GM-17, ADR 0032)", () => {
  const rect = (n: number): CommandInput => ({ type: "fog.add", region: { shape: "rect", from: { x: n * 10, y: 0 }, to: { x: n * 10 + 5, y: 5 } } });
  const fullRoom = () => {
    let state = baseRoom();
    for (let i = 0; i < MAX_FOG_REGIONS; i++) state = run(state, gm, rect(i)).state;
    return state;
  };
  const swap = (state: RoomState): CommandInput => ({
    type: "fog.replace",
    removeIds: [Object.keys(state.fog)[0]!],
    add: [{ shape: "rect", from: { x: 2000, y: 0 }, to: { x: 2005, y: 5 } }],
  });

  it("replaces a region in a room already at the cap, carrying the removed region (invariant 6)", () => {
    const state = fullRoom();
    const old = Object.values(state.fog)[0]!;
    const { state: next, events } = run(state, gm, swap(state));
    expect(events.map((e) => e.type)).toEqual(["FogRemoved", "FogAdded"]);
    expect(events[0]).toEqual({ type: "FogRemoved", region: old });
    expect(Object.keys(next.fog)).toHaveLength(MAX_FOG_REGIONS);
    expect(next.fog[old.id]).toBeUndefined();
  });

  it("refuses the whole swap when it would pass the cap, changing nothing", () => {
    const state = fullRoom();
    const decision = attempt(state, gm, { type: "fog.replace", removeIds: [], add: [{ shape: "rect", from: { x: 2000, y: 0 }, to: { x: 2005, y: 5 } }] });
    expect(decision).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses a missing region or an empty one without emitting any event", () => {
    const state = fullRoom();
    expect(attempt(state, gm, { type: "fog.replace", removeIds: ["nope"], add: [] })).toMatchObject({ ok: false, code: "not_found" });
    expect(attempt(state, gm, { type: "fog.replace", removeIds: [Object.keys(state.fog)[0]!], add: [{ shape: "rect", from: { x: 1, y: 1 }, to: { x: 1, y: 9 } }] }))
      .toMatchObject({ ok: false, code: "invalid" });
  });

  it("is GM only", () => {
    const state = fullRoom();
    expect(attempt(state, alice, swap(state))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("undoes as one action, even in a full room", () => {
    const state = fullRoom();
    const old = Object.values(state.fog)[0]!;
    const swapped = act(state, gm, swap(state));
    const undone = decide(swapped.state, gm, Command.parse({ type: "history.undo", commandId: swapped.commandId }), ctx);
    if (!undone.ok) throw new Error(undone.message);
    const after = undone.events.reduce((s, e) => reduce(s, e), swapped.state);
    expect(Object.keys(after.fog)).toHaveLength(MAX_FOG_REGIONS);
    expect(after.fog[old.id]).toEqual(old);
  });
});

describe("a new map clears the fog (FR-GM-17, ADR 0029)", () => {
  const MAP_A = { url: "/uploads/a.png", width: 700, height: 700 };

  it("removes every fog region when the map changes, carrying each (invariant 6), and keeps them for the same map", () => {
    let state = act(baseRoom(), gm, { type: "scene.setMap", map: MAP_A }).state;
    state = addFog(state).state;
    state = addFog(state, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 100 }, to: { x: 200, y: 200 } } }).state;
    const regions = Object.values(state.fog);

    const same = act(state, gm, { type: "scene.setMap", map: MAP_A });
    expect(Object.keys(same.state.fog)).toHaveLength(2);

    const other = act(state, gm, { type: "scene.setMap", map: { ...MAP_A, url: "/uploads/b.png" } });
    expect(other.state.fog).toEqual({});
    expect(other.events).toHaveLength(1);
    expect(other.events[0]).toMatchObject({ type: "MapSet", fogChange: { fog: [], previous: regions } });
  });
});
