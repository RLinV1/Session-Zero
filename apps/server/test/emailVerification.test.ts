import { randomUUID } from "node:crypto";
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
    vi.unstubAllEnvs();
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

    it("writes the mail in Traditional Chinese for a request that asks for it", async () => {
      await production();
      await signUp({ "accept-language": "zh-TW" });
      expect(mail.sent[0]!.subject).toBe("驗證你的 Session Zero 電子郵件地址");
      expect(mail.sent[0]!.text).toContain("驗證電子郵件地址");
    });
  });

  describe("repeat sign-up (FR-GM-01)", () => {
    const attacker = { ...credentials, password: "attacker passphrase" };
    const signUpAs = (body: typeof credentials, headers: Record<string, string> = {}) =>
      server.anonymous().request("POST", "/api/auth/signup", body, headers);

    it("cannot replace an unverified account's password: the owner's works after verify, the attacker's never does", async () => {
      await production();
      await signUp();
      const first = mail.tokenOf();
      const repeated = await signUpAs(attacker);
      expect(repeated.status).toBe(201);
      expect(mail.sent).toHaveLength(2);
      expect((await verify(first)).status).toBe(400);
      expect((await verify(mail.tokenOf())).status).toBe(200);
      expect((await signIn("attacker passphrase")).status).toBe(401);
      expect((await signIn()).status).toBe(200);
    });

    it("emails the owner a fresh link for the unverified account's existing credentials", async () => {
      await production();
      await signUp();
      const before = await server.store.findUserByEmail(credentials.email);
      await signUpAs(attacker);
      const after = await server.store.findUserByEmail(credentials.email);
      expect(after).toEqual(before);
      expect(mail.sent[1]!.to).toBe("sam@example.com");
      expect(mail.sent[1]!.text).toContain(`${ORIGIN}/verify-email?token=`);
    });

    it("answers a repeat sign-up exactly as a new one: same status, body shape and no cookie", async () => {
      await production();
      const fresh = await signUpAs({ ...credentials, email: "new@example.com" });
      await signUp();
      const unverifiedRepeat = await signUpAs(attacker);
      await verify(mail.tokenOf());
      const verifiedRepeat = await signUpAs(attacker);
      for (const res of [unverifiedRepeat, verifiedRepeat]) {
        expect(res.status).toBe(fresh.status);
        expect(res.headers.getSetCookie()).toEqual([]);
        expect(await res.json()).toEqual({ verificationRequired: true, email: "sam@example.com" });
      }
      expect(await fresh.json()).toEqual({ verificationRequired: true, email: "new@example.com" });
    });

    it("leaves a verified account unchanged and its sessions signed in, and mails a notice with sign-in and reset links", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      const owner = await server.signIn(credentials.email, credentials.password);
      const before = await server.store.findUserByEmail(credentials.email);
      mail.sent.length = 0;
      expect((await signUpAs(attacker)).status).toBe(201);
      expect(await server.store.findUserByEmail(credentials.email)).toEqual(before);
      expect(await owner.me()).not.toBeNull();
      expect((await signIn("attacker passphrase")).status).toBe(401);
      expect((await signIn()).status).toBe(200);
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]!.to).toBe("sam@example.com");
      expect(mail.sent[0]!.text).toContain(`${ORIGIN}/signin`);
      expect(mail.sent[0]!.text).toContain(`${ORIGIN}/forgot-password`);
      expect(mail.sent[0]!.text).not.toContain("token=");
      expect(mail.sent[0]!.html).toContain(`${ORIGIN}/forgot-password`);
    });

    it("creates no second account", async () => {
      await production();
      await signUp();
      await signUpAs(attacker);
      await signUpAs({ ...attacker, displayName: "Mallory" });
      expect((await server.store.findUserByEmail(credentials.email))!.displayName).toBe("Sam");
    });

    it("writes the notice in Traditional Chinese for a request that asks for it", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      mail.sent.length = 0;
      await signUpAs(attacker, { "accept-language": "zh-TW" });
      expect(mail.sent[0]!.subject).toBe("有人嘗試使用你的電子郵件地址註冊");
    });

    it("shares one budget of 3 per 15 minutes per email with verification resend", async () => {
      await production();
      await signUp();
      expect((await resend()).status).toBe(204);
      expect((await resend()).status).toBe(204);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(3));
      expect((await signUpAs(attacker)).status).toBe(201);
      expect(mail.sent).toHaveLength(4);
      const over = await signUpAs(attacker);
      expect(over.status).toBe(201);
      expect(await over.json()).toEqual({ verificationRequired: true, email: "sam@example.com" });
      expect((await resend()).status).toBe(204);
      await new Promise((r) => setTimeout(r, 50));
      expect(mail.sent).toHaveLength(4);
    });

    it("sends no further notice over the limit and answers as before", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      mail.sent.length = 0;
      for (let i = 0; i < 6; i++) {
        const res = await signUpAs(attacker);
        expect(res.status).toBe(201);
        expect(res.headers.get("retry-after")).toBeNull();
      }
      expect(mail.sent).toHaveLength(3);
    });

    it("frees the budget after the window", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      mail.sent.length = 0;
      for (let i = 0; i < 4; i++) await signUpAs(attacker);
      expect(mail.sent).toHaveLength(3);
      clock += 16 * 60 * 1000;
      await signUpAs(attacker);
      expect(mail.sent).toHaveLength(4);
    });

    it("answers as for a sent notice when the mail provider fails, and logs no token", async () => {
      await production();
      await signUp();
      await verify(mail.tokenOf());
      mail.failing = true;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await signUpAs(attacker);
      expect(res.status).toBe(201);
      expect(JSON.stringify(log.mock.calls)).toContain("provider refused");
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/token=/);
    });

    it("still answers 409 and marks the email field when no mail is configured (development)", async () => {
      server = await startServer();
      await server.signUp({ email: "sam@example.com" });
      const res = await signUpAs(attacker);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ field: "email" });
      expect((await server.signIn("sam@example.com", "correct horse battery")).view).not.toBeNull();
    });

    it("does not change the account when the owner verifies between the lookup and the mail", async () => {
      await production();
      await signUp();
      const ownerToken = mail.tokenOf();
      const real = server.store.findUserByEmail.bind(server.store);
      vi.spyOn(server.store, "findUserByEmail").mockImplementationOnce(async (email) => {
        const found = await real(email);
        expect((await verify(ownerToken)).status).toBe(200);
        return found;
      });
      expect((await signUpAs(attacker)).status).toBe(201);
      expect((await signIn("attacker passphrase")).status).toBe(401);
      expect((await signIn()).status).toBe(200);
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
    it("verifies the account, starts no session and uses the token up (BE-AUDIT squatting)", async () => {
      await production();
      await signUp();
      const token = mail.tokenOf();
      const res = await verify(token);
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(await res.json()).toEqual({ account: null });
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

    it("stops mailing one address after 3 requests per 15 minutes but answers 204 as for an unknown one (PR 226 resend limiter)", async () => {
      await production();
      await signUp();
      for (let i = 0; i < 3; i++) expect((await resend()).status).toBe(204);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(4));
      const limited = await resend();
      expect(limited.status).toBe(204);
      expect(limited.headers.get("retry-after")).toBeNull();
      await new Promise((r) => setTimeout(r, 50));
      expect(mail.sent).toHaveLength(4);
    });

    it("does not count requests for an unknown address against it (BE-AUDIT mail abuse)", async () => {
      await production();
      for (let i = 0; i < 5; i++) expect((await resend("nobody@example.com")).status).toBe(204);
    });

    it("limits one client to 20 requests per hour", async () => {
      await production();
      for (let i = 0; i < 20; i++) expect((await resend(`user${i}@example.com`)).status).toBe(204);
      const limited = await resend("another@example.com");
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
    });
  });

  describe("tokens are bound to the credentials they were issued for (PR 226 delayed-token takeover)", () => {
    it("a duplicate sign-up while the first mail is being issued leaves the owner's credentials and one live link", async () => {
      await production();
      const real = server.store.createVerificationToken.bind(server.store);
      vi.spyOn(server.store, "createVerificationToken").mockImplementationOnce(async (...args) => {
        const repeated = await server.anonymous().request("POST", "/api/auth/signup", { ...credentials, password: "attacker passphrase" });
        expect(repeated.status).toBe(201);
        return real(...args);
      });
      expect((await signUp()).status).toBe(201);
      expect(mail.sent).toHaveLength(2);
      expect((await verify(mail.tokenOf(0))).status).toBe(400);
      expect((await verify(mail.tokenOf(1))).status).toBe(200);
      expect((await signIn("attacker passphrase")).status).toBe(401);
      expect((await signIn()).status).toBe(200);
    });

    it("refuses to store a token for a version the credentials have moved past", async () => {
      await production();
      await signUp();
      const user = (await server.store.findUserByEmail(credentials.email))!;
      const now = new Date(clock).toISOString();
      const later = new Date(clock + HOUR).toISOString();
      expect(await server.store.createPasswordResetToken(user.id, "reset-hash", now, later, user.credentialVersion)).toBe(true);
      expect(await server.store.consumePasswordResetToken("reset-hash", now, "$argon2id$reset")).not.toBeNull();
      expect(await server.store.createVerificationToken(user.id, "stale-hash", now, later, user.credentialVersion)).toBe(false);
      expect(await server.store.consumeVerificationToken("stale-hash", now)).toBeNull();
    });

    it("a verification link issued before a password reset stops working", async () => {
      await production();
      await signUp();
      const first = mail.tokenOf();
      const user = (await server.store.findUserByEmail(credentials.email))!;
      const now = new Date(clock).toISOString();
      await server.store.createPasswordResetToken(user.id, "reset-hash", now, new Date(clock + HOUR).toISOString(), user.credentialVersion);
      await server.store.consumePasswordResetToken("reset-hash", now, "$argon2id$reset");
      expect((await verify(first)).status).toBe(400);
    });
  });

  describe("stale unverified sweep follows the verification setting buildApp resolved (PR 226 sweep policy)", () => {
    const orphan = async () => {
      const user = await server.store.createUser({ id: randomUUID(), email: "orphan@example.com", displayName: "Orphan", passwordHash: "x" });
      return user.id;
    };

    it("deletes an old unverified user without a token when verification is on", async () => {
      server = await startServer(new MemoryRoomStore(), { now: () => Date.now() + 30 * 24 * HOUR, verification: { mailer: new Recorder() } });
      const id = await orphan();
      await server.app.sweep();
      expect(await server.store.findUserById(id)).toBeNull();
    });

    it("keeps it when buildApp was given no verification, whatever NODE_ENV says", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUST_PROXY", "1");
      server = await startServer(new MemoryRoomStore(), { now: () => Date.now() + 30 * 24 * HOUR, verification: null });
      const id = await orphan();
      await server.app.sweep();
      vi.unstubAllEnvs();
      expect(await server.store.findUserById(id)).not.toBeNull();
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
