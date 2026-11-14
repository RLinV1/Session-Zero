## Context

See proposal.md for the five findings. Current state that shapes the fixes:

- **Edge.** Caddy (`deploy/Caddyfile`) serves the built web app from `/srv` with an `index.html` fallback. It proxies `/api/*`, `/socket.io/*`, `/uploads/*` and `/health` to `server:3001`, and `/mcp*` to `mcp:3002`. Cloudflare sits in front in production and adds no security headers. Express sets nosniff, no-referrer and no-store on `/api` only (`apps/server/src/app.ts`).
- **Web app loads.** No third-party origins were found in `apps/web`. PixiJS v8 renders the board. The web app does not import `pixi.js/unsafe-eval`, so without `'unsafe-eval'` Pixi may fail to compile shaders. Dice looks are stored as `data:` URLs (`ui/diceSkinStore.ts`), and the board and 3D dice may create `blob:` URLs and workers. React sets inline `style` attributes. Nothing embeds the app in a frame.
- **Limits.** `RateLimiter` (`apps/server/src/identity/rateLimit.ts`) is an in-memory fixed window. `accountLimits()` holds every account-level limiter, including `signUpPerIp: 50 per hour`. `RoomStore.listOwnedRoomIds(ownerGmId)` exists for both the memory and Postgres stores. Refusals use `refused(res, result)` in `identity/routes.ts`, and server text people read is a catalog id (ADR 0054, `sharedText`).
- **Dependencies.** `prisma` is a devDependency at ^6.2.1 (6.19.3 installed), and `@prisma/client` ^6.19.3. `deepmerge-ts` 7.1.5 arrives only through `@prisma/config`. `Dockerfile.server` runs `prisma generate` at build time.

## Goals / Non-Goals

**Goals:**
- Close all five findings with the smallest change that holds in production.
- Prove the CSP against the real built web app, not the Vite dev server, whose HMR needs `eval`.

**Non-Goals:**
- Email verification, or hiding whether an email is registered (owner decision, recorded in ADR 0069).
- HSTS preload, CSP reporting endpoints, and Cloudflare dashboard settings.
- A Prisma 7 major upgrade.
- Moving limiters to Redis. The single app server keeps them in memory, as today.

## Decisions

### D1. Headers live in Caddy, once, for every response
Add one `header` block at the top of the site block. It applies to every `handle`, so the web app, its fallback, uploads, API, health and MCP all get the same headers:

- `Strict-Transport-Security "max-age=31536000; includeSubDomains"`
- `X-Frame-Options DENY`
- `X-Content-Type-Options nosniff`
- `Referrer-Policy strict-origin-when-cross-origin`, set with `?` (only when the response has none), so Express's `no-referrer` on `/api` wins
- `Content-Security-Policy`:
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self' wss: ws:;
  worker-src 'self' blob:;
  media-src 'self' blob: data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none'
  ```
  The exact source lists are adjusted only where the verification in D5 shows a real need.

Why Caddy over Express: Express never sees the web app's HTML or `/mcp`. Why not Cloudflare: settings there aren't in the repo, so they can't be reviewed or reproduced on a fresh VM.

`'unsafe-inline'` stays in `style-src` only, because React inline `style` attributes need it. Inline style injection is low risk next to script injection. `script-src` stays `'self'` with no inline scripts and no eval.

HSTS on a plain `:80` deployment (IP-only demo) is ignored by browsers over http, so it is harmless there.

### D2. PixiJS without eval
If the board fails or logs an eval-related CSP violation, import `pixi.js/unsafe-eval` once at the board entry (`apps/web/src/board/`). That module swaps Pixi's runtime code generation for precompiled paths. It keeps Pixi code inside `board/` (CLAUDE.md convention). The CSP never gets `'unsafe-eval'`.

### D3. Room limits reuse `accountLimits()` and the store's owned list
- Add `roomCreationsPerAccount: new RateLimiter(20, 60 * MINUTE)` to `accountLimits()`, keyed by account user id.
- Before creating, count `listOwnedRoomIds(account.user.ownerId)`. At 100 or more, refuse.
- Serialize the count and creation per owner inside the shared `RoomLifecycle.createRoomWithSeat`, using the same promise-tail pattern as `LiveRoom`, so concurrent requests cannot all pass the cap before their inserts complete. Ordinary rooms and temporary encounter-editing rooms share the limits and queue. Both checks run before the first write, so a refusal creates nothing. Validate request bodies and resolve templates or maps in the callers first; missing or conflicting templates and invalid maps do not spend the hourly budget. A typed refusal is translated into the same localized HTTP response by both entrypoints.
- Refusals are 429 with `Retry-After` for the rate, and 429 without it for the cap. Each carries a `sharedText` catalog message in English and zh-TW.
- No new store method is needed. 100 ids is a cheap read. A count query can come later if owners ever hold thousands.

Alternative rejected: one combined limit. A cap alone lets an account create, delete and recreate rooms in a tight loop, which still grows the event log and storage churn. A rate alone lets rooms pile up forever.

### D4. Sign-up: retain the existing limit and disclosure
Keep `signUpPerIp` at 50 attempts per IP address per hour, shared across accounts on that address, as requested by the owner. Keep the 409 `field: "email"` response.

Record the decision in `docs/adr/0069-sign-up-email-disclosure.md`. Without email sending, a uniform response would leave a real user unable to tell why sign-up failed. Sign-in already answers uniformly. The limit bounds enumeration to 50 guesses per address per hour.

Trade-off: a classroom of 60 signing up behind one school NAT shares one address and would hit 50 per hour. Behind Cloudflare, `client_ip` is the real address, so shared NAT is the one realistic case. The ADR names it. If classes report it, revisit with a different limit key or a challenge.

### D5. Verify the CSP against the production build
The Vite dev server injects inline scripts and uses eval for HMR, so it cannot test the policy. Steps:
1. `npm run build --workspace=@vtt/web`.
2. Run `vite preview` with the same headers. Add `preview.headers` in `apps/web/vite.config.ts`, read from one exported constant (`apps/web/securityHeaders.ts`) that the Caddyfile comment points to. The preview's proxy reuses `server.proxy`, so the API and sockets work.
3. Drive it with the Playwright MCP through the flows in the spec scenario. Read console messages for `Content Security Policy`.

A vitest in `apps/web/test` reads `deploy/Caddyfile` and the constant, and asserts that they carry the same CSP string and that neither contains `'unsafe-eval'`. That stops the two copies drifting.

Alternative rejected: running the production docker stack locally. It verifies Caddy itself, but the machine has little RAM, and the header block is static config that the drift test covers.

### D6. Retain the existing build-time advisory exception
The attempted deepmerge-ts override was reverted. Keep GHSA-ggr8-5vv4-36mx on the existing allowlist in `scripts/audit-ci.mjs`, since only Prisma CLI/config consumes it during builds. `npm run audit` must report no new high or critical advisories. A Prisma upgrade that resolves the advisory remains a separate change; this branch does not claim a clean raw npm audit.

### D7. Dev compose binds data services to loopback
Change `5432:5432`, `6379:6379` and `${S3_PORT:-8333}:8333` to `127.0.0.1:` forms in `docker-compose.yml`. The vision service already does this. The `3001` and `5173` ports stay as they are, so a phone on the LAN can open the dev app.

## Risks / Trade-offs

- **[A CSP source is missed and breaks a feature in production]** → D5 walks the main flows on the production build, and the drift test keeps preview and Caddy identical. If a violation shows up after deploy, the fix is one line in the Caddyfile.
- **[HSTS `includeSubDomains` affects other subdomains of sessionzero.codes]** → None are known. If one must stay on http, drop `includeSubDomains` before deploy.
- **[50 sign-ups per hour blocks a class on one NAT]** → Documented in ADR 0069. The limit is one constant to raise.
- **[In-memory limiters reset on restart]** → Same as every other account limit today. The 100-room cap is read from the store, so it survives restarts.
- **[The existing deepmerge-ts advisory remains]** → Retain the documented build-time exception and verify the audit gate in D6.

## Migration Plan

- Deploy the server, web and Caddy together (`docker compose -f docker-compose.prod.yml up -d --build`).
- Then check with `curl -I https://sessionzero.codes/` that the headers are present, and with `curl -I https://sessionzero.codes/api/health` that `/api` still has `no-referrer`.
- Rollback: revert the Caddyfile header block and redeploy. The room and sign-up limits have no stored state to undo.
- Existing accounts that already own more than 100 rooms keep them all. They can't add another until they are under the cap.
