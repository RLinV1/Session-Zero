# ADR 0079 — Feedback reports and their screenshots live in the database

**Status:** Proposed.

**Requirements:** FR-PL-11. **Change:** `openspec/changes/site-news-and-feedback`. **Adds:** `packages/shared/src/feedback.ts` (no existing schema changes), Prisma tables `feedback_reports` and `feedback_screenshots`.

## Context

People can now send a bug report or idea with up to three screenshots, signed in or not. Screenshots can show anything on the reporter's screen, including a GM's fog-hidden map, so they must never be reachable by URL. `/uploads` and the S3 asset bucket are public by design (ADR 0004). The private Studio media store (ADR 0073) is optional and only configured where Studio runs.

## Decision

1. **Not room state.** A report is a REST request (`POST /api/feedback`), not a command. It is never broadcast and spends no seq, so the event model is untouched.
2. **Cleaned before stored.** Each image's real format is read with `sharp` (PNG, JPEG or WebP, at most 40 megapixels). It is turned upright, fitted inside 2560 px and re-encoded to WebP quality 85 with no metadata, which drops EXIF location and camera data.
3. **Stored in Postgres.** The report row and its images (`bytea`) are written in one transaction. Deleting a report deletes its images (FK cascade). A report from a signed-in account references the user with `ON DELETE CASCADE`, so account deletion (ADR 0050) removes it with no extra step. The memory store mirrors this.
4. **Read only by the team.** No route reads reports back. `npm run feedback:export` reads them from Postgres into a git-ignored `feedback/` folder for the team and Claude Code.
5. **Bounded.** Same-origin only, 10 attempts per address per hour, at most 3 files of 5 MB, a 16 KB form field, and zod limits on every text field.

## Consequences

- No new infrastructure, and feedback works on every deployment, including one without object storage.
- The database grows by roughly 100–400 KB per screenshot. If reports reach the thousands, the bytes can move to the private media store behind the same `FeedbackStore` interface without changing the API.
- Reports from people who aren't signed in have no owner, so nobody can delete them through their account. The team deletes them by reference.
