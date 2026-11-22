import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailMessage, Mailer } from "../src/identity/mailer";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer } from "./helpers";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ORIGIN = "https://sessionzero.codes";
const INVALID = "This reset link is invalid or has expired.";

class Recorder implements Mailer {
  sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  tokenOf(index = this.sent.length - 1) {
    const match = this.sent[index]!.text.match(/token=([^\s]+)/);
    return decodeURIComponent(match![1]!);
  }
}

describe("password reset (FR-GM-01)", () => {
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
  const newPassword = "brand new passphrase";
  const signUp = (body = credentials) => server.anonymous().request("POST", "/api/auth/signup", body);
  const verify = (token: string) => server.anonymous().request("POST", "/api/auth/verify", { token });
  const signIn = (password = credentials.password, email = credentials.email) =>
    server.anonymous().request("POST", "/api/auth/signin", { email, password });
  const forgot = (email = credentials.email, headers: Record<string, string> = {}) =>
    server.anonymous().request("POST", "/api/auth/password/forgot", { email }, headers);
  const reset = (token: string, password = newPassword, client = server.anonymous()) =>
    client.request("POST", "/api/auth/password/reset", { token, password });
  const settle = () => new Promise((r) => setTimeout(r, 50));

  async function verifiedOwner() {
    await production();
    await signUp();
    await verify(mail.tokenOf());
    mail.sent.length = 0;
  }

  async function requestLink() {
    const before = mail.sent.length;
    expect((await forgot()).status).toBe(204);
    await vi.waitFor(() => expect(mail.sent).toHaveLength(before + 1));
    return mail.tokenOf();
  }

  describe("request", () => {
    it("answers 204 and mails a reset link to the reset page for an existing account", async () => {
      await verifiedOwner();
      const res = await forgot();
      expect(res.status).toBe(204);
      expect(res.headers.getSetCookie()).toEqual([]);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
      expect(mail.sent[0]!.to).toBe("sam@example.com");
      expect(mail.sent[0]!.text).toContain(`${ORIGIN}/reset-password?token=`);
      expect(mail.sent[0]!.html).toContain(`${ORIGIN}/reset-password?token=`);
    });

    it("mails a link for an unverified account too", async () => {
      await production();
      await signUp();
      mail.sent.length = 0;
      await forgot();
      await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
      expect(mail.sent[0]!.text).toContain("/reset-password?token=");
    });

    it("answers an unknown address identically and sends nothing", async () => {
      await verifiedOwner();
      const known = await forgot();
      const unknown = await forgot("nobody@example.com");
      expect(unknown.status).toBe(known.status);
      expect(await unknown.text()).toBe(await known.text());
      await settle();
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent.every((m) => m.to === "sam@example.com")).toBe(true);
    });

    it("answers 400 only for a malformed body", async () => {
      await production();
      expect((await forgot("not-an-email")).status).toBe(400);
    });

    it("writes the mail in Traditional Chinese for a request that asks for it", async () => {
      await verifiedOwner();
      await forgot(credentials.email, { "accept-language": "zh-TW" });
      await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
      expect(mail.sent[0]!.subject).not.toBe("Reset your Session Zero password");
      expect(mail.sent[0]!.subject).toMatch(/[一-鿿]/);
    });

    it("stops mailing one address after 3 requests per 15 minutes but still answers 204, then frees it after the window", async () => {
      await verifiedOwner();
      for (let i = 0; i < 3; i++) expect((await forgot()).status).toBe(204);
      await vi.waitFor(() => expect(mail.sent).toHaveLength(3));
      const limited = await forgot();
      expect(limited.status).toBe(204);
      expect(limited.headers.get("retry-after")).toBeNull();
      await settle();
      expect(mail.sent).toHaveLength(3);
      clock += 16 * MINUTE;
      await forgot();
      await vi.waitFor(() => expect(mail.sent).toHaveLength(4));
    });

    it("answers 429 with Retry-After after 20 requests per hour from one client and frees them after the window", async () => {
      await production();
      for (let i = 0; i < 20; i++) expect((await forgot(`user${i}@example.com`)).status).toBe(204);
      const limited = await forgot("another@example.com");
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
      clock += HOUR + MINUTE;
      expect((await forgot("another@example.com")).status).toBe(204);
    });

    it("a newer link makes the earlier one stop working", async () => {
      await verifiedOwner();
      const first = await requestLink();
      const second = await requestLink();
      expect((await reset(first)).status).toBe(400);
      expect((await reset(second)).status).toBe(200);
    });
  });

  describe("reset", () => {
    it("sets the password, starts a signed-in session and answers with the account", async () => {
      await verifiedOwner();
      const token = await requestLink();
      const client = server.anonymous();
      const res = await reset(token, newPassword, client);
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().join(";")).toMatch(/vtt_session=/);
      expect(await res.json()).toMatchObject({ account: { email: "sam@example.com" } });
      expect(await client.me()).not.toBeNull();
      expect((await signIn(newPassword)).status).toBe(200);
      expect((await signIn()).status).toBe(401);
    });

    it("lets the owner reclaim an address a squatter signed up with: verified, squatter's password and link dead", async () => {
      await production();
      await signUp({ ...credentials, password: "squatter passphrase" });
      const squatterLink = mail.tokenOf();
      expect((await signIn("squatter passphrase")).status).toBe(403);
      const token = await requestLink();
      expect((await reset(token)).status).toBe(200);
      expect((await server.store.findUserByEmail(credentials.email))!.emailVerifiedAt).not.toBeNull();
      expect((await signIn("squatter passphrase")).status).toBe(401);
      expect((await signIn(newPassword)).status).toBe(200);
      expect((await verify(squatterLink)).status).toBe(400);
    });

    it("ends every earlier session of the account and keeps only the one the reset started", async () => {
      await verifiedOwner();
      const phone = await server.signIn(credentials.email, credentials.password);
      const laptop = await server.signIn(credentials.email, credentials.password);
      const token = await requestLink();
      const fresh = server.anonymous();
      expect((await reset(token, newPassword, fresh)).status).toBe(200);
      expect(await phone.me()).toBeNull();
      expect(await laptop.me()).toBeNull();
      expect(await fresh.me()).not.toBeNull();
    });

    it("ends build passes and Studio grants like a password change", async () => {
      await verifiedOwner();
      const user = (await server.store.findUserByEmail(credentials.email))!;
      const passes = vi.spyOn(server.store, "endBuildPasses");
      const grants = vi.spyOn(server.store, "endStudioGrants");
      expect((await reset(await requestLink())).status).toBe(200);
      expect(passes).toHaveBeenCalledWith(user.ownerId);
      expect(grants).toHaveBeenCalledWith(user.ownerId, expect.any(String));
    });

    it("makes outstanding verification and reset links stop working", async () => {
      await production();
      await signUp();
      const verification = mail.tokenOf();
      const token = await requestLink();
      expect((await reset(token)).status).toBe(200);
      expect((await verify(verification)).status).toBe(400);
      expect((await reset(token, "another passphrase")).status).toBe(400);
    });

    it("uses the token up: a second submit is refused and the password stays", async () => {
      await verifiedOwner();
      const token = await requestLink();
      expect((await reset(token)).status).toBe(200);
      expect((await reset(token, "second passphrase")).status).toBe(400);
      expect((await signIn(newPassword)).status).toBe(200);
      expect((await signIn("second passphrase")).status).toBe(401);
    });

    it("refuses an expired token one hour after it was issued", async () => {
      await verifiedOwner();
      const token = await requestLink();
      clock += HOUR + 1;
      const res = await reset(token);
      expect(res.status).toBe(400);
      expect((await signIn()).status).toBe(200);
    });

    it("keeps the token usable after a too-short, too-common or email-equal password", async () => {
      await verifiedOwner();
      const token = await requestLink();
      for (const password of ["short", "sessionzero1", credentials.email]) {
        const res = await reset(token, password);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ field: "password" });
        expect(res.headers.getSetCookie()).toEqual([]);
      }
      expect((await signIn()).status).toBe(200);
      expect((await reset(token)).status).toBe(200);
    });

    it("answers unknown, malformed, used, superseded and expired tokens with one 400 body", async () => {
      await verifiedOwner();
      const used = await requestLink();
      await reset(used);
      const superseded = await requestLink();
      await requestLink();
      const expired = mail.tokenOf();
      clock += HOUR + 1;
      const bodies = [];
      for (const token of ["x".repeat(43), "short", used, superseded, expired]) {
        const res = await reset(token);
        bodies.push({ status: res.status, body: await res.json() });
      }
      expect(bodies[0]).toEqual({ status: 400, body: { error: INVALID } });
      for (const answer of bodies) expect(answer).toEqual(bodies[0]);
    });

    it("limits one client to 30 reset attempts per 15 minutes and frees them after the window", async () => {
      await production();
      for (let i = 0; i < 30; i++) expect((await reset("x".repeat(43))).status).toBe(400);
      const limited = await reset("x".repeat(43));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
      clock += 16 * MINUTE;
      expect((await reset("x".repeat(43))).status).toBe(400);
    });

    it("refuses a non-JSON body", async () => {
      await production();
      const res = await fetch(`${server.base}/api/auth/password/reset`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
      expect(res.status).toBe(415);
    });

    it("is not consumed by a GET of the reset page route (scanner-safe)", async () => {
      await verifiedOwner();
      const token = await requestLink();
      await fetch(`${server.base}/reset-password?token=${encodeURIComponent(token)}`);
      expect((await reset(token)).status).toBe(200);
    });

    it("is gone with the account: deleting it removes its reset links", async () => {
      await verifiedOwner();
      const token = await requestLink();
      const owner = await server.signIn(credentials.email, credentials.password);
      expect((await owner.request("DELETE", "/api/auth/account", { password: credentials.password })).status).toBe(204);
      expect((await reset(token)).status).toBe(400);
      expect(await server.store.findUserByEmail(credentials.email)).toBeNull();
    });
  });

  describe("development (no mail configured)", () => {
    it("logs the reset link instead of mailing it and never in production", async () => {
      server = await startServer();
      await server.signUp({ email: "sam@example.com" });
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      expect((await forgot()).status).toBe(204);
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      const line = String(log.mock.calls[0]![0]);
      expect(line).toContain("/reset-password?token=");
      const token = decodeURIComponent(line.match(/token=([^\s]+)/)![1]!);
      expect((await reset(token)).status).toBe(200);
    });

    it("logs nothing when NODE_ENV is production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUST_PROXY", "1");
      server = await startServer();
      await server.signUp({ email: "sam@example.com" });
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      expect((await forgot()).status).toBe(204);
      await settle();
      expect(log).not.toHaveBeenCalled();
    });
  });
});
