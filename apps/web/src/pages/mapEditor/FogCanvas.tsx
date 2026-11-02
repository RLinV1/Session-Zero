import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { MAX_FOG_POINTS, type Command, type FogRegion, type GridSpec, type MapImage, type Point } from "@vtt/shared";
import { FOG_TEXTURE_SIZE, averageColor, fogPalette, makeFogCanvas, type Rgb } from "../../board/fogTexture";
import { fogRegionAt } from "../../board/tools";
import { motionReduced } from "../../ui/motion";
import { MapCanvas } from "./MapCanvas";

/** A polygon closes when a click lands this close to its first corner, in screen pixels. */
const CLOSE_PX = 12;
/** A corner handle is grabbed within this distance, in screen pixels. */
const HANDLE_PX = 10;

/** The region being dragged: moved whole, or by one corner. */
type FogDrag = { kind: "move"; start: Point } | { kind: "corner"; index: number };

/** Drag a rectangle, click out a polygon, click a region to reveal it, move or reshape one, or pan. */
export type FogCanvasMode = "rect" | "polygon" | "reveal" | "edit";
export type FogAdd = Extract<Command, { type: "fog.add" }>["region"];

const clamp = (p: Point, map: MapImage): Point => ({
  x: Math.min(map.width, Math.max(0, p.x)),
  y: Math.min(map.height, Math.max(0, p.y)),
});

/**
 * The Fog step's canvas (map-editor D4): the map with its fog as the GM sees it, in board
 * coordinates (invariant 8). Rectangle drags out a region, Polygon clicks out its corners, and
 * Reveal removes the topmost region under the click.
 */
/** The map's own colour, so editor fog is tinted like the board's (null until the image has loaded or when it cannot be read). */
function useMapColor(url: string): Rgb | null {
  const [color, setColor] = useState<Rgb | null>(null);
  useEffect(() => {
    let live = true;
    setColor(null);
    const image = new Image();
    // Maps can be served from the object store's own origin; without CORS the canvas is tainted and the colour unreadable.
    image.crossOrigin = "anonymous";
    image.onload = () => { if (live) setColor(averageColor(image)); };
    image.src = url;
    return () => { live = false; };
  }, [url]);
  return color;
}

const rgbCss = ([r, g, b]: Rgb) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/**
 * Fog as players see it: the board's two drifting cloud layers, as SVG patterns. Each pattern
 * moves by exactly one tile per loop, so the drift never jumps. Still when motion is reduced.
 */
/**
 * The fog texture as a data URL, made once per map colour. Drawing and encoding it takes long
 * enough to stall the click that turns Player view on, so it is made ahead of time, when the map's
 * colour is known, and kept for the next toggle.
 */
const textureCache = new Map<string, string>();
const textureKey = (base: Rgb | null) => (base ? base.map((c) => Math.round(c)).join(",") : "default");
function fogTextureUrl(base: Rgb | null): string {
  const key = textureKey(base);
  let url = textureCache.get(key);
  if (!url) {
    url = makeFogCanvas(base).toDataURL();
    textureCache.set(key, url);
  }
  return url;
}

function PlayerFog({ id, base }: { id: string; base: Rgb | null }) {
  const href = useMemo(() => fogTextureUrl(base), [base]);
  const still = motionReduced();
  const size = FOG_TEXTURE_SIZE;
  const layer = (key: string, transform: string, to: string, dur: string) => (
    <pattern id={`${id}-${key}`} patternUnits="userSpaceOnUse" width={size} height={size} patternTransform={transform}>
      <image href={href} width={size} height={size} />
      {!still && <animateTransform attributeName="patternTransform" type="translate" additive="sum" from="0 0" to={to} dur={dur} repeatCount="indefinite" />}
    </pattern>
  );
  return (
    <defs>
      {layer("base", "scale(2.5)", `${size} ${size * 0.35}`, "34s")}
      {layer("wisps", "scale(1.55) rotate(34)", `${-size} ${size}`, "22s")}
    </defs>
  );
}

/** One path of every region's outline, so Player view paints two shapes, not two per region. */
const outline = (fog: Record<string, FogRegion>) =>
  Object.values(fog).map((r) => `M${r.points.map((p) => `${p.x},${p.y}`).join("L")}Z`).join("");

/**
 * The fog regions. Memoised: pointer moves redraw the canvas many times a second, and the fog
 * (its patterns animate) must not be rebuilt for each one.
 */
const FogRegions = memo(function FogRegions({ fog, playerView, tint, fogId, revealingId, px }: {
  fog: Record<string, FogRegion>;
  playerView: boolean;
  tint: string;
  fogId: string;
  revealingId: string | null;
  px: number;
}) {
  const all = useMemo(() => outline(fog), [fog]);
  if (playerView) {
    return (
      <>
        <path d={all} fill={`url(#${fogId}-base)`} />
        <path d={all} fill={`url(#${fogId}-wisps)`} fillOpacity={0.55} pointerEvents="none" />
      </>
    );
  }
  return (
    <>
      {Object.values(fog).map((region) => (
        <polygon
          key={region.id}
          points={region.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={tint}
          fillOpacity={0.62}
          stroke={revealingId === region.id ? "#e74c3c" : "#9aa4b2"}
          strokeWidth={(revealingId === region.id ? 3 : 1.5) * px}
          strokeDasharray={`${6 * px} ${4 * px}`}
        />
      ))}
    </>
  );
});

export function FogCanvas({ map, grid, fog, mode, onAdd, onRemove, onUpdate, onNotice, busy, playerView = false }: {
  map: MapImage;
  grid: GridSpec;
  fog: Record<string, FogRegion>;
  mode: FogCanvasMode;
  onAdd: (region: FogAdd) => void;
  onRemove: (regionId: string) => void;
  /** A region moved or reshaped: its new corners. */
  onUpdate: (regionId: string, points: Point[]) => void;
  /** A message for the GM, such as the corner limit. */
  onNotice: (text: string) => void;
  busy: boolean;
  /** Draw fog the way players see it, with no outlines. */
  playerView?: boolean;
}) {
  const fogId = useId().replace(/:/g, "");
  const base = useMapColor(map.url);
  const tint = rgbCss(fogPalette(base).dark);
  // Make the Player view texture while the GM is still drawing, once the map's colour is known.
  useEffect(() => {
    const warm = () => { fogTextureUrl(base); };
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(warm);
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(warm, 200);
    return () => clearTimeout(handle);
  }, [base]);
  const [corners, setCorners] = useState<Point[]>([]);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  /** Edit tool: the chosen region, what is being dragged, and where its corners would be now. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<FogDrag | null>(null);
  const [preview, setPreview] = useState<Point[] | null>(null);
  /** Corners just sent, so the selection can follow the region to the new id it gets. */
  const sent = useRef<Point[] | null>(null);
  const selected = selectedId ? fog[selectedId] ?? null : null;

  // After a move or reshape the region comes back under a new id: follow it by its corners. A region
  // that is simply gone (revealed, or replaced by another edit) is let go.
  useEffect(() => {
    const key = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(" ");
    if (sent.current) {
      const wanted = key(sent.current);
      const moved = Object.values(fog).find((r) => key(r.points) === wanted);
      sent.current = null;
      if (moved) return setSelectedId(moved.id);
    }
    if (selectedId && !fog[selectedId]) setSelectedId(null);
  }, [fog, selectedId]);

  /** The selected region's corners with the drag applied, kept on the map. */
  const draggedPoints = (region: FogRegion, dragging: FogDrag, at: Point): Point[] => {
    if (dragging.kind === "corner") return region.points.map((p, i) => (i === dragging.index ? clamp(at, map) : p));
    const xs = region.points.map((p) => p.x);
    const ys = region.points.map((p) => p.y);
    const dx = Math.min(map.width - Math.max(...xs), Math.max(-Math.min(...xs), at.x - dragging.start.x));
    const dy = Math.min(map.height - Math.max(...ys), Math.max(-Math.min(...ys), at.y - dragging.start.y));
    return region.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  // A new tool starts clean: no half-drawn region carried over.
  useEffect(() => {
    setCorners([]);
    setAnchor(null);
    setHover(null);
    setDrag(null);
    setPreview(null);
    if (mode !== "edit") setSelectedId(null);
  }, [mode]);

  const onMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  const closePolygon = () => {
    if (corners.length >= 3) onAdd({ shape: "polygon", points: corners });
    setCorners([]);
  };

  return (
    <MapCanvas
      map={map}
      grid={grid}
      mode={mode}
      pan={false}
      label="Map fog. Drag a rectangle, click out a polygon, click fog to reveal it, or select fog to move or reshape it; the wheel or a pinch zooms, and two fingers pan."
      onMove={(p) => {
        // Hover only drives the reveal highlight and the draft being drawn; elsewhere a pointer
        // move must not redraw the canvas.
        if (mode === "edit" && drag && selected && p) setPreview(draggedPoints(selected, drag, p));
        else if (mode === "reveal" || anchor || (mode === "polygon" && corners.length > 0)) setHover(p);
        else if (hover) setHover(null);
      }}
      onCancel={() => { setAnchor(null); setDrag(null); setPreview(null); }}
      onSecondary={() => { setCorners([]); setAnchor(null); }}
      onPress={(p, _event, view) => {
        if (busy) return;
        if (mode === "rect") setAnchor(clamp(p, map));
        if (mode !== "edit") return;
        // A corner of the chosen region first, then any region under the pointer.
        const corner = selected?.points.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= HANDLE_PX * view.px) ?? -1;
        if (selected && corner >= 0) return setDrag({ kind: "corner", index: corner });
        const under = fogRegionAt(fog, p);
        setSelectedId(under?.id ?? null);
        if (under) setDrag({ kind: "move", start: p });
      }}
      onRelease={(p, _event, moved, view) => {
        if (busy) return;
        if (mode === "edit") {
          if (drag && selected && moved) {
            const points = draggedPoints(selected, drag, p);
            sent.current = points;
            onUpdate(selected.id, points);
          }
          setDrag(null);
          setPreview(null);
          return;
        }
        if (mode === "rect") {
          const from = anchor;
          setAnchor(null);
          if (from && moved) onAdd({ shape: "rect", from, to: clamp(p, map) });
          return;
        }
        if (moved) return;
        if (mode === "reveal") {
          const region = fogRegionAt(fog, p);
          if (region) onRemove(region.id);
          return;
        }
        if (mode !== "polygon" || !onMap(p)) return;
        const first = corners[0];
        if (first && corners.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_PX * view.px) {
          closePolygon();
          return;
        }
        if (corners.length >= MAX_FOG_POINTS) {
          onNotice(`A fog region holds at most ${MAX_FOG_POINTS} corners. Close this one, then start another.`);
          return;
        }
        setCorners([...corners, p]);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && corners.length >= 3) {
          closePolygon();
          e.preventDefault();
          e.stopPropagation();
        } else if (e.key === "Escape" && (drag || selectedId)) {
          setDrag(null);
          setPreview(null);
          setSelectedId(null);
          e.preventDefault();
          e.stopPropagation();
        } else if ((e.key === "Enter" || e.key === "Escape") && (corners.length > 0 || anchor)) {
          // Escape drops a half-drawn region; with none, it is left to close the editor.
          setCorners([]);
          setAnchor(null);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {(view) => {
        const px = view.px;
        const revealing = mode === "reveal" && hover ? fogRegionAt(fog, hover) : null;
        // While a region is dragged, it is drawn where it would land.
        const shownFog = selected && preview ? { ...fog, [selected.id]: { ...selected, points: preview } } : fog;
        const handles = mode === "edit" && selected ? (preview ?? selected.points) : [];
        const draft = anchor && hover ? clamp(hover, map) : null;
        return (
          <>
            {playerView && <PlayerFog id={fogId} base={base} />}
            <FogRegions fog={shownFog} playerView={playerView} tint={tint} fogId={fogId} revealingId={revealing?.id ?? null} px={px} />
            {mode === "edit" && selected && (
              <g>
                <polygon points={(preview ?? selected.points).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#ffd166" strokeWidth={2.5 * px} pointerEvents="none" />
                {handles.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={6 * px} fill="#fff" stroke="#111" strokeWidth={1.5 * px} pointerEvents="none" />
                ))}
              </g>
            )}
            {anchor && draft && (
              <rect
                x={Math.min(anchor.x, draft.x)} y={Math.min(anchor.y, draft.y)}
                width={Math.abs(draft.x - anchor.x)} height={Math.abs(draft.y - anchor.y)}
                fill="#ffd166" fillOpacity={0.18} stroke="#ffd166" strokeWidth={2 * px} strokeDasharray={`${8 * px} ${5 * px}`}
              />
            )}
            {mode === "polygon" && corners.length > 0 && (
              <g>
                <polyline
                  points={[...corners, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="#ffd166" fillOpacity={0.12} stroke="#ffd166" strokeWidth={2.5 * px} strokeDasharray={`${8 * px} ${5 * px}`}
                />
                {corners.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={(i === 0 && corners.length >= 3 ? 6 : 4) * px} fill={i === 0 ? "#fff" : "#ffd166"} stroke="#111" strokeWidth={1.5 * px} />
                ))}
              </g>
            )}
          </>
        );
      }}
    </MapCanvas>
  );
}
