import { useEffect, useState, type ComponentProps } from "react";
import type { GridSpec } from "@vtt/shared";
import { MapViewport, type CanvasView } from "../../studio/MapViewport";
import { MapGuide } from "./EditorGuide";
import { GridLines, MapFilter } from "./GridLines";
import { t } from "../../i18n/locale";
import { EXAMPLE_HIGHLIGHT_EVENT } from "../../ui/tutorialExample";

export type { CanvasView };
/** Editor behavior stays outside the shared map-coordinate camera and gesture implementation. */
export function MapCanvas({ grid, children, ...props }: Omit<ComponentProps<typeof MapViewport>, "texts" | "overlay"> & { grid: GridSpec }) {
  const [focusRect, setFocusRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const show = (event: Event) => setFocusRect((event as CustomEvent<{ x: number; y: number; w: number; h: number }>).detail);
    window.addEventListener(EXAMPLE_HIGHLIGHT_EVENT, show);
    return () => window.removeEventListener(EXAMPLE_HIGHLIGHT_EVENT, show);
  }, []);
  return <MapViewport {...props} focusRect={focusRect} wrapperClassName="wall-canvas" svgClassName="wall-canvas-svg" controlsClassName="wall-canvas-zoom"
    texts={{ zoom: t("common.zoom"), fit: t("common.fit"), zoomIn: "+", zoomOut: "−" }} overlay={<><MapGuide /><MapFilter /></>}>
    {(view) => <><GridLines grid={grid} map={props.map} scale={view.scale} />{children(view)}</>}
  </MapViewport>;
}
