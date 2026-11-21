# ADR 0079 — Admin launch stats from stored data

**Status:** Proposed · **Extends:** ADR 0017 (accounts and sessions), [ADR 0052](0052-mcp-player-seats.md) (AI seats)

## Context

The public launch needs a weekly answer to "is anyone playing?". The privacy page promises "No analytics, advertising or tracking", and guests play without an account, so sign-ups alone undercount. The question has to be answered from data the server already keeps for the game to work, as totals, and seen only by the people running the site. The app had no notion of a site admin.

## Decision

**Counts from existing rows, nothing new recorded.** `GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive UTC days, both optional; default the last 30 days; at most 366) returns per-day counts and range totals, computed on request from:

| Count | Source |
|---|---|
| New accounts | `users.created_at` |
| Rooms created, by guests / by accounts | `rooms.created_at`, its owner's `gm_identities.guest` or `users.owner_id`; temporary editing rooms (ADR 0033) left out |
| Active rooms | a room with any event whose `actor_id` is set that day (a join is an event by the joiner) |
| Played rooms | an active room with 2+ distinct `actor_id`s that day, AI seats aside |
| Returning rooms | an active room whose first event (seq 1) was on an earlier day |
| AI seats joined | `ParticipantJoined` events whose name ends in " (AI)", the label `apps/mcp` adds (ADR 0052) |

`RoomStore.launchStatsFacts(from, to)` reads these facts (memory and Postgres); the pure `aggregateLaunchStats` turns them into counts. The ids the facts carry never leave the server: the response holds numbers and dates only, no ids, names, emails, addresses, room names or chat. The schemas are new (`packages/shared/src/adminStats.ts`); no existing schema changes and no migration.

**Admins by account id, from the environment.** `ADMIN_ACCOUNT_IDS` lists account ids, comma-separated. The route checks the request's signed-in account (ADR 0017 session cookie) against it on the server. Unset or empty means nobody. An id rather than an email: it never changes and can't be re-registered by someone else.

**Anyone else gets a route that doesn't exist.** For a guest, a signed-in non-admin, or a server with no admins, the handler calls `next()`, so the answer is whatever an unknown `/api` path gets (Express's 404), byte for byte. The web page `/admin/stats` is linked from nowhere; when the API answers 404 it shows the router's own "Page not found" card, title and background.

## What can't be counted, and wasn't added

- **People who connected but did nothing.** Connections are ephemeral (invariant 4) and leave no row. Played rooms count people who joined or acted, so a returning player who only watched is missed.
- **People, as opposed to seats.** One person in two tabs joins as two guests and counts as two. Nothing ties guest seats to a person, by design.
- **Deleted rooms and accounts.** Deletion erases them (ADR 0009), and idle guest rooms are deleted after 30 days, so past counts shrink over time. Read each week's numbers within the month.
- **Visits, referrers, sign-up funnels.** These would need new collection; the privacy promise rules it out. Each social platform's own insights cover the top of the funnel.

## Consequences

- The activity read scans `events.created_at`, which has no index. It runs only when an admin opens the page; add an index if the table grows enough for that to matter.
- The AI-seat count trusts the name label. A person can type " (AI)" after their name; an AI can't remove it.
- Days are UTC, so a US evening game counts on the next day.
- Production sets `ADMIN_ACCOUNT_IDS` in `.env.production`; `docker-compose.prod.yml` passes it to the server. The Terraform templates don't write it, so a Terraform-built host adds the line by hand.
