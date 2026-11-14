import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GM_TOKEN_HEADER,
  GUEST_ASSET,
  GUEST_ROOM_LIMIT,
  GUEST_UPLOAD,
  LEGACY_IDENTITY,
  SHIPPED_MAPS,
  type CreateRoomResponse,
  type GmRoomSummary,
  type GuestRoomStatus,
  type LegacySummary,
} from "@vtt/shared";
import { GUEST_ROOM_IDLE_MS } from "../src/app";
import { hashToken } from "../src/domain/credentials";
import { addressKey } from "../src/identity/routes";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { newGuestToken, startServer, type TestClient } from "./helpers";
import { pngOfSize } from "./pngOfSize";

const DAY = 24 * 60 * 60_000;
const crypt = SHIPPED_MAPS.find((m) => m.slug === "sunken-crypt")!;
const ice = SHIPPED_MAPS.find((m) => m.slug === "hollowfrost-keep")!;
const PNG = pngOfSize(64, 64);

describe("addressKey (FR-GM-01)", () => {
  it("leaves an IPv4 address as it is", () => {
    expect(addressKey("203.0.113.9")).toBe("203.0.113.9");
  });

  it("gives two addresses in one /64 the same key, and another /64 a different one", () => {
    const a = addressKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(addressKey("2001:db8:1:2::1")).toBe(a);
    expect(addressKey("2001:DB8:1:2:0:0:0:ffff")).toBe(a);
    expect(addressKey("2001:db8:1:3::1")).not.toBe(a);
  });

  it("reads an IPv4-mapped IPv6 address as its IPv4", () => {
    expect(addressKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
});

/** The pieces every guest room test needs: a server, and helpers to act as a signed-out browser. */
function useGuestServer(opts: { now?: () => number } = {}) {
  const ctx = {} as {
    server: Awaited<ReturnType<typeof startServer>>;
    store: MemoryRoomStore;
    clients: TestClient[];
  };
  beforeEach(async () => {
    ctx.store = new MemoryRoomStore();
    ctx.server = await startServer(ctx.store, opts);
    ctx.clients = [];
  });
  afterEach(async () => {
    ctx.clients.forEach((c) => c.close());
    await ctx.server.close();
  });

  const body = (over: Record<string, unknown> = {}) => ({
    roomName: "Crypt", displayName: "Sam", guestToken: newGuestToken(), shippedMap: "sunken-crypt", ...over,
  });
  /** `POST /api/rooms` as a signed-out browser holding `gmToken`. */
  const create = (gmToken: string | null, payload: Record<string, unknown> = body(), headers: Record<string, string> = {}) =>
    fetch(`${ctx.server.base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(gmToken ? { [GM_TOKEN_HEADER]: gmToken } : {}), ...headers },
      body: JSON.stringify(payload),
    });
  const startGuest = async (gmToken = newGuestToken()) => {
    const payload = body();
    const res = await create(gmToken, payload);
    if (res.status !== 200) throw new Error(`guest create ${res.status} ${await res.text()}`);
    const room = (await res.json()) as CreateRoomResponse;
    return { ...room, gmToken, guestToken: payload.guestToken as string };
  };
  const connect = async (room: { roomId: string; guestToken: string }) => {
    const client = await ctx.server.connect(room);
    ctx.clients.push(client);
    return client;
  };
  const ownerOf = async (gmToken: string) => (await ctx.store.findGm(hashToken(gmToken)))!;
  return { ctx, body, create, startGuest, connect, ownerOf };
}

describe("guest rooms (FR-GM-01)", () => {
  const { ctx, body, create, startGuest, connect, ownerOf } = useGuestServer();

  it("starts a room on the chosen map and grid, with no library rows", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    expect(gm.state.scene.map).toMatchObject({ url: crypt.url, width: crypt.width, height: crypt.height });
    expect(gm.state.scene.map?.assetId).toBeUndefined();
    expect(gm.state.scene.grid).toMatchObject({ cellSize: crypt.grid.cellSize, offsetX: crypt.grid.offsetX, offsetY: crypt.grid.offsetY });
    expect(gm.state.participants[room.participantId]).toMatchObject({ role: "gm", displayName: "Sam" });
    expect(await ctx.store.ownedCounts(await ownerOf(room.gmToken))).toEqual({ rooms: 1, assets: 0, creatures: 0, diceLooks: 0, guest: true });
    expect(await ctx.store.isGuestRoom(room.roomId)).toBe(true);
  });

  it("lists the guest's rooms and reports that the identity is a guest", async () => {
    const room = await startGuest();
    const headers = { [GM_TOKEN_HEADER]: room.gmToken };
    const rooms = (await (await fetch(`${ctx.server.base}/api/gm/rooms`, { headers })).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.id)).toEqual([room.roomId]);
    const legacy = (await (await fetch(`${ctx.server.base}/api/gm/legacy`, { headers })).json()) as LegacySummary;
    expect(legacy).toMatchObject({ rooms: 1, guest: true });
  });

  it("answers 401 with neither a session nor a token", async () => {
    expect((await create(null)).status).toBe(401);
    expect((await create("short")).status).toBe(401);
  });

  it("answers 400 for a map that does not ship, and creates nothing", async () => {
    const gmToken = newGuestToken();
    expect((await create(gmToken, body({ shippedMap: "not-a-map" }))).status).toBe(400);
    expect((await create(gmToken, body({ shippedMap: undefined }))).status).toBe(400);
    expect(await ctx.store.findGm(hashToken(gmToken))).toBeNull();
  });

  it("answers 400 for an encounter template, and creates nothing", async () => {
    const gmToken = newGuestToken();
    expect((await create(gmToken, body({ templateId: randomUUID() }))).status).toBe(400);
    expect(await ctx.store.findGm(hashToken(gmToken))).toBeNull();
  });

  it("answers 409 legacy_identity for a pre-account token, and leaves that identity as it was", async () => {
    const gmToken = newGuestToken();
    const ownerId = await ctx.store.registerGm(hashToken(gmToken));
    const res = await create(gmToken);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe(LEGACY_IDENTITY);
    expect(await ctx.store.ownedCounts(ownerId)).toEqual({ rooms: 0, assets: 0, creatures: 0, diceLooks: 0, guest: false });
  });

  it("answers 409 guest_room_limit at a 4th room, and a deleted room frees a slot", async () => {
    const gmToken = newGuestToken();
    const first = await startGuest(gmToken);
    await startGuest(gmToken);
    await startGuest(gmToken);
    const fourth = await create(gmToken);
    expect(fourth.status).toBe(409);
    expect(((await fourth.json()) as { code: string }).code).toBe(GUEST_ROOM_LIMIT);
    expect(await ctx.store.countOwnedRooms(await ownerOf(gmToken))).toBe(3);

    const deleted = await fetch(`${ctx.server.base}/api/rooms/${first.roomId}`, { method: "DELETE", headers: { [GM_TOKEN_HEADER]: gmToken } });
    expect(deleted.status).toBe(204);
    expect((await create(gmToken)).status).toBe(200);
  });

  it("answers 429 with Retry-After on the 21st attempt from one address, counting refused ones, and creates no identity", async () => {
    for (let i = 0; i < 20; i += 1) expect((await create(newGuestToken(), body({ shippedMap: "not-a-map" }))).status).toBe(400);
    const gmToken = newGuestToken();
    const res = await create(gmToken);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await ctx.store.findGm(hashToken(gmToken))).toBeNull();
  });

  it("lets a session win over a token, and counts an account against neither guest limit", async () => {
    const sam = await ctx.server.signUp();
    const gmToken = newGuestToken();
    for (let i = 0; i < 20; i += 1) {
      const res = await sam.request("POST", "/api/rooms", body({ shippedMap: undefined, guestToken: newGuestToken() }), { [GM_TOKEN_HEADER]: gmToken });
      expect(res.status).toBe(200);
    }
    expect(await ctx.store.findGm(hashToken(gmToken))).toBeNull();
    const ownerId = (await ctx.store.findUserById(sam.view!.id))!.ownerId;
    expect(await ctx.store.countOwnedRooms(ownerId)).toBe(20);
    expect((await create(newGuestToken())).status).toBe(200);
  });

  it("lets an account start on a shipped map too, and that room is not a guest room", async () => {
    const sam = await ctx.server.signUp();
    const payload = body();
    const room = await sam.json<CreateRoomResponse>("POST", "/api/rooms", payload);
    expect(await ctx.store.isGuestRoom(room.roomId)).toBe(false);
    const gm = await connect({ roomId: room.roomId, guestToken: payload.guestToken as string });
    expect(gm.state.scene.map?.url).toBe(crypt.url);
  });

  it("stores the raw token and the seat credential in no record", async () => {
    const room = await startGuest();
    const stored = JSON.stringify(ctx.store, (_key, value: unknown) => (value instanceof Map || value instanceof Set ? [...value] : value));
    expect(stored).not.toContain(room.gmToken);
    expect(stored).not.toContain(room.guestToken);
    expect(stored).toContain(hashToken(room.gmToken));
  });
});

describe("guest rooms: invites (FR-GM-01)", () => {
  const { ctx, startGuest, connect } = useGuestServer();
  const gmFetch = (roomId: string, guestToken: string, path: string, method = "GET") =>
    fetch(`${ctx.server.base}/api/rooms/${roomId}/${path}`, { method, headers: { authorization: `Bearer ${guestToken}` } });

  it("joins two players and an AI-style seat by invite, then resets the invite and revokes a player, as in an account room", async () => {
    const room = await startGuest();
    const gm = await connect(room);

    const shown = (await (await gmFetch(room.roomId, room.guestToken, "invite")).json()) as { inviteCode: string };
    expect(shown.inviteCode).toBe(room.inviteCode);
    const first = await ctx.server.join(room.inviteCode, "Alex");
    const second = await ctx.server.join(room.inviteCode, "Blake");
    const bot = await ctx.server.join(room.inviteCode, "Claude (AI)");
    const players = [await connect({ roomId: first.roomId, guestToken: first.guestToken }), await connect({ roomId: second.roomId, guestToken: second.guestToken }), await connect({ roomId: bot.roomId, guestToken: bot.guestToken })];
    expect(players.map((p) => p.state.scene.map?.url)).toEqual([crypt.url, crypt.url, crypt.url]);
    await gm.waitForSeq(players[2]!.seq);
    expect(Object.values(gm.state.participants).filter((p) => p.role === "player").map((p) => p.displayName).sort()).toEqual(["Alex", "Blake", "Claude (AI)"]);

    const reset = (await (await gmFetch(room.roomId, room.guestToken, "invite", "POST")).json()) as { inviteCode: string };
    expect(reset.inviteCode).not.toBe(room.inviteCode);
    expect((await ctx.server.tryJoin(room.inviteCode, "Late")).status).toBe(404);
    expect((await ctx.server.tryJoin(reset.inviteCode, "Dana")).status).toBe(200);

    const revoked = await gm.command({ type: "participant.revoke", participantId: second.participantId });
    expect(revoked.type).toBe("ack");
    await players[1]!.disconnected;
  });
});

describe("guest rooms: uploads (FR-GM-02)", () => {
  const { ctx, startGuest, ownerOf } = useGuestServer();

  const form = (fields: Record<string, string>, bytes: Uint8Array = PNG) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    data.append("file", new Blob([bytes], { type: "image/png" }), "art.png");
    return data;
  };
  const upload = (guestToken: string, purpose: "map" | "token") =>
    fetch(`${ctx.server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${guestToken}` }, body: form({ purpose }) });
  const stored = () => readdir(ctx.server.uploadDir);

  it.each(["map", "token"] as const)("refuses a %s upload with 403 guest_upload and stores nothing", async (purpose) => {
    const room = await startGuest();
    const owner = (await ctx.store.findRoomOwner(room.roomId))!;
    const before = await ctx.store.uploadUsage({ ownerGmId: owner });
    const res = await upload(room.guestToken, purpose);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(GUEST_UPLOAD);
    expect(await stored()).toEqual([]);
    expect(await ctx.store.uploadUsage({ ownerGmId: owner })).toEqual(before);
  });

  it("refuses a UVTT import with 403 guest_upload and stores nothing", async () => {
    const room = await startGuest();
    const image = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#afafaf" } }).png().toBuffer();
    const document = JSON.stringify({
      format: 0.3, image: image.toString("base64"),
      resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
      line_of_sight: [], objects_line_of_sight: [], portals: [], lights: [],
    });
    const data = new FormData();
    data.append("file", new Blob([document]), "map.uvtt");
    const res = await fetch(`${ctx.server.base}/api/rooms/${room.roomId}/uvtt/imports`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}` }, body: data,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(GUEST_UPLOAD);
    expect(await stored()).toEqual([]);
  });

  it("still lets an account room upload", async () => {
    const room = await ctx.server.createRoom("GM");
    expect((await upload(room.guestToken, "token")).status).toBe(200);
  });

  it("answers 401 to a guest token that tries the library or creatures", async () => {
    const room = await startGuest();
    const headers = { [GM_TOKEN_HEADER]: room.gmToken, "content-type": "application/json" };
    const library = await fetch(`${ctx.server.base}/api/library`, { method: "POST", headers: { [GM_TOKEN_HEADER]: room.gmToken }, body: form({ kind: "token", name: "Art", width: "64", height: "64" }) });
    expect(library.status).toBe(401);
    const creature = await fetch(`${ctx.server.base}/api/library/creatures`, { method: "POST", headers, body: JSON.stringify({ name: "Orc" }) });
    expect(creature.status).toBe(401);
    expect(await ctx.store.ownedCounts(await ownerOf(room.gmToken))).toMatchObject({ assets: 0, creatures: 0 });
  });
});

describe("guest rooms: built-in art only (FR-GM-02)", () => {
  const { ctx, startGuest, connect } = useGuestServer();
  const setMap = (url: string) => ({ type: "scene.setMap" as const, map: { url, width: 1000, height: 800 } });
  const tokenAt = (imageUrl: string | null, position = { x: 35, y: 35 }) => ({ type: "token.create" as const, name: "Orc", position, imageUrl });

  it("rejects a map set to another room's upload, with nothing appended", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    const seq = gm.seq;
    const result = await gm.command(setMap("/uploads/someone-elses.png"));
    expect(result).toMatchObject({ type: "rejected", code: GUEST_ASSET, messageId: "reject.guestAsset" });
    expect((await ctx.store.loadEvents(room.roomId)).at(-1)?.seq).toBe(seq);
    expect(gm.state.scene.map?.url).toBe(crypt.url);
  });

  it("rejects token art that is not built in, however the token gets it", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    expect(await gm.command(tokenAt("/uploads/x.png"))).toMatchObject({ type: "rejected", code: GUEST_ASSET });
    expect(await gm.command(tokenAt("https://example.com/img/x.png"))).toMatchObject({ type: "rejected", code: GUEST_ASSET });
    expect(await gm.command(tokenAt("/img/../uploads/x.png"))).toMatchObject({ type: "rejected", code: GUEST_ASSET });
    expect(Object.keys(gm.state.tokens)).toEqual([]);

    const made = await gm.command(tokenAt("/img/tokens/enemies/goblin-guard.webp"));
    expect(made.type).toBe("ack");
    const tokenId = Object.keys(gm.state.tokens)[0]!;
    expect(await gm.command({ type: "token.setImage", tokenId, imageUrl: "/uploads/x.png" })).toMatchObject({ type: "rejected", code: GUEST_ASSET });
    expect(gm.state.tokens[tokenId]?.imageUrl).toBe("/img/tokens/enemies/goblin-guard.webp");
  });

  it("rejects a map picked from a library by asset id, and leaves the map as it was", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    const result = await gm.command({ type: "scene.setMap", map: { url: "/uploads/lib.png", width: 100, height: 100, assetId: randomUUID() }, includeLibraryBoard: true });
    expect(result.type).toBe("rejected");
    expect(gm.state.scene.map?.url).toBe(crypt.url);
  });

  it("rejects a signed-in GM's own account image while the room is still a guest room, then accepts it after the move", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    const sam = await ctx.server.signUp();
    const tokenArt = "/uploads/my-library-art.png";
    expect(await gm.command(tokenAt(tokenArt))).toMatchObject({ type: "rejected", code: GUEST_ASSET });

    const claim = await sam.request("POST", "/api/gm/legacy/claim", undefined, { [GM_TOKEN_HEADER]: room.gmToken });
    expect(claim.status).toBe(200);
    expect(await ctx.store.isGuestRoom(room.roomId)).toBe(false);

    // The same connection, no reconnect: the open room dropped its guest rule at once.
    expect((await gm.command(setMap("/uploads/now-mine.png"))).type).toBe("ack");
    expect(gm.state.scene.map?.url).toBe("/uploads/now-mine.png");
    expect((await gm.command(tokenAt(tokenArt))).type).toBe("ack");
  });

  it("accepts built-in maps, token art and creatures", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    expect((await gm.command({ type: "scene.setMap", map: { url: ice.url, width: ice.width, height: ice.height }, grid: ice.grid })).type).toBe("ack");
    expect(gm.state.scene.map?.url).toBe(ice.url);
    expect((await gm.command(tokenAt("/img/tokens/enemies/goblin-spearman.webp"))).type).toBe("ack");
    // Another cell, four columns over: the ice map's cells are 70px, so the first token's cell is taken.
    const { cellSize, offsetX, offsetY } = ice.grid;
    expect((await gm.command(tokenAt(null, { x: offsetX + 4.5 * cellSize, y: offsetY + 0.5 * cellSize }))).type).toBe("ack");
  });
});

describe("guest rooms: status (FR-GM-01)", () => {
  const { ctx, startGuest, connect } = useGuestServer();
  const status = (roomId: string, guestToken: string | null) =>
    fetch(`${ctx.server.base}/api/rooms/${roomId}/guest`, { headers: guestToken ? { authorization: `Bearer ${guestToken}` } : {} });

  it("tells the GM of a guest room that it is one, and that 30 idle days delete it", async () => {
    const room = await startGuest();
    await connect(room);
    const res = await status(room.roomId, room.guestToken);
    expect(res.status).toBe(200);
    expect((await res.json()) as GuestRoomStatus).toEqual({ guest: true, idleDays: 30 });
  });

  it("tells the GM of an account room that it is not a guest room", async () => {
    const room = await ctx.server.createRoom("GM");
    await connect(room);
    expect((await (await status(room.roomId, room.guestToken)).json()) as GuestRoomStatus).toEqual({ guest: false, idleDays: 30 });
  });

  it("answers 403 to a player and to no credential", async () => {
    const room = await startGuest();
    await connect(room);
    const player = await ctx.server.join(room.inviteCode, "Alex");
    await connect({ roomId: player.roomId, guestToken: player.guestToken });
    expect((await status(room.roomId, player.guestToken)).status).toBe(403);
    expect((await status(room.roomId, null)).status).toBe(403);
    expect((await status(room.roomId, newGuestToken())).status).toBe(403);
  });
});

describe("guest rooms: the idle sweep (FR-GM-01)", () => {
  let offset = 0;
  beforeEach(() => {
    offset = 0;
  });
  const { ctx, startGuest, connect } = useGuestServer({ now: () => Date.now() + offset });

  it("deletes a room idle for 30 days and an hour, ends its sessions and removes its identity", async () => {
    const room = await startGuest();
    const gm = await connect(room);
    const owner = (await ctx.store.findRoomOwner(room.roomId))!;
    offset = GUEST_ROOM_IDLE_MS + 60 * 60_000;
    await ctx.server.app.sweepGuestRooms();

    expect(await gm.waitFor((m) => m.type === "sessionEnded")).toMatchObject({ reason: "deleted" });
    expect(await ctx.store.roomExists(room.roomId)).toBe(false);
    expect(await ctx.store.findCredential(hashToken(room.guestToken))).toBeNull();
    expect((await ctx.server.tryJoin(room.inviteCode, "Late")).status).toBe(404);
    expect(await ctx.store.findGm(hashToken(room.gmToken))).toBeNull();
    expect(await ctx.store.ownedCounts(owner)).toMatchObject({ rooms: 0 });
    const rooms = await fetch(`${ctx.server.base}/api/gm/rooms`, { headers: { [GM_TOKEN_HEADER]: room.gmToken } });
    expect(rooms.status).toBe(401);
  });

  it("keeps a room that was played 8 days ago", async () => {
    const room = await startGuest();
    offset = 8 * DAY;
    await ctx.server.app.sweepGuestRooms();
    expect(await ctx.store.roomExists(room.roomId)).toBe(true);
    expect(await ctx.store.findGm(hashToken(room.gmToken))).not.toBeNull();
  });

  it("never deletes a pre-account device's room, however idle", async () => {
    const gmToken = newGuestToken();
    const ownerGmId = await ctx.store.registerGm(hashToken(gmToken));
    const roomId = randomUUID();
    await ctx.store.createRoom(roomId, randomUUID().slice(0, 10), { ownerGmId, name: "Old cave" });
    offset = 60 * DAY;
    await ctx.server.app.sweepGuestRooms();
    expect(await ctx.store.roomExists(roomId)).toBe(true);
    expect(await ctx.store.findGm(hashToken(gmToken))).toBe(ownerGmId);
  });

  it("never deletes an account's room", async () => {
    const room = await ctx.server.createRoom("GM");
    offset = 60 * DAY;
    await ctx.server.app.sweepGuestRooms();
    expect(await ctx.store.roomExists(room.roomId)).toBe(true);
  });

  it("skips a room that was claimed into an account after the sweep listed it", async () => {
    const room = await startGuest();
    const owner = (await ctx.store.findRoomOwner(room.roomId))!;
    const list = ctx.store.listIdleGuestRoomsBefore.bind(ctx.store);
    vi.spyOn(ctx.store, "listIdleGuestRoomsBefore").mockImplementationOnce(async (at) => {
      const ids = await list(at);
      await ctx.store.claimDeviceOwner(owner, randomUUID());
      return ids;
    });
    offset = GUEST_ROOM_IDLE_MS + 60 * 60_000;
    await ctx.server.app.sweepGuestRooms();
    expect(await ctx.store.roomExists(room.roomId)).toBe(true);
  });
});

describe("guest rooms: identity swept during create (FR-GM-01)", () => {
  const { ctx, create } = useGuestServer();

  it("still creates the room when the sweep removed the guest identity before the insert", async () => {
    const gmToken = newGuestToken();
    vi.spyOn(ctx.store, "createRoom").mockImplementationOnce(async () => {
      await ctx.store.deleteEmptyGuestOwners(new Date(Date.now() + DAY).toISOString());
      throw new Error("owner foreign key");
    });
    const res = await create(gmToken);
    expect(res.status).toBe(200);
    const { roomId } = (await res.json()) as CreateRoomResponse;
    expect(await ctx.store.isGuestRoom(roomId)).toBe(true);
  });
});
