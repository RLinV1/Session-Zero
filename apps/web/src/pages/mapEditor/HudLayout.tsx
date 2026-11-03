import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 220;
const MAX_WIDTH = 560;
const KEY_STEP = 24;
const STORAGE_KEY = "vtt.mapEditor.sidePanel";

interface Layout { width: number; collapsed: boolean }

const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

/** The remembered width and fold of the side panel; storage can be missing or blocked. */
function load(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Layout> | null;
    return { width: clampWidth(Number(saved?.width) || DEFAULT_WIDTH), collapsed: saved?.collapsed === true };
  } catch {
    return { width: DEFAULT_WIDTH, collapsed: false };
  }
}

/**
 * The map editor's step layout: the map beside a side panel the GM can drag wider or narrower and
 * fold away. Steps put the panel's width on `--hud-width` through this wrapper, so Grid, Walls and
 * Fog look and behave the same. The choice is remembered between steps and visits.
 */
export function HudLayout({ className, children }: { className: string; children: ReactNode }) {
  const [layout, setLayout] = useState(load);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* the choice just isn't remembered */ }
  }, [layout]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || layout.collapsed) return;
    drag.current = { x: e.clientX, width: layout.width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) setLayout((now) => ({ ...now, width: clampWidth(start.width + start.x - e.clientX) }));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowLeft" ? KEY_STEP : e.key === "ArrowRight" ? -KEY_STEP : 0;
    if (!delta || layout.collapsed) return;
    e.preventDefault();
    setLayout((now) => ({ ...now, width: clampWidth(now.width + delta) }));
  };
  const style = { "--hud-width": layout.collapsed ? "0px" : `${layout.width}px` } as CSSProperties;

  return (
    <div className={`${className} hud-layout`} style={style} data-hud-collapsed={layout.collapsed}>
      {children}
      <div
        className="hud-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={layout.collapsed ? 0 : layout.width}
        tabIndex={layout.collapsed ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          className="hud-fold"
          aria-label={layout.collapsed ? "Show side panel" : "Hide side panel"}
          aria-expanded={!layout.collapsed}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setLayout((now) => ({ ...now, collapsed: !now.collapsed }))}
        >
          {layout.collapsed ? <CaretLeft size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
