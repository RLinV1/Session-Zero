import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GM_TOKEN_HEADER, LaunchStatsResponse, type CreateRoomResponse } from "@vtt/shared";
import { seedAdminAccount } from "../src/identity/adminAccount";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { storeCases } from "./storeHarness";
import { newGuestToken, startServer } from "./helpers";

const DAY_1 = Date.parse("2026-11-01T12:00:00.000Z");
const DAY_3 = Date.parse("2026-11-03T12:00:00.000Z");

describe("admin launch stats (ADR 0080)", () => {
  const admins = new Set<string>();
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    admins.clear();
    server = await startServer(new MemoryRoomStore(), { adminAccountIds: admins });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await server.close();
  });

  /** A room hosted by a signed-out browser (guest-gm-hosting). */
  const guestRoom = async () => {
    const res = await fetch(`${server.base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json", [GM_TOKEN_HEADER]: newGuestToken() },
      body: JSON.stringify({ roomName: "Crypt", displayName: "Sam", guestToken: newGuestToken(), shippedMap: "sunken-crypt" }),
    });
    if (res.status !== 200) throw new Error(`guest create ${res.status} ${await res.text()}`);
    return (await res.json()) as CreateRoomResponse;
  };

  it("answers guests and signed-in non-admins exactly as a route that doesn't exist, and admins with 200", async () => {
    const admin = await server.signUp();
    const member = await server.signUp();
    admins.add(admin.view!.id);

    const nonexistent = await server.anonymous().request("GET", "/api/admin/statz");
    const expected = { status: nonexistent.status, body: (await nonexistent.text()).replace("/api/admin/statz", "/api/admin/stats") };
    expect(expected.status).toBe(404);

    for (const who of [server.anonymous(), member]) {
      const res = await who.request("GET", "/api/admin/stats");
      expect({ status: res.status, body: await res.text() }).toEqual(expected);
    }
    const ok = await admin.request("GET", "/api/admin/stats");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(LaunchStatsResponse.parse(await ok.json()).days).toHaveLength(30);
  });

  it("answers the admin menu probe only for an allowlisted account", async () => {
    const admin = await server.signUp();
    const member = await server.signUp();
    admins.add(admin.view!.id);
    for (const who of [server.anonymous(), member]) {
      expect((await who.request("GET", "/api/admin/me")).status).toBe(404);
    }
    const response = await admin.request("GET", "/api/admin/me");
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("counts signups from supported referral links", async () => {
    const admin = await server.signUp();
    admins.add(admin.view!.id);
    const credentials = { email: "referral@example.com", password: "correct horse battery", displayName: "Referral" };
    const signup = await server.anonymous().request("POST", "/api/auth/signup", { ...credentials, referralCode: "tiktok" });
    expect(signup.status).toBe(201);
    const unknown = await server.anonymous().request("POST", "/api/auth/signup", { ...credentials, email: "unknown@example.com", referralCode: "unknown" });
    expect(unknown.status).toBe(201);
    const stats = await admin.request("GET", "/api/admin/stats");
    expect(LaunchStatsResponse.parse(await stats.json()).referralSignups).toEqual({ tiktok: 1, youtube: 0, instagram: 0 });
  });

  it("serves feedback and screenshots only to admins", async () => {
    const admin = await server.signUp();
    const member = await server.signUp();
    admins.add(admin.view!.id);
    const bytes = new Uint8Array([1, 2, 3]);
    const record = { id: crypto.randomUUID(), reference: "FB-7Q2K", kind: "bug" as const, summary: "Fog issue",
      details: "Fog stays visible after opening a door.", technical: null, reporterUserId: member.view!.id,
      createdAt: new Date().toISOString(), screenshots: [{ width: 1, height: 1, contentType: "image/webp", bytes }] };
    await server.store.createFeedback(record);
    const listPath = "/api/admin/feedback";
    const imagePath = "/api/admin/feedback/FB-7Q2K/screenshots/0";
    for (const client of [server.anonymous(), member]) {
      expect((await client.request("GET", listPath)).status).toBe(404);
      expect((await client.request("GET", imagePath)).status).toBe(404);
    }
    const list = await admin.request("GET", listPath);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(await list.json()).toEqual({ reports: [{ reference: record.reference, kind: record.kind,
      summary: record.summary, details: record.details, technical: null, createdAt: record.createdAt,
      reporter: { displayName: member.view!.displayName, email: member.email }, screenshots: [{ position: 0, width: 1, height: 1 }] }], next: null });
    const shot = await admin.request("GET", imagePath);
    expect(shot.headers.get("content-type")).toBe("image/webp");
    expect(shot.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await shot.arrayBuffer())).toEqual(bytes);
  });

  it("opens for the seeded admin account, and not for a squatter who took the admin email first", async () => {
    const id = "6f1c1a0e-1d8e-4a52-9d44-0b8f7c1e2a33";
    const env = { ADMIN_ACCOUNT_IDS: id, ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "a-long-seeded-secret" };
    const seededStore = new MemoryRoomStore();
    await seedAdminAccount(seededStore, env);
    const seeded = await startServer(seededStore, { adminAccountIds: new Set([id]) });
    const squatStore = new MemoryRoomStore();
    const squatted = await startServer(squatStore, { adminAccountIds: new Set([id]) });
    try {
      const admin = await seeded.signIn(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
      expect((await admin.request("GET", "/api/admin/stats")).status).toBe(200);

      const squatter = await squatted.signUp({ email: env.ADMIN_EMAIL });
      await seedAdminAccount(squatStore, env);
      expect((await squatter.request("GET", "/api/admin/stats")).status).toBe(404);
    } finally {
      await seeded.close();
      await squatted.close();
    }
  });

  it("is off for everyone when no admin is configured", async () => {
    const someone = await server.signUp();
    expect((await someone.request("GET", "/api/admin/stats")).status).toBe(404);
  });

  it("validates the range: real days, start before end, at most 366 days, nothing else", async () => {
    const admin = await server.signUp();
    admins.add(admin.view!.id);
    for (const query of ["from=2026-11-05&to=2026-11-01", "from=2026-02-30", "from=2025-01-01&to=2026-01-02", "from=yesterday", "extra=1", "from=2026-11-01&from=2026-11-02"]) {
      const res = await admin.request("GET", `/api/admin/stats?${query}`);
      expect(res.status, query).toBe(400);
    }
    expect((await admin.request("GET", "/api/admin/stats?from=2026-11-01&to=2026-11-01")).status).toBe(200);
  });

  it("counts accounts, rooms, played, returning rooms and AI seats from seeded play", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: DAY_1 });
    // Day 1: two accounts; a guest room with only an AI seat beside its GM; an account room where
    // a person joined the GM, and an AI seat too.
    const admin = await server.signUp();
    const host = await server.signUp();
    admins.add(admin.view!.id);
    const guest = await guestRoom();
    await server.join(guest.inviteCode, "Oswin (AI)");
    const table = await server.createRoom("GM", { cookie: host.cookie, roomName: "Secret Table Name" });
    await server.join(table.inviteCode, "Ana Realname");
    await server.join(table.inviteCode, "Wren (AI)");

    // Day 3: one more person joins the account room (it returns, but alone that day), and the admin
    // opens a room nobody joins.
    vi.setSystemTime(DAY_3);
    await server.join(table.inviteCode, "Bo");
    await server.createRoom("GM", { cookie: admin.cookie });

    const res = await admin.request("GET", "/api/admin/stats?from=2026-11-01&to=2026-11-03");
    const text = await res.text();
    const stats = LaunchStatsResponse.parse(JSON.parse(text));
    const zero = { accountsCreated: 0, roomsCreated: 0, roomsCreatedByGuests: 0, roomsCreatedByAccounts: 0, activeRooms: 0, playedRooms: 0, returningRooms: 0, aiSeatsJoined: 0, peopleActive: 0 };
    // People: day 1 the guest GM, the table GM and Ana (AI seats aside); day 3 Bo and the admin's GM seat.
    expect(stats.days).toEqual([
      { ...zero, date: "2026-11-01", accountsCreated: 2, roomsCreated: 2, roomsCreatedByGuests: 1, roomsCreatedByAccounts: 1, activeRooms: 2, playedRooms: 1, aiSeatsJoined: 2, peopleActive: 3, accountsToDate: 2, roomsToDate: 2 },
      { ...zero, date: "2026-11-02", accountsToDate: 2, roomsToDate: 2 },
      { ...zero, date: "2026-11-03", roomsCreated: 1, roomsCreatedByAccounts: 1, activeRooms: 2, returningRooms: 1, peopleActive: 2, accountsToDate: 2, roomsToDate: 3 },
    ]);
    expect(stats.totals).toEqual({
      accountsCreated: 2, roomsCreated: 3, roomsCreatedByGuests: 1, roomsCreatedByAccounts: 2,
      activeRooms: 3, playedRooms: 1, returningRooms: 1, aiSeatsJoined: 2, peopleActive: 5, accountsToDate: 2, roomsToDate: 3,
    });

    // Growth starts from what existed before the range.
    const later = LaunchStatsResponse.parse(await (await admin.request("GET", "/api/admin/stats?from=2026-11-03&to=2026-11-03")).json());
    expect(later.totals).toMatchObject({ accountsToDate: 2, roomsToDate: 3, accountsCreated: 0, roomsCreated: 1 });

    // Counts only: nothing that names a person or a room.
    for (const secret of [admin.email, host.email, admin.view!.id, table.roomId, guest.roomId, table.inviteCode, "Secret Table Name", "Ana", "Oswin"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe.each(storeCases)("launch stats facts (%s store, ADR 0080)", (_name, makeStore) => {
  it("reads rooms, activity, first days and AI seats, leaving temporary rooms out", async () => {
    const store = makeStore();
    const from = new Date(Date.now() - 60_000).toISOString();
    const room = crypto.randomUUID();
    const temp = crypto.randomUUID();
    const [gm, ai] = [crypto.randomUUID(), crypto.randomUUID()];
    await store.createRoom(room, `stats-${room}`);
    await store.createRoom(temp, `stats-${temp}`, { temporary: true });
    await store.append(room, 0, [
      { actorId: gm, event: { type: "ParticipantJoined", participant: { id: gm, role: "gm", displayName: "GM" } } },
    ]);
    await store.append(room, 1, [
      { actorId: ai, event: { type: "ParticipantJoined", participant: { id: ai, role: "player", displayName: "Oswin (AI)" } } },
    ]);
    await store.append(temp, 0, [
      { actorId: gm, event: { type: "ParticipantJoined", participant: { id: gm, role: "gm", displayName: "GM" } } },
    ]);
    const to = new Date(Date.now() + 60_000).toISOString();
    const facts = await store.launchStatsFacts(from, to);
    const today = new Date().toISOString().slice(0, 10);

    expect(facts.rooms.filter((r) => r.id === room)).toEqual([{ id: room, at: expect.any(String), host: "other" }]);
    expect(facts.rooms.some((r) => r.id === temp)).toBe(false);
    expect(facts.activity.filter((a) => a.roomId === room).sort((a, b) => a.participantId.localeCompare(b.participantId)))
      .toEqual([gm, ai].sort().map((participantId) => ({ roomId: room, day: today, participantId })));
    expect(facts.activity.some((a) => a.roomId === temp)).toBe(false);
    expect(facts.firstDays.filter((f) => f.roomId === room)).toEqual([{ roomId: room, day: today }]);
    expect(facts.aiSeats.filter((s) => s.roomId === room)).toEqual([{ roomId: room, participantId: ai, at: expect.any(String) }]);

    // Counted as existing before a window that starts after them; temporary rooms never.
    const after = await store.launchStatsFacts(to, new Date(Date.now() + 120_000).toISOString());
    expect(after.roomsBefore - facts.roomsBefore).toBeGreaterThanOrEqual(1);

    // Outside the window, none of it.
    const later = await store.launchStatsFacts(to, new Date(Date.now() + 120_000).toISOString());
    expect(later.activity.some((a) => a.roomId === room)).toBe(false);
    expect(later.rooms.some((r) => r.id === room)).toBe(false);
  });
});
