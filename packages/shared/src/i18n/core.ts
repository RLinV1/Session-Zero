/**
 * Message catalogs for every runtime that writes text people read: pure shared code, the server,
 * React and the Pixi board (localization; ADR 0054).
 *
 * A catalog maps an id to a fixed string or to a function of typed params. English is the
 * source and the type; every other language is declared `satisfies Catalog<typeof en>`, so a
 * missing or extra id, or a function with the wrong params, is a type error. Functions carry
 * plurals and word order, so there is no placeholder syntax to parse.
 *
 * Pure: no globals, no I/O, no current locale. Callers pass the locale in.
 */

export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language named in itself, so readers find their own whatever language is on screen. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: "English", "zh-TW": "繁體中文" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** One catalog entry: a fixed string, or a function of its params. */
export type Entry = string | ((params: never) => string);
/** The English catalog, which every other language is checked against. */
export type CatalogSource = Readonly<Record<string, Entry>>;
/** Another language's catalog: every id of `E`, a string or a function of the same params. */
export type Catalog<E extends CatalogSource> = {
  readonly [K in keyof E]: E[K] extends (params: infer P) => string ? string | ((params: P) => string) : string;
};
/** The params of id `K`, as a rest tuple: `[]` for a fixed string. */
export type ArgsOf<E extends CatalogSource, K extends keyof E> = E[K] extends (params: infer P) => string ? [params: P] : [];

function render(entry: Entry, params: unknown): string {
  return typeof entry === "function" ? (entry as (p: unknown) => string)(params) : entry;
}

function own(catalog: Readonly<Record<string, Entry>> | undefined, id: string): Entry | undefined {
  return catalog && Object.hasOwn(catalog, id) ? catalog[id] : undefined;
}

/**
 * Id `key` in `catalog`, falling back to the English `source` entry. Typed: a wrong id or params
 * is a compile error, so the fallback only matters for catalogs loaded at runtime.
 */
export function translate<E extends CatalogSource, K extends keyof E & string>(
  catalog: Catalog<E> | undefined,
  source: E,
  key: K,
  ...args: ArgsOf<E, K>
): string {
  const entry = own(catalog as Readonly<Record<string, Entry>> | undefined, key) ?? own(source, key);
  return entry === undefined ? "" : render(entry, args[0]);
}

// ---------- Messages as data ----------

/** A message that travels: an id and its params. User content is always a plain string param. */
export interface MessageRef {
  readonly id: string;
  readonly params?: Readonly<Record<string, MessageParam>>;
}
/** A param: user content or a number as is, or a nested message formatted in the same language. */
export type MessageParam = string | number | MessageRef;

/** How deep refs may nest; real messages nest once or twice. */
const MAX_DEPTH = 4;

/**
 * Formats `ref` with `catalog`, falling back to `source` (English) for a missing id, nested refs
 * first. `null` when the id is in neither, so the caller can show the text it already has.
 */
export function formatRef(
  catalog: Readonly<Record<string, Entry>> | undefined,
  source: Readonly<Record<string, Entry>>,
  ref: MessageRef,
  depth = 0,
): string | null {
  const entry = own(catalog, ref.id) ?? own(source, ref.id);
  if (entry === undefined || depth > MAX_DEPTH) return null;
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(ref.params ?? {})) {
    if (typeof value === "object") {
      const nested = formatRef(catalog, source, value, depth + 1);
      if (nested === null) return null;
      params[name] = nested;
    } else {
      params[name] = value;
    }
  }
  return render(entry, params);
}

/** A ref's params: where the entry takes a string, a nested message may stand in for it. */
export type RefParams<P> = { readonly [K in keyof P]: P[K] extends string ? string | MessageRef : P[K] };

/** A typed ref builder for catalog `E`: `msg("reject.wallBlocked")`, `msg("x.y", { name })`. */
export function messageRefs<E extends CatalogSource>() {
  return <K extends keyof E & string>(
    id: K,
    ...args: E[K] extends (params: infer P) => string ? [params: RefParams<P>] : []
  ): MessageRef => (args.length ? { id, params: args[0] as Record<string, MessageParam> } : { id });
}

// ---------- Choosing a language ----------

/**
 * The language a BCP 47 tag maps to: Traditional Chinese for Taiwan, Hong Kong, Macau or the
 * Hant script; English for any `en`. Simplified Chinese and bare `zh` map to nothing.
 */
export function localeForTag(tag: string): Locale | null {
  const [language, ...subtags] = tag.trim().toLowerCase().replace(/_/g, "-").split("-");
  if (language === "en") return "en";
  if (language !== "zh" || subtags.includes("hans")) return null;
  return subtags.some((s) => s === "hant" || s === "tw" || s === "hk" || s === "mo") ? "zh-TW" : null;
}

/** The first tag that maps, in preference order; `null` when none does. */
export function resolveLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const locale = localeForTag(tag);
    if (locale) return locale;
  }
  return null;
}

/** More tags than any browser sends; the rest are ignored. */
const MAX_LANGUAGE_RANGES = 20;

/**
 * An `Accept-Language` header's tags, highest q first (stable for ties), without `*` or q=0.
 * Malformed q values count as 0, so a garbled range is skipped rather than preferred.
 */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  const ranges: { tag: string; q: number; at: number }[] = [];
  for (const [at, part] of header.split(",").slice(0, MAX_LANGUAGE_RANGES).entries()) {
    const [rawTag, ...attrs] = part.split(";");
    const tag = rawTag?.trim() ?? "";
    if (!tag || tag === "*") continue;
    const qAttr = attrs.map((a) => a.trim()).find((a) => a.startsWith("q="));
    const q = qAttr === undefined ? 1 : /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/.test(qAttr.slice(2)) ? Number(qAttr.slice(2)) : 0;
    if (q > 0) ranges.push({ tag, q, at });
  }
  return ranges.sort((a, b) => b.q - a.q || a.at - b.at).map((r) => r.tag);
}

/** The language a request asks for, English when it asks for none we have. */
export function localeFromAcceptLanguage(header: string | undefined): Locale {
  return resolveLocale(parseAcceptLanguage(header)) ?? DEFAULT_LOCALE;
}

// ---------- Formatting with Intl ----------

const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.ListFormat>();
function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.ListFormat>(key: string, make: () => T): T {
  let formatter = formatters.get(key) as T | undefined;
  if (!formatter) {
    formatter = make();
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * A date or time in a language's conventions; `options` as for `Intl.DateTimeFormat`. `locale` is
 * any BCP 47 tag, so English can keep the browser's own region (a UK clock stays 24-hour).
 */
export function formatDateTime(locale: string, date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  if (Number.isNaN(date.getTime())) return "";
  return cached(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options)).format(date);
}

/** A clock time such as "3:05 PM" or "下午3:05". */
export function formatTime(locale: string, date: Date): string {
  return formatDateTime(locale, date, { hour: "numeric", minute: "2-digit" });
}

/** A number in `locale`'s conventions. */
export function formatNumber(locale: string, value: number, options: Intl.NumberFormatOptions = {}): string {
  return cached(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options)).format(value);
}

/** "Aria, Brom and Cass" or "Aria、Brom和Cass". */
export function formatList(locale: string, items: readonly string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  return cached(`l|${locale}|${type}`, () => new Intl.ListFormat(locale, { style: "long", type })).format(items);
}

// ---------- Chinese spacing ----------

const HAN = /[㐀-鿿豈-﫿]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const needsGap = (left: string | undefined, right: string | undefined) =>
  !!left && !!right && ((HAN.test(left) && LATIN_OR_DIGIT.test(right)) || (LATIN_OR_DIGIT.test(left) && HAN.test(right)));

/**
 * A Chinese sentence with values in it, spaced by the glossary's rule: a half-width space where a
 * Han character meets a Latin letter or digit, none next to full-width punctuation or between Han
 * characters. Only the seams around each value are adjusted; the written text is kept as is.
 * `cjk`${name}已不存在。`` gives "Goblin 已不存在。" and "那個棋子已不存在。".
 */
export function cjk(strings: TemplateStringsArray, ...values: readonly (string | number)[]): string {
  let out = strings[0] ?? "";
  values.forEach((raw, i) => {
    const value = String(raw);
    const next = strings[i + 1] ?? "";
    if (needsGap(out.at(-1), value[0])) out += " ";
    out += value;
    if (needsGap(value.at(-1), next[0])) out += " ";
    out += next;
  });
  return out;
}
