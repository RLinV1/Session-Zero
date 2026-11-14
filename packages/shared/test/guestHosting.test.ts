import { describe, expect, it } from "vitest";
import {
  CreateRoomRequest,
  GuestRoomStatus,
  SHIPPED_MAPS,
  SHIPPED_MAP_SLUGS,
  boardImageUrls,
  isBuiltinImageUrl,
  saveScene,
  tableOf,
  type DomainEvent,
  type Token,
} from "../src";
import { baseRoom } from "./fixtures";

const request = { roomName: "Crypt", displayName: "Sam", guestToken: "g".repeat(32) };

describe("guest rooms: the create request (FR-GM-01)", () => {
  it("parses with and without a shipped map", () => {
    expect(CreateRoomRequest.safeParse(request).success).toBe(true);
    const withMap = CreateRoomRequest.safeParse({ ...request, shippedMap: "sunken-crypt" });
    expect(withMap.success && withMap.data.shippedMap).toBe("sunken-crypt");
  });

  it("rejects a slug that does not ship", () => {
    expect(CreateRoomRequest.safeParse({ ...request, shippedMap: "not-a-map" }).success).toBe(false);
  });

  it("lists exactly the shipped maps", () => {
    expect([...SHIPPED_MAP_SLUGS].sort()).toEqual(SHIPPED_MAPS.map((m) => m.slug).sort());
  });

  it("describes a room's guest status", () => {
    expect(GuestRoomStatus.parse({ guest: true, idleDays: 30 })).toEqual({ guest: true, idleDays: 30 });
    expect(GuestRoomStatus.safeParse({ guest: true, idleDays: 0 }).success).toBe(false);
  });
});

describe("isBuiltinImageUrl (FR-GM-02)", () => {
  it("accepts every shipped map and built-in token art", () => {
    for (const map of SHIPPED_MAPS) expect(isBuiltinImageUrl(map.url)).toBe(true);
    expect(isBuiltinImageUrl("/img/tokens/enemies/goblin-guard.webp")).toBe(true);
  });

  it.each([
    "/uploads/x",
    "https://example.com/img/x.png",
    "/img/../uploads/x",
    "//host/img/x",
    "/img//x",
    "/img/x.png?a=1",
    "/img/x.png#frag",
    "/img/%2e%2e/uploads/x",
    "/img\\..\\uploads\\x",
    "/img/a\\b.png",
    "img/x.png",
    "",
  ])("rejects %s", (url) => {
    expect(isBuiltinImageUrl(url)).toBe(false);
  });
});

describe("boardImageUrls (FR-GM-02)", () => {
  const token = (imageUrl: string | null): Token => ({
    id: "t1", name: "Orc", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#aa0000", imageUrl,
    ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
  });
  const map = (url: string) => ({ url, width: 100, height: 100 });
  const room = baseRoom();
  const tableWith = (mapUrl: string | null, tokenUrl: string | null) => ({
    ...tableOf(room),
    scene: { ...room.scene, map: mapUrl ? map(mapUrl) : null },
    tokens: { t1: token(tokenUrl) },
  });
  const sceneWith = (mapUrl: string, tokenUrl: string) => ({ ...saveScene(room), table: tableWith(mapUrl, tokenUrl) });

  it("names the map a MapSet puts on the board, and none for an empty one", () => {
    const set = (url: string | null): DomainEvent => ({ type: "MapSet", map: url ? map(url) : null, previous: map("/uploads/old") });
    expect(boardImageUrls(set("/uploads/a"))).toEqual(["/uploads/a"]);
    expect(boardImageUrls(set(null))).toEqual([]);
  });

  it("names a created token's art, and none for a token with no image", () => {
    expect(boardImageUrls({ type: "TokenCreated", token: token("/img/tokens/a.webp") })).toEqual(["/img/tokens/a.webp"]);
    expect(boardImageUrls({ type: "TokenCreated", token: token(null) })).toEqual([]);
  });

  it("names the new art of TokenImageSet, not the art it replaced", () => {
    const event: DomainEvent = { type: "TokenImageSet", tokenId: "t1", imageUrl: "/img/tokens/a.webp", previous: { imageUrl: "/uploads/old" } };
    expect(boardImageUrls(event)).toEqual(["/img/tokens/a.webp"]);
    expect(boardImageUrls({ ...event, imageUrl: null })).toEqual([]);
  });

  it("names every map and token in a table an event carries", () => {
    const applied = tableWith("/uploads/m", "/uploads/t");
    const previous = tableWith("/uploads/prev-m", "/uploads/prev-t");
    expect(boardImageUrls({ type: "EncounterApplied", templateId: "e1", name: "Ambush", applied, previous })).toEqual(["/uploads/m", "/uploads/t"]);
    expect(boardImageUrls({ type: "CheckpointRestored", checkpointId: "c1", name: "Start", restored: applied, previous })).toEqual(["/uploads/m", "/uploads/t"]);
  });

  it("names the art of the scene an event restores or prepares", () => {
    const saved = sceneWith("/img/map.webp", "/uploads/t");
    const other = sceneWith("/uploads/old", "/uploads/old");
    const expected = ["/img/map.webp", "/uploads/t"];
    expect(boardImageUrls({ type: "SceneDraftCreated", sceneId: "s2", name: "Two", initialId: "initial", initialName: "One", saved })).toEqual(expected);
    expect(boardImageUrls({ type: "ScenePrepared", sceneId: "s2", prepared: saved, previous: other })).toEqual(expected);
    expect(boardImageUrls({ type: "SceneCreated", sceneId: "s2", name: "Two", fromId: "initial", fromName: "One", previous: other, restored: saved })).toEqual(expected);
    expect(boardImageUrls({ type: "SceneSwitched", fromId: "initial", sceneId: "s2", name: "Two", previous: other, restored: saved })).toEqual(expected);
  });

  it("names nothing for events that carry no board art, including ones that only remove it", () => {
    expect(boardImageUrls({ type: "TokenDeleted", token: token("/uploads/x") })).toEqual([]);
    expect(boardImageUrls({ type: "SceneDeleted", sceneId: "s2", name: "Two", previous: sceneWith("/uploads/x", "/uploads/y") })).toEqual([]);
    expect(boardImageUrls({ type: "SceneRenamed", sceneId: "s2", name: "Two", previous: "One" })).toEqual([]);
  });
});
