import { describe, expect, it } from "vitest";
import {
  blocksMovement,
  can,
  Command,
  decide,
  describePortalChange,
  describeUndo,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  reduce,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type Participant,
  type Portal,
  type RoomState,
} from "../src";
import { alice, baseRoom, ctx, gm } from "./fixtures";

const MAP = { url: "/uploads/map.png", width: 700, height: 700 };
/** A doorway on the edge between columns 1 and 2 (x = 140), one cell tall, beside Aria's cell. */
const DOORWAY = { a: { x: 140, y: 70 }, b: { x: 140, y: 140 } };
/** A plain wall far from everything. */
const FAR_WALL = { a: { x: 560, y: 560 }, b: { x: 630, y: 560 } };
const door = (state: Portal["state"]): Portal => ({ kind: "door", state });

let batch = 0;
/** Like the server: decide, then reduce the batch under one command id (ADR 0013). */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) return { ok: false as const, code: decision.code, message: decision.message, state };
  const meta = { commandId: `portal-cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { ok: true as const, state: next, events: decision.events, commandId: meta.commandId };
}

function must(result: ReturnType<typeof act>) {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

/** A room with the map, Alice's token Aria at (105, 105), the doorway as a `portal` (or plain), and a far plain wall. */
function room(portal: Portal | null = door("closed")) {
  let state = must(act(baseRoom(), gm, { type: "scene.setMap", map: MAP })).state;
  state = must(act(state, gm, { type: "token.create", name: "Aria", position: { x: 105, y: 105 }, ownerIds: [alice.id] })).state;
  state = must(act(state, gm, { type: "wall.add", walls: [DOORWAY, FAR_WALL] })).state;
  const [doorwayId, farId] = Object.keys(state.walls) as [string, string];
  if (portal) state = must(act(state, gm, { type: "portal.set", wallId: doorwayId, portal })).state;
  const token = Object.values(state.tokens)[0]!;
  return { state, token, doorwayId, farId };
}

const committed = (event: CommittedEvent["event"], seq = 100): CommittedEvent =>
  ({ seq, roomId: "room-1", actorId: gm.id, at: "2026-10-09T00:00:00.000Z", commandId: "c", event }) as CommittedEvent;

describe("portal rules (FR-GM-18, ADR 0030)", () => {
  it("blocks movement for plain walls and closed or locked portals only", () => {
    expect(blocksMovement({})).toBe(true);
    expect(blocksMovement({ portal: door("closed") })).toBe(true);
    expect(blocksMovement({ portal: { kind: "window", state: "locked" } })).toBe(true);
    expect(blocksMovement({ portal: door("open") })).toBe(false);
  });

  it.each([
    [door("closed"), door("open"), "opened a door"],
    [door("open"), door("closed"), "closed a door"],
    [door("closed"), door("locked"), "locked a door"],
    [door("locked"), door("closed"), "unlocked a door"],
    [door("locked"), door("open"), "unlocked and opened a door"],
    [door("open"), door("locked"), "closed and locked a door"],
    [null, door("closed"), "made a wall a closed door"],
    [door("open"), null, "turned a door back into a wall"],
    [door("closed"), { kind: "window", state: "open" } as Portal, "made a door an open window"],
  ])("words %j to %j as %s", (from, to, past) => {
    expect(describePortalChange(from, to).past).toBe(past);
  });
});

describe("designating portals (FR-GM-09, ADR 0030)", () => {
  it("lets the GM make a wall a door, change it and turn it back", () => {
    const { state, doorwayId } = room(null);
    const made = must(act(state, gm, { type: "portal.set", wallId: doorwayId, portal: door("closed") }));
    expect(made.events).toEqual([{ type: "PortalChanged", wallId: doorwayId, from: null, to: door("closed") }]);
    expect(made.state.walls[doorwayId]!.portal).toEqual(door("closed"));
    const plain = must(act(made.state, gm, { type: "portal.set", wallId: doorwayId, portal: null }));
    expect(plain.state.walls[doorwayId]).toEqual({ id: doorwayId, ...DOORWAY });
  });

  it("refuses players, unknown walls and changes that change nothing", () => {
    const { state, doorwayId } = room();
    expect(act(state, alice, { type: "portal.set", wallId: doorwayId, portal: door("open") })).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(state, gm, { type: "portal.set", wallId: "nope", portal: door("open") })).toMatchObject({ ok: false, code: "not_found" });
    expect(act(state, gm, { type: "portal.set", wallId: doorwayId, portal: door("closed") })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("portal state controls movement (FR-GM-18)", () => {
  const through = (state: RoomState, tokenId: string) => act(state, alice, { type: "token.move", tokenId, to: { x: 175, y: 105 } });

  it("blocks a player at a closed or locked door and lets them through an open one", () => {
    const closed = room(door("closed"));
    expect(through(closed.state, closed.token.id)).toMatchObject({ ok: false, message: "That move is unavailable." });
    const locked = room({ kind: "window", state: "locked" });
    expect(through(locked.state, locked.token.id)).toMatchObject({ ok: false, message: "That move is unavailable." });
    const open = room(door("open"));
    expect(through(open.state, open.token.id).ok).toBe(true);
  });

  it("lets nobody stand across a closed door, but anyone stand in an open doorway", () => {
    const onDoor = { x: 140, y: 105 };
    const closed = room(door("closed"));
    expect(act(closed.state, gm, { type: "token.move", tokenId: closed.token.id, to: onDoor })).toMatchObject({ ok: false, message: "That move is unavailable." });
    const open = room(door("open"));
    expect(act(open.state, alice, { type: "token.move", tokenId: open.token.id, to: onDoor }).ok).toBe(true);
  });
});

describe("who may change a portal's state (FR-GM-18, ADR 0030)", () => {
  it("lets a player open and close a door they can see", () => {
    const { state, doorwayId } = room();
    const opened = must(act(state, alice, { type: "portal.setState", wallId: doorwayId, state: "open" }));
    expect(opened.events).toEqual([{ type: "PortalChanged", wallId: doorwayId, from: door("closed"), to: door("open") }]);
    const closed = must(act(opened.state, alice, { type: "portal.setState", wallId: doorwayId, state: "closed" }));
    expect(closed.state.walls[doorwayId]!.portal).toEqual(door("closed"));
  });

  it("keeps players out of locks", () => {
    const { state, doorwayId } = room(door("locked"));
    expect(act(state, alice, { type: "portal.setState", wallId: doorwayId, state: "open" })).toMatchObject({ ok: false, code: "invalid", message: "That door is locked." });
    expect(act(state, alice, { type: "portal.setState", wallId: doorwayId, state: "closed" })).toMatchObject({ ok: false, message: "That door is locked." });
    const unlocked = room(door("closed"));
    expect(act(unlocked.state, alice, { type: "portal.setState", wallId: unlocked.doorwayId, state: "locked" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers a player the same for a plain wall, a missing wall and a door under fog", () => {
    const { state, doorwayId, farId } = room();
    const fogged = must(act(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 0 }, to: { x: 200, y: 200 } } })).state;
    const answers = [farId, "nope"].map((wallId) => act(state, alice, { type: "portal.setState", wallId, state: "open" }));
    answers.push(act(fogged, alice, { type: "portal.setState", wallId: doorwayId, state: "open" }));
    const refusals = answers.map(({ ok, code, message }) => ({ ok, code, message }));
    expect(refusals[0]).toMatchObject({ ok: false, code: "not_found" });
    expect(new Set(refusals.map((r) => JSON.stringify(r))).size).toBe(1);
    // The GM sees through fog.
    expect(act(fogged, gm, { type: "portal.setState", wallId: doorwayId, state: "open" }).ok).toBe(true);
  });

  it("lets the GM lock, unlock and open a locked door", () => {
    const { state, doorwayId } = room();
    const locked = must(act(state, gm, { type: "portal.setState", wallId: doorwayId, state: "locked" }));
    expect(locked.state.walls[doorwayId]!.portal).toEqual(door("locked"));
    expect(must(act(locked.state, gm, { type: "portal.setState", wallId: doorwayId, state: "open" })).state.walls[doorwayId]!.portal).toEqual(door("open"));
    expect(act(locked.state, gm, { type: "portal.setState", wallId: doorwayId, state: "locked" })).toMatchObject({ ok: false, message: "That door is already locked." });
  });

  it("hints the board which portals the viewer may click", () => {
    const { state, doorwayId, farId } = room(door("locked"));
    expect(can.togglePortal(gm, state.walls[doorwayId]!)).toBe(true);
    expect(can.togglePortal(alice, state.walls[doorwayId]!)).toBe(false);
    expect(can.togglePortal(gm, state.walls[farId]!)).toBe(false);
  });
});

describe("players see the portals in front of them (FR-GM-18, FR-GM-23, ADR 0030)", () => {
  it("sends players portals outside fog and no plain walls", () => {
    const { state, doorwayId } = room();
    expect(Object.keys(filterStateForViewer(state, alice).walls)).toEqual([doorwayId]);
    expect(filterStateForViewer(state, alice).walls[doorwayId]!.portal).toEqual(door("closed"));
    const fogged = must(act(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 0 }, to: { x: 200, y: 200 } } })).state;
    expect(filterStateForViewer(fogged, alice).walls).toEqual({});
    expect(Object.keys(filterStateForViewer(fogged, gm).walls)).toHaveLength(2);
  });

  it("delivers a visible door's state change as an event the player's copy can apply", () => {
    const { state, doorwayId } = room();
    const event = { type: "PortalChanged", wallId: doorwayId, from: door("closed"), to: door("open") } as const;
    const filtered = filterEventForViewer(committed(event), state, alice);
    expect(filtered.kind).toBe("event");
    const playerCopy = reduce(filterStateForViewer(state, alice), event);
    expect(playerCopy.walls[doorwayId]!.portal).toEqual(door("open"));
  });

  it("resyncs when a portal appears or vanishes, and redacts what stays hidden", () => {
    const plain = room(null);
    const designate = committed({ type: "PortalChanged", wallId: plain.doorwayId, from: null, to: door("closed") });
    expect(filterEventForViewer(designate, plain.state, alice).kind).toBe("resync");
    const withDoor = room();
    const removed = committed({ type: "WallsRemoved", walls: [withDoor.state.walls[withDoor.doorwayId]!] });
    expect(filterEventForViewer(removed, withDoor.state, alice).kind).toBe("resync");
    const farOnly = committed({ type: "WallsRemoved", walls: [withDoor.state.walls[withDoor.farId]!] });
    expect(filterEventForViewer(farOnly, withDoor.state, alice).kind).toBe("redacted");
    const fogged = must(act(withDoor.state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 0 }, to: { x: 200, y: 200 } } })).state;
    const hiddenOpen = committed({ type: "PortalChanged", wallId: withDoor.doorwayId, from: door("closed"), to: door("open") });
    expect(filterEventForViewer(hiddenOpen, fogged, alice).kind).toBe("redacted");
  });
});

describe("portal changes are reversible (FR-REC-02, ADR 0030)", () => {
  it("undoes a player's opening and words it", () => {
    const { state, doorwayId } = room();
    const opened = must(act(state, alice, { type: "portal.setState", wallId: doorwayId, state: "open" }));
    const entry = undoableAction(opened.state.undo, opened.commandId)!;
    expect(describeUndo(entry, opened.state.tokens)).toEqual({ verb: "open a door", noun: "opening a door" });
    const undone = must(act(opened.state, gm, { type: "history.undo", commandId: opened.commandId }));
    expect(undone.state.walls[doorwayId]!.portal).toEqual(door("closed"));
  });

  it("refuses when the door changed since or its wall is gone", () => {
    const { state, doorwayId } = room();
    const opened = must(act(state, gm, { type: "portal.setState", wallId: doorwayId, state: "open" }));
    const locked = must(act(opened.state, gm, { type: "portal.setState", wallId: doorwayId, state: "locked" }));
    expect(act(locked.state, gm, { type: "history.undo", commandId: opened.commandId })).toMatchObject({ ok: false, message: "Can't undo: that door has changed since." });
    const gone = must(act(opened.state, gm, { type: "wall.remove", wallIds: [doorwayId] }));
    expect(act(gone.state, gm, { type: "history.undo", commandId: opened.commandId })).toMatchObject({ ok: false, message: "Can't undo: that wall no longer exists." });
  });

  it("brings a removed door back as it was", () => {
    const { state, doorwayId } = room(door("locked"));
    const removed = must(act(state, gm, { type: "wall.remove", wallIds: [doorwayId] }));
    const undone = must(act(removed.state, gm, { type: "history.undo", commandId: removed.commandId }));
    expect(undone.state.walls[doorwayId]!.portal).toEqual(door("locked"));
  });
});

describe("portal activity log (FR-GM-18, ADR 0030)", () => {
  it("phrases opening and designating", () => {
    const { state, doorwayId } = room();
    expect(formatActivity({ type: "PortalChanged", wallId: doorwayId, from: door("closed"), to: door("open") }, "Alice", state)).toBe("Alice opened a door");
    expect(formatActivity({ type: "PortalChanged", wallId: doorwayId, from: null, to: { kind: "window", state: "closed" } }, "GM", state)).toBe("GM made a wall a closed window");
  });
});

describe("new walls may arrive as doors (FR-GM-09, ADR 0030)", () => {
  it("keeps the portal a wall.add wall carries", () => {
    const { state } = room(null);
    const added = must(act(state, gm, { type: "wall.add", walls: [{ a: { x: 280, y: 70 }, b: { x: 280, y: 140 }, portal: door("open") }] }));
    const wall = Object.values(added.state.walls).find((w) => w.a.x === 280)!;
    expect(wall.portal).toEqual(door("open"));
  });
});
