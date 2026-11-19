## Context

See proposal.md for motivation. Today `POST /api/auth/signup` creates a user and starts a session at once (`apps/server/src/identity/routes.ts`). `IdentityStore` has memory and Postgres implementations. The server has no mail code. `CLIENT_ORIGIN` is the public origin and may hold a comma-separated list. Production-only behaviour already keys on `NODE_ENV === "production"` (`TRUST_PROXY`, S3, `seedDevAccount`), and a bad production configuration already refuses to boot.

## Goals / Non-Goals

**Goals:**
- Verification on in production, off elsewhere, decided by one function.
- One mail path that works with Resend today and any SMTP host later, by environment only.
- No new way to learn which addresses have accounts.

**Non-Goals:**
- Password reset, change-of-email verification and notification mail. The mailer is reusable for them but they are not built.
- A queue or retry service for mail. One send attempt; the person can resend.
- Verifying guests, who have no email.
- Domain-level mail features (DMARC reporting, inbound handling).

## Decisions

**D1. Mode is `NODE_ENV === "production"`, not a separate flag.** A pure `verificationRequired(env)` in `identity/` returns the answer and the mailer config together. Alternative: an `EMAIL_VERIFICATION=1` flag. Rejected because it adds a state in which production runs unverified by omission. Production without SMTP settings throws at startup, in the style of `trustProxyFromEnv`. Tests build the app in non-production mode by default and pass the mode explicitly where they test verification, as `buildApp` already takes `cookieSecure` and `now`.

**D2. SMTP through `nodemailer`, not a provider SDK.** Resend, SES, Brevo and Gmail all speak SMTP, so changing provider is an environment change. Alternative: Resend's HTTP API with `fetch`, which needs no dependency but ties the code to one vendor. Variables: `SMTP_HOST`, `SMTP_PORT` (default 465, secure), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. A small `Mailer` interface (`send({ to, subject, text, html })`) lets tests inject a recorder, as other adapters are injected into `buildApp`.

**D3. Tokens.** 32 random bytes, base64url in the link, SHA-256 stored, as sessions already do. Table `email_verification_tokens(token_hash pk, user_id fk, created_at, expires_at)` with 24 h expiry. A new token deletes the account's older rows; use deletes the row. Used rows are not kept, so there is no replay state to sweep. A token row is also deleted when the user is deleted (`deleteUser`) and an hourly sweep removes expired rows alongside the existing session sweep. Alternative: a signed token with no table. Rejected because it cannot be single-use or revoked by a resend.

**D4. Endpoints.**
- `POST /api/auth/signup`: unchanged in non-production. In production returns `201 { verificationRequired: true, email }` and no cookie.
- `POST /api/auth/verify { token }`: consumes the token, sets `email_verified_at`, starts a session, returns `MeResponse`. POST so scanners that GET the link cannot consume it. Invalid, expired and used tokens get one 400 answer.
- `POST /api/auth/verify/resend { email }`: always `204`; sends mail only for an existing unverified account. Limits: 3 per address per 15 minutes and 20 per client address per hour, in `accountLimits`, counted up front like sign-in.
- `POST /api/auth/signin`: after the password check passes, an unverified account in production gets `403 { error, code: "email_unverified" }` and no session. Wrong password and unknown address are unchanged (`SIGN_IN_FAILED`). So the code is learned only with the correct password.

**D5. Schema.** `users.email_verified_at timestamptz null`. Migration adds the column and backfills `now()` for every existing row, so the deploy locks nobody out. Memory store keeps the same field. `createUser` takes an optional `emailVerifiedAt`; non-production sign-up and `seedDevAccount` pass it. `AccountView` and `MeResponse` do not gain a field, because an unverified account never holds a session, so the web app never sees one. New shared schemas (`VerifyEmailRequest`, `ResendVerificationRequest`, `SignUpResponse`) are additions, not changes to existing ones; a short ADR still records the response shape change.

**D6. Link target.** First entry of `CLIENT_ORIGIN` plus `/verify-email?token=...`. Alternative: a new `PUBLIC_ORIGIN` variable. Rejected as a second source of truth for the same value; deployment already sets `CLIENT_ORIGIN` to the site address.

**D7. Mail text is a catalog id.** Subject and body go through the server catalog in `src/i18n` (ADR 0054), in the request's locale (`attachLocale`), with English and `zh-TW` entries and the glossary terms. HTML and plain text bodies are built from the same ids; the link is the only dynamic part and is not user-controlled.

**D8. Send failures never reveal state.** `Mailer.send` errors are caught and logged (error message only, never the token or link). Sign-up and resend answer as if sent. The person's recourse is the resend action.

**D9. Web.** `AccountPages.tsx` sign-up success shows the "check your email" panel in production; `accountStore.signUp` returns the new response type. A new `/verify-email` route posts the token once on mount (guarded against double effects) and then behaves like a successful sign-in. The sign-in form maps `code: "email_unverified"` to a message and the resend action. No literal strings: `t()` keys in English and zh-TW.

## Risks / Trade-offs

- [Production deploy before SMTP variables are set stops the server] → Intended fail-fast; `docs/DEPLOYMENT.md` lists the variables and the deploy order (set variables, then deploy).
- [Resend free tier is 100 emails a day] → Enough for class use; swapping to another SMTP host is an environment change.
- [Mail lands in spam] → The domain is verified in Resend with SPF and DKIM; the sender is on the same domain. Resend-link action covers the gap.
- [A user types the wrong email at sign-up and is stuck] → They can sign up again only with another address; the typo address stays registered. Accepted for now; change-of-email is a non-goal.
- [Sign-in distinguishes unverified from wrong password for callers with the right password] → Accepted: they have already proven the password, and the message is needed to be useful.
- [Per-address resend limit lets someone annoy a victim with 3 mails per 15 minutes] → The per-client limit and the "always 204" answer bound it; mail content is fixed and carries no attacker text.

## Migration Plan

1. Merge. Apply the Prisma migration on deploy: adds the column, backfills existing users, creates the token table.
2. Before restarting the production server, set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<Resend API key>`, `MAIL_FROM=noreply@sessionzero.codes`, and `CLIENT_ORIGIN=https://sessionzero.codes`.
3. Sign up once with a real address and confirm the email arrives and the link signs in.
4. Rollback: redeploy the previous image. The new column and table are unused by old code, so no data rollback is needed.
