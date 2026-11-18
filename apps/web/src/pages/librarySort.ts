import { useCallback, useState } from "react";
import { formattingLocale } from "../i18n/locale";
import { browserStorage, isRecordOf, readStored, writeStored } from "../ui/usePersistentState";

/**
 * How a library tab orders its own items (library-organize). The choice is a per-browser view
 * preference, one per tab, and never leaves the browser.
 */
export const SORT_KEYS = ["newest", "oldest", "nameAsc", "nameDesc"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const isSortKey = (value: unknown): value is SortKey => (SORT_KEYS as readonly unknown[]).includes(value);

/** Catalog ids for each order, read when the picker renders. */
export const SORT_LABELS = {
  newest: "library.sort.newest",
  oldest: "library.sort.oldest",
  nameAsc: "library.sort.nameAsc",
  nameDesc: "library.sort.nameDesc",
} as const satisfies Record<SortKey, string>;

interface Sortable {
  id: string;
  name: string;
}

/**
 * `items` in `key` order, as a new array. Names compare as people read them in the page's
 * language: case and accents aside, and "Goblin 2" before "Goblin 10". `date` is the time
 * "newest" means for the kind: when it was added, or for templates when it was last saved.
 * Ties fall back to the name, then the id, so the order never shuffles between renders.
 */
export function sortItems<T extends Sortable>(items: readonly T[], key: SortKey, date: (item: T) => string, locale = formattingLocale()): T[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const byName = (a: T, b: T) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byDate = (a: T, b: T) => {
    const da = date(a);
    const db = date(b);
    return da < db ? -1 : da > db ? 1 : 0;
  };
  const compare: (a: T, b: T) => number = {
    newest: (a: T, b: T) => byDate(b, a) || byName(a, b),
    oldest: (a: T, b: T) => byDate(a, b) || byName(a, b),
    nameAsc: byName,
    nameDesc: (a: T, b: T) => byName(b, a),
  }[key];
  return [...items].sort(compare);
}

const SORT_STORAGE_KEY = "vtt.ui.librarySort";
const isSortRecord = isRecordOf(isSortKey);
const readSorts = () => readStored<Record<string, SortKey>>(browserStorage(), SORT_STORAGE_KEY, {}, isSortRecord);

/**
 * The remembered order for one tab, newest first until the person picks another. Every tab
 * shares one stored record, and several tabs' lists may be mounted at once, so a change reads
 * the record afresh and replaces only its own tab's entry.
 */
export function useSortPreference(tab: string): [SortKey, (key: SortKey) => void] {
  const [sorts, setSorts] = useState(readSorts);
  const set = useCallback((key: SortKey) => {
    const next = { ...readSorts(), [tab]: key };
    writeStored(browserStorage(), SORT_STORAGE_KEY, next);
    setSorts(next);
  }, [tab]);
  return [sorts[tab] ?? "newest", set];
}
