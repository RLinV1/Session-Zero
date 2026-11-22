import { z } from "zod";
import { sharedMsg, validationMessage } from "./i18n";

/**
 * Account wire schemas (FR-GM-01, ADR 0017). Accounts belong to people, not roles, and none of
 * this ever enters room state: the room kernel only knows participants.
 */

/** Trimmed and lowercased, so `Sam@Example.com ` and `sam@example.com` are one account. */
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { message: validationMessage(sharedMsg("valid.emailTooLong", { max: 254 })) })
  .regex(/^[^@\s]+@[^@\s]+$/, { message: validationMessage(sharedMsg("valid.email")) });

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Length only, as NIST 800-63B advises. The cap also bounds the hashing work per request. */
export const Password = z
  .string()
  .min(PASSWORD_MIN, { message: validationMessage(sharedMsg("valid.passwordTooShort", { min: PASSWORD_MIN })) })
  .max(PASSWORD_MAX, { message: validationMessage(sharedMsg("valid.passwordTooLong", { max: PASSWORD_MAX })) });

/** The account's name. A room still uses the display name given for that room. */
export const AccountDisplayName = z
  .string()
  .trim()
  .min(1, { message: validationMessage(sharedMsg("valid.displayNameBlank")) })
  .max(40, { message: validationMessage(sharedMsg("valid.displayNameTooLong", { max: 40 })) });

export const SignUpRequest = z
  .object({
    email: Email.refine((e) => !/[<>,;"\s]/.test(e.slice(0, e.lastIndexOf("@"))), {
      message: validationMessage(sharedMsg("valid.email")),
    }),
    password: Password,
    displayName: AccountDisplayName,
  })
  .refine((r) => r.password.trim().toLowerCase() !== r.email, {
    message: validationMessage(sharedMsg("valid.passwordIsEmail")),
    path: ["password"],
  });
export type SignUpRequest = z.infer<typeof SignUpRequest>;

/** Sign-in checks only shape; a wrong password and an unknown email get the same answer. */
export const SignInRequest = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

export const VerifyEmailRequest = z.object({ token: z.string().min(20).max(128) });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequest>;

export const ResendVerificationRequest = z.object({ email: Email });
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequest>;

export const ForgotPasswordRequest = z.object({ email: Email });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>;

export const ResetPasswordRequest = z.object({ token: z.string().min(20).max(128), password: Password });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export interface SignUpResponse {
  verificationRequired: true;
  email: string;
}

export const EMAIL_UNVERIFIED_CODE = "email_unverified";

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
export const SIGN_IN_FAILED = validationMessage(sharedMsg("auth.signInFailed"));

/** What a legacy GM device token owns (`GET /api/gm/legacy`), and what a claim moved. */
export interface LegacySummary {
  rooms: number;
  assets: number;
  creatures: number;
  diceLooks: number;
  /** True for a guest identity (guest-gm-hosting D1); false for a pre-account device or an account. */
  guest: boolean;
}
