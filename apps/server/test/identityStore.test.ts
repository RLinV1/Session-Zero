import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EmailTakenError, type SessionRecord } from "../src/store/identityStore";
import { storeCases } from "./storeHarness";

const DAY = 24 * 60 * 60 * 1000;

describe.each(storeCases)("identity store, %s (FR-GM-01)", (_name, makeStore) => {
  const store = makeStore();
  const newUser = () =>
    store.createUser({
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      displayName: "Sam",
      passwordHash: "$argon2id$stub",
    });
  const session = (userId: string, overrides: Partial<SessionRecord> = {}): SessionRecord => {
    const now = new Date();
    return {
      tokenHash: randomUUID(),
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 90 * DAY).toISOString(),
      ...overrides,
    };
  };
  const newRoom = async () => {
    const roomId = randomUUID();
    await store.createRoom(roomId, randomUUID().slice(0, 10));
    return roomId;
  };

  it("creates a user with its own owner row, found by email and by id", async () => {
    const user = await newUser();
    expect(user.ownerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.activeDiceLookId).toBeNull();
    expect(await store.findUserByEmail(user.email)).toEqual(user);
    expect(await store.findUserById(user.id)).toEqual(user);
    expect(await store.ownedCounts(user.ownerId)).toEqual({ rooms: 0, assets: 0, creatures: 0, diceLooks: 0, guest: false });
  });

  it("refuses a second account for the same email", async () => {
    const user = await newUser();
    await expect(
      store.createUser({ id: randomUUID(), email: user.email, displayName: "Other", passwordHash: "x" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("moves passwordChangedAt only for a real change, not a rehash", async () => {
    const user = await newUser();
    await store.setPasswordHash(user.id, "$argon2id$rehash", false);
    const rehashed = (await store.findUserById(user.id))!;
    expect(rehashed.passwordHash).toBe("$argon2id$rehash");
    expect(rehashed.passwordChangedAt).toBe(user.passwordChangedAt);
    await new Promise((r) => setTimeout(r, 5));
    await store.setPasswordHash(user.id, "$argon2id$new", true);
    expect((await store.findUserById(user.id))!.passwordChangedAt > user.passwordChangedAt).toBe(true);
  });

  it("stores, touches and deletes a session", async () => {
    const user = await newUser();
    const s = session(user.id);
    await store.createSession(s);
    expect(await store.findSession(s.tokenHash)).toEqual(s);
    const later = new Date(Date.now() + 1000).toISOString();
    await store.touchSession(s.tokenHash, later);
    expect((await store.findSession(s.tokenHash))!.lastSeenAt).toBe(later);
    await store.deleteSession(s.tokenHash);
    expect(await store.findSession(s.tokenHash)).toBeNull();
  });

  it("ends every other session of a user and keeps the excepted one", async () => {
    const user = await newUser();
    const [a, b, c] = [session(user.id), session(user.id), session(user.id)];
    for (const s of [a, b, c]) await store.createSession(s);
    await store.deleteUserSessions(user.id, b.tokenHash);
    expect(await store.findSession(a.tokenHash)).toBeNull();
    expect(await store.findSession(b.tokenHash)).not.toBeNull();
    expect(await store.findSession(c.tokenHash)).toBeNull();
  });

  it("ends the seat credentials bound to a session with it, and leaves guest seats alone (ADR 0017 M4)", async () => {
    const user = await newUser();
    const s = session(user.id);
    await store.createSession(s);
    const roomId = await newRoom();
    const bound = randomUUID();
    const guest = randomUUID();
    await store.saveCredential(bound, { roomId, participantId: randomUUID(), sessionHash: s.tokenHash });
    await store.saveCredential(guest, { roomId, participantId: randomUUID() });
    expect((await store.findCredential(bound))!.sessionHash).toBe(s.tokenHash);

    const ended = await store.deleteSession(s.tokenHash);
    expect(ended.credentialHashes).toEqual([bound]);
    expect(await store.findCredential(bound)).toBeNull();
    expect(await store.findCredential(guest)).not.toBeNull();
  });

  it("sweeps sessions past their absolute end or idle too long, with their seats", async () => {
    const user = await newUser();
    const now = Date.now();
    const expired = session(user.id, { expiresAt: new Date(now - 1000).toISOString() });
    const idle = session(user.id, { lastSeenAt: new Date(now - 31 * DAY).toISOString() });
    const fresh = session(user.id);
    for (const s of [expired, idle, fresh]) await store.createSession(s);
    const roomId = await newRoom();
    const seat = randomUUID();
    await store.saveCredential(seat, { roomId, participantId: randomUUID(), sessionHash: idle.tokenHash });

    const ended = await store.deleteExpiredSessions(new Date(now).toISOString(), new Date(now - 30 * DAY).toISOString());
    expect(ended.credentialHashes).toEqual([seat]);
    expect(await store.findSession(expired.tokenHash)).toBeNull();
    expect(await store.findSession(idle.tokenHash)).toBeNull();
    expect(await store.findSession(fresh.tokenHash)).not.toBeNull();
  });
});
