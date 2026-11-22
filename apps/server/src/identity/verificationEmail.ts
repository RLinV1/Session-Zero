import type { Locale } from "@vtt/shared";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import type { MailMessage } from "./mailer";
import { escapeHtml, siteLink } from "./siteLink";

export const VERIFY_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function verificationLink(clientOrigin: string, token: string): string {
  return siteLink(clientOrigin, "/verify-email", token);
}

export function verificationEmail(locale: Locale, to: string, link: string): MailMessage {
  const t = locale === "zh-TW" ? serverZhTW : serverEn;
  const subject = t["mail.verify.subject"];
  const intro = t["mail.verify.intro"];
  const action = t["mail.verify.action"];
  const ignore = t["mail.verify.ignore"];
  return {
    to,
    subject,
    text: `${intro}

${action}: ${link}

${ignore}
`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p><p>${escapeHtml(link)}</p><p>${escapeHtml(ignore)}</p>`,
  };
}
