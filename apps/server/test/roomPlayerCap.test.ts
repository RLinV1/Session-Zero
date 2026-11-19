import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS_PER_ROOM, ROOM_FULL, activePlayerCount, type MyRoomsResponse } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
  // Every simulated player joins from 127.0.0.1, which the per-address join limit would stop at 30
  // (security-hardening); that limit has its own tests in joinRateLimit.test.ts.
  vi.spyOn(server.app.limits.joinsPerIpPerRoom, "hit").mockReturnValue({ ok: true, retryAfterSec: 0, reservation: 0 });
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const connect = async (creds: { roomId: string; guestToken: string }) => {
  const client = await server.connect(creds);
  clients.push(client);
  return client;
};

/** A room with its GM connected and `players` guests seated, all joined at once. */
async function roomWith(players: number) {
  const room = await server.createRoom("Sam");
  const gm = await connect(room);
  const start = gm.seq;
  const seats = await Promise.all(Array.from({ length: players }, (_, i) => server.tryJoin(room.inviteCode, `Player ${i + 1}`)));
  expect(seats.map((s) => s.status)).toEqual(seats.map(() => 200));
  await gm.waitForSeq(start + players);
  return { room, gm, seats };
}

/** Leaving ends the seat and disconnects at once, with no ack (ADR 0006). */
async function leave(client: TestClient) {
  client.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
  await client.disconnected;
}

describe("a room holds at most 32 players (room-player-cap, FR-PL-01)", () => {
  it("refuses the 33rd player with 409 room_full, and adds nothing", async () => {
    const { room, gm } = await roomWith(MAX_PLAYERS_PER_ROOM);
    const seqBefore = gm.seq;

    const refused = await server.tryJoin(room.inviteCode, "Latecomer");
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: ROOM_FULL, error: "This room is full: it holds 32 players. Ask the GM for a seat." });

    await expect(server.connect({ roomId: room.roomId, guestToken: refused.guestToken })).rejects.toThrow();
    const fresh = await connect(room);
    expect(fresh.seq).toBe(seqBefore);
    expect(activePlayerCount(fresh.state)).toBe(32);
    expect(Object.values(fresh.state.participants).some((p) => p.displayName === "Latecomer")).toBe(false);
  });

  it("refuses a signed-in person the same way, and keeps no seat on their account", async () => {
    const { room } = await roomWith(MAX_PLAYERS_PER_ROOM);
    const kim = await server.signUp({ displayName: "Kim" });
    const refused = await server.joinAs(kim, room.inviteCode, "Kim");
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe(ROOM_FULL);
    expect((await kim.json<MyRoomsResponse>("GET", "/api/me/rooms")).playing).toEqual([]);
  });

  it("gives the last seat to exactly one of three joins racing for it", async () => {
    const { room } = await roomWith(MAX_PLAYERS_PER_ROOM - 1);
    const racers = await Promise.all(["Ana", "Ben", "Cy"].map((name) => server.tryJoin(room.inviteCode, name)));
    expect(racers.filter((r) => r.status === 200)).toHaveLength(1);
    expect(racers.filter((r) => r.status === 409 && r.body.code === ROOM_FULL)).toHaveLength(2);
    expect(activePlayerCount((await connect(room)).state)).toBe(32);
  });

  it("frees a seat when a player leaves, and when the GM removes one", async () => {
    const { room, gm, seats } = await roomWith(MAX_PLAYERS_PER_ROOM);
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(409);

    await leave(await connect({ roomId: room.roomId, guestToken: seats[0]!.guestToken }));
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(200);
    expect((await server.tryJoin(room.inviteCode, "Second")).status).toBe(409);

    const removed = await gm.command({ type: "participant.revoke", participantId: seats[1]!.body.participantId! });
    expect(removed.type).toBe("ack");
    expect((await server.tryJoin(room.inviteCode, "Second")).status).toBe(200);
  });

  it("lets players already seated in a full room come back: a reconnect, and an account's second device", async () => {
    const { room, gm } = await roomWith(MAX_PLAYERS_PER_ROOM - 1);
    const kim = await server.signUp({ displayName: "Kim" });
    const before = gm.seq;
    const kept = await server.joinAs(kim, room.inviteCode, "Kim");
    expect(kept.status).toBe(200);
    await gm.waitForSeq(before + 1);
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(409);

    const laptop = await connect({ roomId: room.roomId, guestToken: kept.guestToken });
    laptop.close();
    const again = await connect({ roomId: room.roomId, guestToken: kept.guestToken });
    expect(again.participantId).toBe(kept.body.participantId);

    const phone = await server.signIn(kim.email, kim.password);
    const resumed = await server.resume(phone, room.roomId);
    expect(resumed.status).toBe(200);
    expect(resumed.body.participantId).toBe(kept.body.participantId);
    expect((await connect(resumed)).participantId).toBe(kept.body.participantId);
  });
});
