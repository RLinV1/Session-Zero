import { z } from "zod";
import { formatRef, sharedEn, validationRef, type Entry, type Locale, type MessageRef } from "@vtt/shared";
import { sharedZhTW } from "@vtt/shared/i18n/zh-TW";
import { serverEn } from "./en";
import { SERVER_PATTERNS_ZH_TW, serverZhTW } from "./zh-TW";

/**
 * REST text in the request's language (localization; ADR 0054). Routes write English; the locale
 * middleware passes every JSON body through `localizeBody` on its way out. Anything not recognised
 * is left in English, so a missing entry can never show a wrong or half-made sentence.
 */
const serverIdByEnglish = new Map<string, keyof typeof serverEn>(
  (Object.entries(serverEn) as [keyof typeof serverEn, string][]).map(([id, text]) => [text, id]),
);
const sharedEnRecord = sharedEn as Readonly<Record<string, Entry>>;
const sharedZhRecord = sharedZhTW as Readonly<Record<string, Entry>>;
const zodZhTW = z.locales.zhTW().localeError;

/** English texts that two server ids share, which the reverse lookup can't tell apart. */
export function serverCatalogDuplicates(): string[] {
  const seen = new Set<string>();
  return Object.values(serverEn).filter((text) => (seen.has(text) ? true : (seen.add(text), false)));
}

/** A shared message (a join refusal, an encounter template problem) in `locale`. */
export function sharedText(locale: Locale, ref: MessageRef): string {
  return formatRef(locale === "zh-TW" ? sharedZhRecord : undefined, sharedEnRecord, ref) ?? ref.id;
}

/** One English message a route wrote, in `locale`. */
export function localizeText(locale: Locale, english: string): string {
  if (locale === "en") return english;
  const id = serverIdByEnglish.get(english);
  if (id) return serverZhTW[id];
  const ours = validationRef(english);
  if (ours) return sharedText(locale, ours);
  for (const pattern of SERVER_PATTERNS_ZH_TW) {
    const match = english.match(pattern.english);
    if (match) return pattern.translate(match);
  }
  return english;
}

type Issue = { message?: unknown; code?: unknown };

/** A zod issue (or a UVTT issue) in `locale`: ours by id, zod's built-in ones by zod's own zh-TW map. */
function localizeIssue(locale: Locale, issue: Issue): string | undefined {
  if (typeof issue.message !== "string") return undefined;
  const text = localizeText(locale, issue.message);
  if (text !== issue.message || typeof issue.code !== "string") return text;
  try {
    const built = zodZhTW(issue as Parameters<typeof zodZhTW>[0]);
    const message = typeof built === "string" ? built : built?.message;
    return message ?? text;
  } catch {
    return text;
  }
}

/** A JSON body with its `error` and `issues` written in `locale`; every other field untouched. */
export function localizeBody(locale: Locale, body: unknown): unknown {
  if (locale === "en" || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const original = body as { error?: unknown; issues?: unknown };
  const out: Record<string, unknown> = { ...original };
  const issues = Array.isArray(original.issues) ? (original.issues as Issue[]) : null;
  if (issues) {
    out.issues = issues.map((issue) => {
      const message = issue && typeof issue === "object" ? localizeIssue(locale, issue) : undefined;
      return message === undefined ? issue : { ...issue, message };
    });
  }
  // Some routes send their zod issues as `error` itself.
  if (Array.isArray(original.error)) {
    out.error = (original.error as Issue[]).map((issue) => {
      const message = issue && typeof issue === "object" ? localizeIssue(locale, issue) : undefined;
      return message === undefined ? issue : { ...issue, message };
    });
  } else if (typeof original.error === "string") {
    // A field error repeats its first issue: say it the way that issue now reads.
    const first = issues?.[0];
    out.error = first && first.message === original.error
      ? ((out.issues as Issue[])[0]?.message as string)
      : localizeText(locale, original.error);
  }
  return out;
}
