import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashToken } from "../src/domain/credentials";
import { RateLimiter } from "../src/identity/rateLimit";
import {
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  Sessions,
  TOUCH_EVERY_MS,
  clearSessionCookie,
  readSessionCookie,
  sessionCookie,
} from "../src/identity/sessions";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function setup() {
  const store = new MemoryRoomStore();
  let now = Date.parse("2026-10-01T12:00:00.000Z");
  const sessions = new Sessions(store, { secure: false }, () => now);
  const user = await store.createUser({
    id: randomUUID(), email: "sam@example.com", displayName: "Sam", passwordHash: "x",
  });
  return { store, sessions, user, advance: (ms: number) => (now += ms) };
}

describe("sessions (FR-GM-01, ADR 0017 I1)", () => {
  it("stores only the SHA-256 of the token it hands out", async () => {
    const { store, sessions, user } = await setup();
    const { token, session } = await sessions.start(user.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(await store.findSession(session.tokenHash))).not.toContain(token);
  });

  it("ends a session after 30 days without a request", async () => {
    const { sessions, user, advance } = await setup();
    const { token } = await sessions.start(user.id);
    advance(SESSION_IDLE_MS - 1000);
    expect(await sessions.resolve(token)).not.toBeNull();
    advance(SESSION_IDLE_MS + 1000);
    expect(await sessions.resolve(token)).toBeNull();
  });

  it("ends a session 90 days after sign-in even when used every day", async () => {
    const { sessions, user, advance } = await setup();
    const { token } = await sessions.start(user.id);
    for (let day = 1; day < 90; day++) {
      advance(DAY);
      expect(await sessions.resolve(token)).not.toBeNull();
    }
    advance(DAY);
    expect(await sessions.resolve(token)).toBeNull();
    expect(89 * DAY < SESSION_MAX_MS).toBe(true);
  });

  it("writes last-seen at most hourly", async () => {
    const { store, sessions, user, advance } = await setup();
    const { token, session } = await sessions.start(user.id);
    advance(TOUCH_EVERY_MS - 1000);
    await sessions.resolve(token);
    expect((await store.findSession(session.tokenHash))!.lastSeenAt).toBe(session.lastSeenAt);
    advance(2000);
    await sessions.resolve(token);
    expect((await store.findSession(session.tokenHash))!.lastSeenAt).not.toBe(session.lastSeenAt);
  });

  it("sweeps ended sessions and reports the seats that ended with them", async () => {
    const { store, sessions, user, advance } = await setup();
    const { session } = await sessions.start(user.id);
    const roomId = randomUUID();
    await store.createRoom(roomId, "invite1");
    await store.saveCredential("seat-hash", { roomId, participantId: randomUUID(), sessionHash: session.tokenHash });
    const reported: string[][] = [];
    sessions.whenEnded((ended) => reported.push(ended.credentialHashes));

    advance(SESSION_IDLE_MS + 1000);
    await sessions.sweep();
    expect(await store.findSession(session.tokenHash)).toBeNull();
    expect(reported).toEqual([["seat-hash"]]);
  });

  it("automatically sweeps expired signups only while verification is required", async () => {
    const store = new MemoryRoomStore();
    let now = Date.now();
    let verifying = false;
    const sessions = new Sessions(store, { secure: false }, () => now, () => verifying);
    const user = await store.createUser({ id: randomUUID(), email: "sam@example.com", displayName: "Sam", passwordHash: "x" });
    now = Date.parse(user.createdAt) + 7 * DAY;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const stop = sessions.startSweeping();
    try {
      await vi.advanceTimersByTimeAsync(TOUCH_EVERY_MS);
      expect(await store.findUserById(user.id)).not.toBeNull();
      verifying = true;
      await vi.advanceTimersByTimeAsync(TOUCH_EVERY_MS);
      expect(await store.findUserById(user.id)).toBeNull();
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it("writes the exact cookie, with and without Secure", () => {
    const expires = new Date("2026-12-30T12:00:00.000Z");
    expect(sessionCookie("tok", expires, { secure: false })).toBe(
      "vtt_session=tok; Path=/; HttpOnly; SameSite=Lax; Expires=Wed, 30 Dec 2026 12:00:00 GMT",
    );
    expect(sessionCookie("tok", expires, { secure: true })).toBe(
      "__Host-vtt_session=tok; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Wed, 30 Dec 2026 12:00:00 GMT",
    );
    expect(clearSessionCookie({ secure: false })).toBe("vtt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  });

  it("reads only its own cookie, and only a token-shaped value", () => {
    const token = "a".repeat(43);
    expect(readSessionCookie(`theme=dark; vtt_session=${token}`, { secure: false })).toBe(token);
    expect(readSessionCookie(`vtt_session=${token}`, { secure: true })).toBeNull();
    expect(readSessionCookie("vtt_session=<script>", { secure: false })).toBeNull();
    expect(readSessionCookie(undefined, { secure: false })).toBeNull();
  });
});

describe("rate limiter (ADR 0017 I4)", () => {
  it("allows the limit, then refuses with the seconds left", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 60_000, () => now);
    for (let i = 0; i < 3; i++) expect(limiter.hit("k").ok).toBe(true);
    const refused = limiter.hit("k");
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSec).toBe(60);
    now = 30_000;
    expect(limiter.check("k").retryAfterSec).toBe(30);
  });

  it("starts a new window once the old one passes", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    limiter.hit("k");
    expect(limiter.hit("k").ok).toBe(false);
    now = 1000;
    expect(limiter.hit("k").ok).toBe(true);
  });

  it("forgets a key on reset, and keeps keys apart", () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    limiter.hit("a");
    expect(limiter.hit("b").ok).toBe(true);
    limiter.reset("a");
    expect(limiter.hit("a").ok).toBe(true);
  });
});
