import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient, viewFor } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const servers: Awaited<ReturnType<typeof startServer>>[] = [];
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
  servers.push(server);
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function connect(creds: Parameters<typeof server.connect>[0], on = server) {
  const c = await on.connect(creds);
  clients.push(c);
  return c;
}

const inviteRequest = (base: string, roomId: string, guestToken: string, method: "GET" | "POST") =>
  fetch(`${base}/api/rooms/${roomId}/invite`, { method, headers: { authorization: `Bearer ${guestToken}` } });

describe("guest revocation (FR-GM-20)", () => {
  /** GM, Sam (two sockets) and Alex; Sam owns Rogue alone and shares Wolf with Alex. */
  async function setup() {
    const gmCreds = await server.createRoom();
    const samCreds = await server.join(gmCreds.inviteCode, "Sam");
    const alexCreds = await server.join(gmCreds.inviteCode, "Alex");
    const gm = await connect(gmCreds);
    const sam = await connect(samCreds);
    const samTab2 = await connect(samCreds);
    const alex = await connect(alexCreds);
    await gm.command({ type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [sam.participantId] });
    await gm.command({
      type: "token.create", name: "Wolf", position: { x: 105, y: 35 }, ownerIds: [sam.participantId, alex.participantId],
    });
    const tokenId = (name: string) => Object.values(gm.state.tokens).find((t) => t.name === name)!.id;
    return { gm, sam, samTab2, alex, gmCreds, samCreds, tokenId };
  }

  it("ends both of the player's sockets, keeps everyone else, and leaves tokens for the review", async () => {
    const { gm, sam, samTab2, alex, samCreds, tokenId } = await setup();
    const samId = sam.participantId;
    expect(await gm.command({ type: "participant.revoke", participantId: samId })).toMatchObject({ type: "ack" });

    for (const tab of [sam, samTab2]) {
      expect(await tab.waitFor((m) => m.type === "sessionEnded")).toEqual({ type: "sessionEnded", reason: "revoked" });
      expect(await tab.disconnected).toBe("io server disconnect");
    }
    await alex.waitForSeq(gm.seq);
    expect(alex.state.participants[samId]).toMatchObject({ displayName: "Sam", revoked: true });
    expect(alex.state).toEqual(viewFor(gm.state, alex));

    // Tokens still name Sam; the GM and the co-owner can act, and Sam's credential cannot.
    expect(gm.state.tokens[tokenId("Rogue")]!.ownerIds).toEqual([samId]);
    expect(await gm.command({ type: "token.move", tokenId: tokenId("Rogue"), to: { x: 70, y: 0 } })).toMatchObject({ type: "ack" });
    expect(await alex.command({ type: "token.move", tokenId: tokenId("Wolf"), to: { x: 70, y: 70 } })).toMatchObject({ type: "ack" });
    await expect(server.connect(samCreds)).rejects.toThrow(/revoked/);

    // The GM resolves Rogue through the departure review.
    const r = await gm.command({
      type: "participant.resolveDeparture",
      participantId: samId,
      actions: [{ tokenId: tokenId("Rogue"), action: "reassign", to: alex.participantId }],
    });
    expect(r).toMatchObject({ type: "ack" });
    expect(gm.state.tokens[tokenId("Rogue")]!.ownerIds).toEqual([alex.participantId]);
  });

  it("keeps the credential refused after a restart", async () => {
    const store = new MemoryRoomStore();
    await server.close();
    servers.splice(0);
    server = await startServer(store);
    servers.push(server);
    const { gm, sam, samCreds } = await setup();
    await gm.command({ type: "participant.revoke", participantId: sam.participantId });
    await sam.disconnected;

    // A fresh server on the same store replays the log: state and credential row both refuse.
    const restarted = await startServer(store);
    servers.push(restarted);
    await expect(restarted.connect(samCreds)).rejects.toThrow(/revoked/);
  });

  it("refuses the removed player's REST requests", async () => {
    const { gm, sam, samCreds } = await setup();
    await gm.command({ type: "participant.revoke", participantId: sam.participantId });
    const res = await fetch(`${server.base}/api/rooms/${samCreds.roomId}/history`, {
      headers: { authorization: `Bearer ${samCreds.guestToken}` },
    });
    expect(res.status).toBe(403);
    for (const method of ["GET", "POST"] as const) {
      expect((await inviteRequest(server.base, samCreds.roomId, samCreds.guestToken, method)).status).toBe(403);
    }
  });

  it("rejects a command from the removed participant, even one already queued", async () => {
    const store = new MemoryRoomStore();
    await server.close();
    servers.splice(0);
    server = await startServer(store);
    servers.push(server);
    const { gm, sam } = await setup();
    await gm.command({ type: "participant.revoke", participantId: sam.participantId });
    await sam.disconnected;
    // The socket is gone, so go straight to the room: this is a command that was already in the
    // queue behind the revoke when it committed.
    const room = await LiveRoom.load(gm.state.roomId, store);
    expect(await room.submit(sam.participantId, { type: "dice.roll", expression: "1d20", visibility: "public" })).toMatchObject({
      ok: false, code: "forbidden",
    });
  });

  it("never sends another player a hidden token the removed player owned (FR-GM-23)", async () => {
    const { gm, sam, alex } = await setup();
    await gm.command({ type: "token.create", name: "Moonblade", position: { x: 175, y: 175 }, ownerIds: [sam.participantId], hidden: true });
    const moonblade = Object.values(gm.state.tokens).find((t) => t.name === "Moonblade")!.id;
    await gm.command({ type: "participant.revoke", participantId: sam.participantId });
    await gm.command({
      type: "participant.resolveDeparture",
      participantId: sam.participantId,
      actions: [{ tokenId: moonblade, action: "reassign", to: alex.participantId }],
    });
    await alex.waitForSeq(gm.seq);
    const raw = alex.rawLog.join("\n");
    expect(raw).not.toContain(moonblade);
    expect(raw).not.toContain("Moonblade");
  });

  it("re-applies the credential lock when a room loads after a crash before the write", async () => {
    const store = new MemoryRoomStore();
    await store.createRoom("r1", "invite1");
    const sam = { id: "p-sam", role: "player" as const, displayName: "Sam" };
    await store.saveCredential("hash-sam", { roomId: "r1", participantId: sam.id });
    // The event committed, but the process died before the credential row was written.
    await store.append("r1", 0, [
      { actorId: null, event: { type: "RoomCreated", name: "Room" } },
      { actorId: sam.id, event: { type: "ParticipantJoined", participant: sam } },
      { actorId: null, event: { type: "ParticipantRevoked", participant: sam } },
    ]);
    expect(await store.findCredential("hash-sam")).not.toBeNull();
    await LiveRoom.load("r1", store);
    expect(await store.findCredential("hash-sam")).toBeNull();
    expect(await store.findRevokedCredential("hash-sam")).toEqual({ roomId: "r1", participantId: sam.id });
  });

  it("keeps a revoked credential revoked if the same token is saved again", async () => {
    const store = new MemoryRoomStore();
    await store.createRoom("r1", "invite1");
    await store.saveCredential("hash-sam", { roomId: "r1", participantId: "p-sam" });
    await store.revokeCredentials("r1", "p-sam");
    await store.saveCredential("hash-sam", { roomId: "r1", participantId: "p-new" });
    expect(await store.findCredential("hash-sam")).toBeNull();
  });

  it("rejects a player's revoke and a revoke of the GM", async () => {
    const { gm, alex, sam } = await setup();
    const seq = gm.seq;
    expect(await alex.command({ type: "participant.revoke", participantId: sam.participantId })).toMatchObject({
      type: "rejected", code: "forbidden",
    });
    expect(await gm.command({ type: "participant.revoke", participantId: gm.participantId })).toMatchObject({
      type: "rejected", code: "invalid",
    });
    expect(gm.seq).toBe(seq);
  });
});

describe("invite reset (FR-GM-20)", () => {
  it("replaces the link for the GM only, and keeps everyone already in", async () => {
    const gmCreds = await server.createRoom();
    const samCreds = await server.join(gmCreds.inviteCode, "Sam");
    const sam = await connect(samCreds);

    for (const method of ["GET", "POST"] as const) {
      expect((await inviteRequest(server.base, gmCreds.roomId, samCreds.guestToken, method)).status).toBe(403);
    }
    const current = await inviteRequest(server.base, gmCreds.roomId, gmCreds.guestToken, "GET");
    expect(await current.json()).toEqual({ inviteCode: gmCreds.inviteCode });

    const reset = await inviteRequest(server.base, gmCreds.roomId, gmCreds.guestToken, "POST");
    const { inviteCode } = (await reset.json()) as { inviteCode: string };
    expect(inviteCode).not.toBe(gmCreds.inviteCode);

    const old = await server.tryJoin(gmCreds.inviteCode, "Kim");
    expect(old.status).toBe(404);
    expect((await server.tryJoin(inviteCode, "Kim")).status).toBe(200);

    // Sam is still connected and can reconnect with the same credential.
    expect(await sam.command({ type: "dice.roll", expression: "1d20" })).toMatchObject({ type: "ack" });
    sam.close();
    const again = await connect(samCreds);
    expect(again.participantId).toBe(samCreds.participantId);

    const after = await inviteRequest(server.base, gmCreds.roomId, gmCreds.guestToken, "GET");
    expect(await after.json()).toEqual({ inviteCode });

    // Invite codes are access config, never room data: no player payload carries either one.
    for (const player of [sam, again]) {
      const raw = player.rawLog.join("\n");
      expect(raw).not.toContain(gmCreds.inviteCode);
      expect(raw).not.toContain(inviteCode);
    }
  });

  it("refuses a GM credential from another room", async () => {
    const a = await server.createRoom();
    const b = await server.createRoom();
    expect((await inviteRequest(server.base, a.roomId, b.guestToken, "POST")).status).toBe(403);
  });
});
