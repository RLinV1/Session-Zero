import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  formatRef,
  isLocale,
  resolveLocale,
  translate,
  type ArgsOf,
  type Catalog,
  type Entry,
  type Locale,
  type MessageRef,
} from "@vtt/shared";
import type { Route } from "../router";
import { en, type WebEn } from "./en";
import { pseudoize, pseudoRequested } from "./pseudo";
import { LANGUAGE_CHOICE_ENABLED } from "./rollout";

/**
 * The viewer's language (localization). One choice per browser, like the theme (theme.ts): saved
 * in localStorage, the browser's languages when nothing is saved, English when neither maps.
 * Other open tabs follow a change. Nothing here is sent to the account or the room.
 */
export const LOCALE_KEY = "vtt.locale";

type WebCatalog = Catalog<WebEn>;
/** Loaded catalogs; English is the source and needs none. */
const catalogs: Partial<Record<Locale, WebCatalog>> = {};
const loaders: Record<Exclude<Locale, "en">, () => Promise<WebCatalog>> = {
  "zh-TW": () => import("./zh-TW").then((m) => m.zhTW),
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved choice, if there is one and storage can be read. */
export function loadSavedLocale(): Locale | null {
  try {
    const raw = storage()?.getItem(LOCALE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: Locale) {
  try {
    storage()?.setItem(LOCALE_KEY, locale);
  } catch {
    // Private mode: the choice lasts until the page closes (spec: "The choice is saved in this browser").
  }
}

/** The first of the browser's preferred languages we have; English when none. */
export function browserLocale(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): Locale {
  return resolveLocale(languages) ?? DEFAULT_LOCALE;
}

/** What a page load starts in: the saved choice, else the browser's languages. English while choice is off. */
export function initialLocale(): Locale {
  if (!LANGUAGE_CHOICE_ENABLED) return DEFAULT_LOCALE;
  return loadSavedLocale() ?? browserLocale();
}

let current: Locale = DEFAULT_LOCALE;
/** Development only: the pseudo-locale (`?locale=pseudo`), English text accented and bracketed. */
let pseudo = false;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

async function ensureCatalog(locale: Locale): Promise<void> {
  if (locale === "en" || catalogs[locale]) return;
  catalogs[locale] = await loaders[locale]();
}

function setCurrent(next: Locale) {
  if (next === current) return;
  current = next;
  applyDocumentLanguage();
  listeners.forEach((fn) => fn());
}

/**
 * Before the first render: load the starting language's catalog, so a Chinese viewer never sees
 * an English first frame. A failed load starts in English rather than not at all.
 */
export async function initLocale(): Promise<void> {
  // A constant `false` in production builds, so the pseudo-locale is compiled out there.
  pseudo = import.meta.env.DEV && pseudoRequested();
  const locale = pseudo ? DEFAULT_LOCALE : initialLocale();
  try {
    await ensureCatalog(locale);
    current = locale;
  } catch {
    current = DEFAULT_LOCALE;
  }
  applyDocumentLanguage();
}

/**
 * Switches language: loads the catalog first, so a switch is never half applied, then saves and
 * re-renders. Rejects when the catalog can't load; the language is then unchanged.
 */
export async function chooseLocale(next: Locale): Promise<void> {
  await ensureCatalog(next);
  saveLocale(next);
  setCurrent(next);
}

function storageChanged(event: StorageEvent) {
  if (event.key !== LOCALE_KEY && event.key !== null) return;
  const saved = loadSavedLocale();
  if (!saved || !LANGUAGE_CHOICE_ENABLED) return;
  void ensureCatalog(saved).then(() => setCurrent(saved), () => {});
}

export function subscribeLocale(listener: () => void): () => void {
  if (!listeners.size && typeof window !== "undefined") window.addEventListener("storage", storageChanged);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined") window.removeEventListener("storage", storageChanged);
  };
}

/**
 * A catalog id that takes no params. Module-level tables store these and call `t()` when they
 * render, since a table built at import time would keep the language of the first load.
 */
export type TextId = { [K in keyof WebEn & string]: WebEn[K] extends string ? K : never }[keyof WebEn & string];

/** Text `key` in the current language. Typed: a wrong id or params is a compile error. */
export function t<K extends keyof WebEn & string>(key: K, ...args: ArgsOf<WebEn, K>): string {
  const text = translate(catalogs[current], en, key, ...args);
  return import.meta.env.DEV && pseudo ? pseudoize(text) : text;
}

/**
 * `t` for one language whatever the current one is: the policy pages show their English, which
 * governs, beside the translation. Only languages already loaded have their own text.
 */
export function tFor(locale: Locale): typeof t {
  return (key, ...args) => translate(catalogs[locale], en, key, ...args);
}

/** A message that arrived as data (a rejection id), or `fallback` when this build doesn't know its id. */
export function formatMessage(ref: MessageRef, fallback: string): string {
  const text = formatRef(catalogs[current] as Readonly<Record<string, Entry>> | undefined, en, ref);
  if (text === null) return fallback;
  return import.meta.env.DEV && pseudo ? pseudoize(text) : text;
}

/**
 * The tag dates and numbers are formatted with: Traditional Chinese as is, and for English the
 * browser's own English region when it has one, so "en-GB" keeps its day-first, 24-hour clock.
 */
export function formattingLocale(): string {
  if (current !== "en") return current;
  const first = typeof navigator === "undefined" ? undefined : navigator.languages?.[0] ?? navigator.language;
  return first && /^en(-|$)/i.test(first) ? first : "en";
}

/** The current language; re-renders the component when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** `t`, in a component that re-renders when the language changes. */
export function useT(): typeof t {
  useLocale();
  return t;
}

/** `<html lang>` and the meta description follow the language, for screen readers and search. */
export function applyDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
}

const TITLE_KEYS = {
  signin: "title.signin",
  signup: "title.signup",
  join: "title.join",
  notFound: "title.notFound",
  gmDashboard: "title.gmDashboard",
  library: "title.library",
  account: "title.account",
  privacy: "title.privacy",
  terms: "title.terms",
  isometricLighting: "title.isometricLighting",
  room: "title.room",
  encounterEdit: "title.encounterEdit",
  build: "title.build",
} as const satisfies Record<Exclude<Route["page"], "home">, keyof WebEn>;

/** The browser tab's title: "Library · Session Zero", or the product name alone at home. */
export function titleFor(route: Route): string {
  return route.page === "home" ? "Session Zero" : t("title.page", { page: t(TITLE_KEYS[route.page]) });
}

/** Keeps the tab's title in step with the route and the language. */
export function useDocumentTitle(route: Route) {
  const locale = useLocale();
  const title = titleFor(route);
  useLayoutEffect(() => {
    document.title = title;
  }, [title, locale]);
}

/** For tests: forget loaded state and start from storage and the browser again. */
export async function resetLocaleForTests(): Promise<void> {
  current = DEFAULT_LOCALE;
  await initLocale();
  listeners.forEach((fn) => fn());
}
