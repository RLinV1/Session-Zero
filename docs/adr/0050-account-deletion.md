# ADR 0050: Account deletion

**Status:** Proposed · **Builds on:** `docs/adr/0009-room-deletion.md`, ADR 0017 (accounts)
**Changes:** `openspec/changes/account-deletion`

## Context

An account owns one `gm_identities` row, and rooms, library assets, creatures, dice looks, animations and encounter templates hang off it. Sessions, seat credentials and room memberships hang off the user. Nothing could remove an account, so a person could not take their data out of the service.

## Decision

`DELETE /api/auth/account` with `{ password }` erases the signed-in account. It requires JSON, a session (401), and the current password (403 with `field: "password"`), counted on the same `passwordChangeFailuresPerUser` limiter as a password change. Success is 204 with the session cookie cleared.

### Order

1. Delete every room the owner has, temporary ones included, through `deleteRoomFully` (ADR 0009). Room events are erased only through that path.
2. `IdentityStore.deleteUser`, one transaction, children first: credentials of the user's sessions (the foreign key is RESTRICT), sessions, room memberships, the active dice look, the owner's library rows (references, creatures, encounter templates, animations, dice looks, assets), then `users`, then `gm_identities`.
3. After the commit: close sockets on the ended credentials, then delete the stored objects (library assets and dice faces, never built-in `shipped:` art), best-effort.

There is no `ON DELETE CASCADE`. A room left behind makes the final delete fail on its foreign key, so nothing is erased silently.

### Failure model

The user row goes last. If a room delete or the transaction fails, the account still exists and the request can be retried. Rooms already deleted stay deleted. Failed object deletes are logged; the leftovers have random names and nothing references them.

## Consequences

- Deletion is permanent. There is no grace period, soft delete or export.
- Rooms the user only joined survive; their seat and membership go, and the participant stays in that room's log under its display name.
- A large account deletes rooms one at a time, so the request can take seconds.
