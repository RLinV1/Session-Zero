## Why

Anyone can sign up on the live site with an email address they do not own, which lets one person hold accounts under other people's addresses and makes password-reset or notification mail impossible later. The live site needs proof that a sign-up address is reachable. Local development must stay frictionless: no mail server, no waiting for a link.

## What Changes

- In production (`NODE_ENV=production`), sign-up creates an unverified account, sends a one-time verification link to the address, and does not start a session. Sign-in is refused until the link is used.
- A new verify endpoint consumes the link's token, marks the account verified and starts a session. A resend endpoint sends a fresh link and invalidates earlier ones.
- Tokens are random, single-use, expire after 24 hours, and only their SHA-256 is stored.
- Mail is sent by SMTP (`nodemailer`), configured by `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. Production uses Resend (`smtp.resend.com`) with the sender `noreply@sessionzero.codes`. The server refuses to start in production without this configuration.
- Outside production nothing changes: sign-up marks the account verified at once, starts a session as today, and sends no mail. The seeded dev account is verified.
- Existing accounts are marked verified by the migration, so nobody is locked out on deploy.
- The web app gains a "check your email" screen after sign-up, a verify page that reads the link, a "resend link" action on it, and a sign-in message for an unverified account. All text goes through `t()` in English and zh-TW.
- The mail body is localized from the request's language, as other server text is (ADR 0054).
- Guest hosting, room invites, MCP seats and Studio grants are untouched: none of them depends on an unverified account.
- **BREAKING (production only)**: `POST /api/auth/signup` returns `{ verificationRequired: true }` with no session cookie instead of the signed-in account. Clients outside this repo that sign up through the API are affected; there are none known.

## Capabilities

### New Capabilities
- `email-verification`: when verification applies, how links are issued, expire and are consumed, how sign-in and sign-up behave until an address is verified, the dev bypass, and migration of existing accounts.

### Modified Capabilities

None. The account requirements still sit in the in-flight `user-accounts` change and have not been archived into `openspec/specs/`, so this change states its sign-up and sign-in rules in its own capability rather than as a delta.

## Impact

- `packages/shared`: new `VerifyEmailRequest`, `ResendVerificationRequest` and `SignUpResponse` schemas in `auth.ts`; a new sign-in error code for an unverified account. `AccountView` and `MeResponse` are unchanged.
- `apps/server`: Prisma migration (`users.email_verified_at`, backfilled; new `email_verification_tokens`); `IdentityStore` methods on the memory and Postgres stores; a mailer module; changes to `identity/routes.ts` and `app.ts`; new rate limiters; account deletion also removes tokens; new i18n catalog ids.
- `apps/web`: sign-up and sign-in forms, a verify page and route, i18n strings.
- Dependencies: adds `nodemailer` and `@types/nodemailer` to `apps/server`.
- Deployment: operator sets the SMTP env vars and `CLIENT_ORIGIN=https://sessionzero.codes` before deploying; `docs/DEPLOYMENT.md` documents them. The Resend domain and DNS records are already in place.
- Risk: a production deploy without the SMTP variables fails at startup by design.
