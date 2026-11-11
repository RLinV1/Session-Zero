import { formatRef, messageRefs, type Entry, type MessageRef } from "./core";
import { sharedEn, type SharedEn } from "./en";

export * from "./core";
export { sharedEn, type SharedEn } from "./en";
export { validationConflicts, validationMessage, validationRef } from "./validation";

/** Builds a typed reference to a shared message: `sharedMsg("reject.wallBlocked")`. */
export const sharedMsg = messageRefs<SharedEn>();
/** The English catalog as a plain record, for `formatRef` lookups by an id that arrived at runtime. */
export const sharedEnRecord: Readonly<Record<string, Entry>> = sharedEn;

/**
 * A shared message in English: what `message` fields carry for clients that never ask for a
 * language (ADR 0054). Pure, so `decide` can call it.
 */
export function englishText(ref: MessageRef): string {
  return formatRef(undefined, sharedEnRecord, ref) ?? ref.id;
}
