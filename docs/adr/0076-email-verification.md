# ADR 0076 — Email verification in production

**Status:** Proposed — awaiting review by the Real-Time Architecture owner.

**Requirements:** FR-GM-01 (accounts). **Change:** [email-verification](../../openspec/changes/email-verification/proposal.md). **Extends:** ADR 0017 (accounts and sessions).

## Context

Anyone can sign up on the live site with an address they do not own. Local development must stay free of mail servers and waiting.

## Decision

1. **Verification applies when `NODE_ENV=production`, and only then.** One pure function decides it. In production the server refuses to start unless `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are set.
2. **`POST /api/auth/signup` answers differently in production.** Outside production it is unchanged: `201 MeResponse` and a session cookie. In production it answers `201 { verificationRequired: true, email }` and sets no cookie. This is a breaking change for any API client that signs up and expects a session; none outside this repository is known.
3. **New endpoints.** `POST /api/auth/verify { token }` consumes a link's token and answers `200 MeResponse` with a session cookie, or one `400` for an unknown, expired or used token. `POST /api/auth/verify/resend { email }` always answers `204`, sends mail only for an existing unverified account, and is rate limited (`429`).
4. **Sign-in.** In production an unverified account that gives the correct password gets `403 { error, code: "email_unverified" }` and no session. A wrong password or unknown address is unchanged.
5. **Tokens.** 32 random bytes, base64url in the link, SHA-256 stored, 24 hours, single use. Issuing a new token deletes the account's older ones.
6. **Additive contract.** `VerifyEmailRequest`, `ResendVerificationRequest`, `SignUpResponse` and `EMAIL_UNVERIFIED_CODE` are new in `packages/shared/src/auth.ts`. `AccountView` and `MeResponse` do not change, because an unverified account never holds a session.
7. **Existing accounts are verified by the migration.**

## Alternatives rejected

- **An `EMAIL_VERIFICATION` flag.** Production could then run unverified by omission.
- **A signed token with no table.** It could be neither single-use nor revoked by a resend.
- **Verifying on GET.** Mail scanners that fetch the link would consume it; the page posts the token instead.
