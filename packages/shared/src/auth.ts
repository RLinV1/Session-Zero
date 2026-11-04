import { z } from "zod";

/**
 * Account wire schemas (FR-GM-01, ADR 0017). Accounts belong to people, not roles, and none of
 * this ever enters room state: the room kernel only knows participants.
 */

/** Trimmed and lowercased, so `Sam@Example.com ` and `sam@example.com` are one account. */
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { message: "Email must be 254 characters or fewer" })
  .regex(/^[^@\s]+@[^@\s]+$/, { message: "Enter an email address like name@example.com" });

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Length only, as NIST 800-63B advises. The cap also bounds the hashing work per request. */
export const Password = z
  .string()
  .min(PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters` })
  .max(PASSWORD_MAX, { message: `Password must be ${PASSWORD_MAX} characters or fewer` });

/** The account's name. A room still uses the display name given for that room. */
export const AccountDisplayName = z
  .string()
  .trim()
  .min(1, { message: "Display name can't be blank" })
  .max(40, { message: "Display name must be 40 characters or fewer" });

export const SignUpRequest = z
  .object({ email: Email, password: Password, displayName: AccountDisplayName })
  .refine((r) => r.password.trim().toLowerCase() !== r.email, {
    message: "Password can't be your email address",
    path: ["password"],
  });
export type SignUpRequest = z.infer<typeof SignUpRequest>;

/** Sign-in checks only shape; a wrong password and an unknown email get the same answer. */
export const SignInRequest = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: Password,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

/** Deleting an account re-asks for the password, as a password change does. */
export const DeleteAccountRequest = z.object({
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/** Everything about an account that ever leaves the server. */
export interface AccountView {
  id: string;
  email: string;
  displayName: string;
}

/** `GET /api/auth/me`: null when signed out, which is a normal state, not an error. */
export interface MeResponse {
  account: AccountView | null;
}

/** The one message for a failed sign-in, whatever the reason (non-enumeration). */
export const SIGN_IN_FAILED = "Email or password is incorrect.";

/** What a legacy GM device token owns (`GET /api/gm/legacy`), and what a claim moved. */
export interface LegacySummary {
  rooms: number;
  assets: number;
  creatures: number;
  diceLooks: number;
}
