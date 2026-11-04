import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_FAILED } from "@vtt/shared";
import { hashToken } from "../src/domain/credentials";
import { SESSION_IDLE_MS } from "../src/identity/sessions";
import { RateLimiter } from "../src/identity/rateLimit";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

describe("user accounts (FR-GM-01)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
  });

  /** A server on a clock the test moves. */
  async function withClock() {
    let now = Date.parse("2026-10-01T12:00:00.000Z");
    server = await startServer(new MemoryRoomStore(), { now: () => now });
    return (ms: number) => (now += ms);
  }

  describe("creating an account", () => {
    it("creates the account and signs it in", async () => {
      server = await startServer();
      const sam = await server.signUp({ email: "sam@example.com", displayName: "Sam" });
      expect(sam.cookie).toMatch(/^vtt_session=/);
      expect(await sam.me()).toEqual({ id: sam.view!.id, email: "sam@example.com", displayName: "Sam" });
    });

    it("treats case and spaces in the email as the same account", async () => {
      server = await startServer();
      await server.signUp({ email: "sam@example.com" });
      const res = await server.anonymous().request("POST", "/api/auth/signup", {
        email: " Sam@Example.COM", password: "another password", displayName: "Other",
      });
      expect(res.status).toBe(409);
      expect(await server.store.findUserByEmail("sam@example.com")).not.toBeNull();
      expect(res.headers.getSetCookie()).toEqual([]);
    });

    it("refuses weak or oversized input with a 400 naming the field", async () => {
      server = await startServer();
      const cases: [Record<string, string>, string][] = [
        [{ password: "x".repeat(7) }, "password"],
        [{ password: "x".repeat(129) }, "password"],
        [{ password: "new@example.com" }, "password"],
        [{ displayName: "   " }, "displayName"],
      ];
      for (const [patch, field] of cases) {
        const res = await server.anonymous().request("POST", "/api/auth/signup", {
          email: "new@example.com", password: "long enough", displayName: "New", ...patch,
        });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { field: string }).field).toBe(field);
      }
      expect(await server.store.findUserByEmail("new@example.com")).toBeNull();
    });

    it("accepts JSON only", async () => {
      server = await startServer();
      const res = await server.anonymous().request("POST", "/api/auth/signup", undefined, {
        "content-type": "application/x-www-form-urlencoded",
      });
      expect(res.status).toBe(415);
    });
  });

  describe("sign in and sign out", () => {
    it("signs in with the right password", async () => {
      server = await startServer();
      const sam = await server.signUp({ email: "sam@example.com", password: "correct horse" });
      const laptop = await server.signIn("SAM@example.com", "correct horse");
      expect((await laptop.me())!.id).toBe(sam.view!.id);
    });

    it("answers an unknown email and a wrong password identically", async () => {
      server = await startServer();
      await server.signUp({ email: "sam@example.com", password: "correct horse" });
      const unknown = await server.anonymous().request("POST", "/api/auth/signin", {
        email: "nobody@example.com", password: "correct horse",
      });
      const wrong = await server.anonymous().request("POST", "/api/auth/signin", {
        email: "sam@example.com", password: "wrong horse",
      });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      const [a, b] = [await unknown.text(), await wrong.text()];
      expect(a).toBe(b);
      expect(JSON.parse(a)).toEqual({ error: SIGN_IN_FAILED });
    });

    it("kills the cookie on sign-out, even if a client replays it", async () => {
      server = await startServer();
      const sam = await server.signUp();
      const stolen = sam.cookie;
      const res = await sam.request("POST", "/api/auth/signout");
      expect(res.status).toBe(204);
      expect(sam.cookie).toBe("");
      const replay = await fetch(`${server.base}/api/auth/me`, { headers: { cookie: stolen } });
      expect(await replay.json()).toEqual({ account: null });
    });

    it("answers me with null for a signed-out visitor, not an error", async () => {
      server = await startServer();
      const res = await server.anonymous().request("GET", "/api/auth/me");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ account: null });
    });
  });

  describe("session cookie", () => {
    it("is HttpOnly, SameSite=Lax and Path=/", async () => {
      server = await startServer();
      const res = await server.anonymous().request("POST", "/api/auth/signup", {
        email: "sam@example.com", password: "correct horse", displayName: "Sam",
      });
      const [cookie] = res.headers.getSetCookie();
      expect(cookie).toMatch(/^vtt_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Expires=/);
    });

    it("ends after 30 days without a request, and the response clears the cookie", async () => {
      const advance = await withClock();
      const sam = await server.signUp();
      advance(SESSION_IDLE_MS + 1000);
      const res = await sam.request("GET", "/api/auth/me");
      expect(await res.json()).toEqual({ account: null });
      expect(res.headers.getSetCookie()[0]).toContain("Max-Age=0");
    });

    it("ends 90 days after sign-in even when used every day", async () => {
      const advance = await withClock();
      const sam = await server.signUp();
      for (let day = 1; day < 90; day++) {
        advance(DAY);
        expect(await sam.me()).not.toBeNull();
      }
      advance(DAY);
      expect(await sam.me()).toBeNull();
    });
  });

  describe("credentials are never stored or shown in usable form", () => {
    it("keeps neither the password nor the cookie in any record or log line", async () => {
      server = await startServer();
      const logged: string[] = [];
      for (const level of ["log", "info", "warn", "error"] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
      }
      const sam = await server.signUp({ email: "sam@example.com", password: "a secret phrase" });
      const token = sam.cookie.split("=")[1]!;
      await server.signIn("sam@example.com", "a secret phrase");

      const user = (await server.store.findUserByEmail("sam@example.com"))!;
      const records = JSON.stringify([user, await server.store.findSession(hashToken(token))]);
      expect(records).not.toContain("a secret phrase");
      expect(records).not.toContain(token);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      for (const line of logged) {
        expect(line).not.toContain("a secret phrase");
        expect(line).not.toContain(token);
      }
    });

    it("shows id, email and display name, and nothing else", async () => {
      server = await startServer();
      const sam = await server.signUp();
      const res = await sam.request("GET", "/api/auth/me");
      const { account } = (await res.json()) as { account: Record<string, unknown> };
      expect(Object.keys(account).sort()).toEqual(["displayName", "email", "id"]);
    });
  });

  describe("change password", () => {
    it("ends the other sessions and keeps the one that made the change", async () => {
      server = await startServer();
      const laptop = await server.signUp({ email: "sam@example.com", password: "old password" });
      const phone = await server.signIn("sam@example.com", "old password");
      const res = await laptop.request("POST", "/api/auth/password", {
        currentPassword: "old password", newPassword: "new password",
      });
      expect(res.status).toBe(204);
      expect(await laptop.me()).not.toBeNull();
      expect(await phone.me()).toBeNull();
      await expect(server.signIn("sam@example.com", "new password")).resolves.toBeTruthy();
      await expect(server.signIn("sam@example.com", "old password")).rejects.toThrow(/401/);
    });

    it("refuses a wrong current password and changes nothing", async () => {
      server = await startServer();
      const laptop = await server.signUp({ email: "sam@example.com", password: "old password" });
      const phone = await server.signIn("sam@example.com", "old password");
      const res = await laptop.request("POST", "/api/auth/password", {
        currentPassword: "not it", newPassword: "new password",
      });
      expect(res.status).toBe(403);
      expect(await phone.me()).not.toBeNull();
      await expect(server.signIn("sam@example.com", "old password")).resolves.toBeTruthy();
    });

    it("needs a session", async () => {
      server = await startServer();
      const res = await server.anonymous().request("POST", "/api/auth/password", {
        currentPassword: "x", newPassword: "new password",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("guessing resistance", () => {
    it("stops a password after 10 failures in 15 minutes, even the right one, until the window passes", async () => {
      const advance = await withClock();
      await server.signUp({ email: "sam@example.com", password: "correct horse" });
      for (let i = 0; i < 10; i++) {
        const res = await server.anonymous().request("POST", "/api/auth/signin", {
          email: "sam@example.com", password: `guess ${i}`,
        });
        expect(res.status).toBe(401);
      }
      const eleventh = await server.anonymous().request("POST", "/api/auth/signin", {
        email: "sam@example.com", password: "correct horse",
      });
      expect(eleventh.status).toBe(429);
      expect(Number(eleventh.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(eleventh.headers.getSetCookie()).toEqual([]);

      advance(15 * 60 * 1000 + 1000);
      await expect(server.signIn("sam@example.com", "correct horse")).resolves.toBeTruthy();
    });

    it("stops guessing the current password on a password change after 10 failures in 15 minutes (security-hardening)", async () => {
      const advance = await withClock();
      const sam = await server.signUp({ email: "sam@example.com", password: "old password" });
      const change = (currentPassword: string, newPassword = "new password") =>
        sam.request("POST", "/api/auth/password", { currentPassword, newPassword });
      for (let i = 0; i < 10; i++) expect((await change(`guess ${i}`)).status).toBe(403);

      const eleventh = await change("old password");
      expect(eleventh.status).toBe(429);
      expect(Number(eleventh.headers.get("retry-after"))).toBeGreaterThan(0);
      await expect(server.signIn("sam@example.com", "old password")).resolves.toBeTruthy();

      advance(15 * 60 * 1000 + 1000);
      expect((await change("old password")).status).toBe(204);
      await expect(server.signIn("sam@example.com", "new password")).resolves.toBeTruthy();
    });

    it("checks at most 10 current passwords from a burst sent all at once (security-hardening)", async () => {
      server = await startServer();
      const sam = await server.signUp({ email: "sam@example.com", password: "old password" });
      const burst = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        sam.request("POST", "/api/auth/password", { currentPassword: `guess ${i}`, newPassword: "new password" })));
      const statuses = burst.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 403)).toHaveLength(10);
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    });

    it("checks at most 10 passwords for one email from a sign-in burst sent all at once (security-hardening)", async () => {
      server = await startServer();
      await server.signUp({ email: "sam@example.com", password: "correct horse" });
      const burst = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        server.anonymous().request("POST", "/api/auth/signin", { email: "sam@example.com", password: `guess ${i}` })));
      const statuses = burst.map((r) => r.status);
      expect(statuses.filter((s) => s === 401)).toHaveLength(10);
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    });

    it("clears the password-change failure count after a successful change (security-hardening)", async () => {
      server = await startServer();
      const sam = await server.signUp({ email: "sam@example.com", password: "old password" });
      const change = (currentPassword: string, newPassword: string) =>
        sam.request("POST", "/api/auth/password", { currentPassword, newPassword });
      for (let i = 0; i < 9; i++) expect((await change(`guess ${i}`, "new password")).status).toBe(403);
      expect((await change("old password", "new password")).status).toBe(204);
      for (let i = 0; i < 9; i++) expect((await change(`guess ${i}`, "newer password")).status).toBe(403);
      expect((await change("new password", "newer password")).status).toBe(204);
    });

    it("enforces the configured sign-up budget per address", async () => {
      server = await startServer();
      server.app.limits.signUpPerIp = new RateLimiter(10, 60 * 60_000);
      for (let i = 0; i < 10; i++) await server.signUp();
      await expect(server.signUp()).rejects.toThrow(/429/);
    });

    it("enforces the configured sign-in budget per address", async () => {
      server = await startServer();
      server.app.limits.signInPerIp = new RateLimiter(30, 15 * 60_000);
      for (let i = 0; i < 30; i++) {
        await server.anonymous().request("POST", "/api/auth/signin", { email: `u${i}@example.com`, password: "x" });
      }
      const res = await server.anonymous().request("POST", "/api/auth/signin", { email: "u@example.com", password: "x" });
      expect(res.status).toBe(429);
    });
  });

  describe("cookie-authorized writes come from the app (ADR 0017 I3)", () => {
    it("refuses a write carrying the cookie from another origin", async () => {
      server = await startServer();
      const sam = await server.signUp({ password: "old password" });
      const res = await sam.request(
        "POST", "/api/auth/password", { currentPassword: "old password", newPassword: "new password" },
        { origin: "https://evil.example" },
      );
      expect(res.status).toBe(403);
      await expect(server.signIn(sam.email, "old password")).resolves.toBeTruthy();
    });

    it("refuses a cross-site write with no Origin", async () => {
      server = await startServer();
      const sam = await server.signUp();
      const res = await sam.request("POST", "/api/auth/signout", undefined, { "sec-fetch-site": "cross-site" });
      expect(res.status).toBe(403);
      expect(await sam.me()).not.toBeNull();
    });

    it("lets the app's own origin through, including a phone on the LAN through the dev proxy", async () => {
      server = await startServer();
      const sam = await server.signUp();
      const host = new URL(server.base).host;
      const own = await sam.request("POST", "/api/auth/password", { currentPassword: "nope", newPassword: "new password" }, {
        origin: `http://${host}`,
      });
      expect(own.status).toBe(403);
      expect(((await own.json()) as { field?: string }).field).toBe("currentPassword");
      // `fetch` won't set Host, so this one goes out raw, as Vite's proxy would forward it.
      const url = new URL(`${server.base}/api/auth/signout`);
      const lanStatus = await new Promise<number>((resolve, reject) => {
        const req = request(
          { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",
            headers: { origin: "http://192.168.1.20:5173", host: "192.168.1.20:5173", cookie: sam.cookie } },
          (res) => resolve(res.statusCode ?? 0),
        );
        req.on("error", reject);
        req.end();
      });
      expect(lanStatus).toBe(204);
    });
  });
});
