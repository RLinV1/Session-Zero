import { afterEach, describe, expect, it } from "vitest";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { RateLimiter } from "../src/identity/rateLimit";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
let now = Date.parse("2026-10-08T12:00:00.000Z");

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function startWithClock() {
  now = Date.parse("2026-10-08T12:00:00.000Z");
  server = await startServer(new MemoryRoomStore(), { now: () => now });
  // Exercise exhaustion below the room's 32-player cap; default budgets have their own test.
  server.app.limits.joinsPerIpPerRoom = new RateLimiter(30, 15 * 60_000, () => now);
}

const connect = async (creds: { roomId: string; guestToken: string }) => {
  const client = await server.connect(creds);
  clients.push(client);
  return client;
};

/** `count` join attempts from this test's address, each under its own name. */
async function joinTimes(inviteCode: string, count: number, prefix = "Player") {
  const results = [];
  for (let i = 0; i < count; i++) results.push(await server.tryJoin(inviteCode, `${prefix} ${i + 1}`));
  return results;
}

describe("invite joins are rate-limited per address and room (security-hardening, FR-PL-01)", () => {
  it("refuses attempts above the configured budget with 429, appending nothing and keeping no credential", async () => {
    await startWithClock();
    const room = await server.createRoom("Sam");
    const gm = await connect(room);
    const start = gm.seq;

    const accepted = await joinTimes(room.inviteCode, 30);
    expect(accepted.map((r) => r.status)).toEqual(accepted.map(() => 200));
    await gm.waitForSeq(start + 30);

    const refused = await server.tryJoin(room.inviteCode, "Latecomer");
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("Too many joins from this address. Try again later.");
    await expect(server.connect({ roomId: room.roomId, guestToken: refused.guestToken })).rejects.toThrow();
    const fresh = await connect(room);
    expect(fresh.seq).toBe(start + 30);
    expect(Object.values(fresh.state.participants).some((p) => p.displayName === "Latecomer")).toBe(false);
  });

  it("sends Retry-After with the refusal", async () => {
    await startWithClock();
    const room = await server.createRoom("Sam");
    await joinTimes(room.inviteCode, 30);
    const res = await fetch(`${server.base}/api/invites/${room.inviteCode}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Latecomer", guestToken: server.newGuestToken() }),
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("counts refused joins too, so a loop of taken names is bounded", async () => {
    await startWithClock();
    const room = await server.createRoom("Sam");
    await server.tryJoin(room.inviteCode, "Kim");
    for (let i = 0; i < 29; i++) expect((await server.tryJoin(room.inviteCode, "Kim")).status).toBe(409);
    expect((await server.tryJoin(room.inviteCode, "Lee")).status).toBe(429);
  });

  it("counts each room separately", async () => {
    await startWithClock();
    const first = await server.createRoom("Sam");
    const second = await server.createRoom("Sam", { cookie: first.cookie, roomName: "Second" });
    await joinTimes(first.inviteCode, 30);
    expect((await server.tryJoin(first.inviteCode, "Latecomer")).status).toBe(429);
    expect((await server.tryJoin(second.inviteCode, "Latecomer")).status).toBe(200);
  });

  it("lets joins through again once the window passes", async () => {
    await startWithClock();
    const room = await server.createRoom("Sam");
    await joinTimes(room.inviteCode, 30);
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(429);
    now += 15 * 60 * 1000 + 1000;
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(200);
  });

  it("still answers an unknown invite with 404", async () => {
    await startWithClock();
    const res = await server.tryJoin("nosuchcode", "Kim");
    expect(res.status).toBe(404);
  });

  it("does not count reconnects with a stored credential", async () => {
    await startWithClock();
    const room = await server.createRoom("Sam");
    const [kim] = await joinTimes(room.inviteCode, 30);
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).status).toBe(429);
    const reconnected = await connect({ roomId: room.roomId, guestToken: kim!.guestToken });
    expect(reconnected.participantId).toBe(kim!.body.participantId);
  });
});
