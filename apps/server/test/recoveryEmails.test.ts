import { describe, expect, it } from "vitest";
import { resetEmail, resetLink, signUpNoticeEmail } from "../src/identity/recoveryEmails";

const ORIGIN = "https://sessionzero.codes";

describe("recovery emails (FR-GM-01)", () => {
  it("links the reset page on the configured origin, using the first of several and no trailing slash", () => {
    expect(resetLink(`${ORIGIN}/, http://localhost:5173`, "abc")).toBe(`${ORIGIN}/reset-password?token=abc`);
  });

  it("encodes the token in the link", () => {
    expect(resetLink(ORIGIN, "a b&c")).toBe(`${ORIGIN}/reset-password?token=a%20b%26c`);
  });

  it("puts the link in both the text and the html of the reset email", () => {
    const mail = resetEmail("en", "sam@example.com", resetLink(ORIGIN, "abc"));
    expect(mail.to).toBe("sam@example.com");
    expect(mail.text).toContain(`${ORIGIN}/reset-password?token=abc`);
    expect(mail.html).toContain(`href="${ORIGIN}/reset-password?token=abc"`);
  });

  it("escapes the link in the html", () => {
    const mail = resetEmail("en", "sam@example.com", `${ORIGIN}/reset-password?token="><script>&`);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&quot;&gt;&lt;script&gt;&amp;");
  });

  it("links sign-in and the forgot-password page in the notice, with no token", () => {
    const mail = signUpNoticeEmail("en", "sam@example.com", ORIGIN);
    expect(mail.text).toContain(`${ORIGIN}/signin`);
    expect(mail.text).toContain(`${ORIGIN}/forgot-password`);
    expect(mail.text).not.toContain("token=");
    expect(mail.html).toContain(`href="${ORIGIN}/forgot-password"`);
  });

  it("writes Traditional Chinese subjects that differ from the English ones", () => {
    expect(resetEmail("zh-TW", "a@b.co", "x").subject).not.toBe(resetEmail("en", "a@b.co", "x").subject);
    expect(signUpNoticeEmail("zh-TW", "a@b.co", ORIGIN).subject).not.toBe(signUpNoticeEmail("en", "a@b.co", ORIGIN).subject);
    expect(signUpNoticeEmail("zh-TW", "a@b.co", ORIGIN).subject).toBe("有人嘗試使用你的電子郵件地址註冊");
  });
});
