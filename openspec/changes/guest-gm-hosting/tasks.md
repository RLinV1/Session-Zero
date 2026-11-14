## 0. Before starting

- [ ] 0.1 Get ADR 0072 (`docs/adr/0072-guest-gm-hosting.md`) reviewed by the Real-Time Architecture owner, and record the outcome in its Status line. Verify: the Status no longer says "Draft".
- [ ] 0.2 Confirm `user-accounts` is archived (or archive it first). Then run `openspec validate guest-gm-hosting --strict`. Verify: it shows no "Archive would refuse" info lines.

How to run implementation:
- Use Sonnet subagents, at most 3 at a time, one per group below. Two groups that run together must not touch the same files.
  - Groups 1–3: server and shared. Group 4 (docs) can join group 1.
  - Groups 5–6: web.
- Subagents do not run the test suite. Each one writes the tests named in its tasks.
- One final `npm run lint && npm run typecheck && npm test` and one Playwright pass in Chrome (group 8) verify everything.

## 1. Shared contract (packages/shared)

- [x] 1.1 Export `SHIPPED_MAP_SLUGS` from `shippedMaps.ts`. Add `shippedMap: z.enum(SHIPPED_MAP_SLUGS).optional()` to `CreateRoomRequest` and `guest: z.boolean()` to `LegacySummary`. Verify: a unit test in `packages/shared/test` (FR-GM-01) parses a create request with and without `shippedMap`, and rejects an unknown slug.
- [x] 1.2 Add `GuestRoomStatus` (`{ guest: boolean, idleDays: number }`) and the codes `guest_upload`, `guest_asset`, `guest_room_limit` and `legacy_identity`. Add their message ids in `i18n/messages/en` and zh-TW, using the terms in `docs/GLOSSARY-zh-TW.md`. Verify: `npm run typecheck`.
- [x] 1.3 Add pure helpers `isBuiltinImageUrl(url)` and `boardImageUrls(event)` (design D5). Verify:
  - unit tests for `isBuiltinImageUrl` accept every `SHIPPED_MAPS` URL and a built-in token path;
  - they reject `/uploads/x`, `https://…`, `/img/../uploads/x`, `//host/img/x` and paths with `?` or `#`;
  - a `boardImageUrls` test builds one sample of every `DomainEvent` type, checks the URLs returned for `MapSet`, `TokenCreated`, `TokenImageSet` and a `TableState`-carrying event, and fails on any event type it doesn't handle.

## 2. Server: identity and creation

- [x] 2.1 Prisma migration `…_guest_identities`: `gm_identities.guest Boolean @default(false)`. Verify: `prisma migrate dev` applies cleanly on the compose Postgres (`npm run dev:db`).
- [x] 2.2 Add to `RoomStore`, in both `MemoryRoomStore` and `PostgresRoomStore`:
  - `registerGuestGm(tokenHash)` → `{ ownerId, guest }`;
  - `isGuestRoom(roomId)`;
  - `countOwnedRooms`;
  - `listIdleGuestRoomsBefore(at)` (latest event, else creation);
  - `deleteEmptyGuestOwners(registeredBefore)`.

  Also include `guest` in `ownedCounts`. Verify: store tests run against the memory store.
- [x] 2.3 `roomLifecycle.createRoomWithSeat`: make `userId` and `sessionHash` nullable, and skip `putMember` when `userId` is null. Verify: covered by 2.5's tests.
- [x] 2.4 `accountLimits()`: add `guestRoomsPerAddress` (20 per hour), plus an `addressKey(ip)` helper that cuts IPv6 to its /64. Verify: a unit test for `addressKey`:
  - IPv4 comes back unchanged;
  - two addresses in one /64 share a key;
  - IPv4-mapped IPv6 maps to the IPv4.
- [x] 2.5 `POST /api/rooms` guest path, as in design D3. The account path also honours `shippedMap`. Verify: integration tests in `apps/server/test`, under `describe("guest rooms (FR-GM-01)")`:
  - create works, the map and grid are set, and no library rows are created;
  - 401 with neither a session nor a token;
  - 400 for an unknown slug, and 400 with a `templateId`;
  - 409 `legacy_identity` for a token whose identity has `guest = false`, and that identity is unchanged;
  - 409 `guest_room_limit` at a 4th room;
  - 429 with `Retry-After` on the 21st request from one address;
  - a session wins over a token;
  - the raw token appears in no stored record.
- [x] 2.6 Guest invites. Verify: an integration test where a guest GM's room is joined by two players through the invite, the GM resets the invite and revokes one player, and an AI-style client joins through the invite. Each step behaves as in an account room.

## 3. Server: refusals, image guard, status and sweep

- [x] 3.1 `POST /api/uploads`: when `isGuestRoom`, answer 403 `{ code: "guest_upload" }`. Do it before the limiter, the allowance check and `receiveImage`. Verify: integration tests (FR-GM-02) for the map and token purposes assert:
  - 403;
  - no object in the asset store;
  - no `room_uploads` row;
  - allowance use unchanged.
- [x] 3.2 `POST /api/rooms/:roomId/uvtt/imports`: the same refusal, before multer reads the body. Verify: an integration test asserts 403 and no import draft.
- [x] 3.3 `LiveRoom`: load `guest` with the room. After `decide`, reject with `guest_asset` when any `boardImageUrls` URL fails `isBuiltinImageUrl`. Add `refreshGuest()`, and call it from `POST /api/gm/legacy/claim` for each moved room. Verify: integration tests in a guest room:
  - a map set to `/uploads/<key>` is rejected and nothing is appended;
  - a library map picked by `assetId` whose URL is an upload is rejected;
  - a signed-in GM's own account image is rejected while the room is still a guest room;
  - built-in maps, built-in token art and built-in creatures are accepted;
  - after the move, the same upload-URL map change is accepted with no reconnect.
- [x] 3.4 `GET /api/rooms/:roomId/guest` with the room's GM credential, returning `GuestRoomStatus`. It answers 403 for a player credential or none. Verify: integration tests for the GM of a guest room, the GM of an account room, and a player.
- [x] 3.5 Extend the hourly room sweep in `app.ts`: guest rooms idle over `GUEST_ROOM_IDLE_MS` (30 days, exported) go through `rooms.deleteRoomFully`, then `deleteEmptyGuestOwners(now − 1 day)` runs. Expose it on `App` like `sweepTemporaryRooms`. Verify: integration tests on a fake clock:
  - a room idle 30 days and 1 hour is deleted, and a connected client gets `sessionEnded { reason: "deleted" }`;
  - a room active 8 days ago stays;
  - a pre-account device room idle 60 days stays;
  - an empty guest identity is deleted, and its token then gets 401.
- [x] 3.6 Run the `visibility-auditor` and `sync-reviewer` agents on the server diff. Verify: no findings about room payloads, purity of `decide`/`reduce` or event ordering, or each finding fixed.

## 4. Docs

- [x] 4.1 Update these docs:
  - `docs/FRONTEND-CONTRACT.md` §13.1: the hosting rule, the expiry and transfer exceptions, and the new home line;
  - `docs/DESIGN.md` §5 Identity, the §6 FR-GM-01 row, and the §8 ADR index (0072);
  - `docs/INTERFACE.md`: the home section and a `/start` route row.

  Verify: `grep -rn "requires an authenticated account to create a room\|Room creation stays behind a free account" docs` finds nothing outdated.

## 5. Web: entry and start page

- [x] 5.1 Add to `net/identity.ts`: `ensureGmToken()` reuses the stored `vtt.gm`, or else stores 32 random bytes in base64url. Add to `net/api.ts`: a guest `createRoom` that sends `X-GM-Token`, and `api.rooms.guestStatus`. Verify: `npm run typecheck` and the Playwright pass.
- [x] 5.2 New `pages/StartPage.tsx` and a `/start` route in `router.ts`, as in design D8. Invoke the `impeccable` and `design-taste-frontend` skills. Use house components, and `t()` in en and zh-TW. The page has:
  - shipped-map cards;
  - Your name, and Room name defaulting to the map name;
  - Start;
  - sign-in and sign-up links with `next=/gm-dashboard`;
  - a "Guest rooms in this browser" list with Open and Delete (reuse the dashboard's delete dialog);
  - the pre-account message, using `GET /api/gm/legacy` and its `guest` value;
  - the honesty text;
  - the 409 and 429 messages;
  - a redirect to `/gm-dashboard` when signed in.

  Verify: `npm run lint` (no literal UI text) and the Playwright pass.
- [x] 5.3 Home: `Hero.tsx` and `ClosingBand.tsx` link to `/start` when signed out and to `/gm-dashboard` when signed in. Replace the hosting line with "No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps." in en and zh-TW. Check the `landing-differentiators` branch first and keep its hero layout. Verify: the Playwright pass at 1366×768 and 390×844.
- [x] 5.4 The sign-up page links to sign-in with the same `next`, and the reverse, if not already so. Verify: the Playwright pass.

## 6. Web: room and dashboard

- [x] 6.1 Room page, GM view only: fetch the guest status once. When `guest` is true, show a dismissible notice: the room is kept in this browser and deleted after 30 days without play, with "Save to a free account" → `/signup?next=/gm-dashboard`. Verify: the Playwright pass, with a player tab that shows no notice.
- [x] 6.2 In a guest room:
  - the map, token art and creature pickers list only `SHIPPED_MAPS`, `BUILTIN_ASSETS` and `BUILTIN_CREATURES`, and never call `GET /api/library`;
  - the map upload, token-art upload and UVTT import controls, Save as template, Save to library and Room settings show a short "Free account" note with a sign-up link;
  - a `guest_upload` or `guest_asset` refusal that still arrives shows the server's message;
  - the invite, share, QR, reset, lock and revoke controls are unchanged.

  Verify: the Playwright pass finds no file input and no non-built-in picker item in a guest room, and the invite controls are present.
- [x] 6.3 Dashboard move offer: change the `dashboard.legacy.*` strings in en and zh-TW so they cover guest rooms ("started in this browser", "guest rooms stop expiring once moved"). Verify: the Playwright pass.

## 6a. Web: the guest tutorial

- [x] 6a.0 Undo the home link change from 5.3: "Start a room" in `Hero.tsx` and `ClosingBand.tsx` links to `/gm-dashboard` again, so signed-out visitors reach sign-in. Keep the new hosting line. Add "Continue as guest GM" to the sign-in and sign-up pages, linking to `/start`. Update the home tests that 5.3 changed. Verify: the Playwright pass.
- [x] 6a.1 Add `GuestTutorial` (design D8a) in the room page, for the GM of a guest room only:
  - on first open, the question "Try the interactive demo?" with Yes and No, remembered per room;
  - the seven steps of the spec;
  - `data-tutorial` anchors on the real controls, with a bottom-sheet fallback;
  - each step advances on the GM's real action, and a step already done is skipped;
  - progress kept in `vtt.tutorial.<roomId>`;
  - Skip demo, Escape, and an "Interactive demo" item in the GM's room menu to start it again;
  - focus moves to each step, reduced motion is respected, and it fits 390px;
  - en and zh-TW strings.
  Invoke the `impeccable` and `design-taste-frontend` skills. Verify: a unit test for the step logic (advance on a fact, skip a step already done, resume from storage, storage failure) under `apps/web/test`, plus the Playwright pass.

- [x] 6a.2 One-click save (design D7, guest-hosting "Save guest rooms to an account"): `SAVE_ACCOUNT_HREF` opens `/signup?next=/gm-dashboard?save=1`; the room's More menu always offers "Save to a free account" in a guest room; `/gm-dashboard?save=1` runs the move on arrival when the browser holds a known GM token, then strips `save` (replace) and shows what was saved. Without `save=1` the offer waits as before. Test: the dashboard moves on arrival with `save=1` and only offers without it. Verify: the Playwright pass.

## 7. Funnel hook (only if `product-funnel-metrics` is merged first)

- [ ] 7.1 Record `guest_room` on the guest path of `POST /api/rooms`, and `guest_saved` for each moved room in `POST /api/gm/legacy/claim` when the device identity was a guest. Add both to the report's columns and to the privacy notice's step list. If funnel is not merged, skip this and run `/opsx:update product-funnel-metrics` to add them there instead. Verify: the funnel integration test counts one `room` and one `guest_room` for a guest create.

## 8. Final verification

- [x] 8.1 Run `npm run lint && npm run typecheck && npm test` once, after all groups. Verify: all pass; paste the summary lines.
- [x] 8.2 Playwright MCP, Chrome only, on `npm run dev`. Steps:
  1. Signed out, Start a room from `/` reaches sign-in, and "Continue as guest GM" opens `/start`.
  2. Pick Sunken Crypt and start: the room opens with that map and grid.
  3. The room asks about the demo; Yes starts it, and it advances on real actions (invite, token, move, fog, roll). The guest notice shows, the pickers list only built-ins, and no upload control is offered.
  4. Copy the invite link. A second tab joins as a player with no account and sees no notice.
  5. A forged `fetch` to `/api/uploads` from the GM tab gets 403 `guest_upload`.
  6. A forged map command naming an `/uploads/` URL is rejected with `guest_asset`.
  7. "Save to a free account" leads to sign-up and then to the dashboard offer. Accepting it lists the room under Hosting, the notice is gone, and a map upload succeeds.
  8. A browser seeded with a pre-account token sees the pre-account message on `/start`.
  9. Re-check the home page at 1366×768 and 390×844.

  Verify: screenshots of steps 2, 3, 4 and 7.
- [x] 8.3 Update existing QA and Playwright notes that assume Start a room leads to sign-in. Verify: `grep -rn "Continue as guest\|Start a room" docs/qa* apps/web/e2e 2>/dev/null` finds no stale step.
