Continue the existing implementation and verify the final branch. Sign-up remains 50 attempts per IP per hour at the owner's request. Board startup performance is included as a requested follow-up.

## 1. Security headers (agent A: `deploy/Caddyfile`, `apps/web/securityHeaders.ts`, `apps/web/vite.config.ts`, `apps/web/src/board/` entry, `apps/web/test/securityHeaders.test.ts`)

- [x] 1.1 Add the D1 `header` block to the site block in `deploy/Caddyfile`, with a comment pointing to `apps/web/securityHeaders.ts`. Verify that `docker run --rm -v ./deploy:/etc/caddy caddy:2 caddy validate --config /etc/caddy/Caddyfile` passes, or, if docker is unavailable, that the block matches Caddy's `header` directive syntax.
- [x] 1.2 Export the identical header set from `apps/web/securityHeaders.ts`, and apply it as `preview.headers` in `apps/web/vite.config.ts`. Verify that `vite preview` responses carry the headers (`curl -I`).
- [x] 1.3 Add `apps/web/test/securityHeaders.test.ts`. It reads `deploy/Caddyfile` and the constant, then asserts the same CSP string, `frame-ancestors 'none'`, no `'unsafe-eval'`, and HSTS and X-Frame-Options in both. Verify the test passes.
- [x] 1.4 Build the web app and open a room board under the preview CSP. If the board fails or logs an eval violation, import `pixi.js/unsafe-eval` once in the board entry. Verify the board renders with no eval violation.

## 2. Room creation limits (agent B: `apps/server/src/http/routes.ts`, `apps/server/src/identity/routes.ts` limiter list only, shared catalog entries, `apps/web` dashboard create dialog, i18n en and zh-TW, `apps/server/test/roomCreationLimits.test.ts`)

- [x] 2.1 Add `roomCreationsPerAccount` (20 per hour) to `accountLimits()`, and a `MAX_OWNED_ROOMS = 100` constant. Verify typecheck passes for the server workspace.
- [x] 2.2 In `POST /api/rooms`, after body validation and before `createRoomWithSeat`: refuse with 429 when `listOwnedRoomIds` returns 100 or more, and refuse with 429 plus `Retry-After` when the rate limiter refuses. Use `sharedText` catalog messages in English and zh-TW, with terms from `docs/GLOSSARY-zh-TW.md`. Verify with the test in 2.4.
- [x] 2.3 Make the GM dashboard's create-room dialog show the server's 429 message and stay open. UI text goes through `t()`. Verify with an existing or new web test that renders the refusal.
- [x] 2.4 Add `apps/server/test/roomCreationLimits.test.ts` (FR-GM-01). The 21st room in an hour is refused with `Retry-After`, the rate is per account, the 101st owned room is refused, deleting a room frees a place, and a refused request leaves the owned count unchanged. Verify the test passes alone with `npm test --workspace=@vtt/server -- roomCreationLimits`.
- [x] 2.5 Enforce both limits in the shared room lifecycle, including temporary encounter-editing rooms. Regressions cover the editing endpoint's hourly and owned caps and concurrent ordinary/edit requests at the cap.

## 3. Sign-up limit and ADR (agent B, after group 2: `apps/server/src/identity/routes.ts`, `apps/server/test/accountRateLimits.test.ts`, `docs/adr/0069-sign-up-email-disclosure.md`)

- [x] 3.1 Keep `signUpPerIp` at 50 attempts per IP per hour, shared across accounts on that IP. Update `accountRateLimits.test.ts` so the 51st sign-up from one address gets 429 without revealing a taken email, and a second address is unaffected. Verify that test passes alone.
- [x] 3.2 Write `docs/adr/0069-sign-up-email-disclosure.md`: context, the decision to keep 409 for a taken email with no verification, the 50-per-hour bound, the NAT trade-off, and when to revisit. Verify the file exists and is linked from `docs/EDGE-PROTECTION.md`.

## 4. Dependencies and dev compose (agent C: root `package.json`, `package-lock.json`, `docker-compose.yml`)

- [x] 4.1 (Tried, then reverted: npm ignores overrides because @prisma/config pins 7.1.5.) Add `"overrides": { "deepmerge-ts": "^8.0.0" }` to the root `package.json` and run `npm install`. Verify that `npm ls deepmerge-ts` shows 8.x, and that `npx prisma validate` and `npx prisma generate` succeed in `apps/server`.
- [x] 4.2 Retain the existing documented build-time exception for GHSA-ggr8-5vv4-36mx. Verify `npm run audit` passes with no new high or critical advisories; raw npm audit is not clean.
- [x] 4.3 In `docker-compose.yml`, bind 5432, 6379 and the S3 port to `127.0.0.1`. Verify with `docker compose config` if docker is available, or by reading the three port lines.

## 5. Docs (orchestrator)

- [x] 5.1 Update `docs/EDGE-PROTECTION.md` with the header set, the room limits, the existing sign-up limit and the ADR 0069 link. Verify by reading the section.

## 6. Verification (orchestrator)

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test` once. Verify all three pass.
- [x] 6.2 With Playwright Chromium, against `vite preview` with the headers on and the server on the isolated ports: sign in with the seeded dev account, open the dashboard, create a room, upload a map, place tokens, roll dice, and join from the invite in a second context. Verify console/page-error collectors report no CSP violations, and that an iframe of the app on another origin is refused.
- [x] 6.3 Verify `openspec validate security-review-findings --strict` passes.


## 7. Board startup (owner follow-up)

- [x] 7.1 Reproduce stalled-font startup on the production build and record time to canvas, font-gate time and early decorative requests.
- [x] 7.2 Reduce the font grace period to 100 ms, preserving the existing fallback and late-font relabeling. Load effect, condition and fog art only when used.
- [x] 7.3 Verify production browser startup stays below the font-gate budget, starts no decorative requests before the empty board appears, and still loads condition and player-fog art when needed. See verification-log.md for the measured results.

- Verification note: lint, typecheck, production build, targeted regressions, browser checks, audit gate, Compose config and OpenSpec validation pass. The full local run now passes on Windows too: image checks read a buffer so libvips never locks the upload, the MCP join burst goes in batches, and server and web tests default to a 15 s timeout. See verification-log.md.
