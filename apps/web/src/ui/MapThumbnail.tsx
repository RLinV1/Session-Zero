import { useState } from "react";
import type { GridSpec } from "@vtt/shared";
import { mapThumbnailFor } from "../net/builtinAssets";
import { MapGrid } from "./MapGrid";

/**
 * A map as a thumbnail (design-language: "Map thumbnails"): the map, cropped to its frame, with
 * its grid at a lighter weight. A shipped map loads its prepared thumbnail rather than the full
 * map, which for the four of them is about 1.9 MB against 235 KB. Until the image arrives, a
 * placeholder the frame's own shape holds its place, so nothing shifts when it does.
 */
export function MapThumbnail({ url, width, height, grid, alt = "" }: { url: string; width: number; height: number; grid?: GridSpec | null; alt?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  return (
    <span className={`map-thumb is-${state}`}>
      {state !== "loaded" && <span className="map-thumb-placeholder" aria-hidden="true" />}
      {state !== "failed" && (
        <img
          src={mapThumbnailFor(url) ?? url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
      {grid && state === "loaded" && (
        <MapGrid width={width} height={height} cell={grid.cellSize} offsetX={grid.offsetX} offsetY={grid.offsetY} variant="light" fit="cover" />
      )}
    </span>
  );
}
