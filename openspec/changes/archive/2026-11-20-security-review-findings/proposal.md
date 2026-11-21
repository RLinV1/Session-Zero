## Why

A security review on 2026-11-13 read the code and sent 19 read-only requests to https://sessionzero.codes. It found nothing critical or high, but it did find one medium gap and four low ones:

1. **Medium: HTML pages send no browser security headers.** `/` has no Content-Security-Policy, Strict-Transport-Security, X-Frame-Options / `frame-ancestors`, X-Content-Type-Options or Referrer-Policy. Only `/api/*` sets nosniff, no-referrer and no-store (`apps/server/src/app.ts`), and `deploy/Caddyfile` sets no headers. Any site can frame the app (clickjacking a GM's controls), a future XSS has no policy to contain it, and a first visit over http can be downgraded.
2. **Low: no cap on rooms per account.** `POST /api/rooms` only requires an account. A signed-in account can create rooms in bulk, and every room grows the database and the event log.
3. **Low: sign-up says when an email is taken.** It returns 409 with `field: "email"`, so anyone can test whether an address has an account, at up to 50 tries per address per hour. The app cannot send email, and the owner decided that sign-up should not need email verification for now. So the disclosure is accepted and the existing sign-up limit is kept.
4. **Low: `npm audit --omit=dev` reports 3 high issues.** `prisma` and `@prisma/config` 6.19.3 pull in `deepmerge-ts` 7.1.5, which has a stack-exhaustion advisory (GHSA-ggr8-5vv4-36mx). Prisma is a dev dependency, but the server image runs `prisma generate` at build time.
5. **Low: dev docker-compose publishes Postgres, Redis and SeaweedFS on every interface**, with the password `vtt`. Anyone on the same network can reach a developer's database.

## What Changes

- Caddy adds browser security headers to every response it serves: the web app, `/uploads/*`, `/api/*`, `/health` and `/mcp`. These are HSTS without preload, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin` (`/api` keeps its stricter `no-referrer`), and a Content-Security-Policy built from what the web app actually loads, including `frame-ancestors 'none'`.
- Room creation gets two limits per account: a creation rate and a maximum number of rooms owned at once. A refusal returns 429 with a catalog message (ADR 0054), and the GM dashboard shows it.
- Sign-up attempts stay at 50 per address per hour. A new ADR records that "email already has an account" stays visible, and why. No email verification is added.
- The `deepmerge-ts` advisory stays accepted. `@prisma/config` 6.19.3 pins `deepmerge-ts` to exactly 7.1.5, and npm ignores overrides for it (tried root, nested and exact-pin overrides). The advisory is already allowlisted in `scripts/audit-ci.mjs`, and only the Prisma CLI/config reaches it at build time. `docs/EDGE-PROTECTION.md` records this. It clears with a Prisma upgrade, which is a follow-up, not this change.
- Board startup gives label fonts at most 100 ms before using fallback faces, and fetches decorative art when first used. The existing relabeling path restores the chosen fonts after they load.
- Dev `docker-compose.yml` binds Postgres, Redis and SeaweedFS to `127.0.0.1`. The dev server and web ports stay on every interface, so phones on the LAN can still test the app.

## Capabilities

### New Capabilities

- `security-headers`: the browser security headers every response carries in production.
- `room-creation-limits`: how many rooms an account may create, and how a refusal is reported.
- `sign-up-limits`: the sign-up attempt limit and the accepted email disclosure.

### Modified Capabilities

None. The related account and deployment specs exist only inside in-flight changes (`user-accounts`, `production-deployment`), so this change adds new capabilities instead of editing those deltas.

## Impact

- `deploy/Caddyfile`: a header block, and CSP verification through Caddy.
- `apps/server`: the room route and limiter in `src/http/routes.ts` and `src/identity/routes.ts`, a shared room-lifecycle guard using the existing owned-room lists (memory and Prisma), a catalog id for the refusal, and integration tests.
- `apps/web`: the GM dashboard shows the room-limit refusal through `t()` in English and zh-TW. The board possibly needs `pixi.js/unsafe-eval` so PixiJS works without `'unsafe-eval'` in the CSP.
- No dependency changes: the override was tried and reverted (see What Changes).
- `docker-compose.yml` port bindings.
- `docs/adr/0069-sign-up-email-disclosure.md`: the accepted disclosure. 0068 is taken by the in-flight guest GM hosting change. Also `docs/EDGE-PROTECTION.md`: the new headers and limits.
- No shared schema change, no migration, and no change to `docker-compose.prod.yml` port publishing.
