## Why

People who use Session Zero have no place to learn what changed and no way to tell the team that something broke. Playtest bugs reached us by word of mouth, usually without the screenshot that would have shown the problem. A bug report that carries a screenshot and the page it came from can go straight to Claude Code, which can read the report, look at the image and propose a fix with a test.

## What Changes

- A **What's new** page at `/news`, a reading page beside Privacy and Terms: dated posts, newest first, each written as a press release with one real screenshot of the feature, in English and Traditional Chinese. It is linked from the site footer.
- A **Feedback** dialog, opened from a Feedback button in the site header, from Feedback in the site footer, from "Send feedback" in Settings (in a room and on account pages), from "Report a problem" in the room's More menu, and from a link on `/news`:
  - The person chooses Bug, Idea or Other, writes a summary (up to 120 characters) and details (up to 4,000).
  - They can attach up to three screenshots (PNG, JPEG or WebP, up to 5 MB each) by choosing files, dropping them, pasting, or, in a room, capturing their own view of the board.
  - "Include technical details" (on by default) adds the page path, the browser, the screen size, the language and, in a room, the room ID, the event number and the person's role. It never adds the room's contents.
  - On success the dialog shows a reference such as `FB-7Q2K`.
- `POST /api/feedback` accepts a report from anyone, signed in or not, from the site's own origin only and within a per-address rate limit. It checks each image's real format, re-encodes it to WebP (dropping location and camera data), and stores the report and its images privately in the database. Images never get an `/uploads` address.
- A signed-in report records the account, so the team can reply. Deleting the account deletes its reports and their images.
- `npm run feedback:export` writes each report as `feedback/<reference>/report.md` next to its images, so Claude Code can read it. `feedback/` is ignored by git.
- The Privacy page says what a report contains and who reads it.

## Capabilities

### New Capabilities
- `site-news`: the What's new page, its posts and their media.
- `feedback-reports`: the Feedback dialog, what a report holds, how it is accepted, stored, deleted and exported.

### Modified Capabilities

None.

## Impact

- `README.md`: new requirements FR-PL-10 (What's new) and FR-PL-11 (Report a problem).
- `packages/shared`: new `feedback.ts` with `FeedbackKind`, `FeedbackTechnical`, `FeedbackReport` (the form fields) and `FeedbackReceipt`. No existing schema changes.
- `apps/server`: Prisma migration (`feedback_reports`, `feedback_screenshots`); a `FeedbackStore` on the memory and Postgres stores; `http/feedback.ts`; a per-address limiter; `deleteUser` removes the account's reports; catalog ids for new errors; `scripts/feedbackExport.ts`.
- `apps/web`: the `/news` page and posts; `ui/FeedbackDialog.tsx`, a feedback host and opener; a Feedback button in `SiteHeader`; "Report a problem" in `RoomMenu`; a board capture call in `board/`; English and zh-TW catalogs; Privacy text.
- `docs/adr/0079-feedback-reports.md` records where reports and screenshots are kept and why.
- Risk: reports are free text and images from anyone. The rate limit, size limits, re-encoding and same-origin check bound the cost; a report is never shown to anyone but the team.
