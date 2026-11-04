import type { Point } from "@vtt/shared";

/** The arrow keys as one-square steps, used by keyboard moving. */
export const ARROW_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
};

/** Where one square in direction (dx, dy) lands, or null when it would leave the map. */
export function stepTo(at: Point, step: number, dx: number, dy: number, bounds?: { width: number; height: number }): Point | null {
  const to = { x: at.x + dx * step, y: at.y + dy * step };
  return !bounds || (to.x >= 0 && to.y >= 0 && to.x <= bounds.width && to.y <= bounds.height) ? to : null;
}

/** Inputs whose arrow keys still move the token: they don't use the arrows themselves. */
const ARROWLESS_INPUTS = new Set(["checkbox", "button", "submit", "reset", "color", "file"]);
/** Widgets that use the arrow keys for themselves (tabs, lists, sliders, radios, menus…). */
const ARROW_WIDGETS = '[role="tablist"],[role="listbox"],[role="slider"],[role="radiogroup"],[role="menu"],[role="toolbar"],[role="separator"],[role="combobox"],[role="tree"],[role="grid"]';

/** Whether a key pressed on `target` belongs to that control rather than to keyboard moving. */
export function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement && !ARROWLESS_INPUTS.has(target.type)) return true;
  return !!target.closest(ARROW_WIDGETS);
}
