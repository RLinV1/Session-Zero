# ADR 0068: Guest GM hosting on built-in art

**Status:** Proposed. Draft; needs review by the Real-Time Architecture owner (Raymond) before implementation starts. · **Amends:** ADR 0017 (accounts; in `openspec/changes/user-accounts/design.md`), `docs/FRONTEND-CONTRACT.md` §13.1 · **Relates to:** ADR 0002 (transport and identity), ADR 0004 (asset library), ADR 0009 (room deletion), ADR 0033 (temporary rooms), ADR 0036 (seeded shipped maps), ADR 0051 (seat limits), ADR 0052 (AI seats)
**Change:** `openspec/changes/guest-gm-hosting`

## Context

FRONTEND-CONTRACT §13.1 says "Play requires an authenticated account to create a room". It also says "Do not introduce unclaimed-room authority, expiry or ownership transfer in the Core Loop". ADR 0017 built that rule. It turned the GM device identity into legacy that can read, edit and delete, but create nothing.

On the live site, that puts a sign-in form in front of every new GM before they can try the product with friends, while players join with no account. The reason to keep accounts in front of hosting is storage: uploads are bounded per account (2 GB, `upload-byte-checks-and-account-quota`), and production has one 30 GB disk. A room that uses only built-in art stores no object bytes.

## Decision

1. **Guest identities.** `gm_identities.guest` (boolean, default false) marks identities the server registers for guests. Every existing identity is pre-account and stays false.
   - `POST /api/rooms` accepts either a session (unchanged) or an `X-GM-Token`.
   - For an unknown token, the server registers a guest identity (SHA-256 only).
   - For a pre-account token, it answers 409 `legacy_identity` and creates nothing.
   - A valid session always wins over a token.
2. **A guest room is a room owned by a guest identity.** It starts on a shipped map: `CreateRoomRequest` gains `shippedMap?: ShippedMapSlug` (optional, additive), and the first `MapSet` is built from `SHIPPED_MAPS` through the existing `createRoomWithSeat` scene path. Guests get no library rows.
3. **Guest rooms are full rooms.** Invites, share, reset, lock, revoke, AI seats and every table feature work unchanged. Nothing in the join path or the kernel looks at the owner.
4. **Built-in art only, enforced on the server.**
   - `POST /api/uploads` and `POST /api/rooms/:roomId/uvtt/imports` answer 403 `guest_upload` for a guest room, before the body is read.
   - In `LiveRoom`, after `decide` and before append, a guest room rejects with `guest_asset` any command whose events would put a map or token image outside `/img/` on the board. Only the GM sets map and token art today. The guard checks events, not roles, so it holds for anyone. The pure shared helpers `boardImageUrls` and `isBuiltinImageUrl` do the check.
   - `Command`, `DomainEvent`, `RoomState`, `HandshakeAuth`, `decide`, `reduce` and the visibility filters are unchanged.
5. **Limits.** 20 guest rooms per hour per client address (IPv6 by /64). At most 3 rooms per guest identity (409 `guest_room_limit`).
6. **Expiry.** This is the exception to §13.1's "no expiry". A guest room with no event for 30 days is deleted by `deleteRoomFully`, exactly as ADR 0009 defines deletion. Guest identities left with no rooms, and registered over a day ago, are deleted. Pre-account identities and their rooms are never swept.
7. **Ownership transfer.** This is the exception to §13.1's "no ownership transfer". It is the existing explicit legacy move (ADR 0017 O2), which deletes the device row, so moved rooms become account rooms. It never runs on sign-in by itself. `LegacySummary` gains `guest`, so the start page can tell a pre-account browser to sign in instead.

## Consequences

- §13.1's hosting line becomes: "No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps." The account stays free, and no feature is tiered or paid.
- Guest growth is rows and logs only, bounded by rate, count and time. Many-address floods remain the edge's job (`docs/EDGE-PROTECTION.md`).
- Players are unaffected: they never set map or token art in any room, and their dice looks are not checked.
- A guest who clears site data loses access to their guest rooms. The app says so on the start page and in the room.
- Rollback: revert the code. Guest identities then behave like pre-account ones. The column can stay.
