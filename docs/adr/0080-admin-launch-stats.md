# ADR 0080 — Admin launch stats from stored data

**Status:** Proposed · **Extends:** ADR 0017 (accounts and sessions), [ADR 0052](0052-mcp-player-seats.md) (AI seats)

## Context

The public launch needs a weekly answer to "is anyone playing?". The privacy page promises "No analytics, advertising or tracking", and guests play without an account, so sign-ups alone undercount. The question has to be answered from data the server already keeps for the game to work, as totals, and seen only by the people running the site. The app had no notion of a site admin.

## Decision

**Counts from existing rows, nothing new recorded.** `GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive UTC days, both optional; default the last 30 days; at most 366) returns per-day counts, range totals and running all-time totals (growth), computed on request from:

| Count | Source |
|---|---|
| New accounts | `users.created_at` |
| Rooms created, by guests / by accounts | `rooms.created_at`, its owner's `gm_identities.guest` or `users.owner_id`; temporary editing rooms (ADR 0033) left out |
| Active rooms | a room with any event whose `actor_id` is set that day (a join is an event by the joiner) |
| Played rooms | an active room with 2+ distinct `actor_id`s that day, AI seats aside |
| Returning rooms | an active room whose first event (seq 1) was on an earlier day |
| AI seats joined | `ParticipantJoined` events whose name ends in " (AI)", the label `apps/mcp` adds (ADR 0052) |
| People at tables | distinct `actor_id`s per room that day, AI seats aside, summed over rooms (a person in two rooms is two seats; the range total counts each seat once) |
| Accounts / rooms, all time | rooms and accounts created before the range, plus each day's new ones: a running total to the end of each day |

`RoomStore.launchStatsFacts(from, to)` reads these facts (memory and Postgres); the pure `aggregateLaunchStats` turns them into counts. The ids the facts carry never leave the server: the response holds numbers and dates only, no ids, names, emails, addresses, room names or chat. The schemas are new (`packages/shared/src/adminStats.ts`); no existing schema changes and no migration.

**Admins by account id, from the environment.** `ADMIN_ACCOUNT_IDS` lists account ids, comma-separated. The route checks the request's signed-in account (ADR 0017 session cookie) against it on the server. Unset or empty means nobody. An id rather than an email: it never changes and can't be re-registered by someone else.

**Admin entry.** The signed-in account menu checks `GET /api/admin/me` and links to `/admin/stats` after a 204 response. For guests and accounts outside the allowlist, the admin API routes behave like an unknown `/api` path. Both admin pages show "Page not found" on a 404.

**Signup referrals.** The signup form accepts an optional platform code from `/signup?r=tiktok`, `/signup?r=youtube`, or `/signup?r=instagram`. A checkbox lets the user omit attribution. The admin panel counts verified signups by platform for the selected date range, using the signup date. Account deletion removes the attribution. The migration adds one nullable column, so existing accounts have no source.

**Feedback.** The Feedback tab lists saved reports newest first and loads screenshots individually. The account ID allowlist gates the list and screenshot routes. Both send `Cache-Control: no-store`. The list excludes image bytes.

## What can't be counted, and wasn't added

- **People who connected but did nothing.** Connections are ephemeral (invariant 4) and leave no row. Played rooms count people who joined or acted, so a returning player who only watched is missed.
- **People, as opposed to seats.** One person in two tabs joins as two guests and counts as two. Nothing ties guest seats to a person, by design.
- **Deleted rooms and accounts.** Deletion erases them (ADR 0009), and idle guest rooms are deleted after 30 days, so past counts shrink over time. Read each week's numbers within the month.
- **Visits and sign-up funnels.** The referral feature records signup attribution only. Each social platform's own insights cover the top of the funnel.

## Consequences

- The activity read scans `events.created_at`, which has no index. It runs only when an admin opens the page; add an index if the table grows enough for that to matter.
- The AI-seat count trusts the name label. A person can type " (AI)" after their name; an AI can't remove it.
- Days are UTC, so a US evening game counts on the next day.
- Production sets `ADMIN_ACCOUNT_IDS` in `.env.production`; `docker-compose.prod.yml` passes it to the server. The Terraform templates don't write it, so a Terraform-built host adds the line by hand.
