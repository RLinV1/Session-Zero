## Context

`User` owns one `GmIdentity` (owner) row; rooms, library assets, creatures, dice looks, animations and encounter templates hang off the owner. Room deletion is already a reviewed, explicit child-first transaction (ADR 0009, `deleteRoomFully`). The schema has no ON DELETE CASCADE on purpose.

## Goals / Non-Goals

**Goals:** one reviewable deletion path; no orphaned rows or stored objects; no change to existing shared schemas.
**Non-Goals:** soft delete or grace period, data export, email confirmation (no email sending exists), deleting guest seat data (guests have no account).

## Decisions

1. **Orchestrator `domain/accountDeletion.ts`.** Order: end sessions (closing sockets) then `deleteRoomFully` for each owned room (listed with the owner's rooms query the dashboard uses), then library items through the existing `LibraryStore` deletes (collecting object keys), then `IdentityStore.deleteUser`, then stored objects best-effort. Reusing existing paths keeps the invariants (events are erased only through the room-delete trigger path).
2. **`IdentityStore.deleteUser(userId)`** runs one transaction: credentials of the user's sessions, sessions, room memberships, clear `active_dice_look_id`, remaining library rows of the owner, then `users`, then `gm_identities`. The memory store mirrors it. Credentials go before sessions because `Credential.session` is `onDelete: Restrict`.
3. **Failure model.** If the room or library phase fails midway, the account still exists and the user can retry. The final user delete is last, so a retry never meets a half-deleted account without its owner row. Stored-object removal is after commit and best-effort, as in ADR 0009.
4. **Auth.** `requireAccount`, JSON only, password checked with `verifyPassword`, the shared `passwordChangeFailuresPerUser` limiter, `Cache-Control: no-store`. Body schema `DeleteAccountRequest { password }` in `packages/shared`.
5. **Policies** stay plain JSX; `POLICIES_UPDATED` moves to the implementation date. Contact route is the repository issue tracker (README), since there is no team mailbox.
6. **Assets.** Fonts already come from `@fontsource` (OFL, bundled). SFX are CC0 files we hold copies of, so an upstream takedown cannot remove them; the clip and credit titled "Star Wars Blaster" get a neutral name. Images are AI-generated for the project; Terms say so plainly. User-facing "Dungeons & Dragons" becomes "tabletop RPG".

## Risks / Trade-offs

- Irreversible by design, so the UI asks for the typed email and the password.
- Large accounts delete rooms one at a time and may take seconds; the client shows a busy state.
- AI-generated art has unsettled copyright; Terms disclose it, and art can be replaced later without a schema change.
