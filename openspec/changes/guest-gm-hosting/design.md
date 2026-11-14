## Context

See proposal.md for why. The code already has most of what a guest host needs, because `user-accounts` kept the old device path alive as "legacy":

- **Owners and identities are already split (ADR 0017 O1).** `rooms`, `library_assets` and `library_creatures` point at `gm_identities`. An account owns through `users.owner_id`. A device token is a second way to act as an owner row: `ownership/resolveOwner.ts` returns `{ ownerId, via: "device" }` for a known `X-GM-Token`. `LibraryStore.registerGm(tokenHash)` (an upsert) and `findGm` still exist. Only the routes stopped calling `registerGm`, and `POST /api/gm/identify` answers 410.
- **Creating routes already refuse devices.** Library, creatures, animations and encounter templates call `requireAccountOwner`. Dice looks, AI builds, room defaults and library UVTT imports call `requireAccount`. Only two upload routes are authorized by a **room seat** instead of an owner, so they are the only upload gaps:
  - `POST /api/uploads` (room map and token images, `http/routes.ts`);
  - `POST /api/rooms/:roomId/uvtt/imports` (`http/uvttRoutes.ts`).
  `POST /api/rooms/:roomId/preparation` stores JSON geometry only, under 1 MiB, so it is not an upload.
- **Image URLs are free strings.** `MapImage.url` and token `imageUrl` accept any string up to 2048 characters. ADR 0052 already notes "`MapImage.url` is an unrestricted string a GM can set". Built-in art is served by the web origin under `/img/`: the shipped maps (`SHIPPED_MAPS`, 6 entries), the built-in token art (`apps/web/src/net/builtinAssets.ts`, `/img/tokens/…`) and the built-in creatures (`builtinCreatures.ts`, `/img/tokens/enemies/…`). Uploads are under `/uploads/`.
- **Room creation can already start with a map.** `roomLifecycle.createRoomWithSeat` takes `scene: { map, grid, board }` and emits `MapSet` with the room's first events, as `encounterEdits.ts` does. Its `NewRoomWithSeat` type requires `userId` and `sessionHash` today and always writes a `room_members` row.
- **Invites need nothing from the GM.** `POST /api/invites/:code/join`, the share modal, QR code, invite reset, revoke, room lock (ADR 0051) and AI seats (ADR 0052, which join only through invites) all work off the room and its GM seat. None of them checks the owner.
- **The sweep pattern exists.** Temporary rooms (ADR 0033) are swept hourly in `app.ts` through `rooms.deleteRoomFully` (ADR 0009).
- **The legacy move exists.** `POST /api/gm/legacy/claim` → `LibraryStore.claimDeviceOwner` moves everything a device owner has, in one transaction, and deletes the device row. The dashboard already shows the offer (`dashboard.legacy.*` strings).
- **Limiters.** `identity/routes.ts` `accountLimits()` holds every fixed-window `RateLimiter`, keyed by `req.ip`. `TRUST_PROXY=1` behind Caddy makes `req.ip` the real client (`docs/EDGE-PROTECTION.md`). That doc's "Still open" notes the app counts each IPv6 address apart while Caddy groups by /64.
- **The written rule to reverse** is in `docs/FRONTEND-CONTRACT.md` §13.1, which `docs/DESIGN.md` §5 cites: "Play requires an authenticated account to create a room … Do not introduce unclaimed-room authority, expiry or ownership transfer in the Core Loop."

## Goals / Non-Goals

**Goals:**
- A signed-out visitor is at a table with a map in two screens, the start page and then the room, and can invite players at once.
- A guest room is the real table, not a demo. It differs only where a file is stored or something is saved to an account.
- Guest storage growth is zero object bytes. Guest growth in rows and log is bounded by rate, by count and by time.
- Every limit is enforced on the server (CLAUDE.md invariant 7). The UI only hides what the server would refuse.
- `decide`, `reduce` and the shared room schemas do not change.
- Reuse the device identity, the legacy move, the sweep pattern and `deleteRoomFully` as they are.

**Non-Goals:**
- A guest library, guest room defaults, or guest encounter templates.
- Letting a guest GM's room move to another device without an account.
- A global cap on guest rooms, CAPTCHA, or proof-of-work (D6 keeps the door open).
- Changing the account quota or `UPLOAD_ALLOWANCE`.

## Decisions

### D1. "Guest" is a kind of identity, and a guest room is a room it owns

Migration `…_guest_identities` adds `gm_identities.guest boolean not null default false`. Every existing row is a pre-account identity and stays false. Only the guest path creates rows, always with `guest = true`.

A *guest room* is a room whose owner row has `guest = true`. Nothing is stored on the room.

**Why on the identity:**
- **A pre-account GM is not a guest.** A browser holding a token from before accounts belongs to a returning GM with real rooms and uploads. With the flag, the server tells the two apart, refuses guest creation for pre-account tokens (D3), and never sweeps or restricts their old rooms. FRONTEND-CONTRACT §13.1 asks that any removal of pre-account access be announced first.
- **Saving needs no extra step.** The move already repoints rooms to the account owner and deletes the device row (ADR 0017 O2). A moved room is then account-owned, so it stops being a guest room without clearing anything.
- **A guest identity can only ever own guest rooms.** It cannot upload or create library items, so it never owns stored files.

**Alternative rejected: a `rooms.guest` flag.** The first draft used one. It needed the move to clear it, and it let a pre-account token start "guest" rooms that mixed with its old uploads.

Store additions, in both `MemoryRoomStore` and `PostgresRoomStore`:
- `registerGuestGm(tokenHash)`, which returns `{ ownerId, guest }`: it creates a guest row for an unknown hash, and returns the existing row as it is otherwise;
- `isGuestRoom(roomId)`, a join from the room to its owner;
- `countOwnedRooms(ownerGmId)`, where `listOwnedRooms` is too heavy;
- `listIdleGuestRoomsBefore(at)`, where activity is `coalesce(max(events.created_at), rooms.created_at)`;
- `deleteEmptyGuestOwners(registeredBefore)`.

`isGuestRoom` is read on uploads and on board-image commands only. The live room caches it (D5), so the join runs once per room load.

### D2. The guest GM uses the existing device token

The browser keeps using `vtt.gm` (`net/identity.ts`). The start page calls a new `ensureGmToken()`: return the stored token, or make 32 random bytes in base64url and store them. It sends the token as `X-GM-Token` on `POST /api/rooms`. The server hashes it with `hashToken` (SHA-256). Only the hash is stored.

**Why reuse:** every owner query, `resolveOwner`, `GET /api/gm/rooms`, `DELETE /api/rooms/:id` and the legacy move already accept it. ADR 0002's property holds: the server keeps no secret it could leak.

**Alternative rejected: a new `guest_hosts` table or a server-minted guest cookie.** It would need its own move path, its own owner resolution, and its own sweep. It would buy nothing over a hashed bearer token that already works end to end.

**Precedence:** `resolveOwner` checks the session first. A signed-in visitor never creates a guest room. `POST /api/rooms` with a valid session takes the account path and ignores any `X-GM-Token`.

**How `/start` tells a pre-account token apart:** it calls `GET /api/gm/legacy`, which already exists, for the counts. That route answers for both kinds, so it also returns the identity's `guest` value (`LegacySummary` gains `guest: boolean`).
- If the token is unknown, the browser forgets it and starts fresh.
- If the identity is a pre-account one, the page shows the sign-in offer instead of the form.
- Otherwise, the page shows the form and the guest's rooms.

### D3. `POST /api/rooms`: one route, two callers

```
session?            → account path, unchanged (no guest limits)
else X-GM-Token?    → guest path:
   1. guestRoomsPerAddress.hit(addressKey(req.ip))  → 429 + Retry-After   (every attempt counts)
   2. parse body; shippedMap must be a SHIPPED_MAPS slug; templateId must be absent   → 400
   3. { ownerId, guest } = registerGuestGm(sha256(token))
   4. !guest                                         → 409 { code: "legacy_identity" }
   5. countOwnedRooms(ownerId) >= 3                  → 409 { code: "guest_room_limit" }
   6. createRoomWithSeat({ ownerGmId: ownerId, userId: null, sessionHash: null,
        scene: { map: { url, width, height }, grid }, preset, … })
else                → 401
```

- **`createRoomWithSeat`** makes `userId` and `sessionHash` nullable. It stores the credential with no session hash, as a guest join does, and skips `putMember` when `userId` is null.
- **No library rows for guests.** The scene is built straight from `SHIPPED_MAPS`, with no `assetId`, as rooms did before ADR 0036. The guest's in-room pickers read the client's built-in catalogs (D8). So `ensureShippedMaps` is never called for a guest, and nothing needs cleaning up later.
- **Address key:** IPv4 as is, and IPv6 cut to its /64 (`addressKey()` beside the limiter). This closes the EDGE-PROTECTION "Still open" gap for this limiter only. Moving other limiters is a separate change.
- **20 per hour:** a classroom behind one NAT can still start a room each. One machine cannot make more than 480 a day, and step 5 bounds what each browser keeps.
- **Step 5 is not atomic** with step 6. Two parallel requests from one browser could make a 4th room. That is accepted: the address limit still bounds it, and the count is a nudge, not a security boundary.
- **`shippedMap`** is the new optional `CreateRoomRequest` field: `z.enum(SHIPPED_MAP_SLUGS).optional()`. The account path accepts it too, so the dashboard could use it later, but no account UI sends it in this change. It is additive, so old clients parse unchanged, and it is recorded in ADR 0068.
- **Walls** are not applied at creation. Map setup's Detect walls already offers a shipped map's stored walls with no job (FR-GM-19). Room creation matches the library placement of the same map.

### D4. Upload refusal sits beside the existing room checks

In `POST /api/uploads`, right after the GM-seat check and **before** the rate limiter, the allowance check and `receiveImage`:

```ts
if (await store.isGuestRoom(actor.roomId)) return res.status(403).json({ error: t(GUEST_UPLOAD), code: GUEST_UPLOAD });
```

`uvttRoutes.ts` adds the same check for `POST ${base}/imports`, after the GM-seat guard and before multer reads the body. The other `/uvtt` routes edit or delete an import that cannot exist in a guest room. A refused upload costs one indexed lookup. The message is a catalog id (ADR 0054).

### D5. Built-in-art check in the room pipeline, after `decide`

Refusing uploads protects the disk. It does not make "built-ins only" true, because a command can name any image URL, such as `/uploads/<key>` from another room. So `LiveRoom.commit` gets one guard:

```
events = decide(state, command, ctx)            // unchanged, pure
if (this.guest && boardImageUrls(events).some((u) => !isBuiltinImageUrl(u)))
  reject({ code: "guest_asset" })                // nothing appended, nothing broadcast
append → reduce → broadcast                      // unchanged
```

- **`boardImageUrls(event)`** is a new pure helper in `packages/shared`. It returns the map and token image URLs a `DomainEvent` would put on the board:
  - `MapSet.map.url`;
  - `TokenCreated.token.imageUrl`;
  - `TokenImageSet.imageUrl`;
  - every scene map and token `imageUrl` inside a `TableState`, which covers `EncounterApplied`, scene creation and copy, preparation and checkpoint restores.
  Its unit test runs it on one sample of every `DomainEvent` type. A new event that carries an image therefore fails the test until the helper learns it.
- **`isBuiltinImageUrl(url)`:** true only for an origin-relative path under `/img/` with no `..`, `//`, `\`, `?` or `#`. That covers every shipped map, built-in token and built-in creature. A path under `/img/` that names no file just fails to load, which is harmless. It is stricter than an exact catalog match, and it needs no move of the web catalogs into `shared`.
- **`this.guest`** is read once with `isGuestRoom` when the room loads. A room only changes from guest to account-owned through the move, which re-reads it (D7).
- **Why after `decide` and not inside it:** `decide` and `reduce` stay pure and free of account data (invariant 2), and no shared schema changes. Checking the events, not the commands, catches every route to an image in one place: a URL in a command, a map picked by `assetId` (which `LiveRoom` already resolves), a prepared scene, a UVTT import or an encounter. Only the GM can set map and token art today (`token.create`, `token.setImage` and the image fields of `token.configure` all need `can.administer` in `decide`). The guard checks events, not roles, so it would still hold if a later change let players set art. Players' dice looks are not board art and are not checked.
- **Why not leave it to the UI:** CLAUDE.md invariant 7. The rule is "guests use only built-ins", and a forged request must not get around it.
- **Rejection** uses the room's existing command-rejection path with the code `guest_asset` and a catalog message. Invariant 1 holds: a rejected command produces no event.

### D6. Limits reuse the existing limiter

`accountLimits()` gains `guestRoomsPerAddress: new RateLimiter(20, 60 * MINUTE, now)`. It is per process, like every limiter here, which is fine on the one app server (ADR 0017 I4).

**Not added: a global ceiling or CAPTCHA.** Guest rows are small: an identity row, a room row and a short log, with no objects and no library rows. Address and browser limits plus the 30-day sweep bound them. If abuse shows up, a ceiling is one `count(*)` in D3 step 5. EDGE-PROTECTION's Cloudflare step is the answer to many-address floods.

### D7. Idle expiry, and saving to an account

**Expiry, in the existing hourly sweep.** `sweepTemporaryRooms` in `app.ts` becomes a sweep of both kinds of rooms:
- temporary rooms older than 24 hours (unchanged);
- guest rooms idle 30 days (`GUEST_ROOM_IDLE_MS`, exported like `TEMPORARY_ROOM_LIFETIME_MS`).
Each room is deleted with `rooms.deleteRoomFully`, so ADR 0009 holds as written: the live room is closed with `sessionEnded { reason: "deleted" }`, children and log are removed in one transaction, and Redis seq is cleaned up. A guest room has no recorded uploads.

Then `deleteEmptyGuestOwners(now − 1 day)` deletes guest identities that own no rooms. A guest identity can own nothing else. The one-day floor keeps the sweep from racing a `registerGuestGm` that is about to create a room. Pre-account identities are never touched.

**Why 30 days:** it outlasts a fortnightly or monthly game night. It matches the account session's idle limit. A shorter value would delete real groups' rooms. A longer one buys nothing a free account does not give.

**Why delete and not "archive":** ADR 0009 has no soft delete, and a guest has no account to restore into.

**Saving is the legacy move, unchanged.** `claimDeviceOwner` repoints the guest's rooms to the account owner and deletes the guest row. The rooms are then account rooms (D1).
- After the move, the claim route calls `registry.loaded(roomId)?.refreshGuest()` for each moved room, so an open room drops its `guest` flag at once.
- The GM's room credential has no `session_hash`, so it keeps working. The first Resume from another device creates the `room_members` row (ADR 0017 M2).

**Web: saving takes one click and the sign-up form.**
- "Save to a free account" is in the guest notice, in the room's More menu (always, so "Not now" never hides it), and on the demo's Done step. It opens `/signup?next=/gm-dashboard?save=1`. Sign-up links to sign-in with the same `next`, and a browser already signed in goes straight to `next`.
- On `/gm-dashboard?save=1`, when this browser holds a GM token the server knows, the dashboard makes the move on arrival, with no second click. It then removes `save=1` from the URL (replace), says what was saved, and lists the rooms under Hosting.
- Without `save=1` (a GM who simply signs in), the existing offer appears and waits for the GM's choice, as before. Its strings change from "from before accounts" to "started in this browser". It also says guest rooms stop expiring.

**Why the move may run on arrival from Save:** FRONTEND-CONTRACT §13.1 "Never silently merge" and ADR 0017 O2 want the move to be the GM's explicit choice, never a side effect of signing in. Pressing "Save to a free account" inside the guest room is that choice, made by the person at that table, so asking again on the dashboard only adds a step. The shared-computer case the rule guards against is someone signing in who did not start the rooms; that path still gets the offer and moves nothing until accepted. `save=1` is only a hint to the browser: the server still requires the session and the device token, as for any move.

### D8. What the guest GM sees

New `GET /api/rooms/:roomId/guest`:
- authorized by the room's GM credential (`Bearer`), the same check `uvttRoutes.authorize` uses;
- returns `GuestRoomStatus = { guest: boolean, idleDays: 30 }`;
- answers 403 to any other caller.

It is a REST response with no room data, so it needs no visibility filter. It is never sent to players.

**Why an endpoint and not a client guess:** only the server knows the owner. A signed-in GM can be in an unmoved guest room, and a moved room's GM can be signed out with a valid credential.

**Web:**
- **`/start` page** (`pages/StartPage.tsx`, route in `router.ts`):
  - map cards from `SHIPPED_MAPS`, using the shipped images;
  - Your name, and Room name defaulting to the map name;
  - Start, plus sign-in and sign-up links;
  - a "Guest rooms in this browser" list from `GET /api/gm/rooms`, with Open and Delete. Delete reuses the dashboard's delete dialog;
  - the pre-account message when D2 finds a pre-account token;
  - the 409 and 429 messages.
  A signed-in visitor is redirected to `/gm-dashboard`. It uses the house components and the i18n catalogs (en, zh-TW, terms per `docs/GLOSSARY-zh-TW.md`).
- **Home and sign-in:** "Start a room" keeps linking to `/gm-dashboard`, so a signed-out visitor still reaches sign-in. The sign-in and sign-up pages gain a "Continue as guest GM" link to `/start`. The hosting line changes as specified.
- **Room** (guest rooms only):
  - a dismissible GM notice with "Save to a free account";
  - the map and token art pickers list only the built-in catalogs (`SHIPPED_MAPS`, `BUILTIN_ASSETS`, `BUILTIN_CREATURES`), never `GET /api/library`;
  - the upload and UVTT import controls, Save as template, Save to library and Room settings show a short "Free account" note with a sign-up link instead.
  The invite, share, QR, reset, lock and revoke controls are unchanged. Nothing changes for players.

### D8a. The guest room offers an interactive demo, client-only

Continuing as a guest GM leads into the demo. On the guest room's first open, the GM is asked whether to try the interactive demo. Yes teaches the table by having the GM do each thing once. No dismisses it for that room. It lives entirely in `apps/web`, with no server, schema or event change.

- **Where:** a `GuestTutorial` component in the room page, rendered only when the guest status (D8) says `guest` and the viewer is the GM.
- **Anchors:** each step points at the real control through a `data-tutorial="<step>"` attribute on that control. A step whose anchor is not on screen (narrow layout, closed panel) shows as a bottom sheet with the same text.
- **Advancing:** a step completes on a fact in the GM's own room state or an action the client already performs, compared with its value when the step started:
  - **invite:** the invite link is copied or shared, through the existing copy and share handlers;
  - **token:** the token count goes up;
  - **move:** a `TokenMoved` event is applied;
  - **fog:** the fog region count goes up;
  - **roll:** a roll by the GM appears.
  A step whose fact is already true when it would start is skipped.
- **Progress:** `localStorage` key `vtt.tutorial.<roomId>`, holding the step index, `"declined"` or `"done"`; no key means the question has not been asked yet. Reads and writes are in try/catch like other storage reads. When storage fails, the question and demo still work for that page load. An "Interactive demo" item in the GM's room menu starts it again.
- **Accessibility:** the step is a non-modal `role="dialog"` with a heading. Focus moves to it, and Escape closes it as Skip tutorial. It is reduced-motion aware and fits 390px.
- **Why client-only:** the tutorial watches what the GM does; it decides nothing. Invariants 1, 3 and 7 are untouched. Progress is a per-browser convenience, so `localStorage` is the right place.
- **Alternative rejected: a scripted practice room with fake players.** It needs seeded state, bots and a second code path. Teaching inside the guest's real room means the GM ends the tutorial with a room they can already share.

### D9. Funnel hook for `product-funnel-metrics`

That change (branch `feat/product-funnel-metrics`, parked as a draft) counts `room` in `POST /api/rooms` after `createRoomWithSeat`. Guest rooms go through the same route, so they are counted in `room` with no extra work. To measure the sign-up drop-off, its recorder gets two more steps:

| Step | Where | Meaning |
|---|---|---|
| `guest_room` | `POST /api/rooms`, guest path, after `createRoomWithSeat` | A room was started without an account (subset of `room`) |
| `guest_saved` | `POST /api/gm/legacy/claim`, after a move whose device identity was a guest, once per moved room | A guest room was kept in an account |

`signup` and `room − guest_room` show whether guests later sign up and host with an account. Its existing `first_move` step already shows whether guest rooms get players. Being a guest never enters a room event, so that change's own D4 rule ("noticed after commit, never decided") is unaffected. Whichever change merges second adds these two calls. If funnel merges first, tasks group 7 does it here. Otherwise `/opsx:update product-funnel-metrics` adds them there.

### D10. Shared contract and ADR

- **`packages/shared`:**
  - `CreateRoomRequest.shippedMap` (optional, additive);
  - `LegacySummary.guest` (added to a response);
  - `SHIPPED_MAP_SLUGS`;
  - `GuestRoomStatus`;
  - `boardImageUrls` and `isBuiltinImageUrl` (pure helpers, not schemas);
  - the codes `guest_upload`, `guest_asset`, `guest_room_limit` and `legacy_identity`, with their message ids in en and zh-TW.
- `Command`, `DomainEvent`, `RoomState`, `HandshakeAuth`, `decide`, `reduce` and `visibility.ts` are unchanged.
- ADR 0068 records:
  - the reversal of §13.1's account-only hosting;
  - the new expiry;
  - the built-in-art guard in the room pipeline;
  - the two schema additions.
  It goes to the Real-Time Architecture owner for review.

## Risks / Trade-offs

- [Guest spam fills the database with rooms] → 20 per hour per address (/64 for IPv6), 3 per browser, 30-day expiry, empty-identity cleanup. A global ceiling is a one-line follow-up (D6).
- [Many-address floods bypass per-address limits] → Same as every per-address limit today. EDGE-PROTECTION's Cloudflare step is the planned answer.
- [A guest loses their room by clearing site data or by 30 idle days] → Said plainly on `/start` and in the room. Saving to a free account removes both risks.
- [Reverses an accepted product decision] → ADR 0068 and Real-Time Architecture owner review before implementation starts. The scope is narrower than the removed "Continue as guest": no library, no uploads, built-in art only, expiry.
- [A pre-account GM who clicks Start a room signed out is asked to sign in] → Intended. Their rooms and uploads are real, and signing in plus the move keeps them all.
- [A guest GM who signs in but hasn't moved the room yet can't use their account art in it] → The room is still a guest room until the move. The "free account" note links to the dashboard offer, and the move ends the limit at once (D7).
- [A new event type that carries an image is missed by `boardImageUrls`] → Its unit test runs every `DomainEvent` type and fails on an unknown one.
- [The 3-per-browser count races] → Accepted (D3). It is a nudge, bounded by the address limit.
- [Existing QA and Playwright steps assume Start a room goes to sign-in] → Updated in tasks group 8.
- [Archive order] → The deltas target requirements that `user-accounts` adds. Archive `user-accounts` before this change. `openspec validate` lists them as info until then.

## Migration Plan

1. Migration `…_guest_identities`: add `gm_identities.guest` with default false. It is additive, so old code ignores it, and every existing identity stays pre-account.
2. Ship server and web together. No existing room changes behaviour, because no existing identity is a guest.
3. **Rollback:** revert the code. Guest identities then behave like pre-account ones: they keep their rooms through the token, and nothing sweeps them or checks their art. The column can stay.
4. Docs land with the code: ADR 0068, FRONTEND-CONTRACT §13.1, DESIGN.md §5, §6 and §8, and INTERFACE.md.

## Open Questions

- **Starting values:** 20 per hour, 3 per browser and 30 days. Tuning them changes no structure.
- **Whether the dashboard should show a signed-in GM their unmoved guest rooms** before they accept the offer. The offer's counts already say how many there are.
