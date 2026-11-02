import type { CSSProperties, ReactNode } from "react";
import { MapGrid } from "../../ui/MapGrid";
import { CROP, viewRect, type CropView } from "./crops";

/**
 * Part of a home crop on its own, with the map's faint squares: the picture is the whole crop,
 * moved and clipped so the view starts on one of its grid lines. Anything placed inside uses
 * `atPoint`; an SVG laid over it can use crop pixels with `viewBox={viewBoxOf(view)}`.
 */
export function CropWindow({ src, alt, view, children }: { src: string; alt: string; view: CropView; children?: ReactNode }) {
  const r = viewRect(view);
  return (
    // --cols lets a token size itself to the view's squares (styles.css, "a token fills its square").
    <div className="crop-window" style={{ aspectRatio: `${r.width} / ${r.height}`, "--cols": view.cols } as CSSProperties}>
      <img
        src={src}
        alt={alt}
        width={CROP.width}
        height={CROP.height}
        loading="lazy"
        decoding="async"
        // Tokens are dragged across it; the picture itself must never start the browser's image drag.
        draggable={false}
        style={{ width: `${(CROP.width / r.width) * 100}%`, left: `${(-r.x / r.width) * 100}%`, top: `${(-r.y / r.height) * 100}%` }}
      />
      <MapGrid width={r.width} height={r.height} cell={CROP.cell} variant="faint" />
      {children}
    </div>
  );
}

/** The SVG viewBox that puts crop pixels under a view. */
export function viewBoxOf(view: CropView): string {
  const r = viewRect(view);
  return `${r.x} ${r.y} ${r.width} ${r.height}`;
}
