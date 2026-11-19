import { describe, expect, it } from "vitest";
import { Command, decide, filterStateForViewer, isDisplayNameTaken, MAX_EVENTS_PER_ROOM, MAX_TOKENS_PER_ROOM, type RoomState, type Token } from "../src";
import { movementObstacles } from "../src/movement";
import { buildFieldLabel } from "../src/build";
import { CreateRoomRequest, GuestToken } from "../src/protocol";
import { alice, attempt, baseRoom, ctx, gm, run, withToken } from "./fixtures";

const withMap = (state: RoomState): RoomState => ({ ...state, scene: { ...state.scene, map: { url: "/uploads/m.png", width: 700, height: 700 } } });

describe("L8: token positions stay near the map (FR-GM-15)", () => {
  it("refuses a move, a create and a configure far off the board", () => {
    const { state, token } = withToken(withMap(baseRoom()), { ownerIds: [alice.id] });
    expect(attempt(state, alice, { type: "token.move", tokenId: token.id, to: { x: 1e300, y: 0 } })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "token.create", name: "Far", position: { x: 99999, y: 0 } })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "token.configure", tokenId: token.id, changes: { position: { x: 0, y: -99999 } } })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("M3: room ceilings (FR-GM-15)", () => {
  it("refuses a token past MAX_TOKENS_PER_ROOM", () => {
    const { state, token } = withToken(baseRoom());
    const tokens: Record<string, Token> = {};
    for (let i = 0; i < MAX_TOKENS_PER_ROOM; i++) tokens[`t${i}`] = { ...token, id: `t${i}` };
    expect(attempt({ ...state, tokens }, gm, { type: "token.create", name: "One more", position: { x: 35, y: 35 } })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses commands once the log reaches MAX_EVENTS_PER_ROOM", () => {
    const command = Command.parse({ type: "token.create", name: "Late", position: { x: 35, y: 35 } });
    expect(decide(baseRoom(), gm, command, { ...ctx, lastSeq: MAX_EVENTS_PER_ROOM })).toMatchObject({ ok: false, code: "invalid" });
    expect(decide(baseRoom(), gm, command, { ...ctx, lastSeq: 5 })).toMatchObject({ ok: true });
  });
});

describe("M8: image urls are origin-relative paths (FR-GM-15)", () => {
  it.each(["https://evil.example/p.png", "//evil.example/p.png", "http://x/y", "/a?b=1", "javascript:alert(1)"])("refuses %s", (imageUrl) => {
    expect(Command.safeParse({ type: "token.setImage", tokenId: "t", imageUrl }).success).toBe(false);
    expect(Command.safeParse({ type: "scene.setMap", map: { url: imageUrl, width: 10, height: 10 } }).success).toBe(false);
  });

  it("accepts uploads and built-in art", () => {
    expect(Command.safeParse({ type: "token.setImage", tokenId: "t", imageUrl: "/uploads/a-b_1.png" }).success).toBe(true);
    expect(Command.safeParse({ type: "scene.setMap", map: { url: "/img/map-ice.webp", width: 10, height: 10 } }).success).toBe(true);
  });
});

describe("L5: invisible characters in names (FR-PL-02)", () => {
  it("strips zero-width and bidi characters from a display name", () => {
    const parsed = CreateRoomRequest.parse({ roomName: "Room​", displayName: "A‮lice​", guestToken: "x".repeat(43) });
    expect(parsed.displayName).toBe("Alice");
    expect(parsed.roomName).toBe("Room");
  });

  it("refuses a name that is only invisible characters", () => {
    expect(Command.safeParse({ type: "token.create", name: "​​", position: { x: 0, y: 0 } }).success).toBe(false);
  });

  it("treats a name with a zero-width character as the same name", () => {
    expect(isDisplayNameTaken(baseRoom(), "Al​ice")).toBe(true);
  });
});

describe("L6: players get an allow-list of room fields", () => {
  it("does not pass an unknown field through to a player", () => {
    const state = { ...baseRoom(), futureSecret: { gm: true } } as unknown as RoomState;
    expect("futureSecret" in filterStateForViewer(state, alice)).toBe(false);
    expect("futureSecret" in filterStateForViewer(state, gm)).toBe(true);
  });

  it("keeps the public fields", () => {
    const view = filterStateForViewer({ ...baseRoom(), reducedEffects: true, hideHp: true }, alice);
    expect(view).toMatchObject({ roomId: "room-1", name: "Test Room", reducedEffects: true, hideHp: true });
  });
});

describe("M4: movement obstacles are cached per state", () => {
  it("returns the same object for the same state", () => {
    const state = baseRoom();
    expect(movementObstacles(state)).toBe(movementObstacles(state));
    expect(movementObstacles({ ...state })).not.toBe(movementObstacles(state));
  });
});

describe("M1: reserved ids (FR-GM-15)", () => {
  it.each(["constructor", "__proto__", "toString"])("refuses %s on token.setOwners without an event", (tokenId) => {
    expect(attempt(baseRoom(), gm, { type: "token.setOwners", tokenId, ownerIds: [] })).toMatchObject({ ok: false });
    expect(() => run(baseRoom(), gm, { type: "token.setOwners", tokenId, ownerIds: [] })).toThrow();
  });
});

describe("BE-AUDIT: inherited keys in label lookups", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("buildFieldLabel(%s) reads as words, not an Object member", (field) => {
    expect(typeof buildFieldLabel(field)).toBe("string");
    expect(buildFieldLabel("hp")).toBe("HP");
  });
});

describe("BE-AUDIT: guest token shape", () => {
  it("accepts 32 random bytes as base64url and refuses short or foreign characters", () => {
    expect(GuestToken.safeParse("A".repeat(43)).success).toBe(true);
    expect(GuestToken.safeParse("A".repeat(42)).success).toBe(false);
    expect(GuestToken.safeParse(`${"A".repeat(42)}.`).success).toBe(false);
    expect(GuestToken.safeParse(`${"A".repeat(42)} `).success).toBe(false);
  });
});
