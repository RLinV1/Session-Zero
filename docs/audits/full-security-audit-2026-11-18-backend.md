# Backend security audit, 2026-11-18

Scope: `packages/shared`, `apps/server`, `apps/mcp`, Prisma schema and migrations, read from the working tree
`claude/email-verification-live`. Read-only: nothing was run (no tests, builds, servers, docker), so every item below is
from reading the code. Items I could not confirm by execution are marked **(inferred)**. `apps/web`, `deploy/` and
dependencies belong to another audit; I read `deploy/Caddyfile` and `docker-compose.prod.yml` only to judge reachability.

Counts: critical 0, high 3, medium 9, low 12.

## Past findings: status

| Past finding | Status now |
|---|---|
| security-hardening: password-change guess limit | Closed (`identity/routes.ts:217-224`, count-first, reset on success). |
| security-hardening: invite-join limit | Closed, but keyed on raw `req.ip` (see M2). Budget is 150 per 15 min, not the 30 the design says. |
| security-hardening: chat and dice-look limits per participant | Closed (`ws/socket.ts` `SeatWindows`). |
| security-hardening: sign-in guess race | Closed (count before hashing). |
| security-hardening: `TRUST_PROXY=true` refused in production | Closed when set. Unset is not refused (M6). |
| security-hardening: default S3 credentials in production | Closed (`store/assetStore.ts:~191`). |
| security-hardening "not fixed" 1: image URLs are free text | **Still open** (M8). |
| security-hardening "not fixed" 2: no general command limit | Closed (`ws/socket.ts:34-49`: player burst and sustained, GM budget). |
| security-hardening "not fixed" 3: uploads trust declared MIME | Closed (`http/imageUpload.ts:55-62` decides by real bytes: png, jpeg, webp only). |
| security-hardening "not fixed" 4: token positions unbounded | **Still open** (L8). |
| edge-protection: handshakes per connection | Closed (`ws/socket.ts:64`). |
| security-review-findings: headers, room caps, sign-up disclosure (accepted, ADR 0069) | Caps verified in `domain/roomLifecycle.ts`. Headers are in `deploy/Caddyfile` (not audited here). 409 on a taken email is still returned, as accepted. |
| email-verification security-review H1 to L7 | Not re-audited, as asked. H1 looks addressed in code (`SignUpRequest` refine at `packages/shared/src/auth.ts:34`, `to` passed as an address object at `identity/mailer.ts:58`). |

---

## High

### H1. One shared rate-limit bucket for every guest room creation
- Where: `apps/server/src/domain/roomLifecycle.ts:73` (`limits.roomCreationsPerAccount.hit(\`rooms:${room.userId}\`)`); guest callers pass `userId: null` (`http/routes.ts:119-122`).
- Failure: every guest creates under the key `rooms:null`, so all guests together get 20 rooms per hour (`identity/routes.ts:60`). One IP can use the whole budget: 20 `POST /api/rooms` with distinct `X-GM-Token` values and a shipped map (the per-address guest limit is also 20 per hour, so one address is enough). For the next hour nobody can start a guest room, and the attacker also created 20 rooms and 20 guest identities. Guest hosting is the no-account on-ramp, so this is a one-person outage of a headline feature. **(inferred)**
- Fix: key by the owner, `rooms:${room.userId ?? room.ownerGmId}`, and keep the per-address guest limit as the only global-ish bound. Add a test with two guests.

### H2. Replay and history endpoints can hold the single event loop (cross-tenant DoS)
- Where: `packages/shared/src/replay.ts:140-151` (per event: `filterEventForViewer` plus `filterStateForViewer(withRulesNow(state))`, which rebuilds a full concealment, line of sight included, for up to `MAX_REPLAY_FRAMES = 2000` frames); `http/routes.ts:459-487` (loads the whole log with `store.loadEvents` each call, 150 requests per minute per participant, `identity/routes.ts:68`); `http/routes.ts:438-453` (`/history`, GM, no limiter at all, folds the whole log).
- Failure: anyone with a public invite link is a participant, and each of up to 32 participants per room gets its own 150 per minute. A room with a long log, walls and line of sight turns each call into hundreds of milliseconds to seconds of synchronous CPU on the process that serves every room. The code already warns at 500 ms (`routes.ts:483`), so slow replays are expected. An attacker can build the heavy room themselves (a GM may issue 3000 commands per 30 s). Not measured. **(inferred)**
- Fix: per-room and per-IP replay budget (not per participant), a small LRU of filtered replays per (room, viewer, point, last seq), compute off the main thread (worker), and a limiter on `/history`. Make `visibleBefore` incremental instead of recomputing the whole filtered state per frame.

### H3. Every upload is stored twice, one copy forever on the app server disk, with a 2 GiB quota per free account
- Where: `store/assetStore.ts:241,253,265-280` (`withDiskCopy`: "stays there"), `store/libraryStore.ts:155` (`maxBytes: 2 GiB`, 1000 items), `ownership/diceLooks.ts:96-130` (dice picture upload has no `uploadsPerOwner` limiter and writes to the store before the allowance check).
- Failure: object storage is not the only copy, so each account can place up to 2 GiB on the VM's local disk too. About 25 verified accounts (sign-up allows 50 per hour per IP; disposable inboxes work) can fill a 50 GB disk. If Postgres or Docker share that disk, the whole site stops and the database may be damaged. Deletes remove both copies, so only abusers hit this. **(inferred; I did not check the disk size or compose volumes)**
- Fix: in production do not keep the disk copy (delete after a successful S3 put, serve only from S3), or cap it with a small cache and sweep. Add the upload limiter to dice faces, and a global disk-free check that refuses uploads below a floor.

---

## Medium

### M1. A GM can write an event that makes their own room unloadable (inherited property names)
- Where: `packages/shared/src/decide.ts:688-699` and the same `state.tokens[command.tokenId]` pattern in token.setHidden, token.setOwners, token.delete, token.setImage, token.setAppearance, participant.revoke (`:1430-1434`) and others. `Id` is any 1-64 character string (`state.ts:12`). Only walls, scenes and a few lines use `Object.hasOwn`.
- Failure: GM sends `token.setHidden {tokenId:"constructor", hidden:true}`. `state.tokens["constructor"]` is the `Object` function (truthy), so `decide` accepts and emits `TokenHiddenSet` with `tokenId: undefined`. `LiveRoom.commit` appends it (`domain/liveRoom.ts:593`) and only then reduces; `reduce` throws "references a missing entity" (`reducer.ts:523`). The row is already in the log, the in-memory `seq` and state are not advanced (every later command hits `SeqConflictError`), and every future `LiveRoom.load` of that room fails on replay. The GM has destroyed their own campaign; other rooms are isolated. Player-reachable commands I read throw earlier (`token.ownerIds.includes` on a function) and persist nothing, so I found no cross-user path. **(inferred)**
- Fix: one `own(map, id)` helper (`Object.hasOwn`) used for every id lookup, or create `tokens`, `participants` and similar maps with a null prototype. Also reduce the decided events against the current state before `store.append` so a bad event can never be committed.

### M2. Per-address limits use raw `req.ip`; an IPv6 /64 gets unlimited addresses
- Where: `identity/routes.ts:163` (sign-in), `http/routes.ts:167,174` (invite lookups, joins), `membership/routes.ts:115`, `http/build.ts:711` (build pass failures), `apps/mcp/src/app.ts:126,134,146,154` (join limits keyed by `req.ip`). Sign-up, guest rooms, OAuth registration and token failures correctly use `addressKey()` (`identity/routes.ts:36`).
- Failure: one machine with a /64 rotates source addresses and walks past `signInPerIp` (150 per 15 min), `inviteLookupsPerIp`, `joinsPerIpPerRoom` and `buildPassFailuresPerIp`. Two concrete effects: (a) every sign-in with an unknown email still runs a full argon2 verify (`passwords.ts` `verifyAgainstDummy`), so about 50 requests per second (Caddy's per-/64 cap, `Caddyfile` zone `api`) saturates the 4-thread libuv pool that also serves fs, dns and crypto for the whole server; (b) join and leave loops grow a room's append-only log without the per-address bound. Per-email limits are on the email string, so distinct emails bypass them. **(inferred)**
- Fix: use `addressKey(req.ip)` everywhere. Add a global cap on concurrent argon2 operations (or a bounded queue) and set `UV_THREADPOOL_SIZE` explicitly.

### M3. No cap on tokens or events per room, and rooms are never evicted from memory
- Where: `decide.ts:1769-1795` (`createTokens` copies `named.tokens` for every new token: O(n) per token, up to `MAX_TOKENS_PER_CREATE = 20` per command; the only bound is free squares), no `MAX_TOKENS`; `reducer.ts` object spread per event; `domain/roomRegistry.ts` (a loaded room stays in the map until deleted); `store.loadEvents` loads the whole log on every load and every replay.
- Failure: a GM (3000 commands per 30 s) can create tens of thousands of tokens or millions of events. Each command then costs O(tokens) on the shared event loop, every snapshot sent to a player grows with it, and the full log lives in process memory for as long as the process runs. A modest number of such rooms exhausts memory. **(inferred)**
- Fix: `MAX_TOKENS_PER_ROOM` (a few hundred), a per-room event ceiling or periodic snapshots, and LRU eviction of idle rooms (`registry.evict` exists).

### M4. Ephemeral relay and per-commit recompute can burn CPU on the shared loop
- Where: `domain/liveRoom.ts:489-550` (relay runs synchronously on arrival, not queued; `this.concealments.clear()` after every commit at `:601`, so the first relay after each commit rebuilds line-of-sight concealment for the sender and for every viewer), `shared/visibility.ts:163-176` (`movementObstacles` rebuilt for every `tokenMovePreview`), `ws/socket.ts:19-20` (40 messages per second per participant, 10 previews per second).
- Failure: 32 attacker-controlled seats in one room (one account plus 31 invite joins) each sending 40 per second, in a room with walls and line of sight, is about 40 thousand deliveries per second plus repeated sight polygon rebuilds after each commit. Also `broadcast` runs `wallsChanged` (two `JSON.stringify` of all visible walls) per viewer per wall event. **(inferred, not measured)**
- Fix: cache obstacles per `state` object, cap relay work per room per second (not only per participant), and cap rebuilds of concealment per tick.

### M5. `/mcp/*` is unauthenticated and not rate limited at the edge; `/mcp/build` takes 12 MB bodies from anyone
- Where: `apps/mcp/src/app.ts:83-84` (`express.json({ limit: "12mb", type: () => true })` on `/mcp/build`, before any credential is read), `deploy/Caddyfile` rate-limit zones cover only `/socket.io/*`, `/api/*` and `/health`, `/uploads/*`.
- Failure: any client can POST up to 12 MB of JSON per request to `/mcp/build` (and 64 KB to `/mcp`) at full speed. Each is buffered and `JSON.parse`d on the MCP process event loop before the MCP layer rejects it, and the pool keeps up to 300 seat sockets for `/mcp`. The MCP join limiter (`apps/mcp/src/limits.ts`) only counts after parsing and uses raw `req.ip` (M2). Failure is limited to the MCP container, but it is a public endpoint. **(inferred)**
- Fix: add a Caddy `rate_limit` zone for `/mcp*` and a `request_body max_size` there; make `/mcp/build` read at most a few hundred KB until a pass has been checked.

### M6. Unsafe production fallbacks
- Where: `apps/server/src/index.ts:22-24` (no `DATABASE_URL` silently selects the in-memory store, also in production); `app.ts:346-348` (`TRUST_PROXY` unset is accepted in production); `identity/mailer.ts:60-62` and `identity/sessions.ts` cookie `Secure` both key off `NODE_ENV === "production"` (see email-verification M3).
- Failure: a deploy that misses `DATABASE_URL` runs with all state in RAM and loses everything on restart, with no error. A deploy that misses `TRUST_PROXY` puts every user behind the proxy's address, so every per-address limit becomes one global bucket (sign-in, join, OAuth registration), which locks everyone out at 150 sign-ins per 15 minutes. `docker-compose.prod.yml:117,135` defaults `TRUST_PROXY` to 1, so this only bites on a different deploy path. **(inferred)**
- Fix: in production require `DATABASE_URL`, `S3_ENDPOINT` and `TRUST_PROXY`, and exit with a message when any is missing.

### M7. Open dynamic client registration lets anyone choose what the consent page calls them
- Where: `http/studioOAuth.ts:122-129,259-286` (RFC 7591 open registration; `client_name` accepted, control and format characters stripped by `shownName` at `:152` but any text allowed); consent page shows `client.name` and `redirectHost` (`:325`).
- Failure: an attacker registers a client named "Claude" or "ChatGPT" with `https://attacker.example/cb`, then lures a signed-in GM to `/studio/connect?...`. The page says the named app wants access; if the GM selects builds and approves, the code goes to the attacker and, with the attacker's own PKCE verifier, becomes tokens for those builds (scope `studio:build`, builds the GM ticked, 8 hour access and 14 day refresh). The redirect host is shown, which is the only defence. Blast radius is limited to the selected open builds. **(inferred)**
- Fix: show the redirect host prominently and make it the primary label; flag clients whose host is not on an allow-list of known AI apps; mark never-seen hosts "unverified".

### M8. Image and map URLs are free text (open since security-hardening)
- Where: `packages/shared/src/commands.ts:72,200,303` (`imageUrl: z.string().max(2048)`), `state.ts:59` (`MapImage.url`); guest rooms are limited to `/img/` (`builtinArt.ts:11`, `liveRoom.ts:344`), account rooms are not.
- Failure: a GM in an account room sets a token or map image to `https://attacker.example/pixel.png?room=...`. Every player's browser (and every MCP seat host) fetches it, which discloses their IP address, user agent and timing to a third party. The URL also goes into the permanent log. Not code execution. **(inferred for the browser side; it is the web app that fetches)**
- Fix: restrict to `^/uploads/[A-Za-z0-9._-]+$` and `^/img/...$` in the command schemas (ADR needed, per CLAUDE.md), with a migration-safe read path for old events.

### M9. Image decompression bomb through the 16384 px edge limit
- Where: `http/imageUpload.ts:55` (`sharp(..., { limitInputPixels: false }).metadata()` is header-only, so the check passes anything up to `MAX_ASSET_EDGE = 16384`, i.e. 268 million pixels, inside 25 MB because PNG and WebP compress flat areas massively), `http/build.ts:839` (server decodes with `limitInputPixels: MAX_ASSET_EDGE ** 2`), `apps/mcp/src/mapImage.ts:191-200` (`MAX_MAP_PIXELS` 64 M, safe).
- Failure: a build upload of a 16384 x 16384 flat-colour PNG (a few hundred KB) passes the byte check. A preview request decodes it (about 1 GiB as RGBA, partly streamed with `sequentialRead`) in the server process, up to `MAX_PREVIEWS_AT_ONCE` at a time. Every player's browser also decodes it as a map. Out-of-memory kills the API process. **(inferred)**
- Fix: cap total pixels (for example 64 M) at upload as well as the edge, and set `limitInputPixels` for server decodes to that cap.

---

## Low

- **L1. Credential upsert overwrites silently.** `store/postgresRoomStore.ts:363-369` (`saveCredential` update branch). A client that reuses one `guestToken` for two rooms or two seats silently loses the earlier seat; an attacker who learns a token can re-point it. Use create-only and 409 on a conflict. (inferred)
- **L2. REST bearer routes do not check session liveness.** `http/routes.ts:510-528` (`isRoomGm`, `authenticate`) skip the `cred.sessionHash` check that sockets (`ws/socket.ts:175`) and UVTT routes (`http/uvttRoutes.ts` `authorize`) make, so an expired session's seat keeps working over REST until the hourly sweep. Share one `authorize`.
- **L3. Hidden-wall oracle through `token.move`.** The move preview masks unknown routes (`visibility.ts:173` `movementRouteKnown`), but the command returns `reject.moveUnavailable` for any wall or terrain block (`decide.ts:529-534`) and accepts otherwise, so a player can probe walls under fog by moving their own token. Judge by the player's visible walls for non-GM actors, or accept that normal play reveals this. (inferred)
- **L4. `attachAccount` runs on every path including `/uploads/*`** (`app.ts:213`, before `:224`): every image load that carries the cookie does 2 database reads (`sessions.ts:101-119`), up to the 1000 per 10 s edge cap. Mount it on `/api` only.
- **L5. Names accept invisible and bidirectional characters.** `ChatText` strips them (`commands.ts`), but display names, token names, room names and creature names do not (`protocol.ts:CreateRoomRequest/JoinRoomRequest`, `TokenUpdate.name`). A player named like the GM with a zero-width character passes `isDisplayNameTaken` (`names.ts` folds NFC and case only) and sends chat as that name. Strip `\p{Cc}\p{Cf}` and compare skeletons.
- **L6. `filterStateForViewer` is a deny-list.** `visibility.ts:230` returns `{ ...publicState, ... }`, so any new `RoomState` field reaches players unless someone remembers to remove it. The event filter is exhaustive (the switch has no default and returns a type), the state filter is not. Build the player view from an allow-list.
- **L7. Logs may carry query data.** `identity/routes.ts:306` and `http/routes.ts:540` log the error object or message; Prisma errors usually quote the failing call. For sign-up that call carries the email and the password hash. The Caddy privacy design says addresses are not logged, but emails would be. Log `err.name` and a code only, as `studioOAuth.ts:543` does. (inferred, not confirmed against the Prisma version in use)
- **L8. Token positions are unbounded.** `commands.ts` `Point` is any finite number and `decide.ts:517-542` only bounds `via`, so `to: { x: 1e300 }` is accepted for a player's own token. Clamp to the map plus a margin.
- **L9. Password policy and lockout.** 8 characters minimum, no common-password check (`password` is accepted, `auth.ts:22-23`); 10 failures lock an email for 15 minutes for the owner too, so anyone can lock a known email out (`identity/routes.ts:172`). Add a small deny-list and consider lock by (email, IP).
- **L10. Some OAuth paths are not limited.** `/api/oauth/revoke` (`studioOAuth.ts:448`) has no limiter, and token-endpoint failures for a known client id are intentionally uncounted (`:385`); both do database lookups. Registration eviction (`:271`, `STUDIO_LIMITS.evictUnusedClientMs` 10 min) lets 200 fresh registrations from about 10 addresses push out a legitimate client that has not been used yet. Add a per-client limiter.
- **L11. Account deletion keeps display names in other rooms' logs.** `postgresRoomStore.ts:1710-1760` removes memberships, but events in rooms the user only played in are append-only (`0007_events_insert_only`) and keep the name. State this on the privacy page.
- **L12. Check-then-hit upload budget in Studio intake.** `http/studioMedia.ts:95-100` checks `uploadsPerOwner` before the download and hits it after, so parallel intakes pass together. Hit first and refund on failure.

---

## Checks that passed

- Sessions: 256-bit server-minted token, SHA-256 stored (`identity/sessions.ts:25`, `domain/credentials.ts`); cookie `HttpOnly; SameSite=Lax; Secure` plus the `__Host-` prefix in production; no session fixation (token minted after authentication); 30 day idle and 90 day absolute expiry enforced on read (`isLive`); password change ends all other sessions and the seats bound to them and also ends build passes and Studio grants (`routes.ts:228-232`); sign-out deletes the row; account deletion needs the password and deletes tokens, sessions, rooms, library and grants in one transaction.
- Password hashing: argon2id, m=19456 KiB, t=2, p=1 (OWASP minimum), rehash on sign-in, dummy hash for unknown emails, `needsRehash` after parameter change.
- CSRF: `requireSameOrigin` for every unsafe request that carries the session cookie, JSON-only account routes (415 otherwise), SameSite=Lax.
- Authorization: every room REST route resolves a credential bound to that `roomId` and requires `role === "gm"` where needed; every library, encounter, creature, animation, dice, build and Studio route scopes by the caller's `ownerGmId` and answers 404 for foreign ids; builds are checked against the grant's `buildIds`; every `decide` case begins with `can.administer` or an owner check (`can.*` in `decide.ts:74-106`); invariant 7 holds in the code I read.
- Visibility: the live broadcast, snapshots, previews, replay and checkpoint routes all go through `filterStateForViewer` / `filterEventForViewer` (`liveRoom.ts:471-480,659-677`, `routes.ts:451,466,481`, `replay.ts:135-151`); `filterEventForViewer` is exhaustive over event types; undo, checkpoints, groups, saved scenes and GM rolls are removed from player state; ephemeral relays check concealment per viewer (`liveRoom.ts:529-549`); MCP views are built from the filtered state and fail closed (`mapImage.ts:92-110`).
- SSRF: Studio download is pinned to `sdmntpr*.oaiusercontent.com`, HTTPS only, no port, no redirects, DNS answers checked against private ranges and the checked address is the one connected to, size and time capped (`domain/studioDownload.ts`); the MCP map fetch accepts only `/uploads/<name>` (`mapImage.ts:34`) and the shipped map list; vision calls use a fixed configured URL.
- Uploads: file bytes decide type (png, jpeg, webp), random UUID names, 25 MB multer cap, per-owner quota with row locks (`pg_advisory_xact_lock`, `FOR UPDATE`), `nosniff` on `/uploads`, traversal and symlink and `studio-private` filters with triple decode (`app.ts:224-239`), private Studio media in a separate store with an anonymous-access probe at startup.
- OAuth: authorization code with S256-only PKCE, exact redirect URI match against registered URIs, loopback or https only, RFC 8707 resource check, single-use codes with replay revoking the grant, refresh rotation with reuse detection, row locks around redeem and rotate, tokens stored hashed, 5 minute codes, 8 hour access tokens, 30 day family cap, `iss` on responses, CSRF and same-origin on consent.
- Persistence: every `$queryRaw` and `$executeRaw` is a tagged template (parameterised); no `Unsafe` variant anywhere; events table is append-only by trigger (`0007`); append checks `expectedLastSeq` in a transaction and the composite key backs it; per-owner and per-room quotas are in transactions; migration `20261118120000_email_verification` is additive and backfills existing users as verified.
- Input: zod on every body, query and socket message; socket payload 64 KB (`app.ts:142`), JSON bodies 64 KB; dice formula bounds (20 dice, 1000 sides, 64 characters); regexes I read are linear; no `any` in the auth path.
- Socket handshake: three attempts per connection, credential and revocation lookups only after a valid shape, per-seat connection cap of 8, per-seat command, chat, dice-look and resync windows shared across connections.
- Config: `x-powered-by` off, `/api` sets `nosniff`, `no-referrer`, `no-store`; dev account seed refused when `NODE_ENV=production`; production refuses missing `S3_*` and `TRUST_PROXY=true`.

## Not covered or only skimmed

- Not read in depth: `apps/server/src/store/memoryRoomStore.ts` (dev store), `postgresRoomStore.ts` outside the sections quoted above, `domain/wallDetection.ts` and `services/vision` (Python, out of scope), `domain/buildPublish.ts`, `domain/studioSceneRevision.ts`, `store/studioAuthoring.ts`, most of `packages/shared/src/build.ts`, `terrain.ts`, `sight.ts`, `geometry.ts`, `uvtt.ts` and `undo.ts` (parser and geometry code that could hide ReDoS or quadratic loops).
- `apps/mcp/src/studioM0/*` (the fixture OAuth server and `download.ts`) is enabled only with `STUDIO_M0=1` (`apps/mcp/src/index.ts`); I did not audit it. It must stay off in production.
- Nothing was run: no load test, so H2, M3, M4 and M9 are unmeasured; no `npm audit`; no query against the live site; Postgres isolation behaviour is from reading.
- Whether `docker-compose.prod.yml` publishes the room server or MCP port directly (which would let a client forge `X-Forwarded-For` and skip every per-address limit) belongs to the deploy audit; I assumed only Caddy is reachable.
- Redis sequence reservation (`store/redisSeq.ts`) and BullMQ job payload handling were not reviewed.
- Web-side rendering of names, chat and room text (stored XSS) was not assessed; the server stores them raw (`ChatText` is the only sanitised free text).
