import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missingProductionEnv } from "../src/app";
import { errorTag } from "../src/http/errorTag";
import { ReplayCache } from "../src/http/replayCache";
import { isCommonPassword } from "../src/identity/commonPasswords";
import { PasswordBusyError, hashPassword } from "../src/identity/passwords";
import { RateLimiter } from "../src/identity/rateLimit";
import { createAssetStore, type AssetStore } from "../src/store/assetStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { CredentialConflictError } from "../src/store/roomStore";
import { startServer } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function fakeS3(): AssetStore {
  return {
    put: async (_temp, key) => `/uploads/${key}`,
    delete: async () => {},
    readPrivate: async () => null,
    sizeOf: async () => null,
  };
}

describe("H3 disk copy and disk floor (backend audit)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes the local copy after a successful object storage put in production", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    const file = path.join(uploadDir, "a.png");
    await writeFile(file, "bytes");
    const env = { NODE_ENV: "production", S3_ENDPOINT: "http://s3:9000", S3_ACCESS_KEY: "k", S3_SECRET_KEY: "s" };
    const store = await createAssetStore(uploadDir, env, async () => fakeS3());
    expect(await store.put(file, "a.png", "image/png")).toBe("/uploads/a.png");
    expect(existsSync(file)).toBe(false);
  });

  it("keeps the local copy outside production", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    const file = path.join(uploadDir, "a.png");
    await writeFile(file, "bytes");
    const store = await createAssetStore(uploadDir, { S3_ENDPOINT: "http://s3:9000" }, async () => fakeS3());
    await store.put(file, "a.png", "image/png");
    expect(existsSync(file)).toBe(true);
  });

  it("refuses an upload with 503 while free disk is below the floor", async () => {
    const server = await startServer();
    const previous = process.env.MIN_FREE_DISK_BYTES;
    process.env.MIN_FREE_DISK_BYTES = String(Number.MAX_SAFE_INTEGER);
    try {
      const room = await server.createRoom("GM");
      const form = new FormData();
      form.append("file", new Blob([PNG], { type: "image/png" }), "art.png");
      const res = await fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${room.guestToken}` }, body: form });
      expect(res.status).toBe(503);
    } finally {
      if (previous === undefined) delete process.env.MIN_FREE_DISK_BYTES;
      else process.env.MIN_FREE_DISK_BYTES = previous;
      await server.close();
    }
  });
});

describe("H2 replay budgets per room and a replay cache (backend audit)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("counts replay requests per room across participants", async () => {
    server.app.limits.replaysPerRoom = new RateLimiter(2, 60_000);
    const room = await server.createRoom("GM");
    const player = await server.join(room.inviteCode, "Sam");
    const get = (token: string) => fetch(`${server.base}/api/rooms/${room.roomId}/replay`, { headers: { authorization: `Bearer ${token}` } });
    expect((await get(room.guestToken)).status).toBe(200);
    expect((await get(player.guestToken)).status).toBe(200);
    expect((await get(room.guestToken)).status).toBe(429);
  });

  it("counts history requests per room across participants", async () => {
    server.app.limits.historyPerRoom = new RateLimiter(1, 60_000);
    const room = await server.createRoom("GM");
    const get = () => fetch(`${server.base}/api/rooms/${room.roomId}/history`, { headers: { authorization: `Bearer ${room.guestToken}` } });
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
  });

  it("serves a repeated replay from the cache with the same body", async () => {
    const room = await server.createRoom("GM");
    const get = () => fetch(`${server.base}/api/rooms/${room.roomId}/replay`, { headers: { authorization: `Bearer ${room.guestToken}` } }).then((r) => r.text());
    expect(await get()).toBe(await get());
  });

  it("evicts the least recently used entry", () => {
    const cache = new ReplayCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
  });
});

describe("M2 argon2 concurrency cap (backend audit)", () => {
  it("refuses work beyond the queue instead of piling it on the thread pool", async () => {
    const results = await Promise.allSettled(Array.from({ length: 80 }, () => hashPassword("correct horse battery")));
    expect(results.some((r) => r.status === "rejected" && r.reason instanceof PasswordBusyError)).toBe(true);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  }, 60_000);
});

describe("M6 production configuration (backend audit)", () => {
  it("names every missing setting in production and nothing elsewhere", () => {
    expect(missingProductionEnv({ NODE_ENV: "production" })).toEqual(["DATABASE_URL", "S3_ENDPOINT", "TRUST_PROXY"]);
    expect(missingProductionEnv({ NODE_ENV: "production", DATABASE_URL: "x", S3_ENDPOINT: "y", TRUST_PROXY: "1" })).toEqual([]);
    expect(missingProductionEnv({})).toEqual([]);
  });
});

describe("L1 credentials are create-only (backend audit)", () => {
  it("refuses to re-point a credential at another seat, and allows the same seat again", async () => {
    const store = new MemoryRoomStore();
    await store.createRoom("r1", "invite1");
    await store.saveCredential("hash", { roomId: "r1", participantId: "p1" });
    await store.saveCredential("hash", { roomId: "r1", participantId: "p1" });
    await expect(store.saveCredential("hash", { roomId: "r1", participantId: "p2" })).rejects.toBeInstanceOf(CredentialConflictError);
  });

  it("answers 409 when a join reuses a token that already holds a seat", async () => {
    const server = await startServer();
    try {
      const room = await server.createRoom("GM");
      const res = await fetch(`${server.base}/api/invites/${room.inviteCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Sam", guestToken: room.guestToken }),
      });
      expect(res.status).toBe(409);
    } finally {
      await server.close();
    }
  });
});

describe("L9 common passwords (backend audit)", () => {
  it("rejects a common password at sign-up with the password field named", async () => {
    const server = await startServer();
    try {
      const res = await server.anonymous().request("POST", "/api/auth/signup", { email: "sam@example.com", password: "password123", displayName: "Sam" });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ field: "password" });
      expect(isCommonPassword("  PassWord123 ")).toBe(true);
      expect(isCommonPassword("correct horse battery")).toBe(false);
    } finally {
      await server.close();
    }
  });
});

describe("L12 upload budget refund and L7 log tags (backend audit)", () => {
  it("gives a counted attempt back", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.hit("k").ok).toBe(true);
    expect(limiter.hit("k").ok).toBe(false);
    limiter.refund("k");
    expect(limiter.hit("k").ok).toBe(true);
  });

  it("logs the error name and code, never its message", () => {
    const err = Object.assign(new Error("insert of sam@example.com failed"), { name: "PrismaClientKnownRequestError", code: "P2002" });
    expect(errorTag(err)).toBe("PrismaClientKnownRequestError P2002");
    expect(errorTag("raw")).toBe("non-error");
  });
});
