import { describe, expect, it, vi } from "vitest";
import { mailConfigFromEnv, smtpMailer, verificationFromEnv, verificationRequired } from "../src/identity/mailer";
import { buildApp } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const full = {
  SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "465",
  SMTP_USER: "resend",
  SMTP_PASS: "re_key",
  MAIL_FROM: "noreply@sessionzero.codes",
};

describe("mail configuration (FR-GM-01)", () => {
  it("sends to exactly one plain address", async () => {
    const nodemailer = (await import("nodemailer")).default;
    const sendMail = vi.fn(async () => ({}));
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);
    await smtpMailer(mailConfigFromEnv(full)).send({ to: "x<ceo@company.com>@evil.com", subject: "s", text: "t", html: "h" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: { name: "", address: "x<ceo@company.com>@evil.com" } }));
    vi.restoreAllMocks();
  });

  it("reads a full environment", () => {
    expect(mailConfigFromEnv(full)).toEqual({
      host: "smtp.resend.com", port: 465, user: "resend", pass: "re_key", from: "noreply@sessionzero.codes",
    });
  });

  it("names every missing variable", () => {
    expect(() => mailConfigFromEnv({})).toThrow(/SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM/);
    expect(() => mailConfigFromEnv({ ...full, SMTP_PASS: "", MAIL_FROM: undefined })).toThrow(/SMTP_PASS, MAIL_FROM/);
    expect(() => mailConfigFromEnv({ ...full, SMTP_HOST: undefined })).toThrow(/missing SMTP_HOST$/);
  });

  it("refuses a port that is not a number", () => {
    expect(() => mailConfigFromEnv({ ...full, SMTP_PORT: "smtp" })).toThrow(/SMTP_PORT/);
  });

  it("requires verification in production only", () => {
    expect(verificationRequired({ NODE_ENV: "production" })).toBe(true);
    expect(verificationRequired({ NODE_ENV: "development" })).toBe(false);
    expect(verificationRequired({})).toBe(false);
  });

  it("refuses to start in production without mail settings and builds a mailer with them", () => {
    expect(() => verificationFromEnv({ NODE_ENV: "production" })).toThrow(/missing SMTP_HOST/);
    expect(verificationFromEnv({ NODE_ENV: "production", ...full })?.mailer.send).toBeTypeOf("function");
    expect(verificationFromEnv({})).toBeNull();
  });

  it("makes buildApp throw in production mode without mail settings, and not otherwise", async () => {
    const saved = { ...process.env };
    try {
      for (const name of Object.keys(full)) delete process.env[name];
      process.env.NODE_ENV = "production";
      await expect(buildApp({ store: new MemoryRoomStore(), uploadDir: "." })).rejects.toThrow(/missing SMTP_HOST/);
      process.env.NODE_ENV = "test";
      const app = await buildApp({ store: new MemoryRoomStore(), uploadDir: ".", wallQueue: null, studio: null });
      await app.close().catch(() => undefined);
    } finally {
      process.env = saved;
    }
  });
});
