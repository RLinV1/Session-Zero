import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { ROOM_LOCKED, type EphemeralPayload, type ServerMessage } from "@vtt/shared";
import { RateLimiter } from "../src/identity/rateLimit";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  vi.restoreAllMocks();
  skew = 0;
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function connect(creds: { roomId: string; guestToken: string }) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

/** A room with its GM connected and one connected guest. */
async function table() {
  const room = await server.createRoom("GM");
  const gm = await connect(room);
  const seat = await server.join(room.inviteCode, "Sam");
  const player = await connect(seat);
  return { room, gm, seat, player };
}

/** Moves the clock the limits read forward, as tests cannot wait out a real window. */
const realNow = Date.now.bind(Date);
let skew = 0;
function skipAhead(ms: number) {
  skew += ms;
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
}

/** Sends `count` commands at once and waits for an answer to each; returns how many were accepted. */
async function spend(c: TestClient, count: number) {
  const acks = replies(c, "ack").length, rejected = replies(c, "rejected").length;
  for (let i = 0; i < count; i++) c.send({ type: "command", clientCommandId: `s${skew}-${acks + rejected + i}`, command: roll });
  await vi.waitFor(() => expect(replies(c, "ack").length + replies(c, "rejected").length - acks - rejected).toBe(count), { timeout: 5000 });
  return replies(c, "ack").length - acks;
}

const replies = (c: TestClient, type: ServerMessage["type"]) => c.rawLog.filter((m) => (JSON.parse(m) as ServerMessage).type === type);
const settled = async () => new Promise((resolve) => setTimeout(resolve, 150));
const roll = { type: "dice.roll", expression: "1d20" } as const;

describe("commands per seat (FR-PL-01, ADR 0051)", () => {
  it("takes a player's 800 in a burst, refuses the next with a reason and appends nothing for it", async () => {
    const { gm, player } = await table();
    const start = gm.seq;
    expect(await spend(player, 800)).toBe(800);
    await player.waitForSeq(start + 800, 5000);
    const seq = player.seq;
    expect(await player.command(roll)).toMatchObject({ type: "rejected", code: "invalid", message: "You're sending commands too fast. Wait a few seconds." });
    expect(player.seq).toBe(seq);
  });

  it("appends only the budget from a far larger burst", async () => {
    const { gm, player } = await table();
    const start = gm.seq;
    expect(await spend(player, 2000)).toBe(800);
    await gm.waitForSeq(start + 800, 5000);
    await settled();
    expect(gm.seq).toBe(start + 800);
  });

  it("never refuses an arrow key held for the whole window, at the fastest key repeat of 33 a second", async () => {
    const { player } = await table();
    expect(await spend(player, 33 * 20)).toBe(33 * 20);
  });

  it("caps what a seat can add over five minutes, however it's paced", async () => {
    const { seat, player } = await table();
    expect(await spend(player, 800)).toBe(800);
    skipAhead(20_001);
    expect(await spend(player, 800)).toBe(800);
    skipAhead(20_001);
    expect(await spend(player, 200)).toBe(200);
    skipAhead(20_001);
    // A fresh socket: past 45 seconds the skipped clock makes the open one think its pings stopped.
    const later = await connect(seat);
    expect((await later.command(roll)).type).toBe("rejected");
  });

  it("shares the budget across the seat's connections", async () => {
    const { seat, player } = await table();
    const secondTab = await connect(seat);
    await spend(player, 800);
    expect((await secondTab.command(roll)).type).toBe("rejected");
  });

  it("gives each seat its own budget and frees it after the window", async () => {
    const { room, player } = await table();
    const other = await connect(await server.join(room.inviteCode, "Kim"));
    await spend(player, 800);
    expect((await other.command(roll)).type).toBe("ack");
    skipAhead(20_001);
    expect((await player.command(roll)).type).toBe("ack");
  });

  it("gives the GM room to make every imported opening a door", async () => {
    const { gm } = await table();
    expect(await spend(gm, 1500)).toBe(1500);
  });

  it("counts malformed commands too, still answering each", async () => {
    const { player } = await table();
    for (let i = 0; i < 800; i++) player.send({ type: "command", clientCommandId: `m${i}`, command: { type: "no.such" } } as never);
    await vi.waitFor(() => expect(replies(player, "rejected")).toHaveLength(800), { timeout: 5000 });
    expect(await player.command(roll)).toMatchObject({ type: "rejected", message: "You're sending commands too fast. Wait a few seconds." });
  });
});

describe("snapshots per seat (FR-PL-06, ADR 0051)", () => {
  it("answers 30 resyncs a minute and drops the rest", async () => {
    const { seat, player } = await table();
    const before = replies(player, "welcome").length;
    for (let i = 0; i < 40; i++) player.send({ type: "resync" });
    await vi.waitFor(() => expect(replies(player, "welcome").length - before).toBe(30));
    await settled();
    expect(replies(player, "welcome").length - before).toBe(30);
    skipAhead(60_001);
    // A fresh socket: past 45 seconds the skipped clock makes the open one think its pings stopped.
    const later = await connect(seat);
    later.send({ type: "resync" });
    await vi.waitFor(() => expect(replies(later, "welcome")).toHaveLength(2));
  });

  it("leaves commands alone when resyncs run out, and the other way round", async () => {
    const { player } = await table();
    for (let i = 0; i < 35; i++) player.send({ type: "resync" });
    expect((await player.command(roll)).type).toBe("ack");
  });
});

describe("live traffic per seat (FR-SYNC-03, ADR 0051)", () => {
  it("shares the 40 a second across the seat's connections", async () => {
    const { gm, seat, player } = await table();
    const secondTab = await connect(seat);
    // A ping needs a map to point at (KAN-34).
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await player.waitForSeq(gm.seq);
    await secondTab.waitForSeq(gm.seq);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const ping = (x: number): EphemeralPayload => ({ type: "ping", at: { x, y: 10 } });
    for (let i = 0; i < 30; i++) {
      player.send({ type: "ephemeral", payload: ping(i) });
      secondTab.send({ type: "ephemeral", payload: ping(100 + i) });
    }
    await vi.waitFor(() => expect(replies(gm, "ephemeral").length).toBeGreaterThan(0));
    await settled();
    expect(replies(gm, "ephemeral").length).toBeLessThanOrEqual(40);
  });
});

describe("connections per seat (ADR 0051)", () => {
  it("closes the oldest when a ninth opens, telling it why, and leaves the rest open", async () => {
    const { seat, player: oldest, gm } = await table();
    const others = [];
    for (let i = 0; i < 7; i++) others.push(await connect(seat));
    const ninth = await connect(seat);
    await vi.waitFor(() => expect(replies(oldest, "error")).toHaveLength(1));
    expect(JSON.parse(replies(oldest, "error")[0]!)).toMatchObject({ type: "error", code: "too_many_connections" });
    await oldest.disconnected;
    expect((await ninth.command(roll)).type).toBe("ack");
    expect((await others[6]!.command(roll)).type).toBe("ack");
    expect((await gm.command(roll)).type).toBe("ack");
    expect(replies(others[0]!, "error")).toHaveLength(0);
  });

  it("refuses a reconnect loop past 120 a minute, then lets the seat back in", async () => {
    const { seat } = await table();
    // The first join's own connection counted as one.
    for (let i = 0; i < 119; i++) (await server.connect(seat)).close();
    await expect(server.connect(seat)).rejects.toThrow("too_many_connections");
    skipAhead(60_001);
    expect((await connect(seat)).seq).toBeGreaterThan(0);
  });
});

describe("handshakes per connection (FR-PL-05, ADR 0051)", () => {
  /** A connection used as a script would use it. Socket.IO's own client closes it after one refusal. */
  async function rawConnection() {
    const socket = new WebSocket(`${server.base.replace("http", "ws")}/socket.io/?EIO=4&transport=websocket`);
    const refusals: string[] = [];
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    const opened = new Promise<void>((resolve) => socket.once("message", () => resolve()));
    socket.on("message", (data) => {
      const text = String(data);
      if (text.startsWith("44")) refusals.push((JSON.parse(text.slice(2)) as { message: string }).message);
    });
    await opened;
    return { socket, refusals, closed };
  }
  const handshake = (auth: unknown) => `40${JSON.stringify(auth)}`;
  const wrong = (roomId: string) => ({ roomId, guestToken: server.newGuestToken() });

  it("looks up three credentials from a burst of 2,000 on one connection, then closes it", async () => {
    const { roomId } = await server.createRoom("GM");
    const lookups = vi.spyOn(server.store, "findCredential");
    const { socket, closed } = await rawConnection();
    for (let i = 0; i < 2000; i++) socket.send(handshake(wrong(roomId)));
    await closed;
    expect(lookups).toHaveBeenCalledTimes(3);
    // Packets read along with the fourth still reach the check after the close. None may stay half-made.
    const { _preConnectSockets: pending } = server.app.io.of("/") as unknown as { _preConnectSockets: Map<string, unknown> };
    await vi.waitFor(() => expect(pending.size).toBe(0));
  });

  it("answers three handshakes of any kind, one at a time, and closes on the fourth", async () => {
    const { roomId } = await server.createRoom("GM");
    const { socket, refusals, closed } = await rawConnection();
    for (const [i, auth] of [{}, wrong(roomId), wrong(roomId)].entries()) {
      socket.send(handshake(auth));
      await vi.waitFor(() => expect(refusals).toHaveLength(i + 1));
    }
    expect(refusals).toEqual(["bad_request", "unauthorized", "unauthorized"]);
    socket.send(handshake(wrong(roomId)));
    await closed;
    expect(refusals).toHaveLength(3);
  });

  it("charges each connection separately, so a real client is never closed for it", async () => {
    const room = await server.createRoom("GM");
    const { socket, closed } = await rawConnection();
    for (let i = 0; i < 4; i++) socket.send(handshake(wrong(room.roomId)));
    await closed;
    // Each of these is a new connection, from the same address as the one just closed.
    for (let i = 0; i < 5; i++) await expect(server.connect(wrong(room.roomId))).rejects.toThrow("unauthorized");
    expect((await connect(room)).seq).toBeGreaterThan(0);
  });
});

describe("invite attempts per address (FR-PL-01, ADR 0051)", () => {
  it("counts wrong codes, then refuses every code from that address, valid or not", async () => {
    server.app.limits.inviteLookupsPerIp = new RateLimiter(5, 15 * 60_000);
    const room = await server.createRoom("GM");
    for (let i = 0; i < 5; i++) expect((await server.tryJoin(`wrong${i}`, "Guess")).status).toBe(404);
    const wrong = await server.tryJoin("wrong5", "Guess");
    expect(wrong.status).toBe(429);
    expect(wrong.body.error).toBe("Too many invite attempts from this address. Try again later.");
    expect((await server.tryJoin(room.inviteCode, "Sam")).status).toBe(429);
  });

  it("counts a signed-in visitor's seat lookups as well", async () => {
    server.app.limits.inviteLookupsPerIp = new RateLimiter(1, 15 * 60_000);
    const account = await server.signUp();
    expect((await account.request("GET", "/api/invites/wrong/seat")).status).toBe(404);
    expect((await account.request("GET", "/api/invites/wrong/seat")).status).toBe(429);
  });
});

describe("a locked room (FR-PL-01, FR-GM-20, ADR 0051)", () => {
  const lock = (gm: TestClient, locked: boolean) => gm.command({ type: "room.setJoinsLocked", locked });

  it("refuses new joins with their own code, adds no one and keeps no credential", async () => {
    const { room, gm } = await table();
    expect((await lock(gm, true)).type).toBe("ack");
    const seq = gm.seq;
    const refused = await server.tryJoin(room.inviteCode, "Latecomer");
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe(ROOM_LOCKED);
    await expect(server.connect({ roomId: room.roomId, guestToken: refused.guestToken })).rejects.toThrow();
    await settled();
    expect(gm.seq).toBe(seq);
    expect(Object.values(gm.state.participants).some((p) => p.displayName === "Latecomer")).toBe(false);
  });

  it("lets everyone already seated stay and come back", async () => {
    const { seat, gm, player } = await table();
    await lock(gm, true);
    await player.waitForSeq(gm.seq);
    expect(player.state.joinsLocked).toBe(true);
    player.close();
    const back = await connect(seat);
    expect((await back.command(roll)).type).toBe("ack");
  });

  it("still answers a signed-in member as already seated", async () => {
    const { room, gm } = await table();
    const member = await server.signUp();
    await server.joinAs(member, room.inviteCode, "Kim");
    await lock(gm, true);
    const res = await member.request("POST", `/api/invites/${room.inviteCode}/join`, { displayName: "Kim again", guestToken: server.newGuestToken() });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).not.toBe(ROOM_LOCKED);
  });

  it("admits joins again once unlocked, and a link reset doesn't unlock it", async () => {
    const { room, gm } = await table();
    await lock(gm, true);
    const reset = await fetch(`${server.base}/api/rooms/${room.roomId}/invite`, { method: "POST", headers: { authorization: `Bearer ${room.guestToken}` } });
    const { inviteCode } = (await reset.json()) as { inviteCode: string };
    expect((await server.tryJoin(inviteCode, "Kim")).status).toBe(409);
    await lock(gm, false);
    expect((await server.tryJoin(inviteCode, "Kim")).status).toBe(200);
  });

  it("refuses a player who tries to lock", async () => {
    const { player } = await table();
    expect(await player.command({ type: "room.setJoinsLocked", locked: true })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("survives a restart", async () => {
    const { room, gm } = await table();
    await lock(gm, true);
    clients.splice(0).forEach((c) => c.close());
    const store = server.store;
    await server.close();
    server = await startServer(store);
    expect((await server.tryJoin(room.inviteCode, "Latecomer")).body.code).toBe(ROOM_LOCKED);
  });
});

describe("removing several players at once (FR-GM-20, ADR 0051)", () => {
  it("ends each seat on every connection and frees it, in one step", async () => {
    const { room, gm, seat, player } = await table();
    const kimSeat = await server.join(room.inviteCode, "Kim");
    const kim = await connect(kimSeat);
    const stays = await connect(await server.join(room.inviteCode, "Lee"));
    const start = gm.seq;
    const ack = await gm.command({ type: "participant.revokeMany", participantIds: [seat.participantId, kimSeat.participantId] });
    expect(ack.type).toBe("ack");
    await player.disconnected;
    await kim.disconnected;
    expect(replies(player, "sessionEnded")).toHaveLength(1);
    await gm.waitForSeq(start + 2);
    await expect(server.connect(seat)).rejects.toThrow("revoked");
    await stays.waitForSeq(start + 2);
    expect(stays.state.participants[seat.participantId]!.revoked).toBe(true);
    expect(stays.state.participants[kimSeat.participantId]!.revoked).toBe(true);
    expect((await stays.command(roll)).type).toBe("ack");
  });

  it("changes nothing when one on the list can't be removed", async () => {
    const { gm, seat, player } = await table();
    const seq = gm.seq;
    const gmId = Object.values(gm.state.participants).find((p) => p.role === "gm")!.id;
    expect((await gm.command({ type: "participant.revokeMany", participantIds: [seat.participantId, gmId] })).type).toBe("rejected");
    expect(gm.seq).toBe(seq);
    expect((await player.command(roll)).type).toBe("ack");
  });
});
