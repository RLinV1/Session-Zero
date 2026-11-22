## 1. Server

- [x] 1.1 Add failing tests in `apps/server/test/feedbackEmail.test.ts` (FR-PL-11) for every scenario in `specs/feedback-alerts/spec.md`, using a fake mailer through `AppOptions.verification` and a recipient through `AppOptions`; verify they fail
- [x] 1.2 Add optional `attachments` to `MailMessage` and pass them through `smtpMailer`; add `mail.feedback.*` catalog ids to the server en and zh-TW catalogs and `feedbackEmail(...)` in `apps/server/src/http/feedbackEmail.ts`; verify the message-content tests pass
- [x] 1.3 Add the `feedbackMailPerDay` limiter (20 per 24 hours) beside the other limits; pass mailer, recipient and limiter from `app.ts` into `registerFeedbackRoutes`; send the notice after the 201 with logged failures; verify the notice, cap, no-config and mail-failure tests pass
- [x] 1.4 Read the `website` multipart field, raise the multer `parts` limit by one, and answer a filled honeypot with 201 and a fresh reference without saving or mailing; verify the honeypot tests and the existing `feedback.test.ts` pass

## 2. Web

- [x] 2.1 Append an empty `website` field in `api.feedback.send` and add the hidden, non-focusable, `aria-hidden` input to `FeedbackDialog.tsx`; verify lint and typecheck pass
- [x] 2.2 Verify with Playwright: open Feedback, confirm the honeypot input is not visible and not reachable by Tab, send a report and get a reference

## 3. Finish

- [x] 3.1 Add one line to `docs/DEPLOYMENT.md` saying feedback notices go to `ADMIN_EMAIL`, capped at 20 a day; verify `openspec validate feedback-email-alerts` passes
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test` once and fix every failure the change causes
