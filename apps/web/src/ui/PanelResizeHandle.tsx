import { useCallback, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "../i18n/locale";

export const MIN_PANEL_WIDTH = 272;
const MAX_PANEL_WIDTH = 720;
const KEY_STEP = 16;

/** The widest the panel may grow: never more than 60% of the window, so the board stays usable. */
export function maxPanelWidth(windowWidth: number): number {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.round(windowWidth * 0.6)));
}

export function clampPanelWidth(width: number, windowWidth: number): number {
  return Math.min(maxPanelWidth(windowWidth), Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

export const isPanelWidth = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= MIN_PANEL_WIDTH && v <= MAX_PANEL_WIDTH);

/**
 * The drag strip on the sidebar's inner edge. Drag, or focus it and use the arrow keys, to set
 * the panel's width; double-click or Home returns it to the default. Board positions are
 * untouched: only the layout column changes, and the board canvas resizes with its host.
 */
export function PanelResizeHandle({
  width,
  onWidth,
}: {
  /** Current width in px, or null while the stylesheet's default applies. */
  width: number | null;
  onWidth: (width: number | null) => void;
}) {
  const move = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      onWidth(clampPanelWidth(window.innerWidth - e.clientX, window.innerWidth));
    },
    [onWidth],
  );

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = width ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? MIN_PANEL_WIDTH;
    if (e.key === "ArrowLeft") onWidth(clampPanelWidth(current + KEY_STEP, window.innerWidth));
    else if (e.key === "ArrowRight") onWidth(clampPanelWidth(current - KEY_STEP, window.innerWidth));
    else if (e.key === "Home") onWidth(null);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="panel-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("sidebar.resize")}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={maxPanelWidth(window.innerWidth)}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title={t("sidebar.resizeHint")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={move}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      onDoubleClick={() => onWidth(null)}
      onKeyDown={key}
    />
  );
}
