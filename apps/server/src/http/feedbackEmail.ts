import type { FeedbackReport } from "@vtt/shared";
import { serverEn } from "../i18n/en";
import type { MailMessage } from "../identity/mailer";
import { escapeHtml } from "../identity/siteLink";
import type { FeedbackScreenshotRecord } from "../store/feedbackStore";

const SUBJECT_MAX = 100;

export function feedbackEmail(
  to: string,
  report: FeedbackReport,
  reference: string,
  reporterEmail: string | null,
  screenshots: readonly FeedbackScreenshotRecord[],
): MailMessage {
  const t = serverEn;
  const tech = report.technical;
  const technical: [string, string | number | undefined][] = tech
    ? [
        [t["mail.feedback.page"], tech.pagePath],
        [t["mail.feedback.appVersion"], tech.appVersion],
        [t["mail.feedback.browser"], tech.userAgent],
        [t["mail.feedback.screen"], tech.screen && `${tech.screen.width}x${tech.screen.height}`],
        [t["mail.feedback.viewport"], tech.viewport && `${tech.viewport.width}x${tech.viewport.height}`],
        [t["mail.feedback.pixelRatio"], tech.pixelRatio],
        [t["mail.feedback.language"], tech.locale],
        [t["mail.feedback.room"], tech.roomId],
        [t["mail.feedback.event"], tech.seq],
        [t["mail.feedback.role"], tech.role],
      ]
    : [];
  const technicalLines = technical.filter(([, value]) => value !== undefined).map(([label, value]) => `${label}: ${value}`);
  const text = [
    `${t["mail.feedback.reference"]}: ${reference}`,
    `${t["mail.feedback.kind"]}: ${report.kind}`,
    `${t["mail.feedback.summary"]}: ${report.summary}`,
    `${t["mail.feedback.details"]}:`,
    report.details,
    reporterEmail ? `${t["mail.feedback.signedIn"]}: ${t["mail.feedback.yes"]} (${reporterEmail})` : `${t["mail.feedback.signedIn"]}: ${t["mail.feedback.no"]}`,
    technicalLines.length ? `${t["mail.feedback.technical"]}:` : t["mail.feedback.noTechnical"],
    ...technicalLines,
    `${t["mail.feedback.screenshots"]}: ${screenshots.length}`,
  ].join("\n");
  const subject = `[${t["mail.feedback.subject"]} ${reference}] ${report.kind}: ${report.summary}`.replace(/\s*[\r\n]+\s*/g, " ").slice(0, SUBJECT_MAX);
  return {
    to,
    subject,
    text,
    html: `<pre>${escapeHtml(text)}</pre>`,
    attachments: screenshots.map((shot, i) => ({ filename: `${reference}-${i + 1}.webp`, content: Buffer.from(shot.bytes), contentType: shot.contentType })),
  };
}
