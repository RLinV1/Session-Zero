import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { type MapImage, type Point } from "@vtt/shared";

/** A press that moves further than this is a drag, not a click. */
const CLICK_SLOP_PX = 4;
const MAX_ZOOM = 12;
const FOCUS_ZOOM = 2.5;
/** Wheel events closer together than this belong to the same gesture and keep its classification. */
const WHEEL_GESTURE_MS = 150;

/** Safari's non-standard trackpad pinch event. */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

/**
 * A wheel event from a trackpad's two-finger scroll, as opposed to a mouse wheel notch. Browsers do
 * not say which device sent it: a mouse reports lines (Firefox) or coarse notches whose legacy
 * `wheelDeltaY` is not -3 × `deltaY` (Chromium, WebKit); a trackpad scrolls in pixels, often
 * sideways, and reports `wheelDeltaY === -3 × deltaY`.
 */
function trackpadScroll(e: globalThis.WheelEvent) {
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  const legacy = (e as globalThis.WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (legacy) return Math.abs(legacy + 3 * e.deltaY) < 1;
  return Math.abs(e.deltaY) < 50;
}

interface Camera {
  /** Map point at the centre of the view. */
  cx: number;
  cy: number;
  /** Multiple of the fit-to-view scale. */
  zoom: number;
}

/** A two-finger gesture: the map point under the fingers' midpoint stays under it. */
interface Pinch { distance: number; zoom: number; point: Point }

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** What a layer needs to draw in map coordinates at a steady size on screen. */
export interface CanvasView {
  /** Screen pixels per map pixel. */
  scale: number;
  /** One screen pixel in map pixels: multiply by a size in screen pixels. */
  px: number;
}

/**
 * Provider-free SVG map viewport extracted from the map editor (map-editor D3): the map and its grid in board coordinates
 * (invariant 8) with a viewBox camera. The wheel or a two-finger pinch zooms; Pan mode, the middle
 * button, Space-drag or a two-finger drag pans. With `wheel="auto"`, a trackpad's two-finger scroll
 * pans and only a mouse wheel or a pinch zooms. Every pointer callback gets a map point, never a screen point. Steps
 * draw their own layers as `children` and choose what a click or drag does.
 */
export function MapViewport({
  map, mode, pan, label, className, focus, focusRect, onMove, onPress, onRelease, onCancel, onSecondary, onKeyDown, children, overlay, toolbar, texts, onImageError, keyboardNavigation = false, minZoom = 1, wheel = "zoom", wrapperClassName = "studio-map-viewport", svgClassName = "studio-map-svg", controlsClassName = "studio-map-zoom",
}: {
  map: MapImage;
  /** Names the cursor (`mode-<mode>`). Space held shows `pan`. */
  mode: string;
  /** The step's Pan tool is chosen: every drag moves the view. */
  pan: boolean;
  label: string;
  /** Extra class on the SVG, for a step's own styling and tests. */
  className?: string;
  /** A map point to bring into view (zoomed in at least to FOCUS_ZOOM) whenever it changes. */
  focus?: Point | null;
  /** The pointer moved over the map, or left it (null). */
  onMove?: (at: Point | null, event: PointerEvent<SVGSVGElement>, view: CanvasView) => void;
  /** A primary press that is not a pan. */
  onPress?: (at: Point, event: PointerEvent<SVGSVGElement>, view: CanvasView) => void;
  /** The matching release; `moved` when the pointer travelled past a click's slop. */
  onRelease?: (at: Point, event: PointerEvent<SVGSVGElement>, moved: boolean, view: CanvasView) => void;
  /** A second finger turned the press into a pinch: drop anything the press began. */
  onCancel?: () => void;
  /** A right-button press. */
  onSecondary?: () => void;
  onKeyDown?: (event: KeyboardEvent<SVGSVGElement>, center: Point) => void;
  children: (view: CanvasView) => ReactNode;
  overlay?: ReactNode;
  /** Tools shown with the zoom controls in one bar at the bottom of the view. */
  toolbar?: ReactNode;
  /** Lowest zoom as a multiple of fit-to-view; below 1 leaves a margin around the whole map. */
  minZoom?: number;
  /** "auto": a trackpad's two-finger scroll pans; a mouse wheel and a pinch zoom. */
  wheel?: "zoom" | "auto";
  onImageError?: () => void;
  focusRect?: { x: number; y: number; w: number; h: number } | null;
  texts: { zoom: string; fit: string; zoomIn: string; zoomOut: string };
  keyboardNavigation?: boolean;
  wrapperClassName?: string;
  svgClassName?: string;
  controlsClassName?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ cx: map.width / 2, cy: map.height / 2, zoom: 1 });
  const [space, setSpace] = useState(false);
  const press = useRef<{ x: number; y: number; camera: Camera; pan: boolean; moved: boolean } | null>(null);
  /** Pointers down on the canvas, in client pixels, for pinch and two-finger pan. */
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const wheelGesture = useRef<{ pan: boolean; at: number } | null>(null);
  const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(minZoom, zoom));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setView({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const focusX = focus?.x;
  const focusY = focus?.y;
  useEffect(() => {
    if (focusX === undefined || focusY === undefined) return;
    setCamera((c) => ({ cx: focusX, cy: focusY, zoom: Math.max(c.zoom, FOCUS_ZOOM) }));
  }, [focusX, focusY]);

  const fit = view.width > 0 && view.height > 0 ? Math.min(view.width / map.width, view.height / map.height) : 1;
  const scale = fit * camera.zoom;
  const viewBox = useMemo(() => {
    const w = view.width / scale || map.width;
    const h = view.height / scale || map.height;
    return { x: camera.cx - w / 2, y: camera.cy - h / 2, w, h };
  }, [view, scale, camera, map]);

  const toMap = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: viewBox.x + (clientX - rect.left) / scale, y: viewBox.y + (clientY - rect.top) / scale };
  };

  /** Zoom by `factor`, keeping the map point under the client point where it is. */
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2, y = clientY - rect.top - rect.height / 2;
    setCamera((c) => {
      const zoom = clampZoom(c.zoom * factor);
      const before = fit * c.zoom, after = fit * zoom;
      return { zoom, cx: c.cx + x / before - x / after, cy: c.cy + y / before - y / after };
    });
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  const onWheel = (e: globalThis.WheelEvent) => {
    e.preventDefault();
    // A trackpad pinch arrives as a wheel event with ctrlKey set.
    if (e.ctrlKey) { zoomAt(e.clientX, e.clientY, Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.01)))); return; }
    const last = wheelGesture.current;
    const pan = wheel === "auto" && (last && e.timeStamp - last.at < WHEEL_GESTURE_MS ? last.pan : trackpadScroll(e));
    wheelGesture.current = { pan, at: e.timeStamp };
    if (pan) setCamera((c) => ({ ...c, cx: c.cx + e.deltaX / (fit * c.zoom), cy: c.cy + e.deltaY / (fit * c.zoom) }));
    else zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  };
  // React's wheel listener is passive, so it can't stop the frame scrolling; listen natively.
  const wheelHandler = useRef(onWheel);
  wheelHandler.current = onWheel;
  const gestureStart = useRef(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelEvent = (e: globalThis.WheelEvent) => wheelHandler.current(e);
    // Safari reports a trackpad pinch as gesture events instead of ctrl-wheel.
    const onGestureStart = (e: Event) => { e.preventDefault(); gestureStart.current = 1; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      const step = g.scale / gestureStart.current;
      gestureStart.current = g.scale;
      zoomAtRef.current(g.clientX, g.clientY, step);
    };
    svg.addEventListener("wheel", onWheelEvent, { passive: false });
    svg.addEventListener("gesturestart", onGestureStart);
    svg.addEventListener("gesturechange", onGestureChange);
    return () => {
      svg.removeEventListener("wheel", onWheelEvent);
      svg.removeEventListener("gesturestart", onGestureStart);
      svg.removeEventListener("gesturechange", onGestureChange);
    };
  }, []);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    svgRef.current?.focus({ preventScroll: true });
    if (e.button === 2) {
      onSecondary?.();
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [first, second] = [...pointers.current.values()];
    if (pointers.current.size === 2 && first && second) {
      // A second finger turns the press into a pinch: no tap fires when the fingers lift.
      if (press.current) onCancel?.();
      press.current = null;
      const mid = midpoint(first, second);
      pinch.current = { distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)), zoom: camera.zoom, point: toMap(mid.x, mid.y) };
      return;
    }
    if (pointers.current.size > 1) return;
    const panning = pan || e.button === 1 || space;
    press.current = { x: e.clientX, y: e.clientY, camera, pan: panning, moved: false };
    if (!panning) onPress?.(toMap(e.clientX, e.clientY), e, { scale, px: 1 / scale });
  };

  const endPointer = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [first, second] = [...pointers.current.values()];
    const gesture = pinch.current;
    if (gesture && first && second) {
      // Zoom by the change in finger spread, and keep the pinched map point under the midpoint,
      // so moving both fingers together pans.
      const rect = svgRef.current!.getBoundingClientRect();
      const mid = midpoint(first, second);
      const zoom = clampZoom(gesture.zoom * Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance);
      const next = fit * zoom;
      setCamera({ zoom, cx: gesture.point.x - (mid.x - rect.left - view.width / 2) / next, cy: gesture.point.y - (mid.y - rect.top - view.height / 2) / next });
      return;
    }
    onMove?.(toMap(e.clientX, e.clientY), e, { scale, px: 1 / scale });
    const start = press.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > CLICK_SLOP_PX) start.moved = true;
    if (start.pan && start.moved) setCamera({ ...start.camera, cx: start.camera.cx - dx / scale, cy: start.camera.cy - dy / scale });
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const start = press.current;
    press.current = null;
    endPointer(e);
    if (!start || start.pan) return;
    onRelease?.(toMap(e.clientX, e.clientY), e, start.moved, { scale, px: 1 / scale });
  };

  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    onKeyDown?.(e, { x: camera.cx, y: camera.cy });
    if (e.defaultPrevented) return;
    if (e.key === " ") {
      setSpace(true);
      e.preventDefault();
    }
    if (keyboardNavigation) {
      const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (move) { e.preventDefault(); setCamera((c) => ({ ...c, cx: c.cx + move[0]! * 40 / scale, cy: c.cy + move[1]! * 40 / scale })); }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom * 1.5) })); }
      if (e.key === "-") { e.preventDefault(); setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom / 1.5) })); }
      if (e.key === "0" || e.key === "Home") { e.preventDefault(); setCamera({ cx: map.width / 2, cy: map.height / 2, zoom: 1 }); }
    }
  };

  const px = 1 / scale;
  const zoomControls = <div className={controlsClassName} role="group" aria-label={texts.zoom}>
    <button type="button" className="secondary small" aria-label={texts.zoomIn} onClick={() => setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom * 1.5) }))}>+</button>
    <button type="button" className="secondary small" aria-label={texts.zoomOut} onClick={() => setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom / 1.5) }))}>−</button>
    <button type="button" className="secondary small" onClick={() => setCamera({ cx: map.width / 2, cy: map.height / 2, zoom: 1 })}>{texts.fit}</button>
  </div>;
  const boxX = focusRect?.x, boxY = focusRect?.y, boxW = focusRect?.w, boxH = focusRect?.h;
  useEffect(() => {
    if (boxX === undefined || boxY === undefined || boxW === undefined || boxH === undefined) return;
    setCamera((c) => ({ cx: boxX + boxW / 2, cy: boxY + boxH / 2, zoom: Math.min(MAX_ZOOM, Math.max(1, Math.min(map.width / (boxW * 2), map.height / (boxH * 2)), c.zoom)) }));
  }, [boxX, boxY, boxW, boxH, map.width, map.height]);
  return (
    <div className={`${wrapperClassName}${toolbar ? " has-dock" : ""}`}>
      <svg
        ref={svgRef}
        className={`${svgClassName} mode-${space ? "pan" : mode}${className ? ` ${className}` : ""}`}
        data-testid="studio-map"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        tabIndex={0}
        role="application"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          if (press.current) onCancel?.();
          press.current = null;
          endPointer(e);
        }}
        onLostPointerCapture={(e) => {
          if (!pointers.current.delete(e.pointerId)) return;
          if (press.current) onCancel?.();
          press.current = null;
          pinch.current = null;
        }}
        onPointerLeave={(e) => onMove?.(null, e, { scale, px: 1 / scale })}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => { if (e.key === " ") setSpace(false); }}
        onBlur={() => setSpace(false)}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <image data-testid="studio-source-image" onError={onImageError} href={map.url} x={0} y={0} width={map.width} height={map.height} preserveAspectRatio="none" />
        {children({ scale, px })}
      </svg>
      {overlay}
      {toolbar ? <div className="studio-map-dock">{toolbar}{zoomControls}</div> : zoomControls}
    </div>
  );
}
