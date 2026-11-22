import type { Locale } from "@vtt/shared";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import type { MailMessage } from "./mailer";
import { escapeHtml, siteLink } from "./siteLink";

export const RESET_LINK_LIFETIME_MS = 60 * 60 * 1000;

const catalog = (locale: Locale) => (locale === "zh-TW" ? serverZhTW : serverEn);

export function resetLink(clientOrigin: string, token: string): string {
  return siteLink(clientOrigin, "/reset-password", token);
}

export function resetEmail(locale: Locale, to: string, link: string): MailMessage {
  const t = catalog(locale);
  const intro = t["mail.reset.intro"];
  const action = t["mail.reset.action"];
  const ignore = t["mail.reset.ignore"];
  return {
    to,
    subject: t["mail.reset.subject"],
    text: `${intro}

${action}: ${link}

${ignore}
`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p><p>${escapeHtml(link)}</p><p>${escapeHtml(ignore)}</p>`,
  };
}

export function signUpNoticeEmail(locale: Locale, to: string, clientOrigin: string): MailMessage {
  const t = catalog(locale);
  const intro = t["mail.notice.intro"];
  const signIn = t["mail.notice.signIn"];
  const reset = t["mail.notice.reset"];
  const ignore = t["mail.notice.ignore"];
  const signInLink = siteLink(clientOrigin, "/signin");
  const resetPageLink = siteLink(clientOrigin, "/forgot-password");
  return {
    to,
    subject: t["mail.notice.subject"],
    text: `${intro}

${signIn}: ${signInLink}
${reset}: ${resetPageLink}

${ignore}
`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(signInLink)}">${escapeHtml(signIn)}</a></p><p><a href="${escapeHtml(resetPageLink)}">${escapeHtml(reset)}</a></p><p>${escapeHtml(ignore)}</p>`,
  };
}
