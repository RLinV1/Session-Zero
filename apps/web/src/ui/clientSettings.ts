import { useSyncExternalStore } from "react";
import { readStored, writeStored } from "./usePersistentState";

export type GraphicsQuality = "high" | "balanced" | "low";
export interface ClientSettings {
  graphicsQuality: GraphicsQuality;
  reducedAnimations: boolean;
  /** Pan and zoom the board to the fighters when an attack plays. */
  autoFocusAttacks: boolean;
  musicVolume: number;
  soundVolume: number;
}
export const CLIENT_SETTINGS_KEY = "vtt.ui.settings";
export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  graphicsQuality: "balanced", reducedAnimations: false, autoFocusAttacks: true, musicVolume: 70, soundVolume: 80,
};
export const QUALITY = {
  high: { resolution: 2, frameMs: 1000 / 30, particles: 80, emitters: 12, conditions: 32, glow: true, blurQuality: 2, arcSegments: 30, fogPuffs: 1200 },
  balanced: { resolution: 2, frameMs: 1000 / 30, particles: 56, emitters: 6, conditions: 24, glow: true, blurQuality: 1, arcSegments: 22, fogPuffs: 700 },
  low: { resolution: 1, frameMs: 1000 / 24, particles: 28, emitters: 0, conditions: 12, glow: false, blurQuality: 1, arcSegments: 14, fogPuffs: 300 },
} as const;

export function isClientSettings(value: unknown): value is ClientSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ClientSettings>;
  const volume = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return (v.graphicsQuality === "high" || v.graphicsQuality === "balanced" || v.graphicsQuality === "low")
    && typeof v.reducedAnimations === "boolean" && typeof v.autoFocusAttacks === "boolean" && volume(v.musicVolume) && volume(v.soundVolume);
}
function storage() {
  try { return window.localStorage; } catch { return null; }
}
let current: ClientSettings | undefined;
const listeners = new Set<() => void>();
export function getClientSettings(): ClientSettings {
  return current ??= readStored(storage(), CLIENT_SETTINGS_KEY, DEFAULT_CLIENT_SETTINGS, isClientSettings);
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
  current = readStored(storage(), CLIENT_SETTINGS_KEY, DEFAULT_CLIENT_SETTINGS, isClientSettings);
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
