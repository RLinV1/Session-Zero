import { CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MapGuide } from "./mapEditor/EditorGuide";
import { gridLineStyle, type GridSpec, type Point } from "@vtt/shared";
import { gridLines } from "../board/gridLines";
import { canRenderGrid, minimumGridCellSizeForDisplay, type BoardSize } from "../board/gridRenderLimit";
import { adjustGridSampleCorner, drawGridSample, GRID_CELL_SNAP, gridFromSample, screenToMap, seedGridSample, snapGridSampleOffsets, type GridSample, type SampleCount } from "./gridSample";
import { beginPointerGesture, EMPTY_GESTURE, EMPTY_PLACEMENT, finishPointerGesture, interruptPointerGesture, movePointerGesture,
  repositionGridSample, transitionPlacement, type Anchor, type Placement, type PointerGesture } from "./gridSampleInteraction";

const MAX_SCALE = 8;
const BUTTON_STEP = 1.5;
interface Camera {
  cx: number;
  cy: number;
  /** Multiple of the fit-to-map scale. */
  zoom: number;
}
/** How far past fit the map may be zoomed out, so all of it can be seen with room around it. */
const MIN_ZOOM = 0.5;
const FIT: Camera = { cx: Number.NaN, cy: Number.NaN, zoom: 1 };
interface Pinch { distance: number; zoom: number; point: Point }
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Shared map editor. Anchors, provisional geometry and navigation stay local. */
export function MapGridPreview({ map, grid, onChange, onInteraction, onPreviewChange, previewEnabled = true, disabled = false, geometryRevision = 0, autoFocus = false }: {
  map: BoardSize & { url: string | null };
  grid: GridSpec;
  onChange: (grid: GridSpec) => void;
  /** Includes first-anchor placement, before a complete grid can change. */
  onInteraction?: () => void;
  /** Temporary geometry for editor readouts; never changes the confirmed draft. */
  onPreviewChange?: (grid: GridSpec | null) => void;
  /** Numeric editing takes precedence until focus returns to the map. */
  previewEnabled?: boolean;
  disabled?: boolean;
  /** Explicit numeric edits also invalidate anchors when the field is temporarily invalid. */
  geometryRevision?: number;
  autoFocus?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    let live = true;
    // A newly opened dialog enters the top layer in its parent's effect first.
    queueMicrotask(() => { if (live) svgRef.current?.focus(); });
    return () => { live = false; };
  }, [autoFocus]);
  const helpId = useId();
  const keysId = useId();
  const statusId = useId();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(FIT);
  const [count, setCount] = useState<SampleCount>(1);
  const [placement, setPlacement] = useState<Placement>(EMPTY_PLACEMENT);
  // Keyboard/seed geometry survives pauses; visible temporary previews do not.
  const [provisionalSample, setProvisionalSample] = useState<GridSample | null>(null);
  const [preserveProvisional, setPreserveProvisional] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [freeform, setFreeform] = useState(false);
  const [space, setSpace] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const gesture = useRef<PointerGesture>(EMPTY_GESTURE);
  const pinch = useRef<Pinch | null>(null);
  const sentGeometry = useRef(grid);
  const sample = "sample" in placement ? placement.sample : null;
  const selected = placement.stage === "repositioning" ? placement.selected : null;

  const clearTransient = useCallback(() => {
    const pointers = gesture.current.pointers;
    gesture.current = interruptPointerGesture(gesture.current);
    pinch.current = null;
    setCursor(null);
    setPreviewActive(false);
    for (const p of pointers) {
      if (svgRef.current?.hasPointerCapture(p.id)) svgRef.current.releasePointerCapture(p.id);
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        clearTransient();
        setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [clearTransient]);

  // Numeric corrections invalidate anchors; units and line style preserve them.
  useEffect(() => {
    const sent = sentGeometry.current;
    if (sent.cellSize !== grid.cellSize || sent.offsetX !== grid.offsetX || sent.offsetY !== grid.offsetY) {
      setPlacement(EMPTY_PLACEMENT);
      setProvisionalSample(null);
      setMessage(null);
      clearTransient();
    }
    sentGeometry.current = grid;
  }, [grid, clearTransient]);
  useEffect(() => { if (disabled || !previewEnabled) clearTransient(); }, [disabled, previewEnabled, clearTransient]);
  useEffect(() => {
    setPlacement(EMPTY_PLACEMENT);
    setProvisionalSample(null);
    setMessage(null);
    clearTransient();
  }, [geometryRevision, clearTransient]);

  const fitScale = viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / map.width, viewport.height / map.height) : 1;
  const maxZoom = Math.max(1, MAX_SCALE / fitScale);
  const clamp = (next: Camera): Camera => {
    const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, next.zoom));
    const scale = fitScale * zoom;
    const halfW = viewport.width / scale / 2;
    const halfH = viewport.height / scale / 2;
    const axis = (c: number, half: number, size: number) =>
      half * 2 >= size || Number.isNaN(c) ? size / 2 : Math.min(size - half, Math.max(half, c));
    return { zoom, cx: axis(next.cx, halfW, map.width), cy: axis(next.cy, halfH, map.height) };
  };
  const view = clamp(camera);
  const scale = fitScale * view.zoom;
  const vw = viewport.width / scale;
  const vh = viewport.height / scale;
  const vx = view.cx - vw / 2;
  const vy = view.cy - vh / 2;
  const zoomAt = (factor: number, sx = viewport.width / 2, sy = viewport.height / 2) => {
    clearTransient();
    setCamera((current) => {
      const from = clamp(current);
      const fromScale = fitScale * from.zoom;
      const px = from.cx - viewport.width / fromScale / 2 + sx / fromScale;
      const py = from.cy - viewport.height / fromScale / 2 + sy / fromScale;
      const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, from.zoom * factor));
      const toScale = fitScale * zoom;
      return clamp({ zoom, cx: px - sx / toScale + viewport.width / toScale / 2,
        cy: py - sy / toScale + viewport.height / toScale / 2 });
    });
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAtRef.current(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const press = (e: globalThis.KeyboardEvent) => { if (e.key === "Shift") setFreeform(true); };
    const release = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
      if (e.key === "Shift") setFreeform(false);
    };
    const blur = () => { setSpace(false); setFreeform(false); clearTransient(); };
    const releaseOutside = (e: globalThis.PointerEvent) => {
      if (e.target instanceof Node && svgRef.current?.contains(e.target)) return;
      gesture.current = finishPointerGesture(gesture.current, e.pointerId, true).gesture;
      pinch.current = null;
      setCursor(null);
      setPreviewActive(false);
    };
    window.addEventListener("keydown", press);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", clearTransient);
    window.addEventListener("pointerup", releaseOutside);
    window.addEventListener("pointercancel", releaseOutside);
    return () => {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", clearTransient);
      window.removeEventListener("pointerup", releaseOutside);
      window.removeEventListener("pointercancel", releaseOutside);
    };
  }, [clearTransient]);

  const mapPoint = (point: Point): Point | null => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? screenToMap(point, matrix.inverse()) : null;
  };
  const invalid = () => {
    setCursor(null);
    setPreviewActive(false);
    setMessage(`Keep the sample inside the map, with each square between ${minimumGridCellSizeForDisplay(map)} and 2000 px. Your last valid grid is retained. Try another location.`);
  };
  const commit = (point: Point, freeformPlacement = false) => {
    onInteraction?.();
    const cellSizeStep = freeformPlacement ? 0 : GRID_CELL_SNAP;
    const result = transitionPlacement(placement, { type: "place", point, cellSizeStep, offsetStep: cellSizeStep }, count, grid, map);
    if (result.invalid) { invalid(); return; }
    setPlacement(result.placement);
    setCursor(null);
    setMessage(null);
    if (result.placement.stage === "awaiting-b") {
      setProvisionalSample(seedGridSample(result.placement.anchor, grid.cellSize, count, map, cellSizeStep));
      setPreserveProvisional(false);
      setPreviewActive(true);
    } else {
      setProvisionalSample(null);
      setPreviewActive(false);
    }
    if (result.grid) {
      sentGeometry.current = result.grid;
      onChange(result.grid);
    }
  };
  const select = (anchor: Anchor) => {
    onInteraction?.();
    clearTransient();
    setPlacement(transitionPlacement(placement, { type: "select", anchor }, count, grid, map).placement);
    setMessage(null);
  };
  const preview = useMemo(() => {
    const step = freeform ? 0 : GRID_CELL_SNAP;
    if (placement.stage === "awaiting-b") {
      // An untouched seed follows Shift; explicit keyboard/count edits keep their bounds.
      if (!cursor && (preserveProvisional || freeform)) return provisionalSample;
      const point = cursor ?? provisionalSample?.corner;
      const candidate = point ? drawGridSample(placement.anchor, point, count, map, step) : null;
      return candidate && snapGridSampleOffsets(candidate, map, step);
    }
    if (placement.stage === "repositioning" && cursor) return repositionGridSample(placement.sample, placement.selected, cursor, map, step, step);
    return null;
  }, [placement, cursor, provisionalSample, preserveProvisional, count, map, freeform]);
  const previewGrid = useMemo(() => previewActive && previewEnabled && !disabled && preview
    ? gridFromSample(preview, grid, map, cursor && !freeform ? GRID_CELL_SNAP : 0) : null,
  [previewActive, previewEnabled, disabled, preview, grid, map, cursor, freeform]);
  useEffect(() => { onPreviewChange?.(previewGrid); }, [onPreviewChange, previewGrid]);
  useEffect(() => () => { onPreviewChange?.(null); }, [onPreviewChange]);
  const shownGrid = previewGrid ?? grid;
  const shownSample = previewGrid ? preview : sample;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled || (e.button !== 0 && e.button !== 1)
      || (gesture.current.pointers.some((p) => p.id !== e.pointerId) && e.pointerType !== "touch")) return;
    const screen = { x: e.clientX, y: e.clientY };
    const point = mapPoint(screen);
    if (!point) return;
    setFreeform(e.shiftKey);
    e.preventDefault();
    const action = (e.target as Element).closest("[data-anchor]")?.getAttribute("data-anchor");
    svgRef.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = beginPointerGesture(gesture.current, { id: e.pointerId, type: e.pointerType,
      start: screen, current: screen, anchor: action === "A" || action === "B" ? action : null }, space || e.button === 1);
    const touches = gesture.current.pointers.filter((p) => p.type === "touch");
    const [firstTouch, secondTouch] = touches;
    if (touches.length === 2 && firstTouch && secondTouch) {
      const mid = midpoint(firstTouch.current, secondTouch.current);
      const fixed = mapPoint(mid);
      if (fixed) pinch.current = { distance: Math.max(1, distance(firstTouch.current, secondTouch.current)), zoom: view.zoom, point: fixed };
    }
    setCursor(gesture.current.navigating ? null : point);
    setPreviewActive(!gesture.current.navigating);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    setFreeform(e.shiftKey);
    const screen = { x: e.clientX, y: e.clientY };
    const before = gesture.current;
    const previous = before.pointers.find((p) => p.id === e.pointerId);
    if (!previous) {
      if (!before.pointers.length && e.pointerType !== "touch" && !space && previewEnabled) {
        setCursor(mapPoint(screen));
        setPreviewActive(true);
      }
      return;
    }
    const next = movePointerGesture(before, e.pointerId, screen);
    gesture.current = next;
    if (next.interrupted) return;
    if (!next.navigating) { setCursor(mapPoint(screen)); setPreviewActive(true); return; }
    setCursor(null);
    setPreviewActive(false);
    const touches = next.pointers.filter((p) => p.type === "touch");
    const [firstTouch, secondTouch] = touches;
    const startPinch = pinch.current;
    if (firstTouch && secondTouch && startPinch) {
      const mid = midpoint(firstTouch.current, secondTouch.current);
      const rect = e.currentTarget.getBoundingClientRect();
      const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM,
        startPinch.zoom * distance(firstTouch.current, secondTouch.current) / startPinch.distance));
      const nextScale = fitScale * zoom;
      setCamera(clamp({ zoom,
        cx: startPinch.point.x - (mid.x - rect.left - viewport.width / 2) / nextScale,
        cy: startPinch.point.y - (mid.y - rect.top - viewport.height / 2) / nextScale }));
    } else if (next.pointers.length === 1) {
      const from = before.navigating ? previous.current : previous.start;
      const dx = (screen.x - from.x) / scale;
      const dy = (screen.y - from.y) / scale;
      setCamera((current) => {
        const fromView = clamp(current);
        return clamp({ ...fromView, cx: fromView.cx - dx, cy: fromView.cy - dy });
      });
    }
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    // Capture revocation can become observable before lostpointercapture is dispatched.
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) gesture.current = interruptPointerGesture(gesture.current);
    // Include the release position even when the browser omitted a final move event.
    const next = movePointerGesture(gesture.current, e.pointerId, { x: e.clientX, y: e.clientY });
    const result = finishPointerGesture(next, e.pointerId);
    gesture.current = result.gesture;
    pinch.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (disabled || !result.click) { setCursor(null); setPreviewActive(false); return; }
    if (result.click.anchor && sample && result.click.anchor !== selected) select(result.click.anchor);
    else {
      const point = mapPoint(result.click.current);
      if (point) commit(point, e.shiftKey);
    }
  };
  const cancelPointer = (e: PointerEvent<SVGSVGElement>) => {
    const result = finishPointerGesture(gesture.current, e.pointerId, true);
    gesture.current = result.gesture;
    pinch.current = null;
    setCursor(null);
    setPreviewActive(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement | HTMLButtonElement>) => {
    if (disabled) return;
    const action = (e.target as Element).closest("[data-anchor]")?.getAttribute("data-anchor");
    if (e.code === "Space" && (action === "A" || action === "B") && e.currentTarget === svgRef.current) {
      e.preventDefault();
      select(action);
      return;
    }
    if (e.code === "Space" && e.currentTarget === svgRef.current) {
      e.preventDefault();
      clearTransient();
      setSpace(true);
      return;
    }
    const arrows: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    };
    const arrow = arrows[e.key];
    const anchor = action === "A" || action === "B" ? action : selected;
    if (arrow) {
      if (placement.stage === "awaiting-b" || sample && anchor) onInteraction?.();
      e.preventDefault();
      clearTransient();
      const step = e.shiftKey ? 10 : 1;
      const delta = { x: arrow.x * step, y: arrow.y * step };
      const cellSizeStep = e.shiftKey ? 0 : GRID_CELL_SNAP;
      if (placement.stage === "awaiting-b" && !space) {
        const provisional = preview;
        const adjusted = provisional && adjustGridSampleCorner(provisional, delta, map, cellSizeStep);
        const next = adjusted && snapGridSampleOffsets(adjusted, map, cellSizeStep);
        if (next && gridFromSample(next, grid, map)) {
          setPlacement({ stage: "awaiting-b", anchor: next.anchor });
          setPreserveProvisional(true);
          setProvisionalSample(next); setPreviewActive(true); setMessage(null);
        }
        else invalid();
      } else if (sample && anchor && !space) {
        const editing = transitionPlacement(placement, { type: "select", anchor }, count, grid, map).placement;
        const result = transitionPlacement(editing, { type: "adjust", anchor, delta, cellSizeStep, offsetStep: e.shiftKey ? 0 : GRID_CELL_SNAP }, count, grid, map);
        if (result.invalid) invalid();
        else if (result.grid) {
          setPlacement(result.placement);
          sentGeometry.current = result.grid;
          setMessage(null);
          onChange(result.grid);
        }
      } else {
        setCamera((current) => {
          const from = clamp(current);
          return clamp({ ...from, cx: from.cx + delta.x * 30 / scale, cy: from.cy + delta.y * 30 / scale });
        });
      }
    } else if (e.key === "Enter") {
      onInteraction?.();
      e.preventDefault();
      clearTransient();
      if (sample) {
        // Hover confirmation uses the visible candidate; keyboard adjustments are
        // already in the draft, so confirming those only clears the selection.
        if (selected && previewActive && cursor && !space) commit(cursor, e.shiftKey);
        else {
          setPlacement(transitionPlacement(placement, { type: "confirm" }, count, grid, map).placement);
          setMessage(null);
        }
        svgRef.current?.focus();
      } else if (placement.stage === "awaiting-b") {
        if (previewActive && cursor && !space) commit(cursor, e.shiftKey);
        else if (preview) {
          const result = transitionPlacement(placement, { type: "confirm", sample: preview }, count, grid, map);
          if (result.invalid) invalid();
          else if (result.grid) {
            setPlacement(result.placement);
            setProvisionalSample(null);
            setMessage(null);
            sentGeometry.current = result.grid;
            onChange(result.grid);
          }
        }
        svgRef.current?.focus();
      } else if (!space) {
        commit({ x: view.cx, y: view.cy }, e.shiftKey);
      }
    }
  };

  const style = gridLineStyle(shownGrid);
  const path = useMemo(() => {
    if (viewport.width === 0 || !canRenderGrid(shownGrid.cellSize, map)) return "";
    const x0 = Math.max(0, vx), y0 = Math.max(0, vy);
    const x1 = Math.min(map.width, vx + vw), y1 = Math.min(map.height, vy + vh);
    const { xs, ys } = gridLines(shownGrid, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    return xs.map((x) => `M${x} ${y0}V${y1}`).join("") + ys.map((y) => `M${x0} ${y}H${x1}`).join("");
  }, [shownGrid, map, viewport.width, vx, vy, vw, vh]);
  const ready = viewport.width > 0 && viewport.height > 0;
  // Keep committed handles stationary while previewing a reposition, so a map click
  // can commit instead of accidentally selecting a handle that followed the cursor.
  const first = placement.stage === "awaiting-b" ? shownSample?.anchor ?? placement.anchor : sample?.anchor;
  const second = sample?.corner ?? shownSample?.corner;
  const side = shownSample ? Math.abs(shownSample.corner.x - shownSample.anchor.x) : 0;
  const status = placement.stage === "awaiting-a" ? "Step 1: Click or tap a grid intersection to place A."
    : placement.stage === "awaiting-b" ? "Step 2: Click or tap the opposite corner to place B."
      : selected ? `Anchor ${selected} selected. Click the map to reposition it, or press Enter to confirm and deselect.`
        : "Sample placed. Check alignment across the map; select A to move it or B to change spacing.";

  return (
    <div className="map-grid-preview">
      <p className="grid-instruction">Place A and B at opposite corners of one square. For a gridless map, choose the square size you want.</p>
      <div className="map-grid-toolbar">
        <div role="group" aria-label="Sample size" className="grid-sample-count">
          {([1, 3, 5] as const).map((n) => (
            <button key={n} type="button" className="secondary" aria-pressed={count === n} disabled={disabled}
              onClick={() => {
                onInteraction?.();
                const result = transitionPlacement(placement, { type: "count", count: n }, count, grid, map);
                const pending = placement.stage === "awaiting-b" && (preview ?? provisionalSample);
                if (result.invalid || (pending && !gridFromSample({ ...pending, count: n }, grid, map))) { invalid(); return; }
                clearTransient();
                if (pending) {
                  setProvisionalSample({ ...pending, count: n });
                  setPreserveProvisional(true);
                }
                setPlacement(result.placement);
                setCount(n);
                setMessage(null);
                if (result.grid) { sentGeometry.current = result.grid; onChange(result.grid); }
              }}>{n === 1 ? "1 square" : `${n}×${n}`}</button>
          ))}
        </div>
        <button type="button" className="secondary" disabled={disabled} onClick={() => {
          onInteraction?.();
          clearTransient(); setPlacement(EMPTY_PLACEMENT); setProvisionalSample(null); setMessage(null); svgRef.current?.focus();
        }}>Start over</button>
        <div role="group" aria-label="Select anchor" className="grid-anchor-controls">
          {(["A", "B"] as const).map((anchor) => (
            <button key={anchor} type="button" className="secondary" data-anchor={anchor}
              aria-pressed={selected === anchor} disabled={disabled || !sample} onClick={() => select(anchor)}
              onKeyDown={onKeyDown}>Select {anchor}</button>
          ))}
        </div>
        <div className="map-grid-zoom" role="group" aria-label="Zoom">
          <button type="button" className="secondary" aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM}
            onClick={() => zoomAt(1 / BUTTON_STEP)}><MagnifyingGlassMinus size={18} aria-hidden="true" /></button>
          <span className="map-grid-zoom-level">{Math.round(scale * 100)}%</span>
          <button type="button" className="secondary" aria-label="Zoom in" disabled={view.zoom >= maxZoom}
            onClick={() => zoomAt(BUTTON_STEP)}><MagnifyingGlassPlus size={18} aria-hidden="true" /></button>
          <button type="button" className="secondary" onClick={() => { clearTransient(); setCamera(FIT); }}>
            <CornersOut size={18} aria-hidden="true" /> Fit map
          </button>
        </div>
      </div>
      <p id={statusId} className="map-grid-status small-print" role="status">{status}</p>
      <div className="map-grid-canvas-wrap">
      <MapGuide />
      <svg ref={svgRef} className={`map-grid-canvas${space ? " is-panning" : ""}`}
        viewBox={ready ? `${vx} ${vy} ${vw} ${vh}` : `0 0 ${map.width} ${map.height}`}
        role="group" aria-label="Place grid anchors on the map" aria-describedby={`${statusId} ${helpId} ${keysId}`} tabIndex={0}
        aria-disabled={disabled} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={cancelPointer} onLostPointerCapture={(e) => {
          if (gesture.current.pointers.some((p) => p.id === e.pointerId)) clearTransient();
        }}
        onPointerLeave={clearTransient} onKeyDown={onKeyDown} onBlur={() => { setSpace(false); clearTransient(); }}>
        <rect x={0} y={0} width={map.width} height={map.height} fill="#2b2e35" />
        {map.url && <image href={map.url} x={0} y={0} width={map.width} height={map.height} />}
        <path d={path} fill="none" stroke={style.color} strokeOpacity={style.opacity}
          strokeWidth={Math.max(style.width, 1 / scale)} pointerEvents="none" />
        {first && (
          <g className={`grid-sample${previewGrid ? " is-provisional" : ""}`}>
            {shownSample && <rect x={Math.min(shownSample.anchor.x, shownSample.corner.x)}
              y={Math.min(shownSample.anchor.y, shownSample.corner.y)} width={side} height={side}
              fill="rgba(224,138,98,0.16)" stroke="#f7b18d" strokeWidth={2 / scale}
              strokeDasharray={previewGrid ? `${6 / scale} ${4 / scale}` : undefined} pointerEvents="none" />}
            {([{ anchor: "A", point: first }, { anchor: "B", point: second }] as const).map(({ anchor, point }) => point && (
              <g key={anchor} data-anchor={anchor} role={sample ? "button" : undefined} tabIndex={sample && !disabled ? 0 : -1}
                aria-label={`Select anchor ${anchor}. Use arrow keys; Enter confirms and deselects.`}
                aria-pressed={selected === anchor} aria-disabled={disabled}>
                <circle cx={point.x} cy={point.y} r={22 / scale} fill="transparent" />
                <circle className="grid-anchor-dot" cx={point.x} cy={point.y} r={8 / scale}
                  fill={selected === anchor ? "#fff0e6" : "#f7b18d"} stroke="#181b20" strokeWidth={2 / scale} />
                <text x={point.x + 12 / scale} y={point.y - 12 / scale} fontSize={14 / scale}
                  fontWeight={700} fill="#fff0e6" stroke="#181b20" strokeWidth={3 / scale} paintOrder="stroke"
                  pointerEvents="none" aria-hidden="true">{anchor}</text>
              </g>
            ))}
          </g>
        )}
      </svg>
      </div>
      <p id={helpId} className="muted small-print map-grid-help">
        Hold Shift to place freely. Scroll to zoom; middle-drag or Space-drag moves the view.
      </p>
      <details className="map-grid-keys small-print">
        <summary>Keyboard and fine control</summary>
        <p id={keysId} className="muted">
          Focus the map and press Enter to place A at the view center, then use arrows and Enter to place B.
          Select A to move both anchors by 1 pixel, or B to change the cell size by 0.5 px; Shift moves 10 pixels.
          Placement snaps to 0.5 px. On touch, use two fingers to pan and zoom.
        </p>
      </details>
      {message && <p className="error" role="status">{message}</p>}
    </div>
  );
}
