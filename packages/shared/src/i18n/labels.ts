import type { MessageRef } from "./core";
import { sharedMsg } from "./index";

/** A game preset's name inside a message: a built-in preset in the reader's language, any other as named. */
export function presetLabel(preset: { id: string; name: string }): string | MessageRef {
  return preset.id === "free" ? sharedMsg("preset.free") : preset.name;
}
