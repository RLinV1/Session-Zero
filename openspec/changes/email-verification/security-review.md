# Security review: email verification (pre-deploy)

Scope: uncommitted worktree changes against `proposal.md`, `design.md` and the spec. Read-only review; nothing was run (no tests, no servers). Line numbers are approximate, taken from the working copy.

Counts: critical 0, high 1, medium 4, low 7.

## Ranked findings

### H1. High: recipient address parsed by nodemailer, so the stored address and the mailed address can differ
- Where: `packages/shared/src/auth.ts:10-15` (`Email` regex `^[^@\s]+@[^@\s]+$`), `apps/server/src/identity/mailer.ts:58` (`transport.sendMail({ from, ...message })` with `to` a plain string), `apps/server/src/identity/verificationEmail.ts:87`.
- Failure: the regex allows `<`, `>`, `,`, `;`, `"` in the local part and `>` in the domain. nodemailer parses a string `to` as an RFC 5322 address list. Registering `x<ceo@company.com>` (exactly one `@`, no whitespace, so the schema accepts it) stores that string as the account email, but the mail goes to `ceo@company.com`. `y<ceo@company.com>`, `z<ceo@company.com>` and so on are all distinct accounts. Effects:
  1. The per-email limits (`resendPerEmail`, and the 409 on a duplicate address) are bypassed. Only `signUpPerIp` (50/hour) and `resendPerIp` (20/hour) bound it, per attacker IP. This is a working email-bombing and spam-from-your-domain primitive against any third party, with reputation and Resend quota damage.
  2. Pre-account-hijack: the attacker knows the password of an account whose token lands in the victim's inbox. If the victim clicks the link, the account becomes verified and the attacker signs in (see M1).
  Header injection by newline is NOT possible (`\s` is excluded, which covers CR and LF).
- Fix: (a) tighten `Email` to a conservative addr-spec (no `<>,;"()[]\:`; at most one `@`); this is also a shared-schema change, so it needs the ADR/owner review. (b) At the send boundary pass `to: { name: "", address }` (nodemailer then does not re-parse), and assert `address === user.email` before sending. (c) Add a test with `a<b@c.com>` and `a,b@c.com`.

### M1. Medium: pre-account-hijacking through sign-up on someone else's address
- Where: `apps/server/src/identity/routes.ts` sign-up (~99-124), 409 path, and verify (~137-146); design.md risk "typo address stays registered".
- Failure: attacker signs up `victim@x.com` with their own password. The account is unverified, and the victim receives a genuine "verify your email" mail. If the victim clicks it (many will, believing they signed up), the account is verified, the victim gets a session on it, and the attacker (who holds the password) signs in. A victim who later tries to register gets 409 and cannot use their own address. The design accepts the lock-out, but not the hijack.
- Fix: when sign-up hits an existing UNVERIFIED account, overwrite its password hash and display name with the new request's, invalidate older tokens, send a new link, and return the same 201 `verificationRequired` answer (no 409). Only verified accounts return 409. Optionally, on verify, end all other sessions of that user (none exist today, but this keeps it true if that changes).

### M2. Medium: SMTP quota exhaustion and domain-reputation abuse via sign-up
- Where: `routes.ts` sign-up (50/hour/IP via `signUpPerIp`, no global cap), `sendVerification` (awaited in-request, ~257); Resend free tier is 100 mails/day (design.md).
- Failure: two or three IPs (or one IPv6 /64 rotator; sign-up keys on the raw `req.ip`, not `addressKey`) burn the daily quota with throwaway addresses, so real users receive no verification mail and cannot sign in. Each mail also goes to an arbitrary third party, which risks the sender domain's reputation (spam complaints, Resend suspension).
- Fix: a global mail budget (for example `mailsPerDay`, below the provider quota, answering sign-up with 503 or deferring) and a per-`addressKey` limit on sign-up that counts, using `addressKey(req.ip)` instead of raw `req.ip`. Consider a CAPTCHA or proof-of-work at sign-up if abuse appears. Alert on provider 4xx/quota errors (they are logged only as `err.message`).

### M3. Medium: fail-open mode selection on `NODE_ENV`
- Where: `apps/server/src/identity/mailer.ts:63-65`, `app.ts` default `verificationFromEnv()`.
- Failure: only the exact string `production` turns verification on. `NODE_ENV=prod`, `Production`, unset, or a copy of the compose file without the env line silently makes sign-up create verified accounts with a session and no mail check. `docker-compose.prod.yml` sets `NODE_ENV: production` on both services (checked), so the shipped path is fine, but the failure is silent. The same exact-match convention is used elsewhere in the repo, so this is consistent, not new.
- Fix: log a loud startup line stating the mode ("email verification: ON/OFF") and refuse to start if `NODE_ENV` is set to a value other than `production`, `development` or `test`. Optionally require `EMAIL_VERIFICATION=off` to be explicit when running a non-development non-production build.

### M4. Medium: no rate limit on `POST /api/auth/verify`
- Where: `routes.ts` verify handler (~137-146).
- Failure: tokens are 256-bit, so guessing is infeasible, but each request still costs a Postgres transaction (a findUnique plus delete). Rate-limited only by Caddy's `/api/*` zone (500/10 s per IP). Low exploitability, but it is the only new unauthenticated DB-touching endpoint without an app-level limit.
- Fix: add a per-address limiter (for example 30/15 min), counted up front, using `addressKey`.

### L1. Low: Postgres consume and `markEmailVerified` are not one atomic step
- Where: `routes.ts` verify (~143-144); `postgresRoomStore.ts` `consumeVerificationToken`.
- Detail: single use under concurrency is correct (see passed checks). But the token is deleted in one transaction and `email_verified_at` is set afterwards in another. A crash or DB error between them burns the token and leaves the user unverified (recoverable through resend). Fix: set `email_verified_at` inside the same transaction (`consumeVerificationToken` returning the updated row).

### L2. Low: resend budget can be burned against a victim
- Where: `limits.resendPerEmail` (3 per 15 min, keyed on the target address, counted for any address).
- Detail: an attacker can keep a victim's resend budget at zero with 3 requests per 15 minutes from one IP, so the victim cannot ask for a fresh link. Accepted in design.md as a trade-off; note it. Fix (optional): key the budget on `(email, addressKey)` plus a looser per-email cap.

### L3. Low: sign-in discloses "unverified" to anyone holding the password
- Where: `routes.ts` signin (~178-180). Accepted in design D4/risks. The 403 comes only after the password verifies (hash cost is the same as any real account), so it is not an enumeration oracle. No action needed beyond keeping the order (password check first).

### L4. Low: sign-up still answers 409 `field: "email"` for existing addresses
- Where: `routes.ts` sign-up catch of `EmailTakenError`. This enumeration existed before the change, and design.md ("no new way to learn which addresses have accounts") holds only because of it. If the goal is real non-enumeration, the sign-up must answer the same 201 for existing accounts (and mail the owner a "you already have an account" note). Note also the timing gap: a new address costs an argon2 hash plus a mail send, an existing one is a fast 409.

### L5. Low: deploy-window users and old code
- Where: migration SQL. The column has no default, so old-image code that creates users during the migrate-then-restart window writes `NULL` (unverified) rows with no token. They can recover through resend (works for any unverified account), so nobody is permanently locked out. Run the migration and the restart back to back, and re-run `UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL AND created_at < <deploy time>` right after the new image is up if there was a gap.

### L6. Low: SMTP secret in cloud metadata and state
- Where: `deploy/terraform*/main.tf` and the `*.tftpl` files. `smtp_pass` is `sensitive = true` in both `variables.tf` (good, no default), but it is rendered into user_data (AWS) and the startup-script metadata (GCP) and so is also in Terraform state in plaintext, readable by anyone who can read instance metadata or state. This matches how the Postgres and S3 secrets are already handled, so it is no regression. Fix when convenient: a secret manager (SSM Parameter Store or Secret Manager) fetched at boot, and a remote encrypted state backend.

### L7. Low: error logging of nodemailer messages
- Where: `routes.ts:~262` logs `err.message` for send failures. nodemailer messages can include the recipient address and SMTP server reply text (not the password, and not the token or link, since neither is in the message), so this is PII-adjacent but not a secret leak. The privacy page claims addresses are not kept in logs; strip the address from the logged message or log only `err.code`.

## Checks that passed with nothing to report

1. Token randomness and length: `randomBytes(32)` base64url (256 bits), CSPRNG. Only SHA-256 is stored (`hashToken`); the raw token exists only in the mail body and link. Request schema bounds `min(20).max(128)`.
2. Single use under concurrency (Postgres): inside a transaction, `deleteMany({ where: { tokenHash } })` is the arbiter; a concurrent loser blocks on the row lock, then sees `count === 0` and returns null. Memory store is synchronous. Expired tokens are deleted and refused.
3. Expiry and clock: expiry is written and checked with the injected `now`. Memory-store comparison uses ISO strings of equal format, so ordering is correct.
4. Supersede by resend: `createVerificationToken` deletes the user's earlier rows (a Postgres `$transaction`, and the memory map). A rare concurrent double-create could leave two valid tokens; harmless.
5. Token never returned or logged: no response contains it, errors are one fixed message (400 on any invalid, used or expired token), the log line prints only `err.message`, and the web page removes it from the URL after success (`navigate(..., { replace: true })`).
6. Resend enumeration: the 204 is sent before the lookup and the send; the per-email and per-IP limits are counted for any address, existing or not, so status code and timing do not differ.
7. Sign-in enumeration: unknown users take the `verifyAgainstDummy` path; wrong password for unverified and verified accounts both return the same 401. The 403 appears only after a correct password.
8. Session creation: the only `sessions.start` caller is `startSession` in `identity/routes.ts` (sign-up outside production, verify, sign-in). `createUser` is called only from sign-up and `seedDevAccount`. Socket handshake, Studio and MCP resolve an existing session cookie, so they cannot create one for an unverified account. Mode is a server-side constant of `NODE_ENV` set at startup; no header, body or query parameter can switch it.
9. Dev bypass: `seedDevAccount` refuses when `NODE_ENV === "production"` and only runs with `SEED_DEV_ACCOUNT=1`; the seeded account is verified, so it is useless in production anyway.
10. Link construction: only the first `CLIENT_ORIGIN` entry and `encodeURIComponent(token)`; `Host`, `X-Forwarded-*` and request body play no part. `docker-compose.prod.yml` requires `CLIENT_ORIGIN` (`:?`). The HTML mail escapes `& < > "`, and the only dynamic values are the link and fixed catalog text (no display name or email is interpolated into the body or subject). Subject comes from the catalog.
11. Open redirect via `next`: `safeNext` rejects `//`, `/\` and absolute origins; the verify page uses it.
12. CSRF and content type: both new endpoints require `application/json` (415 otherwise), so cross-site form posts fail; cross-site `fetch` with JSON needs a preflight the server does not grant; `requireSameOrigin` still guards cookie-bearing posts; every handler sets `Cache-Control: no-store`. Verify is POST, so link scanners that GET the page cannot consume the token. Body limit 64kb (`express.json`).
13. Limiter memory: all `accountLimits()` limiters, including the two new ones, are swept every 60 s in `app.ts`.
14. Secrets: `mailConfigFromEnv` errors name the missing variable names and the port value only, never `SMTP_PASS`; `.env` example has `SMTP_PASS=` blank; the tfvars examples show a placeholder; `smtp_pass` is `sensitive` and has no default in both terraform stacks; the heredoc is quoted (`'ENVEOF'`) so the shell does not expand the value.
15. Migration: additive; `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP` backfills every existing user in the same migration, so nobody is locked out; token table has the PK on the hash, `user_id` and `expires_at` indexes, and an FK `ON DELETE RESTRICT` that is respected because `deleteUser` removes tokens before the user (Postgres and memory both). Rollback is data-safe (old code ignores the column and table).
16. Existing invariants: no `Command`/`decide`/`reduce` path touched; no room data in new payloads, so the visibility filters are unaffected; the existing sign-in limits (`signInPerIp`, `signInFailuresPerEmail`) keep their order and counting. The 403 is returned after `signInFailuresPerEmail.reset`, which is acceptable because the password was correct.

## Not verified

- Nothing was executed. The Postgres race analysis is from reading the code under the default Read Committed isolation; it is worth one integration test with two parallel `verify` calls against a real Postgres.
- Whether nodemailer 10.6.0 treats `to` as in H1: behaviour of its address parser is from knowledge of the library, not a run; confirm with a one-line test that sends `x<a@b.com>` through a stub transport (`jsonTransport`).
- Caddy and Resend account settings (SPF/DKIM, bounce handling) are outside this diff.
