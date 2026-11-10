import { formatRef, type Entry, type MessageRef } from "./core";
import { sharedEn } from "./en";

const englishText = (ref: MessageRef) => formatRef(undefined, sharedEn as Readonly<Record<string, Entry>>, ref) ?? ref.id;

/**
 * Our own zod messages, mapped back to their catalog ids (ADR 0052). A schema writes
 * `message: validationMessage(sharedMsg("valid.nameBlank"))`: it gets the English zod reports, and
 * the server and the web can turn that issue's message back into an id with `validationRef` and
 * show it in the reader's language. Built when the schemas are defined, from fixed values only.
 */
const byText = new Map<string, MessageRef>();
const conflicts: string[] = [];

export function validationMessage(ref: MessageRef): string {
  const text = englishText(ref);
  const seen = byText.get(text);
  if (seen && seen.id !== ref.id) conflicts.push(text);
  byText.set(text, ref);
  return text;
}

/** The message a zod issue's English came from, if it is one of ours. */
export function validationRef(message: string): MessageRef | undefined {
  return byText.get(message);
}

/** English texts registered under two different ids: the index can't tell them apart. */
export function validationConflicts(): readonly string[] {
  return conflicts;
}
