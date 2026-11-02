import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import { useRef, useState, type ReactNode } from "react";
import type { Point } from "@vtt/shared";

const STEPS: { label: string; key: string; icon: ReactNode }[] = [
  { label: "up", key: "ArrowUp", icon: <ArrowUp size={18} aria-hidden="true" /> },
  { label: "left", key: "ArrowLeft", icon: <ArrowLeft size={18} aria-hidden="true" /> },
  { label: "right", key: "ArrowRight", icon: <ArrowRight size={18} aria-hidden="true" /> },
  { label: "down", key: "ArrowDown", icon: <ArrowDown size={18} aria-hidden="true" /> },
];

/** The arrow keys as one-square steps, shared by the Move buttons and keyboard moving. */
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

/**
 * Moves a token one grid square at a time: the non-drag way to move (WCAG 2.5.7,
 * FRONTEND-CONTRACT §13.5). `at` and `step` are board coordinates (map-image pixels).
 * A step that would leave the map is unavailable; the server still decides the move.
 */
export function MoveControl({
  name,
  at,
  step,
  bounds,
  onMove,
}: {
  name: string;
  at: Point;
  step: number;
  /** The map's size; omitted when there is no map to stay on. */
  bounds?: { width: number; height: number };
  onMove: (to: Point) => Promise<unknown>;
}) {
  // One move at a time: a second press before the first lands would start from a stale square.
  // `aria-disabled`, not `disabled`: disabling the focused button (mid-move, or on reaching the
  // map's edge) would drop keyboard focus.
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="move-control" role="group" aria-label={`Move ${name}`} aria-busy={busy || undefined}>
      {STEPS.map(({ label, key, icon }) => {
        const [dx, dy] = ARROW_STEPS[key]!;
        const to = stepTo(at, step, dx, dy, bounds);
        const offMap = to === null;
        return (
          <button
            key={label}
            type="button"
            className="secondary move-step"
            style={{ gridArea: label }}
            aria-label={`Move ${name} ${label} one square`}
            title={`Move ${label} one square`}
            aria-disabled={busy || offMap || undefined}
            onClick={async () => {
              if (pending.current || to === null) return;
              pending.current = true;
              setBusy(true);
              try {
                await onMove(to);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
