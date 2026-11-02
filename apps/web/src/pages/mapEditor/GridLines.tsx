import { useContext, useMemo, useSyncExternalStore } from "react";
import { BoardFilters } from "../../board/BoardFilters";
import { GuideStepContext } from "./EditorGuide";
import { gridLineStyle, type GridSpec, type MapImage } from "@vtt/shared";

const STORAGE_KEY = "vtt.mapEditor.showGrid";
const listeners = new Set<() => void>();
function load(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
}
let shown = load();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => void listeners.delete(fn); };

/** Whether the Walls, Fog and Sight previews draw the grid: a view choice shared by those steps, remembered here, never sent. */
export function useShowGrid(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => shown, () => true);
  return [on, (next) => {
    shown = next;
    try { localStorage.setItem(STORAGE_KEY, next ? "on" : "off"); } catch { /* the choice just isn't remembered */ }
    listeners.forEach((fn) => fn());
  }];
}

/** The editor's "Show" menu (the board's, with a Grid row) at the map's top-left; only inside a map editor step. */
export function MapFilter() {
  const [on, setOn] = useShowGrid();
  if (!useContext(GuideStepContext)) return null;
  const off = { fog: false, walls: false, portals: false };
  return (
    <div className="map-editor-filter-slot">
      <BoardFilters value={{ ...off, grid: on }} available={{ ...off, grid: true }} onChange={(next) => setOn(next.grid === true)} />
    </div>
  );
}

/**
 * The grid as the board draws it, in map coordinates inside an SVG, so every editor step shows the
 * colour set in the Grid step. `scale` is screen pixels per map pixel; cells under 6px are skipped.
 */
export function GridLines({ grid, map, scale }: { grid: GridSpec; map: MapImage; scale: number }) {
  // Outside an editor step (the encounter preview) there is no menu, so the grid always shows.
  const [chosen] = useShowGrid();
  const inEditor = useContext(GuideStepContext) !== null;
  const show = chosen || !inEditor;
  const style = gridLineStyle(grid);
  const lines = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (grid.cellSize * scale < 6) return out;
    for (let x = grid.offsetX % grid.cellSize; x <= map.width; x += grid.cellSize) out.push({ x1: x, y1: 0, x2: x, y2: map.height });
    for (let y = grid.offsetY % grid.cellSize; y <= map.height; y += grid.cellSize) out.push({ x1: 0, y1: y, x2: map.width, y2: y });
    return out;
  }, [grid, map, scale]);
  if (!show) return null;
  return (
    <g className="map-editor-grid-lines" stroke={style.color} strokeOpacity={style.opacity} strokeWidth={style.width} pointerEvents="none">
      {lines.map((l, i) => <line key={i} {...l} />)}
    </g>
  );
}
