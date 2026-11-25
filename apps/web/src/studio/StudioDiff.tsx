import { cellRect, terrainCells, type Point, type StudioRectangle, type StudioRevisionView, type StudioSelectionObject, type TerrainKind } from "@vtt/shared";
import { ObjectOutline, objectCenter, studioObjectLabel } from "./StudioSelection";
import { studioT, type StudioLocale } from "./text";

interface ObjectChange {
  id: string;
  label: string;
  focus: StudioRectangle | null;
  before?: StudioSelectionObject;
  after?: StudioSelectionObject;
  movement?: { from: Point; to: Point };
}
interface TerrainChange {
  id: string;
  label: string;
  focus: StudioRectangle;
  cells: StudioRectangle[];
  erased: boolean;
}
export type StudioChange = ObjectChange | TerrainChange;

function extent(a: StudioRectangle | null, b: StudioRectangle | null): StudioRectangle | null {
  if (!a || !b) return a ?? b;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

const positionChanged = (a: StudioSelectionObject, b: StudioSelectionObject) => JSON.stringify(a.segment ?? a.bounds) !== JSON.stringify(b.segment ?? b.bounds);

export function studioChanges(base: StudioRevisionView, result: StudioRevisionView, locale: StudioLocale): StudioChange[] {
  const old = new Map(base.objects.map((o) => [o.id, o]));
  const next = new Map(result.objects.map((o) => [o.id, o]));
  const t = (key: Parameters<typeof studioT>[1], params?: Record<string, string | number>) => studioT(locale, key, params);
  const describePortal = (o: StudioSelectionObject) => o.state ? t("change.portalValue", { kind: studioObjectLabel(locale, o), state: t(`portal.${o.state}`) }) : studioObjectLabel(locale, o);
  const changes: StudioChange[] = [];
  for (const [id, before] of old) {
    const after = next.get(id);
    const name = studioObjectLabel(locale, before);
    if (!after) {
      changes.push({ id, label: t("change.removed", { name }), focus: before.bounds, before });
      continue;
    }
    const focus = extent(before.bounds, after.bounds);
    const moved = positionChanged(before, after);
    if (moved && before.kind === "token") {
      const movement = before.bounds && after.bounds ? { from: objectCenter(before.bounds), to: objectCenter(after.bounds) } : undefined;
      changes.push({ id: `${id}-move`, label: t("change.moved", { name }), focus, before, after, movement });
    } else if (moved || (before.kind === "mark" && before.label !== after.label)) {
      changes.push({ id, label: t("change.changed", { name }), focus, before, after });
    }
    if (before.kind !== after.kind || before.state !== after.state) {
      changes.push({ id: `${id}-portal`, label: t("change.portal", { before: describePortal(before), after: describePortal(after) }), focus, after });
    }
    if (before.layer === "geometry" && before.kind !== "mark" && before.label !== after.label) {
      const label = after.label ? t("change.openingFlagged", { name, reason: after.label }) : t("change.openingFlagCleared", { name });
      changes.push({ id: `${id}-review`, label, focus, after });
    }
    if (before.hidden !== after.hidden) {
      changes.push({ id: `${id}-visibility`, label: t("change.visibility", { name, before: t(before.hidden ? "hidden" : "visible"), after: t(after.hidden ? "hidden" : "visible") }), focus, after });
    }
  }
  for (const [id, after] of next) {
    if (!old.has(id)) changes.push({ id, label: t("change.added", { name: studioObjectLabel(locale, after) }), focus: after.bounds, after });
  }

  const { grid: beforeGrid, terrain: beforeTerrain } = base.scene;
  const { grid: afterGrid, terrain: afterTerrain } = result.scene;
  const differentCoordinates = beforeGrid?.cellSize !== afterGrid?.cellSize || beforeGrid?.offsetX !== afterGrid?.offsetX || beforeGrid?.offsetY !== afterGrid?.offsetY;
  if (differentCoordinates || base.scene.gridStatus !== result.scene.gridStatus) {
    changes.push({ id: "grid", label: t("change.grid"), focus: null });
  }
  // Cell indices only identify the same ground when the grids agree exactly.
  if (differentCoordinates && beforeTerrain.length && afterTerrain.length) {
    changes.push({ id: "terrain-grid", label: t("change.terrainGrid"), focus: null });
    return changes;
  }
  const grid = beforeTerrain.length ? beforeGrid : afterGrid;
  if (!grid) return changes;
  const previous = terrainCells(beforeTerrain);
  const current = terrainCells(afterTerrain);
  const transitions = new Map<string, { before: TerrainKind | undefined; after: TerrainKind | undefined; coordinates: { row: number; column: number }[] }>();
  for (const key of new Set([...previous.keys(), ...current.keys()])) {
    const before = previous.get(key), after = current.get(key);
    if (before === after) continue;
    const [row, column] = key.split(":").map(Number);
    const transitionKey = `${before ?? "normal"}-${after ?? "normal"}`;
    const transition = transitions.get(transitionKey) ?? { before, after, coordinates: [] };
    transition.coordinates.push({ row: row!, column: column! });
    transitions.set(transitionKey, transition);
  }
  for (const [id, { before, after, coordinates }] of transitions) {
    const cells: StudioRectangle[] = [];
    let focus: StudioRectangle | null = null;
    for (const { row, column } of coordinates.sort((a, b) => a.row - b.row || a.column - b.column)) {
      const bounds = cellRect(column, row, grid);
      const last = cells.at(-1);
      if (last && last.minY === bounds.minY && Math.abs(last.maxX - bounds.minX) < 1e-8) last.maxX = bounds.maxX;
      else cells.push(bounds);
      focus = extent(focus, bounds);
    }
    if (focus) changes.push({ id, focus, cells, erased: !after,
      label: t(coordinates.length === 1 ? "change.terrainOne" : "change.terrain", { count: coordinates.length, before: t(`terrain.${before ?? "normal"}`), after: t(`terrain.${after ?? "normal"}`) }) });
  }
  return changes;
}

export function StudioDiffOverlay({ changes, focused, px }: { changes: StudioChange[]; focused: string | null; px: number }) {
  return <g pointerEvents="none" data-studio-changes="">{changes.map((change) => <g key={change.id} opacity={focused && focused !== change.id ? .45 : 1}>
    {"cells" in change ? change.cells.map((cell, index) => <rect key={index} x={cell.minX} y={cell.minY} width={cell.maxX - cell.minX} height={cell.maxY - cell.minY}
      fill={change.erased ? "#ff8d98" : "#7ff8dc"} fillOpacity=".14" stroke={change.erased ? "#ff9bab" : "#8bfce2"}
      strokeWidth={px * 2} strokeDasharray={change.erased ? `${4 * px} ${4 * px}` : undefined} />)
      : <>
        {change.before && <g data-testid="studio-removed-mark">
          <ObjectOutline object={change.before} px={px} color="#ff9bab" dashed />
          {change.before.bounds && <RemovalCross point={objectCenter(change.before.bounds)} px={px} />}
        </g>}
        {change.after && <ObjectOutline object={change.after} px={px} color="#8bfce2" />}
        {change.movement && <Arrow {...change.movement} px={px} />}
      </>}
  </g>)}</g>;
}

function RemovalCross({ point: { x, y }, px }: { point: Point; px: number }) {
  const r = px * 5;
  return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`}
    fill="none" stroke="#ffb8be" strokeWidth={px * 2} strokeLinecap="round" />;
}

function Arrow({ from, to, px }: { from: Point; to: Point; px: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const head = Math.min(px * 10, length / 2);
  const base = { x: to.x - dx / length * head, y: to.y - dy / length * head };
  const wing = { x: dy / length * head / 2, y: dx / length * head / 2 };
  return <path data-testid="studio-movement-arrow" d={`M${from.x} ${from.y}L${to.x} ${to.y}M${base.x + wing.x} ${base.y - wing.y}L${to.x} ${to.y}L${base.x - wing.x} ${base.y + wing.y}`}
    stroke="#fff8d4" fill="none" strokeWidth={px * 2.5} strokeLinecap="round" strokeLinejoin="round" />;
}
