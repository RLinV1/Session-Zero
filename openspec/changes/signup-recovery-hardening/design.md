## Context

See proposal.md for why. Today `POST /api/auth/signup` hashes the password first, then tries `createUser`. On `EmailTakenError` it calls `replaceUnverifiedCredentials` for an unverified account (swap password, bump `credentialVersion`, issue a new verification token) or answers 409 for a verified one. Verification tokens live in `email_verification_tokens` with a `credential_version` column, so bumping the account's version kills earlier links. `POST /api/auth/verify/resend` already issues a link for an account's existing credentials, limited by `resendPerEmail` (3 per 15 minutes) and `resendPerIp`. Changing a password (`POST /api/auth/password`) sets the hash, ends other sessions, ends build passes and Studio grants. Mail is built from server catalog ids (ADR 0054) in `identity/verificationEmail.ts` and sent through the `EmailVerification` mailer. No password reset exists.

## Goals / Non-Goals

**Goals:**
- No request without the inbox can change who controls an account.
- A repeat sign-up response is indistinguishable from a fresh one in production.
- Password reset reuses the verification link machinery rather than adding a parallel one.

**Non-Goals:**
- Deleting stale unverified accounts (a scheduled cleanup can follow).
- Changing an account's email, magic-link sign-in, or two-factor sign-in.
- Response-time equality beyond what already exists (both paths already hash the password before the store call).

## Decisions

**D1. Repeat sign-up branch.** On `EmailTakenError` in production: look up the account, then hit `resendPerEmail` with the same key the resend endpoint uses (`resend:<email>`), so sign-up and resend share one budget. Within the limit, an unverified account gets `sendVerification` for its current `credentialVersion` (the same call resend makes, so earlier links die). A verified account gets the new "someone tried to sign up" notice. Either way the answer is `201 { verificationRequired: true, email }`, the same body as a fresh sign-up, sent after the mail call as the fresh path does. Outside production (no `verification`), keep today's 409. Alternative considered: a "choose your password" link only for repeat sign-ups. Rejected because password reset covers the same rescue and serves forgotten passwords too.

**D2. Reset tokens in their own table.** `password_reset_tokens (token_hash pk, user_id, created_at, expires_at, credential_version)`, a copy of the verification table's shape, with indexes on `user_id` and `expires_at` and a Prisma migration. Lifetime one hour (`RESET_LINK_LIFETIME_MS`). Alternative considered: one token table with a `purpose` column. Rejected because it changes an existing table and every query on it, for little saved code.

**D3. Store methods.** `IdentityStore` gains `createPasswordResetToken(userId, tokenHash, createdAt, expiresAt, credentialVersion): Promise<boolean>` (false when the version moved, same rule as `createVerificationToken`), `findUserByResetToken(tokenHash, now): Promise<UserRecord | null>` (read-only), and `consumePasswordResetToken(tokenHash, now, passwordHash): Promise<UserRecord | null>`. Consume runs in one transaction with the user row locked: the token must exist, be unexpired, and match the account's current `credentialVersion`. It then sets the hash and `passwordChangedAt`, sets `emailVerifiedAt` if null, increments `credentialVersion`, and deletes the account's reset and verification tokens. Memory store mirrors it. `replaceUnverifiedCredentials` is removed from the interface and both stores. Account deletion deletes reset tokens next to verification tokens.

**D4. Endpoints.**
- `POST /api/auth/password/forgot { email }`: `refused` on a new `resetRequestsPerIp` (20 per hour). Always answers 204. Sends only when an account exists and a new `resetRequestsPerEmail` (3 per 15 minutes) allows it. The mail goes out after the 204, as resend does. Outside production, where no mailer exists, the link is written to the server log instead (development only, never with `NODE_ENV=production`), so a developer can reset a local account.
- `POST /api/auth/password/reset { token, password }`: `refused` on a new `resetAttemptsPerIp` (30 per 15 minutes). Parse the schema, then run the common-password check. A too-short or too-common password returns a field error before the token is touched, so the token stays usable. Then a read-only `findUserByResetToken(tokenHash, now)` (same validity rules as consume). A null result returns one 400, "This reset link is invalid or has expired." A password equal to that account's email returns a field error, so the token survives. Then `consumePasswordResetToken`, where a null result (a race with another use) returns the same 400. On success: `sessions.endOthers(userId)` with no kept session, `endBuildPasses`, `endStudioGrants` (the same three calls as a password change), then `startSession` and `MeResponse`.

**D5. Shared schemas (additions).** `ForgotPasswordRequest { email }` with the same email rules as `SignUpRequest`, and `ResetPasswordRequest { token, password }` with the token rules of `VerifyEmailRequest` and the password rules of `SignUpRequest`. Exported from `packages/shared` with tests in `packages/shared/test/auth.test.ts`. No existing schema changes, so ADR 0081 is short and records the endpoints, the shared limit, and the dropped 409 in production.

**D6. Emails.** `identity/recoveryEmails.ts` builds two messages with the same escaping and link-base logic as `verificationEmail` (move `verificationLink`'s base handling into a shared `siteLink(clientOrigin, path, token?)`). Reset email: subject, intro, action, the link to `/reset-password?token=…`, the one-hour lifetime, and an ignore line. Notice email: subject, "someone tried to create an account with this email", a sign-in link (`/signin`), a reset request link (`/forgot-password`), and "if this was you, sign in; if not, you can ignore this". The catalog ids go in `apps/server/src/i18n/en.ts` and `zh-TW.ts`, with terms per `docs/GLOSSARY-zh-TW.md`.

**D7. Web.**
- Router: `/forgot-password` and `/reset-password` pages next to `verifyEmail`.
- Sign-in gets a "Forgot password?" link.
- The forgot page has one email field and then a fixed "If an account exists for that email, we sent a link" message.
- The reset page reads the token from the query and does nothing on load, so scanners don't consume it. It has one new-password field with the existing show-password control. It posts on submit, then `setAccount` and `navigate(DEFAULT_NEXT)`. A 400 shows "link no longer works" with a link to `/forgot-password`.
- API client methods go in `net/api.ts` and actions in `account/accountStore.ts`. All text goes through `t()` in the en and zh-TW catalogs.
- The production sign-up page needs no new branch: it already shows "check your email" for `verificationRequired`.

**D8. Tests first (FR-GM-01).** Server integration tests in `apps/server/test/emailVerification.test.ts` (rename the describe blocks that assert replacement) and a new `apps/server/test/passwordReset.test.ts`:
- takeover attempt (owner's password works after verify, attacker's never does, owner gets a fresh link)
- verified repeat sign-up (unchanged account, notice mail, sessions intact)
- shared per-email limit
- reset happy path (verifies the account, kills the squatter's link and password, ends old sessions)
- token reuse, expiry, supersede and unknown
- weak password keeps the token
- scanner-safe page
- unknown-email request is silent
- deletion removes reset tokens
- dev 409 unchanged

Store tests in `identityStore.test.ts` for both stores. A web unit test for the reset page's bad-token state, if the page has testable logic.

## Risks / Trade-offs

- [Inbox compromise now means account compromise] → This is the standard trade for email recovery. Reset ends every session, so the owner regains control the same way.
- [Reset token in the URL may land in proxy logs] → The verification link already carries its token the same way. Tokens are single-use and last one hour. The page loads no third-party resources, and `security-headers` already sets the referrer policy.
- [Someone spams reset or repeat sign-up mails to an address] → Per-email limit of 3 per 15 minutes per mail kind, plus per-address limits. The Resend quota is shared, so a server-wide daily cap stays a follow-up (audit finding 7).
- [A squatter's unverified account lingers] → The owner reclaims it with a reset. Automatic expiry is a non-goal here.

## Migration Plan

Deploy the Prisma migration with the server, as earlier identity changes did (the `migrate` service runs first). No backfill is needed. Rolling back the code leaves an unused table behind, which is harmless.
