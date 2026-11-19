import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_UNVERIFIED_CODE } from "@vtt/shared";
import type { MailMessage, Mailer } from "../src/identity/mailer";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer } from "./helpers";

const HOUR = 60 * 60 * 1000;
const ORIGIN = "https://sessionzero.codes";

class Recorder implements Mailer {
  sent: MailMessage[] = [];
  failing = false;
  async send(message: MailMessage) {
    if (this.failing) throw new Error("provider refused");
    this.sent.push(message);
  }
  tokenOf(index = this.sent.length - 1) {
    const match = this.sent[index]!.text.match(/token=([^\s]+)/);
    return decodeURIComponent(match![1]!);
  }
}

describe("email verification (FR-GM-01)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let mail: Recorder;
  let clock: number;
  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.close();
  });

  async function production() {
    mail = new Recorder();
    clock = Date.parse("2026-10-01T12:00:00.000Z");
    server = await startServer(new MemoryRoomStore(), { now: () => clock, verification: { mailer: mail }, clientOrigin: ORIGIN });
  }

  const credentials = { email: "sam@example.com", password: "correct horse battery", displayName: "Sam" };
  const signUp = (headers: Record<string, string> = {}) => server.anonymous().request("POST", "/api/auth/signup", credentials, headers);
  const verify = (token: string) => server.anonymous().request("POST", "/api/auth/verify", { token });
  const resend = (email = credentials.email) => server.anonymous().request("POST", "/api/auth/verify/resend", { email });
  const signIn = (password = credentials.password, email = credentials.email) =>
    server.anonymous().request("POST", "/api/auth/signin", { email, password });

  describe("sign-up", () => {
    it("in production creates an unverified account, starts no session and mails one link", async () => {
      await production();
      const res = await signUp();
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ verificationRequired: true, email: "sam@example.com" });
      expect(res.headers.getSetCookie()).toEqual([]);
      expect((await server.store.findUserByEmail("sam@example.com"))!.emailVerifiedAt).toBeNull();
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]!.to).toBe("sam@example.com");
      expect(mail.sent[0]!.text).toContain(`${ORIGIN}/verify-email?token=`);
      expect(mail.sent[0]!.html).toContain(`${ORIGIN}/verify-email?token=`);
    });

    it("outside production verifies the account at once, signs in and sends no mail", async () => {
      server = await startServer();
      const sam = await server.signUp({ email: "sam@example.com" });
      expect(sam.cookie).toMatch(/^vtt_session=/);
      expect((await server.store.findUserByEmail("sam@example.com"))!.emailVerifiedAt).not.toBeNull();
    });

    it("answers as for a sent link when the mail provider fails, and logs no token", async () => {
      await production();
      mail.failing = true;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await signUp();
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ verificationRequired: true, email: "sam@example.com" });
      expect(await server.store.findUserByEmail("sam@example.com")).not.toBeNull();
      expect(JSON.stringify(log.mock.calls)).toContain("provider refused");
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/token=/);
    });

    it("refuses an address with angle brackets, a comma or a semicolon and sends no mail", async () => {
      await production();
      const res = await server.anonymous().request("POST", "/api/auth/signup", { ...credentials, email: "x<ceo@company.com>@evil.com" });
      expect(res.status).toBe(400);
      expect(mail.sent).toEqual([]);
    });

    it("refuses a registered address and sends no mail", async () => {
      await production();
      await signUp();
      mail.sent.length = 0;
      expect((await signUp()).status).toBe(409);
      expect(mail.sent).toEqual([]);
    });

    it("writes the mail in Traditional Chinese for a request that asks for it", async () => {
      await production();
      await signUp({ "accept-language": "zh-TW" });
      expect(mail.sent[0]!.subject).toBe("驗證你的 Session Zero 電子郵件地址");
      expect(mail.sent[0]!.text).toContain("驗證電子郵件地址");
    });
  });

  describe("sign-in", () => {
    it("refuses an unverified account with the right password, naming the reason", async () => {
      await production();
      await signUp();
      const res = await signIn();
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: EMAIL_UNVERIFIED_CODE });
      expect(res.headers.getSetCookie()).toEqual([]);
    });

    it("answers a wrong password on an unverified account like an unknown address", async () => {
      await production();
      await signUp();
      const wrong = await signIn("wrong password!");
      const unknown = await signIn("wrong password!", "nobody@example.com");
      expect(wrong.status).toBe(401);
      expect({ status: wrong.status, body: await wrong.json() }).toEqual({ status: unknown.status, body: await unknown.json() });
    });

    it("signs in once the address is verified", async () => {
      await production();
      await signUp();
      expect((await verify(mail.tokenOf())).status).toBe(200);
      expect((await signIn()).status).toBe(200);
    });
  });

  describe("verify", () => {
    it("verifies the account, starts a session and uses the token up", async () => {
      await production();
      await signUp();
      const token = mail.tokenOf();
      const res = await verify(token);
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().join(";")).toMatch(/vtt_session=/);
      expect(await res.json()).toMatchObject({ account: { email: "sam@example.com", displayName: "Sam" } });
      expect((await server.store.findUserByEmail("sam@example.com"))!.emailVerifiedAt).not.toBeNull();
      expect((await verify(token)).status).toBe(400);
    });

    it("refuses an expired token and leaves the account unverified", async () => {
      await production();
      await signUp();
      clock += 24 * HOUR + 1;
      expect((await verify(mail.tokenOf())).status).toBe(400);
      expect((await server.store.findUserByEmail("sam@example.com"))!.emailVerifiedAt).toBeNull();
    });

    it("refuses a superseded token and accepts the newer one", async () => {
      await production();
      await signUp();
      await resend();
      await vi.waitFor(() => expect(mail.sent).toHaveLength(2));
      expect((await verify(mail.tokenOf(0))).status).toBe(400);
      expect((await verify(mail.tokenOf(1))).status).toBe(200);
    });

    it("answers unknown, malformed and expired tokens with the same body", async () => {
      await production();
      await signUp();
      const unknown = await verify("x".repeat(43));
      const malformed = await verify("short");
      clock += 25 * HOUR;
      const expired = await verify(mail.tokenOf());
      const bodies = await Promise.all([unknown, malformed, expired].map(async (r) => ({ status: r.status, body: await r.json() })));
      expect(bodies[0]!.status).toBe(400);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
    });

    it("limits one client to 30 verify requests per 15 minutes and frees them after the window", async () => {
      await production();
      for (let i = 0; i < 30; i++) expect((await verify("x".repeat(43))).status).toBe(400);
      const limited = await verify("x".repeat(43));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
      clock += 16 * 60 * 1000;
      expect((await verify("x".repeat(43))).status).toBe(400);
    });

    it("is not consumed by a GET of the page route", async () => {
      await production();
      await signUp();
      const token = mail.tokenOf();
      await fetch(`${server.base}/verify-email?token=${encodeURIComponent(token)}`);
      expect((await verify(token)).status).toBe(200);
    });
  });

  describe("resend", () => {
    it("sends a fresh link for an unverified account and stops the old one", async () => {
      await production();
      await signUp();
      expect((await resend()).status).toBe(204);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(2));
      expect((await verify(mail.tokenOf(0))).status).toBe(400);
    });

    it("answers 204 and sends nothing for an unknown or verified address", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      mail.sent.length = 0;
      expect((await resend("nobody@example.com")).status).toBe(204);
      expect((await resend()).status).toBe(204);
      await new Promise((r) => setTimeout(r, 50));
      expect(mail.sent).toEqual([]);
    });

    it("answers 400 only for a malformed body", async () => {
      await production();
      expect((await resend("not-an-email")).status).toBe(400);
    });

    it("limits one address to 3 requests per 15 minutes with Retry-After", async () => {
      await production();
      await signUp();
      for (let i = 0; i < 3; i++) expect((await resend()).status).toBe(204);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(4));
      const limited = await resend();
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 50));
      expect(mail.sent).toHaveLength(4);
    });

    it("limits one client to 20 requests per hour", async () => {
      await production();
      for (let i = 0; i < 20; i++) expect((await resend(`user${i}@example.com`)).status).toBe(204);
      const limited = await resend("another@example.com");
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
    });
  });

  describe("deletion", () => {
    it("removes a pending token with the account", async () => {
      await production();
      await signUp();
      const token = mail.tokenOf();
      const user = (await server.store.findUserByEmail("sam@example.com"))!;
      await server.store.deleteUser(user.id);
      expect((await verify(token)).status).toBe(400);
    });
  });
});
