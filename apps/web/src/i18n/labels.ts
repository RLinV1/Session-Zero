import { t } from "./locale";

/** A game preset's name in the reader's language: built-in presets are translated, others shown as named. */
export function presetName(preset: { id: string; name: string }): string {
  return preset.id === "free" ? t("preset.free") : preset.name;
}

/** A game preset's description in the reader's language. */
export function presetDescription(preset: { id: string; description: string }): string {
  return preset.id === "free" ? t("preset.free.description") : preset.description;
}

/** Why a participant is no longer at the table, in the current language (the shared `inactiveLabel` is English). */
export function inactiveText(participant: { revoked?: boolean }): string {
  return t(participant.revoked ? "people.removedTag" : "people.leftTag");
}
