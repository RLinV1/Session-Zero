import type { TemplateGeometry } from "./state";

/**
 * How an edit of a placed area reads in the activity log (ADR 0058): "changed" when its size or
 * width changed, otherwise "moved" when its placed point moved, otherwise "turned". Its own module,
 * with type-only imports, so the localized sentences can use it without an import cycle.
 */
export function templateChangeKind(from: TemplateGeometry, to: TemplateGeometry): "moved" | "turned" | "changed" {
  if (from.size !== to.size || from.width !== to.width) return "changed";
  return from.origin.x !== to.origin.x || from.origin.y !== to.origin.y ? "moved" : "turned";
}
