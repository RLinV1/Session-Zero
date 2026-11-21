## Context

Guest seats are stored per room as `vtt.credentials.<roomId>` → `StoredCredentials` (`roomId`, `participantId`, `guestToken`, and `inviteCode` for the GM's own seats only). `JoinPage` writes them; `RoomPage` reads them, and on status `ended` calls `forgetCredentials`. A connection refused at the handshake goes to status `unauthorized` and never reconnects. The join response carries no room name, but every snapshot's `state.name` does.

## Decisions

**Record the name from the room page, not at join.** Recording from the snapshot needs no server change, fills in names for seats created before this change the next time they are opened, and follows a rename. `rememberRoomName` writes only when the stored name differs, so steady snapshots cost one read.

**Dead seats are forgotten, only on `unauthorized`.** The handshake refuses with `unauthorized` when the server has no credential row for the token; deleting a room deletes its credentials (ADR 0009), so a deleted room lands here too. That is permanent, so the room page calls `forgetCredentials` and the row disappears. `not_found` is also sent when a room's log fails to load (room-load-isolation) or the store throws, which can recover, so the seat is kept. The snapshot gains `refusal` so the room page can tell the two apart; both still show the same "No access" screen.

**GM seats excluded by `inviteCode`.** Same rule `guestRoomForInvite` already uses. The GM dashboard owns those rooms.

**Listing takes an injectable storage.** `listJoinedRooms(storage)` needs `length`/`key` to enumerate keys, so it takes `Pick<Storage, "getItem" | "key" | "length">` defaulting to `localStorage`, and returns `[]` if any access throws. Rows are sorted by name for a stable order; unnamed seats sort last.

**Placement.** Inside `.hero-paths`, before `JoinBlock`, styled like the other two paths (label with icon, hint, list). Nothing renders when the list is empty, so the Landing is unchanged for new visitors and private browsing.

## Risks

- **Per-browser only.** Stated in the hint text; KAN-57 replaces it.
- **Dead seats look live until opened once.** Accepted: no endpoint exists to check them and adding one is out of scope for this ticket.
