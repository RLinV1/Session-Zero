import { formatDateTime } from "@vtt/shared";
import { formattingLocale, t } from "../i18n/locale";

/**
 * "just now", "5 min ago", "3 h ago", "2 d ago", then a date: when a room or template last
 * changed. In Traditional Chinese "剛剛", "5 分鐘前", "3 天前" (localization).
 */
export function formatRelative(iso: string, now: number = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  const days = Math.round(hours / 24);
  return days < 30 ? t("time.daysAgo", { n: days }) : formatDate(iso);
}

/** A calendar date in the viewer's language: "11/9/2026", "2026/11/9". */
export function formatDate(iso: string) {
  return formatDateTime(formattingLocale(), new Date(iso), { year: "numeric", month: "numeric", day: "numeric" });
}

/** A clock time, "3:05 PM" or "下午3:05"; with `twoDigitHour`, "03:05 PM" or "下午03:05". Empty for a bad date. */
export function formatClock(iso: string, twoDigitHour = false) {
  return formatDateTime(formattingLocale(), new Date(iso), { hour: twoDigitHour ? "2-digit" : "numeric", minute: "2-digit" });
}

/** Date and time to the second, for a log line: "11/9/2026, 3:05:09 PM", "2026/11/9 下午3:05:09". */
export function formatStamp(iso: string) {
  return formatDateTime(formattingLocale(), new Date(iso), {
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}
