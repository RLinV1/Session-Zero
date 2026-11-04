import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, trustProxyFromEnv, type App } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { RateLimiter } from "../src/identity/rateLimit";
import { listenForFetch, newGuestToken, startServer } from "./helpers";

describe("TRUST_PROXY can't let clients forge their address (security-hardening)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("refuses to start in production with TRUST_PROXY=true", () => {
    expect(() => trustProxyFromEnv({ NODE_ENV: "production", TRUST_PROXY: "true" })).toThrow(/TRUST_PROXY=1/);
  });

  it("refuses a value that is not a hop count in production, instead of ignoring it", () => {
    expect(() => trustProxyFromEnv({ NODE_ENV: "production", TRUST_PROXY: "yes" })).toThrow(/hop count/);
  });

  it("accepts a hop count in production, and leaves the default when unset", () => {
    expect(trustProxyFromEnv({ NODE_ENV: "production", TRUST_PROXY: "1" })).toBe(1);
    expect(trustProxyFromEnv({ NODE_ENV: "production" })).toBeUndefined();
  });

  it("still allows TRUST_PROXY=true outside production, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(trustProxyFromEnv({ TRUST_PROXY: "true" })).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/rate limits can be bypassed/));
  });

  it("refuses to build the app in production with TRUST_PROXY=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUST_PROXY", "true");
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await expect(buildApp({ store: new MemoryRoomStore(), uploadDir, cookieSecure: false })).rejects.toThrow(/TRUST_PROXY/);
  });

  it("behind one proxy, a forged X-Forwarded-For entry doesn't reset the join limit", async () => {
    // A room to join, made on an ordinary test server sharing the store.
    const store = new MemoryRoomStore();
    const setup = await startServer(store);
    const room = await setup.createRoom("Sam");
    await setup.close();

    vi.stubEnv("TRUST_PROXY", "1");
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    const app: App = await buildApp({ store, uploadDir, clientOrigin: "*" });
    app.limits.joinsPerIpPerRoom = new RateLimiter(30, 15 * 60_000);
    const base = await listenForFetch(app);
    try {
      // The proxy appends the address it saw; the client controls everything before it.
      const join = (i: number) => fetch(`${base}/api/invites/${room.inviteCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` },
        body: JSON.stringify({ displayName: `Player ${i}`, guestToken: newGuestToken() }),
      });
      for (let i = 0; i < 30; i++) expect((await join(i)).status).toBe(200);
      expect((await join(30)).status).toBe(429);
    } finally {
      await app.close();
    }
  });
});
