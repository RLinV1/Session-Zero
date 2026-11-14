## Why

A first visit to https://sessionzero.codes/ shows the problem. A player follows an invite and is at the table with no account. A GM clicks **Start a room** and lands on `/signin` before seeing anything. The first thing the product asks of a would-be host is a form, so trying it costs a sign-up. For M5/M6 the team wants real GMs to try Session Zero with their friends, and that wall is the first drop-off.

Hosting was made account-only on purpose. `user-accounts` (FR-GM-01, FRONTEND-CONTRACT.md §13.1 "Free account required to host") removed "Continue as guest". The main reason now is storage: the 2 GB upload allowance (`upload-byte-checks-and-account-quota`) is per account, and production runs on one 30 GB disk. Unlimited guest uploads could fill it.

This change lets a signed-out GM start a room at once, invite players and run a real table. The room uses only what already ships: the 6 built-in maps, the built-in token art and the built-in creatures. Uploading needs a free account. The account stays free and gives the same features to everyone, so nothing becomes tiered or paywalled. The account gates storage, not features.

## What Changes

**Reverses part of an accounted decision.** `user-accounts` made hosting require an account and made the GM device identity create-nothing legacy. This change brings back a narrow guest host, with limits the old "Continue as guest" never had. These requirements change:
- `gm-home` "Legacy GM device identity" is renamed "Guest GM device identity". The server again registers device tokens, but **only as guest identities, only to start a guest room**, and it records which identities are guests. Tokens from before accounts stay pre-account: they still create nothing, and they are never made guests.
- `gm-home` "Both paths in the first screen" and "The home page does not overstate what is saved": the line "Free account required to host; players join without one." becomes "No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps." A signed-out visitor's run path goes to the guest start page, not to sign-in.
- `gm-dashboard` "GM dashboard": the scenario "Creating a room without an account: 401" now applies only when the request also has no GM token.
- `gm-dashboard` "One entry rule for the dashboard": the home page's run path no longer goes through it for a signed-out visitor. Direct visits to `/gm-dashboard` and `/library` still need sign-in.
- `gm-dashboard` "Bring this browser's rooms into the account": the offer now also covers guest rooms, and its wording no longer says "from before accounts".

**New: guest rooms** (`guest-hosting`)
- **Start now.** A signed-out visitor who follows **Start a room** gets a guest start page. They pick one of the 6 shipped maps, give their name, and land at the table with that map set.
- **Continue as guest GM, with an interactive demo.** "Start a room" still opens sign-in, which now also offers **Continue as guest GM**. The first time the guest GM opens their room, it asks whether they want to try the interactive demo. If they say yes, short steps beside the real controls walk them through it. They invite players, place a token, move it, add fog and roll. Each step moves on when they actually do it. The GM can skip it, restart it, and pick up where they left off after a reload. Players never see it.
- **A real table.** The invite link, share and QR code, invite reset, room lock, revoke, AI player seats and every table feature work as in any room. Players join with no account, as today.
- **Built-in art only, checked on the server.**
  - Every upload into a guest room is refused: map and token images, and UVTT imports.
  - A room command that would put any other image on the board is also refused. This covers a hand-sent `/uploads/` link from another room. Players are unaffected: only the GM sets map and token art, in any room.
  - The library, creatures, encounter templates and dice-look pictures already need an account.
  - In the room, upload and save controls show a short "free account" note with a sign-up link.
- **Pre-account GMs are not guests.** A browser holding a token from before accounts is asked to sign in and bring its rooms over. Its old rooms keep working exactly as now.
- **Creation limits.** At most 20 guest rooms per hour from one address (IPv6 counted per /64), and at most 3 guest rooms held by one browser at a time.
- **Identity.** A guest GM is the existing GM device identity: a browser-made token in `localStorage`, stored by the server only as a SHA-256 hash, now marked as a guest. No new identity type.
- **Lifetime.** A guest room with no activity for 30 days is deleted fully (ADR 0009). Guest identities left with no rooms are removed.
- **Save to account.** Signing up or signing in, then accepting the dashboard's existing move offer (ADR 0017 O2), moves the guest's rooms into the account. Moved rooms stop expiring and allow uploads and any art.
- **Honesty.** The start page and the guest room tell the GM that the room is kept in this browser only and is deleted after 30 days unused. They do not call it "saved".

**Not in this change**
- Raising or changing account quotas, or a guest storage allowance of any size.
- Guest access to the library page, encounter templates, creatures, the AI game builder or room defaults.
- A global cap on guest rooms, CAPTCHA, or email verification.
- Funnel counting itself. design.md D9 names the hook points for `product-funnel-metrics`.

## Capabilities

### New Capabilities
- `guest-hosting`: starting a room without an account on a shipped map; a guest GM runs a full table and invites players; built-in art only, enforced on the server; creation limits per address and per browser; idle expiry and cleanup; saving guest rooms into an account; what the guest GM is told.

### Modified Capabilities
- `gm-home`: "Legacy GM device identity" is renamed and widened to "Guest GM device identity" (guest and pre-account kinds); the home page's run path and hosting line change ("Both paths in the first screen", "The home page does not overstate what is saved").
- `gm-dashboard`: "GM dashboard" (who may create a room), "One entry rule for the dashboard" (the home page's run path), and "Bring this browser's rooms into the account" (covers guest rooms).

These deltas target requirements that `user-accounts` adds or rewrites. That change is merged in code but not archived, so **archive `user-accounts` first**. Until then, `openspec validate` reports the gm-home and gm-dashboard targets as info only.

## Impact

- **Room kernel (`Command`, `DomainEvent`, `RoomState`, `decide`, `reduce`, visibility filters, `HandshakeAuth`): untouched.** Being a guest is access data on the owner row. It never enters room state or any room payload. The built-in-art rule is a server guard in `LiveRoom` after `decide`, not a kernel change.
- **packages/shared:**
  - `CreateRoomRequest` gains an optional `shippedMap` slug, and `LegacySummary` gains `guest`. Both are additive changes to existing schemas, so they need ADR 0072 and review by the Real-Time Architecture owner.
  - New `GuestRoomStatus` response schema.
  - New pure helpers `boardImageUrls` and `isBuiltinImageUrl`.
  - New codes `guest_upload`, `guest_asset`, `guest_room_limit` and `legacy_identity`.
- **apps/server:**
  - `POST /api/rooms` accepts a session **or** an `X-GM-Token`.
  - `POST /api/uploads` and `POST /api/rooms/:roomId/uvtt/imports` refuse guest rooms with 403.
  - `LiveRoom` rejects board images that are not built-in in guest rooms.
  - New `GET /api/rooms/:roomId/guest`.
  - New `guestRoomsPerAddress` limiter.
  - The hourly sweep also deletes idle guest rooms and empty guest identities.
- **Prisma migration:** `gm_identities.guest boolean not null default false`.
- **apps/web:**
  - new guest start page `/start`;
  - the home page's two Start a room links;
  - in guest rooms, a guest notice with a Save to account link, pickers that show only built-ins, and "free account" notes on upload and save controls;
  - the dashboard move offer's wording;
  - new strings in the en and zh-TW catalogs.
- **Docs:**
  - new ADR 0072 "Guest GM hosting" (draft, Proposed);
  - FRONTEND-CONTRACT.md §13.1 "Play requires an authenticated account to create a room" and "Do not introduce unclaimed-room authority, expiry or ownership transfer". `docs/DESIGN.md` §5 Identity points to it as "§13.1", so this is the hosting rule the task calls DESIGN.md §13.1;
  - DESIGN.md §5 Identity ("Creating a room requires an account");
  - DESIGN.md §6 traceability row for FR-GM-01;
  - DESIGN.md §8 ADR index;
  - `docs/INTERFACE.md` home section ("Room creation stays behind a free account"), plus a `/start` row in its route table.
- **Wording shared with parallel changes:**
  - `landing-differentiators` rewrites the home hero. Use this change's hosting line ("No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps.") and keep "Free forever" true. Accounts stay free.
  - `product-funnel-metrics` adds `guest_room` and `guest_saved` steps beside its `room` step (design.md D9).
- **Tests:** FR-GM-01 and FR-GM-02 IDs; server integration tests for guest create, invites, refusals, the image guard, limits, sweep and the move; one Playwright run in Chrome.
