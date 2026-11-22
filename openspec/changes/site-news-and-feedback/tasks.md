## 1. Contract and records

- [x] 1.1 Add FR-PL-10 and FR-PL-11 to `README.md` (requirements and priority tables)
- [x] 1.2 Write `docs/adr/0079-feedback-reports.md`
- [x] 1.3 Add `packages/shared/src/feedback.ts` (`FeedbackKind`, `FeedbackTechnical`, `FeedbackReport`, `FeedbackReceipt`, limits) with unit tests in `packages/shared/test/feedback.test.ts`

## 2. Server

- [x] 2.1 Prisma migration: `feedback_reports`, `feedback_screenshots` (cascade from report; report cascades from user)
- [x] 2.2 `FeedbackStore` on the memory and Postgres stores; memory `deleteUser` removes the account's reports
- [x] 2.3 `http/feedback.ts`: multer limits, zod, `feedbackPerIp` limiter, sharp check and WebP re-encode, 201 receipt; catalog ids in `i18n/en.ts` and `i18n/zh-TW.ts`
- [x] 2.4 `scripts/feedbackExport.ts` and the `feedback:export` script; `feedback/` in `.gitignore`
- [x] 2.5 Integration tests in `apps/server/test/feedback.test.ts` (FR-PL-11): accept, disguised file, size, count, rate limit, EXIF stripped, technical details allow-list, account deletion, export output

## 3. Web

- [x] 3.1 What's new page, posts and screenshots (FR-PL-10), with tests
- [x] 3.2 `ui/FeedbackDialog.tsx` and a feedback host opened through `openFeedback()`
- [x] 3.3 Feedback button in `SiteHeader` and `SiteFooter`, "Send feedback" in `SettingsMenu`, "Report a problem" in `RoomMenu`, link on `/news`
- [x] 3.4 Board capture in `board/` and its use from the room
- [x] 3.5 English and zh-TW catalogs; Privacy text about reports
- [x] 3.6 Component tests in `apps/web/test/feedbackDialog.test.tsx` (FR-PL-11)

## 4. Verification

- [x] 4.1 `npm run lint && npm run typecheck && npm test`
- [x] 4.2 Send a report with a pasted image and a board capture in the browser; export it and read `report.md`
