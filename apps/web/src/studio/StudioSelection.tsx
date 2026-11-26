import { useId, useRef, useState } from "react";
import {
  cellRect, distanceToSegment, studioObjectCoverage, studioTerrainCoverage,
  type Point, type StudioEditLayer, type StudioInspection, type StudioRectangle, type StudioSelection, type StudioSelectionObject,
} from "@vtt/shared";
import type { StudioMapInteraction } from "./StudioSceneMap";
import { studioT, type StudioLocale } from "./text";

type Tool = "region" | "objects" | "pan";
interface DraftSelection {
  tool: Tool;
  revision: number;
  region: StudioRectangle | null;
  layers: StudioEditLayer[];
  excluded: string[];
  whole: string[];
}

const area = (a: Point, b: Point): StudioRectangle => ({
  minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y),
});
export const objectCenter = (bounds: StudioRectangle): Point => ({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
const positive = (r: StudioRectangle) => r.minX < r.maxX && r.minY < r.maxY;
const box = (r: StudioRectangle) => ({ x: r.minX, y: r.minY, width: r.maxX - r.minX, height: r.maxY - r.minY });
const emptyDraft: DraftSelection = { tool: "region", revision: 0, region: null, layers: [], excluded: [], whole: [] };
const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
export const editLayers = ["geometry", "terrain", "placements"] as const;

export function studioObjectLabel(locale: StudioLocale, object: StudioSelectionObject) {
  return object.kind === "token" && object.label ? object.label : studioT(locale, `object.${object.kind}`);
}

export function useStudioSelection(inspection: StudioInspection | null, allowed: StudioEditLayer[], disabled: boolean, cancel: () => void) {
  const cellsId = useId().replace(/:/g, "");
  const [draft, setDraft] = useState<DraftSelection>(emptyDraft);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [keyboardObjectId, setKeyboardObjectId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<StudioRectangle | null>(null);
  const anchor = useRef<Point | null>(null);
  const keyboardAnchor = useRef<Point | null>(null);
  const source = inspection?.scene.source;
  const grid = inspection?.scene.grid;
  const objects = inspection?.objects ?? [];
  const keyboardObject = objects.find((object) => object.id === keyboardObjectId);
  const setTool = (tool: Tool) => {
    anchor.current = null; keyboardAnchor.current = null;
    setDragging(null); setCursor(null); setKeyboardObjectId(null); setDraft((old) => ({ ...old, tool }));
  };
  const reset = (layers: StudioEditLayer[]) => {
    setTool("region");
    setDraft((old) => ({ ...emptyDraft, revision: old.revision, layers }));
  };
  const clamp = (at: Point) => ({ x: Math.max(0, Math.min(at.x, source?.width ?? 0)), y: Math.max(0, Math.min(at.y, source?.height ?? 0)) });
  function selectRegion(region: StudioRectangle) {
    if (positive(region)) setDraft((old) => ({ ...old, revision: old.revision + 1, region, layers: allowed, excluded: [], whole: [] }));
  }
  function pick(object: StudioSelectionObject) {
    if (!source || !grid || !object.bounds || !allowed.includes(object.layer)) return;
    const r = object.bounds;
    const padding = Math.max(1, grid.cellSize / 2);
    const region = area(clamp({ x: r.minX - padding, y: r.minY - padding }), clamp({ x: r.maxX + padding, y: r.maxY + padding }));
    if (!positive(region)) return;
    setDraft((old) => ({ ...old, revision: old.revision + 1, region, layers: [object.layer],
      excluded: objects.filter((o) => o.id !== object.id).map((o) => o.id),
      whole: [] }));
  }
  function hit(at: Point, px: number) {
    if (!source || at.x < 0 || at.y < 0 || at.x > source.width || at.y > source.height) return;
    // Prefer a token or portal to a wall drawn underneath it.
    const order = { token: 0, door: 1, window: 1, opening: 1, mark: 2, wall: 3 };
    const hits = objects.flatMap((object) => {
      const r = object.bounds;
      if (!r || !allowed.includes(object.layer)) return [];
      const distance = object.segment ? distanceToSegment(at, object.segment)
        : Math.hypot(Math.max(0, r.minX - at.x, at.x - r.maxX), Math.max(0, r.minY - at.y, at.y - r.maxY));
      return distance <= px * 8 ? [{ object, distance }] : [];
    }).sort((a, b) => order[a.object.kind] - order[b.object.kind] || a.distance - b.distance);
    if (hits[0]) pick(hits[0].object);
  }
  const layers = draft.layers.filter((layer) => allowed.includes(layer));
  const candidates = draft.region ? objects.flatMap((object) => {
    if (!layers.includes(object.layer)) return [];
    const coverage = studioObjectCoverage(object, draft.region!);
    if (coverage === "outside") return [];
    const included = coverage === "crossing" ? draft.whole.includes(object.id) : !draft.excluded.includes(object.id);
    return [{ object, coverage, included }];
  }) : [];
  const selection: StudioSelection | null = draft.region && layers.length ? {
    region: draft.region, layers,
    objectIds: candidates.filter(({ included }) => included).map(({ object }) => object.id),
    wholeObjectIds: candidates.filter(({ included, coverage }) => included && coverage === "crossing").map(({ object }) => object.id),
  } : null;
  const coverage = draft.region && grid && layers.includes("terrain") ? studioTerrainCoverage(draft.region, grid) : null;

  function toggleWhole(id: string, enabled: boolean) {
    setDraft((old) => ({ ...old, revision: old.revision + 1, whole: enabled ? [...old.whole, id] : old.whole.filter((value) => value !== id) }));
  }
  const interaction: StudioMapInteraction | undefined = inspection && !disabled ? {
    mode: draft.tool, pan: draft.tool === "pan", focus: cursor,
    onPress(at) {
      setKeyboardObjectId(null); setCursor(null);
      if (draft.tool !== "region") return;
      keyboardAnchor.current = null;
      anchor.current = clamp(at);
    },
    onMove(at) {
      if (anchor.current && at) setDragging(area(anchor.current, clamp(at)));
    },
    onRelease(at, _event, moved, view) {
      if (draft.tool === "objects" && !moved) hit(at, view.px);
      if (anchor.current && moved) selectRegion(area(anchor.current, clamp(at)));
      anchor.current = null; setDragging(null);
    },
    onCancel() { anchor.current = null; setDragging(null); },
    onKeyDown(event, center) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (anchor.current || keyboardAnchor.current) setTool(draft.tool);
        else cancel();
        return;
      }
      const direction = arrows[event.key];
      if (!direction && event.key !== "Enter") return;
      if (draft.tool === "objects") {
        event.preventDefault();
        const available = objects.filter((object) => object.bounds && allowed.includes(object.layer));
        if (!available.length) return;
        const index = available.findIndex((object) => object.id === keyboardObjectId);
        if (!direction) { pick(available[Math.max(index, 0)]!); return; }
        const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const next = index < 0 ? (step > 0 ? 0 : available.length - 1) : (index + step + available.length) % available.length;
        const object = available[next]!;
        setKeyboardObjectId(object.id);
        setCursor(objectCenter(object.bounds!));
        return;
      }
      if (draft.tool !== "region") return;
      event.preventDefault();
      const at = cursor ?? clamp(center);
      if (direction) {
        const step = event.shiftKey ? 1 : grid?.cellSize ?? 10;
        const next = clamp({ x: at.x + direction.x * step, y: at.y + direction.y * step });
        setCursor(next);
        if (keyboardAnchor.current) setDragging(area(keyboardAnchor.current, next));
      } else if (keyboardAnchor.current) {
        const region = area(keyboardAnchor.current, at);
        if (positive(region)) {
          selectRegion(region);
          keyboardAnchor.current = null; setCursor(null); setDragging(null);
        }
      } else {
        keyboardAnchor.current = at; setCursor(at);
      }
    },
  } : undefined;

  const drawOverlay = (px: number) => {
    const current = dragging && positive(dragging) ? dragging : draft.region;
    const first = coverage && grid ? cellRect(coverage.fromColumn, coverage.fromRow, grid) : null;
    const last = coverage && grid ? cellRect(coverage.toColumn, coverage.toRow, grid) : null;
    const drawCells = grid && grid.cellSize > px * 5 && !dragging && first && last;
    return <g pointerEvents="none" data-studio-selection="">
      {!dragging && first && last && <rect {...box({ ...first, maxX: last.maxX, maxY: last.maxY })} fill="#00c5c8" fillOpacity=".22"
        stroke="#63f5e3" strokeWidth={px * 2} strokeDasharray={`${px * 3} ${px * 3}`} data-testid="studio-editable-cells" />}
      {grid && first && last && drawCells && <>
        <defs><pattern id={cellsId} x={grid.offsetX} y={grid.offsetY} width={grid.cellSize} height={grid.cellSize} patternUnits="userSpaceOnUse">
          <path d={`M0 ${grid.cellSize}V0H${grid.cellSize}`} stroke="#78f5e0" strokeWidth={px} fill="none" />
        </pattern></defs>
        <rect {...box({ ...first, maxX: last.maxX, maxY: last.maxY })} fill={`url(#${cellsId})`} />
      </>}
      {current && <rect {...box(current)} fill="#54e2dd" fillOpacity=".08" stroke="#effffd" strokeWidth={px * 2}
        strokeDasharray={`${px * 8} ${px * 5}`} data-testid="studio-selection-region" />}
      {!dragging && candidates.map(({ object, included, coverage }) => <g key={object.id} opacity={included ? 1 : .75}
        data-scope-object={object.id} data-crossing={coverage === "crossing"} data-included={included}>
        <ObjectOutline object={object} px={px} color={included ? "#6ef9d2" : "#ffd784"} dashed={coverage === "crossing" || !included} />
      </g>)}
      {cursor && <path d={`M${cursor.x - 9 * px} ${cursor.y}h${18 * px}M${cursor.x} ${cursor.y - 9 * px}v${18 * px}`}
        stroke="#fff" strokeWidth={px * 2} />}
    </g>;
  };
  return { draft, reset, setTool, keyboardObject, candidates, selection, interaction, drawOverlay, toggleWhole };
}

export function ObjectOutline({ object, px, color, dashed = false }: { object: StudioSelectionObject; px: number; color: string; dashed?: boolean }) {
  const line = { stroke: color, strokeWidth: px * 3, strokeDasharray: dashed ? `${px * 6} ${px * 4}` : undefined, fill: "none" };
  if (object.segment) {
    const { a, b } = object.segment;
    return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...line} />;
  }
  return object.bounds ? <rect {...box(object.bounds)} {...line} /> : null;
}
