import { useCallback, useState, type SetStateAction } from "react";

/**
 * Per-browser UI preferences (sidebar and section collapse state).
 *
 * Layout preferences only: never room state, never sent to the server. Storage can be
 * missing, full, or throw on access (private windows, blocked site data), and a stored
 * value can be from an older build, so every read is validated and every access guarded.
 * The page must work on defaults when none of this succeeds.
 */

/** The slice of `Storage` used here, so tests can pass a stub. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export type Validate<T> = (value: unknown) => value is T;

export function readStored<T>(storage: KeyValueStorage | null, key: string, initial: T, validate: Validate<T>): T {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return initial;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : initial;
  } catch {
    return initial;
  }
}

export function writeStored(storage: KeyValueStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or blocked storage: the preference lasts for this visit only.
  }
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function usePersistentState<T>(key: string, initial: T, validate: Validate<T>) {
  const [value, setValue] = useState(() => readStored(browserStorage(), key, initial, validate));
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeStored(browserStorage(), key, resolved);
        return resolved;
      }),
    [key],
  );
  return [value, set] as const;
}

export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export const isBooleanRecord = (v: unknown): v is Record<string, boolean> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every(isBoolean);

/** A validator for a string-keyed record whose every value passes `isValue`. */
export const isRecordOf = <T>(isValue: Validate<T>): Validate<Record<string, T>> =>
  (v: unknown): v is Record<string, T> =>
    typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every(isValue);
