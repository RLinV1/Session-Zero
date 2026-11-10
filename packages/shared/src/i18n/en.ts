import type { CatalogSource } from "./core";
import { rejectionsEn } from "./messages/en/rejections";
import { validationEn } from "./messages/en/validation";

/**
 * English text that shared code writes for people: rejections, validation, activity sentences,
 * condition names, undo and portal phrases, replay points (localization; ADR 0052). The source
 * every other language is checked against, so editing an entry here edits the English the app
 * shows.
 */
export const sharedEn = {
  /** A rejection whose id the client doesn't know falls back to the server's English. */
  "common.unknownError": "Something went wrong",
  ...rejectionsEn,
  ...validationEn,
} as const satisfies CatalogSource;

export type SharedEn = typeof sharedEn;
