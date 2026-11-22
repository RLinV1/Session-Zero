## Why

Feedback reports (FR-PL-11, ADR 0079) are only saved in Postgres, so the team learns about a report only when someone remembers to query the database. The deployed server can already send mail, so a short email per report closes that gap, as long as a flood of reports cannot exhaust the small sending allowance that sign-up verification and password reset also depend on.

## What Changes

- After a report is saved, the server emails a short plain-text notice to the address in `ADMIN_EMAIL` (already set at deploy for the admin account). No `ADMIN_EMAIL`, or no mail configured, means no email; the report is still saved.
- The notice holds the reference, kind, summary, full details, whether the reporter was signed in and their account email if so, the technical details when the reporter left them on (page, browser, screen, language, and in a room its ID, event number and role), and the report's cleaned screenshots as WebP attachments (at most 3). The subject is the reference, kind and summary.
- At most 20 notices per server per rolling 24 hours. Reports past the cap are saved without a notice, so verification and reset mail always keep their allowance.
- A hidden honeypot field on the Feedback form. A report that fills it in is answered like a success (201 with a reference) but is not saved and sends nothing.
- Mail failure never fails the report: it is logged and the reporter still gets their reference.

## Capabilities

### New Capabilities
- `feedback-alerts`: emailing the team when a feedback report arrives, the daily notice cap, and the honeypot that drops bot reports.

### Modified Capabilities

## Impact

- `apps/server/src/http/feedback.ts`: honeypot check, notify after save; takes the mailer, recipient and a cap limiter.
- `apps/server/src/identity/mailer.ts`: `MailMessage` gains optional attachments, which the SMTP mailer passes through.
- `apps/server/src/app.ts`: passes the existing `verification` mailer and `ADMIN_EMAIL` into the feedback routes.
- `apps/server/src/identity/routes.ts` (limits): a `feedbackMailPerDay` limiter.
- New `apps/server/src/http/feedbackEmail.ts` (message builder); English catalog ids `mail.feedback.*` in the server catalogs (ADR 0054).
- `apps/web/src/net/api.ts` and `apps/web/src/ui/FeedbackDialog.tsx`: send the honeypot field; the field is hidden from people and assistive tech.
- No shared schema change: the honeypot travels as its own multipart field beside `report`, so `FeedbackReport` stays strict and unchanged.
- No new deploy settings: reuses `ADMIN_EMAIL` and the SMTP settings already in terraform.
- `docs/DEPLOYMENT.md`: one line on where feedback mail goes.
