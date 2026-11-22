# ADR 0081 — Sign-up recovery and password reset

**Status:** Proposed — awaiting review by the Real-Time Architecture owner.

**Requirements:** FR-GM-01 (accounts). **Change:** [signup-recovery-hardening](../../openspec/changes/signup-recovery-hardening/proposal.md). **Extends:** ADR 0076 (email verification).

## Context

In production a sign-up for an email that was registered but not yet verified replaced that account's password, so the owner verified an account carrying someone else's password. The replacement existed so an owner could reclaim an address a squatter registered first. There was no other recovery.

## Decision

1. **A repeat sign-up never changes the account.** In production it answers exactly like a new sign-up, `201 { verificationRequired: true, email }` with no cookie, and mails the owner instead: a fresh verification link for an unverified account, a "someone tried to sign up" notice for a verified one. Outside production the answer stays `409`, as no mail is sent there.
2. **One per-email limit.** Repeat sign-ups and `POST /api/auth/verify/resend` share the `resend:<email>` budget (3 per 15 minutes). Over it, the answer is unchanged and nothing is sent. Production no longer answers `409` for a registered email.
3. **Password reset.** `POST /api/auth/password/forgot { email }` always answers `204` and mails a link only for an existing account, limited per client address (20 per hour, `429`) and per email (3 per 15 minutes, silent). `POST /api/auth/password/reset { token, password }` sets the password, marks the email verified, ends every session, build pass and Studio grant of the account, and starts a new session. A bad token gets one `400`.
4. **Tokens.** 32 random bytes, SHA-256 stored in `password_reset_tokens`, one hour, single use, bound to the account's credential version. A new link replaces the earlier ones. A weak password is refused before the token is touched. The reset page posts only on submit, so scanners cannot consume the link.
5. **Development.** With no mailer, the forgot endpoint writes the link to the server log, never when `NODE_ENV=production`.
6. **Additive contract.** `ForgotPasswordRequest` and `ResetPasswordRequest` are new in `packages/shared/src/auth.ts`. No existing schema changes. `replaceUnverifiedCredentials` is removed from `IdentityStore`.

## Alternatives rejected

- **A "choose your password" link only for repeat sign-ups.** Reset covers the same rescue and serves forgotten passwords too.
- **One token table with a `purpose` column.** It changes an existing table and every query on it for little saved code.
