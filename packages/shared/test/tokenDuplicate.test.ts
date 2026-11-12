import { describe, expect, it } from "vitest";
import { filterEventForViewer, type DomainEvent, type Token } from "../src";
import { committedRoom } from "./committedRoom";
import { alice, gm } from "./fixtures";

function withGoblin(overrides: { hidden?: boolean } = {}) {
  const room = committedRoom();
  const { events } = room.run(gm, {
    type: "token.create",
    name: "Goblin",
    position: { x: 105, y: 105 },
    stats: { hp: 7, maxHp: 7, ac: 15 },
    conditions: ["poisoned"],
    color: "#336699",
    ownerIds: [alice.id],
    hidden: overrides.hidden ?? false,
    attacks: [{ name: "Scimitar", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 } }],
  });
  const created = events[0];
  if (created?.type !== "TokenCreated") throw new Error("expected TokenCreated");
  return { room, goblin: created.token };
}

const created = (events: readonly DomainEvent[]): Token[] =>
  events.flatMap((e) => (e.type === "TokenCreated" ? [e.token] : []));

describe("Duplicate a token (KAN-82, FR-REC-02)", () => {
  it("copies image, size, stats, conditions, attacks, owners and visibility, next to the original", () => {
    const { room, goblin } = withGoblin();
    const [copy] = created(room.run(gm, { type: "token.duplicate", tokenId: goblin.id }).events);
    expect(copy).toMatchObject({
      name: "Goblin 2",
      size: goblin.size,
      color: "#336699",
      stats: { hp: 7, maxHp: 7, ac: 15 },
      conditions: ["poisoned"],
      ownerIds: [alice.id],
      hidden: false,
      attacks: goblin.attacks,
    });
    expect(copy!.id).not.toBe(goblin.id);
    expect(copy!.position).not.toEqual(goblin.position);
    const cell = room.state.scene.grid.cellSize;
    expect(Math.abs(copy!.position.x - goblin.position.x)).toBeLessThanOrEqual(cell);
    expect(Math.abs(copy!.position.y - goblin.position.y)).toBeLessThanOrEqual(cell);
  });

  it("makes several numbered copies on distinct free squares in one action", () => {
    const { room, goblin } = withGoblin();
    const { events } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id, count: 4 });
    const copies = created(events);
    expect(copies.map((t) => t.name)).toEqual(["Goblin 2", "Goblin 3", "Goblin 4", "Goblin 5"]);
    const spots = new Set([goblin, ...copies].map((t) => `${t.position.x},${t.position.y}`));
    expect(spots.size).toBe(5);
    expect(room.state.undo.at(-1)?.events).toHaveLength(4);
  });

  it("keeps a hidden original's copies hidden from players", () => {
    const { room, goblin } = withGoblin({ hidden: true });
    room.run(gm, { type: "token.duplicate", tokenId: goblin.id });
    const committed = room.log.at(-1)!;
    const before = { ...room.state, tokens: { [goblin.id]: goblin } };
    expect(filterEventForViewer(committed, before, alice).kind).toBe("redacted");
  });

  it("does not copy the remembered initiative score", () => {
    const { room, goblin } = withGoblin();
    room.run(gm, { type: "initiative.start", entries: [{ tokenId: goblin.id, score: 12 }] });
    const [copy] = created(room.run(gm, { type: "token.duplicate", tokenId: goblin.id }).events);
    expect(copy!.initiative).toBeUndefined();
  });

  it("rejects counts outside 1–20 and unknown tokens", () => {
    const { room, goblin } = withGoblin();
    expect(() => room.attempt(gm, { type: "token.duplicate", tokenId: goblin.id, count: 0 })).toThrow();
    expect(() => room.attempt(gm, { type: "token.duplicate", tokenId: goblin.id, count: 21 })).toThrow();
    expect(room.attempt(gm, { type: "token.duplicate", tokenId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("is GM only, even for a player's own token (FR-GM-15)", () => {
    const { room, goblin } = withGoblin();
    expect(room.attempt(alice, { type: "token.duplicate", tokenId: goblin.id })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("Duplicates join the original's group (KAN-82)", () => {
  it("puts the copies in the original's group, and one undo removes them all", () => {
    const { room, goblin } = withGoblin();
    const { events: made } = room.run(gm, { type: "group.create", name: "Gate guards" });
    const groupId = (made[0] as Extract<DomainEvent, { type: "GroupCreated" }>).group.id;
    room.run(gm, { type: "group.assign", groupId, tokenIds: [goblin.id] });
    const { events, commandId } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id, count: 2 });
    for (const copy of created(events)) expect(room.state.tokenGroups[copy.id]).toBe(groupId);
    room.run(gm, { type: "history.undo", commandId });
    expect(Object.keys(room.state.tokens)).toEqual([goblin.id]);
    expect(room.state.tokenGroups).toEqual({ [goblin.id]: groupId });
  });
});

describe("Undo token creation (KAN-82, FR-REC-02)", () => {
  it("removes every token a duplicate created, and leaves the original", () => {
    const { room, goblin } = withGoblin();
    const { commandId } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id, count: 3 });
    room.run(gm, { type: "history.undo", commandId });
    expect(Object.values(room.state.tokens).map((t) => t.name)).toEqual(["Goblin"]);
    expect(room.state.tokens[goblin.id]).toEqual(goblin);
  });

  it("undoes Add token too", () => {
    const room = committedRoom();
    const { commandId } = room.run(gm, { type: "token.create", name: "Ogre", position: { x: 35, y: 35 } });
    room.run(gm, { type: "history.undo", commandId });
    expect(room.state.tokens).toEqual({});
  });

  it("refuses when a copy has changed since, removing nothing", () => {
    const { room, goblin } = withGoblin();
    const { events, commandId } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id });
    const [copy] = created(events);
    room.run(gm, { type: "token.move", tokenId: copy!.id, to: { x: 385, y: 385 } });
    const refused = room.attempt(gm, { type: "history.undo", commandId });
    expect(refused).toMatchObject({ ok: false, message: "Can't undo: Goblin 2 has changed since." });
    expect(Object.keys(room.state.tokens)).toHaveLength(2);
  });

  it("refuses when a copy was deleted since", () => {
    const { room, goblin } = withGoblin();
    const { events, commandId } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id });
    room.run(gm, { type: "token.delete", tokenId: created(events)[0]!.id });
    expect(room.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, message: "Can't undo: Goblin 2 no longer exists." });
  });
});

describe("Duplicate onto a chosen square (KAN-82, ADR 0033)", () => {
  it("puts the copy on the given square, with everything copied", () => {
    const { room, goblin } = withGoblin();
    const at = { x: 385, y: 245 };
    const [copy] = created(room.run(gm, { type: "token.duplicate", tokenId: goblin.id, position: at }).events);
    expect(copy).toMatchObject({ name: "Goblin 2", position: at, stats: goblin.stats, conditions: goblin.conditions, ownerIds: goblin.ownerIds, attacks: goblin.attacks });
  });

  it("joins the original's group in the same decision", () => {
    const { room, goblin } = withGoblin();
    const { events: made } = room.run(gm, { type: "group.create", name: "Gate guards" });
    const groupId = (made[0] as Extract<DomainEvent, { type: "GroupCreated" }>).group.id;
    room.run(gm, { type: "group.assign", groupId, tokenIds: [goblin.id] });
    const { events } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id, position: { x: 385, y: 245 } });
    expect(events.map((e) => e.type)).toEqual(["TokenCreated", "TokensGrouped"]);
    expect(room.state.tokenGroups[created(events)[0]!.id]).toBe(groupId);
  });

  it("keeps a hidden original's copy hidden from players", () => {
    const { room, goblin } = withGoblin({ hidden: true });
    const before = room.state;
    const { events } = room.run(gm, { type: "token.duplicate", tokenId: goblin.id, position: { x: 385, y: 245 } });
    expect(created(events)[0]!.hidden).toBe(true);
    expect(filterEventForViewer(room.log.at(-1)!, before, alice).kind).toBe("redacted");
  });

  it("refuses a square whose footprint crosses a wall, creating nothing", () => {
    const { room, goblin } = withGoblin();
    room.run(gm, { type: "scene.setMap", map: { url: "/uploads/map.png", width: 1400, height: 1050 } });
    room.run(gm, { type: "wall.add", walls: [{ a: { x: 385, y: 0 }, b: { x: 385, y: 700 } }] });
    const before = room.state;
    expect(room.attempt(gm, { type: "token.duplicate", tokenId: goblin.id, position: { x: 385, y: 245 } })).toMatchObject({ ok: false, code: "invalid" });
    expect(room.state).toBe(before);
  });

  it("leaves a duplicate without a square beside the original, as before", () => {
    const { room, goblin } = withGoblin();
    const [copy] = created(room.run(gm, { type: "token.duplicate", tokenId: goblin.id }).events);
    expect(copy!.position).not.toEqual(goblin.position);
    expect(Math.abs(copy!.position.x - goblin.position.x)).toBeLessThanOrEqual(room.state.scene.grid.cellSize);
  });
});
