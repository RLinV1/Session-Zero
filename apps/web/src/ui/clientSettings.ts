import { useSyncExternalStore } from "react";
import { writeStored } from "./usePersistentState";

export type GraphicsQuality = "high" | "balanced" | "low";
/** Which attack effects this viewer's board plays (board-attack-effects): every one, the active turn's, or none. */
export type AttackAnimations = "all" | "turn" | "none";
export interface ClientSettings {
  graphicsQuality: GraphicsQuality;
  reducedAnimations: boolean;
  /** Pan and zoom the board to the fighters when an attack plays. */
  autoFocusAttacks: boolean;
  musicVolume: number;
  soundVolume: number;
  /** The arrow keys move the selected token one square (client-settings). */
  arrowKeyMove: boolean;
  attackAnimations: AttackAnimations;
}
export const CLIENT_SETTINGS_KEY = "vtt.ui.settings";
/** Where the token card's arrow-key switch was saved before it moved into Settings; read once, then removed. */
export const LEGACY_ARROW_KEY_MOVE_KEY = "vtt.ui.arrowKeyMove";
export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  graphicsQuality: "balanced", reducedAnimations: false, autoFocusAttacks: true, musicVolume: 70, soundVolume: 80,
  arrowKeyMove: true, attackAnimations: "all",
};
export const QUALITY = {
  high: { resolution: 2, frameMs: 1000 / 30, particles: 80, emitters: 12, conditions: 32, glow: true, blurQuality: 2, arcSegments: 30, fogPuffs: 1200 },
  balanced: { resolution: 2, frameMs: 1000 / 30, particles: 56, emitters: 6, conditions: 24, glow: true, blurQuality: 1, arcSegments: 22, fogPuffs: 700 },
  low: { resolution: 1, frameMs: 1000 / 24, particles: 28, emitters: 0, conditions: 12, glow: false, blurQuality: 1, arcSegments: 14, fogPuffs: 300 },
} as const;

const isQuality = (v: unknown): v is GraphicsQuality => v === "high" || v === "balanced" || v === "low";
const isAttackAnimations = (v: unknown): v is AttackAnimations => v === "all" || v === "turn" || v === "none";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isVolume = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
/** Each setting's own check, so one bad stored value falls back alone (client-settings). */
const FIELD_CHECKS: { [K in keyof ClientSettings]: (v: unknown) => v is ClientSettings[K] } = {
  graphicsQuality: isQuality, reducedAnimations: isBoolean, autoFocusAttacks: isBoolean,
  musicVolume: isVolume, soundVolume: isVolume, arrowKeyMove: isBoolean, attackAnimations: isAttackAnimations,
};
const FIELDS = Object.keys(FIELD_CHECKS) as (keyof ClientSettings)[];

export function isClientSettings(value: unknown): value is ClientSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return FIELDS.every((field) => FIELD_CHECKS[field](v[field]));
}
function storage() {
  try { return window.localStorage; } catch { return null; }
}
function parseStored(store: Storage | null, key: string): unknown {
  try {
    const raw = store?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
/**
 * The saved settings over the defaults, field by field: a setting added since they were saved,
 * or one whose saved value is invalid, takes its default without resetting the rest. The token
 * card's old arrow-key switch is carried over once and its key removed.
 */
function readClientSettings(): ClientSettings {
  const store = storage();
  const stored = parseStored(store, CLIENT_SETTINGS_KEY);
  const saved = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  const result = { ...DEFAULT_CLIENT_SETTINGS } as Record<keyof ClientSettings, unknown>;
  for (const field of FIELDS) if (FIELD_CHECKS[field](saved[field])) result[field] = saved[field];
  if (!isBoolean(saved.arrowKeyMove)) {
    const legacy = parseStored(store, LEGACY_ARROW_KEY_MOVE_KEY);
    if (isBoolean(legacy)) {
      result.arrowKeyMove = legacy;
      writeStored(store, CLIENT_SETTINGS_KEY, result);
      try { store?.removeItem(LEGACY_ARROW_KEY_MOVE_KEY); } catch { /* storage blocked: the default stands next time */ }
    }
  }
  return result as unknown as ClientSettings;
}
let current: ClientSettings | undefined;
const listeners = new Set<() => void>();
export function getClientSettings(): ClientSettings {
  return current ??= readClientSettings();
}
export function graphicsBudget() { return QUALITY[getClientSettings().graphicsQuality]; }
export function setClientSettings(update: Partial<ClientSettings>) {
  const next = { ...getClientSettings(), ...update };
  if (!isClientSettings(next)) return;
  current = next;
  writeStored(storage(), CLIENT_SETTINGS_KEY, next);
  for (const listener of listeners) listener();
}
function storageChanged(event: StorageEvent) {
  if (event.key !== CLIENT_SETTINGS_KEY && event.key !== null) return;
  current = readClientSettings();
  for (const listener of listeners) listener();
}
export function subscribeClientSettings(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", storageChanged);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", storageChanged);
  };
}
/** Audio adjustments must not resize the canvas or interrupt a playing effect. */
export function subscribeGraphicsSettings(listener: () => void) {
  let previous = getClientSettings();
  return subscribeClientSettings(() => {
    const next = getClientSettings();
    const changed = next.graphicsQuality !== previous.graphicsQuality || next.reducedAnimations !== previous.reducedAnimations;
    previous = next;
    if (changed) listener();
  });
}
export function useClientSettings() {
  return useSyncExternalStore(subscribeClientSettings, getClientSettings, () => DEFAULT_CLIENT_SETTINGS);
}
