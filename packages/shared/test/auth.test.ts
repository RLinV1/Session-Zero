import { describe, expect, it } from "vitest";
import { ChangePasswordRequest, EMAIL_UNVERIFIED_CODE, ForgotPasswordRequest, ResendVerificationRequest, ResetPasswordRequest, SignInRequest, SignUpRequest, VerifyEmailRequest } from "../src";

const valid = { email: "sam@example.com", password: "correct horse", displayName: "Sam" };

/** The field a failed parse names, so a 400 can say which input was wrong. */
const failedField = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? null : result.error!.issues[0]!.path[0];

describe("user accounts (FR-GM-01)", () => {
  describe("sign-up", () => {
    it("trims and lowercases the email, so case and spaces never make a second account", () => {
      const parsed = SignUpRequest.parse({ ...valid, email: "  Sam@Example.COM " });
      expect(parsed.email).toBe("sam@example.com");
    });

    it("accepts an email of 254 characters and refuses 255", () => {
      const at254 = `${"a".repeat(242)}@example.com`;
      expect(at254).toHaveLength(254);
      expect(SignUpRequest.safeParse({ ...valid, email: at254 }).success).toBe(true);
      expect(failedField(SignUpRequest.safeParse({ ...valid, email: `a${at254}` }))).toBe("email");
    });

    it("refuses something that is not an email address", () => {
      for (const email of ["sam", "sam@", "@example.com", "sam @example.com"]) {
        expect(failedField(SignUpRequest.safeParse({ ...valid, email }))).toBe("email");
      }
    });

    it("accepts passwords of 8 and 128 characters and refuses 7 and 129", () => {
      expect(SignUpRequest.safeParse({ ...valid, password: "x".repeat(8) }).success).toBe(true);
      expect(SignUpRequest.safeParse({ ...valid, password: "x".repeat(128) }).success).toBe(true);
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "x".repeat(7) }))).toBe("password");
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "x".repeat(129) }))).toBe("password");
    });

    it("has no composition rule beyond length", () => {
      expect(SignUpRequest.safeParse({ ...valid, password: "aaaaaaaa" }).success).toBe(true);
    });

    it("refuses a password equal to the email, in any case", () => {
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "sam@example.com" }))).toBe("password");
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "SAM@Example.com" }))).toBe("password");
    });

    it("trims the display name and refuses a blank or over-long one", () => {
      expect(SignUpRequest.parse({ ...valid, displayName: "  Sam  " }).displayName).toBe("Sam");
      expect(failedField(SignUpRequest.safeParse({ ...valid, displayName: "   " }))).toBe("displayName");
      expect(failedField(SignUpRequest.safeParse({ ...valid, displayName: "x".repeat(41) }))).toBe("displayName");
    });
  });

  describe("sign-in", () => {
    it("normalises the email the same way as sign-up", () => {
      expect(SignInRequest.parse({ email: " SAM@example.com", password: "x" }).email).toBe("sam@example.com");
    });

    it("checks only the password's presence and bound, never its rules", () => {
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "short" }).success).toBe(true);
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "" }).success).toBe(false);
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "x".repeat(129) }).success).toBe(false);
    });
  });

  describe("change password", () => {
    it("holds the new password to the sign-up rules", () => {
      expect(ChangePasswordRequest.safeParse({ currentPassword: "old", newPassword: "x".repeat(8) }).success).toBe(true);
      expect(failedField(ChangePasswordRequest.safeParse({ currentPassword: "old", newPassword: "short" }))).toBe(
        "newPassword",
      );
    });
  });
});

describe("email verification schemas (FR-GM-01)", () => {
  it("refuses an address that a mailer would read as a list or a display name at sign-up", () => {
    for (const email of ["x<ceo@company.com>@evil.com", "a,b@evil.com", "a;b@evil.com", 'a"b@evil.com', "a>b@evil.com"]) {
      expect(failedField(SignUpRequest.safeParse({ ...valid, email }))).toBe("email");
    }
    expect(SignUpRequest.safeParse({ ...valid, email: "sam.o+tag@example.com" }).success).toBe(true);
  });

  it("accepts a token of 20 to 128 characters and refuses 19 and 129", () => {
    expect(VerifyEmailRequest.safeParse({ token: "x".repeat(20) }).success).toBe(true);
    expect(VerifyEmailRequest.safeParse({ token: "x".repeat(128) }).success).toBe(true);
    expect(VerifyEmailRequest.safeParse({ token: "x".repeat(19) }).success).toBe(false);
    expect(VerifyEmailRequest.safeParse({ token: "x".repeat(129) }).success).toBe(false);
    expect(VerifyEmailRequest.safeParse({}).success).toBe(false);
  });

  it("trims and lowercases the email to resend to, and refuses a malformed one", () => {
    expect(ResendVerificationRequest.parse({ email: "  Sam@Example.COM " }).email).toBe("sam@example.com");
    expect(ResendVerificationRequest.safeParse({ email: "sam" }).success).toBe(false);
  });

  it("names the unverified sign-in code", () => {
    expect(EMAIL_UNVERIFIED_CODE).toBe("email_unverified");
  });
});

describe("password reset schemas (FR-GM-01)", () => {
  const token = "t".repeat(43);

  it("trims and lowercases the email asked about, and refuses a malformed one", () => {
    expect(ForgotPasswordRequest.parse({ email: "  Sam@Example.COM " }).email).toBe("sam@example.com");
    expect(failedField(ForgotPasswordRequest.safeParse({ email: "sam" }))).toBe("email");
  });

  it("accepts a token and a password of 8 to 128 characters", () => {
    expect(ResetPasswordRequest.safeParse({ token, password: "x".repeat(8) }).success).toBe(true);
    expect(ResetPasswordRequest.safeParse({ token, password: "x".repeat(128) }).success).toBe(true);
  });

  it("refuses a short or overlong password, naming the field", () => {
    expect(failedField(ResetPasswordRequest.safeParse({ token, password: "x".repeat(7) }))).toBe("password");
    expect(failedField(ResetPasswordRequest.safeParse({ token, password: "x".repeat(129) }))).toBe("password");
  });

  it("refuses a missing, short or overlong token", () => {
    expect(failedField(ResetPasswordRequest.safeParse({ password: "correct horse" }))).toBe("token");
    expect(failedField(ResetPasswordRequest.safeParse({ token: "short", password: "correct horse" }))).toBe("token");
    expect(failedField(ResetPasswordRequest.safeParse({ token: "t".repeat(129), password: "correct horse" }))).toBe("token");
  });
});
