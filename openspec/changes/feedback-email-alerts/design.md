## Context

`POST /api/feedback` (`apps/server/src/http/feedback.ts`) validates the strict `FeedbackReport` JSON part, cleans screenshots, saves through `FeedbackStore.createFeedback`, and answers `201 FeedbackReceipt`. It is already limited to 10 attempts per address per hour and checks that requests come from the app's own pages.

Mail exists for identity: `verificationFromEnv()` builds an SMTP `Mailer` in production (and refuses to start without SMTP settings); `app.ts` holds it as `verification`, and tests inject a fake through `AppOptions.verification`. `ADMIN_EMAIL` is set at deploy by terraform for the seeded admin account.

## Goals / Non-Goals

**Goals:**
- One short notice per report to the team, capped, without touching the report's own success path.

**Non-Goals:**
- No spam scoring, keyword lists, CAPTCHA, or AI checks. The per-address limit, the daily cap and the honeypot are the whole defense.
- No digest or batching email, no "more waiting" summary when the cap is hit.
- No reply-to header or replying from the app.
- No mailto or "email us" option in the form; the team address stays off the page.

## Decisions

**D1. Recipient is `ADMIN_EMAIL`.** It is already set in terraform for the admin account, so feedback mail needs no new variable, tfvars line or compose entry. Alternative: a separate `FEEDBACK_EMAIL`; rejected until someone needs feedback to go somewhere other than the admin.

**D2. Reuse the identity mailer.** `app.ts` passes `verification?.mailer` and `env.ADMIN_EMAIL` into `registerFeedbackRoutes`. In development `verification` is null, so no mail is sent there, which matches how verification mail behaves. Tests pass a fake mailer through the existing `AppOptions.verification` and set the recipient through an `AppOptions` field defaulting to `process.env.ADMIN_EMAIL`.

**D3. Cap with the existing `RateLimiter`.** A `feedbackMailPerDay: new RateLimiter(20, 24 * HOUR, now)` beside the other limits, hit with one fixed key. It is per process and resets on restart; the deployment is one VM with one server process, so that is the real limit. Alternative: a Postgres count of reports sent today; rejected as more code for the same result at this scale.

**D4. Notice after save, not awaited by the response.** The handler answers 201 first, then sends with `.catch` logging `[vtt] feedback email failed:`. The reporter never waits on SMTP and a mail error cannot turn into a 500.

**D5. Honeypot as its own multipart field.** The form appends `website` (empty) beside `report`. The server reads it from the multipart body; non-empty means answer `201` with a freshly generated reference and `screenshots: 0`, then stop. Keeping it out of the `report` JSON means `FeedbackReport` stays strict and unchanged, so no shared schema change or ADR. The multer `parts` limit grows by one. The field is visually hidden off-screen, `tabIndex={-1}`, `aria-hidden`, `autoComplete="off"`, so people and screen readers skip it while form-filling bots see a normal input.

**D6. Message text.** Built by a small `feedbackEmail(report, reference, reporterEmail, screenshots)` returning a `MailMessage`. Technical details are listed one per line by field name (page, app version, browser, screen, viewport, pixel ratio, language, room, event number, role), or one line saying none were included. Labels come from server catalog ids `mail.feedback.*` (English; the team reads it). `html` is the same text escaped inside `<pre>`, since `MailMessage` requires both. Subject: `[Feedback FB-XXXX] bug: <summary>`, with line breaks collapsed and cut to 100 characters; nodemailer encodes the header, so reporter text cannot inject headers.

**D7. Screenshots as attachments.** `MailMessage` gains an optional `attachments: { filename, content: Buffer, contentType }[]`, passed straight to nodemailer by `smtpMailer`. The handler already holds the cleaned `FeedbackScreenshotRecord`s it just saved, so it attaches those bytes (`FB-XXXX-1.webp` ...) without re-reading the database. Worst case is 3 images that were re-encoded and size-limited on intake, well inside SMTP message limits. Alternative: a link to view them; rejected because there is no admin page that serves them and adding one is a new authorization surface.

## Risks / Trade-offs

- [Cap resets on restart] → A crash loop could send more than 20 a day. The per-address limit still applies; acceptable for one VM.
- [A cap hit by a flood hides real reports from email] → They are still saved; the team can query the table. Acceptable.
- [Screenshots leave the database] → They travel to the team inbox only, already stripped of metadata; the privacy policy already says the team reads reports and screenshots.
- [Honeypot only stops naive bots] → It is cheap; real defense is the per-address limit and the cap.
- [No SMTP on the VM] → No notices and no verification mail either; production already refuses to start without SMTP settings, so this is visible at deploy.

## Migration Plan

Merge, then rebuild the server container on the VM (`docker compose ... up -d --build` after `git pull`). No database migration. Rollback: revert the commit and rebuild.
