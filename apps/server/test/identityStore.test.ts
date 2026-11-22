import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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

  describe("email verification tokens", () => {
    const hour = 60 * 60 * 1000;
    const issue = async (userId: string, hash: string, ttl = 24 * hour) => {
      const now = Date.now();
      const user = (await store.findUserById(userId))!;
      await store.createVerificationToken(userId, hash, new Date(now).toISOString(), new Date(now + ttl).toISOString(), user.credentialVersion);
    };

    it("creates a user unverified unless told otherwise, and marks it verified", async () => {
      const user = await newUser();
      expect(user.emailVerifiedAt).toBeNull();
      const at = new Date().toISOString();
      await store.markEmailVerified(user.id, at);
      expect((await store.findUserById(user.id))!.emailVerifiedAt).toBe(at);
      const verified = await store.createUser({
        id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x", emailVerifiedAt: at,
      });
      expect(verified.emailVerifiedAt).toBe(at);
    });

    it("consumes a token once and returns its user", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issue(user.id, hash);
      expect((await store.consumeVerificationToken(hash, new Date().toISOString()))!.id).toBe(user.id);
      expect(await store.consumeVerificationToken(hash, new Date().toISOString())).toBeNull();
    });

    it("refuses an expired or unknown token", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issue(user.id, hash, hour);
      expect(await store.consumeVerificationToken(hash, new Date(Date.now() + 2 * hour).toISOString())).toBeNull();
      expect(await store.consumeVerificationToken(randomUUID(), new Date().toISOString())).toBeNull();
    });

    it("replaces the user's earlier tokens when a new one is issued", async () => {
      const user = await newUser();
      const first = randomUUID();
      const second = randomUUID();
      await issue(user.id, first);
      await issue(user.id, second);
      expect(await store.consumeVerificationToken(first, new Date().toISOString())).toBeNull();
      expect((await store.consumeVerificationToken(second, new Date().toISOString()))!.id).toBe(user.id);
    });

    it("sweeps expired tokens and keeps live ones", async () => {
      const user = await newUser();
      const other = await newUser();
      const stale = randomUUID();
      const live = randomUUID();
      await issue(user.id, stale, hour);
      await issue(other.id, live);
      await store.deleteExpiredVerificationTokens(new Date(Date.now() + 2 * hour).toISOString());
      expect(await store.consumeVerificationToken(stale, new Date().toISOString())).toBeNull();
      expect((await store.consumeVerificationToken(live, new Date().toISOString()))!.id).toBe(other.id);
    });

    it("deletes old unverified users with no token, keeping verified and token-holding ones (BE-AUDIT squatting)", async () => {
      const stale = await newUser();
      const held = await newUser();
      const verified = await newUser();
      await store.markEmailVerified(verified.id, new Date().toISOString());
      await issue(held.id, randomUUID());
      await store.deleteStaleUnverifiedUsers(new Date(Date.now() + hour).toISOString());
      expect(await store.findUserById(stale.id)).toBeNull();
      expect(await store.findUserById(held.id)).not.toBeNull();
      expect(await store.findUserById(verified.id)).not.toBeNull();
    });

    it("marks the user verified as it consumes the token (PR 226 atomic replacement)", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issue(user.id, hash);
      await store.consumeVerificationToken(hash, new Date().toISOString());
      expect((await store.findUserById(user.id))!.emailVerifiedAt).not.toBeNull();
    });

    it("keeps a user the sweep selected but who verified or got a token before deletion (PR 226 sweep recheck)", async () => {
      const verifiedMeanwhile = await newUser();
      const tokenedMeanwhile = await newUser();
      const abandoned = await newUser();
      const real = store.deleteUser.bind(store);
      const spy = vi.spyOn(store, "deleteUser").mockImplementation(async (id: string, staleBefore?: string) => {
        if (id === verifiedMeanwhile.id) await store.markEmailVerified(id, new Date().toISOString());
        if (id === tokenedMeanwhile.id) await issue(id, randomUUID());
        return real(id, staleBefore);
      });
      await store.deleteStaleUnverifiedUsers(new Date(Date.now() + hour).toISOString());
      spy.mockRestore();
      expect(await store.findUserById(verifiedMeanwhile.id)).not.toBeNull();
      expect(await store.findUserById(tokenedMeanwhile.id)).not.toBeNull();
      expect(await store.findUserById(abandoned.id)).toBeNull();
    });

    it("deletes a user's pending token with the user", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issue(user.id, hash);
      expect(await store.deleteUser(user.id)).not.toBeNull();
      expect(await store.consumeVerificationToken(hash, new Date().toISOString())).toBeNull();
    });
  });
  describe("password reset tokens", () => {
    const hour = 60 * 60 * 1000;
    const issueReset = async (userId: string, hash: string, ttl = hour) => {
      const now = Date.now();
      const user = (await store.findUserById(userId))!;
      return store.createPasswordResetToken(userId, hash, new Date(now).toISOString(), new Date(now + ttl).toISOString(), user.credentialVersion);
    };
    const issueVerification = async (userId: string, hash: string) => {
      const now = Date.now();
      const user = (await store.findUserById(userId))!;
      return store.createVerificationToken(userId, hash, new Date(now).toISOString(), new Date(now + 24 * hour).toISOString(), user.credentialVersion);
    };
    const nowIso = () => new Date().toISOString();

    it("creates a token, finds its user without using it, and consumes it once", async () => {
      const user = await newUser();
      const hash = randomUUID();
      expect(await issueReset(user.id, hash)).toBe(true);
      expect((await store.findUserByResetToken(hash, nowIso()))!.id).toBe(user.id);
      expect((await store.findUserByResetToken(hash, nowIso()))!.id).toBe(user.id);
      const consumed = (await store.consumePasswordResetToken(hash, nowIso(), "$argon2id$reset"))!;
      expect(consumed.id).toBe(user.id);
      expect(consumed.passwordHash).toBe("$argon2id$reset");
      expect(await store.consumePasswordResetToken(hash, nowIso(), "$argon2id$again")).toBeNull();
      expect(await store.findUserByResetToken(hash, nowIso())).toBeNull();
      expect((await store.findUserById(user.id))!.passwordHash).toBe("$argon2id$reset");
    });

    it("refuses an expired or unknown token and leaves the password", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issueReset(user.id, hash, hour);
      const later = new Date(Date.now() + 2 * hour).toISOString();
      expect(await store.findUserByResetToken(hash, later)).toBeNull();
      expect(await store.consumePasswordResetToken(hash, later, "$argon2id$late")).toBeNull();
      expect(await store.consumePasswordResetToken(randomUUID(), nowIso(), "$argon2id$none")).toBeNull();
      expect((await store.findUserById(user.id))!.passwordHash).toBe("$argon2id$stub");
    });

    it("replaces the user's earlier reset tokens when a new one is issued", async () => {
      const user = await newUser();
      const first = randomUUID();
      const second = randomUUID();
      await issueReset(user.id, first);
      await issueReset(user.id, second);
      expect(await store.consumePasswordResetToken(first, nowIso(), "$argon2id$first")).toBeNull();
      expect((await store.consumePasswordResetToken(second, nowIso(), "$argon2id$second"))!.id).toBe(user.id);
    });

    it("refuses to store a token for a credential version the account has moved past", async () => {
      const user = await newUser();
      const used = randomUUID();
      await issueReset(user.id, used);
      await store.consumePasswordResetToken(used, nowIso(), "$argon2id$moved");
      const stale = randomUUID();
      const now = Date.now();
      expect(await store.createPasswordResetToken(user.id, stale, new Date(now).toISOString(), new Date(now + hour).toISOString(), user.credentialVersion)).toBe(false);
      expect(await store.consumePasswordResetToken(stale, nowIso(), "$argon2id$stale")).toBeNull();
    });

    it("moves the credential version on and kills an outstanding verification token when consumed", async () => {
      const user = await newUser();
      const squatter = randomUUID();
      const reset = randomUUID();
      await issueVerification(user.id, squatter);
      await issueReset(user.id, reset);
      const consumed = (await store.consumePasswordResetToken(reset, nowIso(), "$argon2id$owner"))!;
      expect(consumed.credentialVersion).toBe(user.credentialVersion + 1);
      expect(await store.consumeVerificationToken(squatter, nowIso())).toBeNull();
    });

    it("verifies the email as it consumes the token, and keeps an earlier verification time", async () => {
      const unverified = await newUser();
      const verified = await newUser();
      const at = "2026-01-01T00:00:00.000Z";
      await store.markEmailVerified(verified.id, at);
      const a = randomUUID();
      const b = randomUUID();
      await issueReset(unverified.id, a);
      await issueReset(verified.id, b);
      expect((await store.consumePasswordResetToken(a, nowIso(), "$argon2id$a"))!.emailVerifiedAt).not.toBeNull();
      expect((await store.consumePasswordResetToken(b, nowIso(), "$argon2id$b"))!.emailVerifiedAt).toBe(at);
    });

    it("moves passwordChangedAt on consume", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issueReset(user.id, hash);
      await new Promise((r) => setTimeout(r, 5));
      const consumed = (await store.consumePasswordResetToken(hash, nowIso(), "$argon2id$moved"))!;
      expect(consumed.passwordChangedAt > user.passwordChangedAt).toBe(true);
    });

    it("deletes the account's other reset tokens and verification tokens when one is consumed", async () => {
      const user = await newUser();
      const reset = randomUUID();
      const verification = randomUUID();
      await issueReset(user.id, reset);
      await issueVerification(user.id, verification);
      await store.consumePasswordResetToken(reset, nowIso(), "$argon2id$x");
      expect(await store.consumeVerificationToken(verification, nowIso())).toBeNull();
    });

    it("deletes a user's pending reset token with the user", async () => {
      const user = await newUser();
      const hash = randomUUID();
      await issueReset(user.id, hash);
      expect(await store.deleteUser(user.id)).not.toBeNull();
      expect(await store.findUserByResetToken(hash, nowIso())).toBeNull();
      expect(await store.consumePasswordResetToken(hash, nowIso(), "$argon2id$gone")).toBeNull();
    });

    it("refuses a token for a user that is gone", async () => {
      expect(await store.createPasswordResetToken(randomUUID(), randomUUID(), nowIso(), nowIso(), 0)).toBe(false);
    });
  });
});
