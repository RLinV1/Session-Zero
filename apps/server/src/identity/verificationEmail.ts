import type { Locale } from "@vtt/shared";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import type { MailMessage } from "./mailer";

export const VERIFY_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function verificationLink(clientOrigin: string, token: string): string {
  const base = clientOrigin.split(",")[0]!.trim().replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
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
    text: `${intro}\n\n${action}: ${link}\n\n${ignore}\n`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p><p>${escapeHtml(link)}</p><p>${escapeHtml(ignore)}</p>`,
  };
}
