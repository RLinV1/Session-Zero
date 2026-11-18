import { useRef, useState } from "react";
import { ArrowCounterClockwise, Eraser, Hand, Keyboard, Mountains, PaintBrush, Prohibit, Question, Rectangle } from "@phosphor-icons/react";
import { cellAt, cellRect, effectiveTerrain, emptyTerrain, paintTerrain, replaceTerrainLayer, terrainLayer, type CommandInput, type Point, type RoomState, type TerrainKind, type TerrainRun } from "@vtt/shared";
import { cellInMap, extendStroke, startStroke, strokePaint, strokeRuns, type TerrainStroke } from "../../board/terrainStroke";
import type { EditorConnection } from "../../net/roomConnection";
import { MapCanvas } from "./MapCanvas";
import { HudLayout } from "./HudLayout";
import { PopoverButton } from "../../ui/Popover";
import { t } from "../../i18n/locale";

export { TerrainCells } from "../../studio/TerrainCells";
import { TerrainCells } from "../../studio/TerrainCells";

const TOOLS = [["brush", "terrain.brush", PaintBrush], ["rect", "common.rectangle", Rectangle], ["pan", "common.pan", Hand]] as const;
const KINDS = [[null, "terrain.normal", Eraser], ["difficult", "terrain.difficult", Mountains], ["blocked", "terrain.blocked", Prohibit]] as const;
/** Paints the Base layer only: extra terrain layers are not offered (board-terrain-tool). */
export function TerrainSetup({ connection, state, live = false }: { connection: EditorConnection; state: RoomState; live?: boolean }) {
  const [mode, setMode] = useState<"brush" | "rect" | "pan">("brush");
  const [kind, setKind] = useState<TerrainKind | null>("difficult");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TerrainRun[]>([]);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const stroke = useRef<TerrainStroke | null>(null);
  const activePointer = useRef(false);
  const busyRef = useRef(false);
  const canvasFocus = useRef<HTMLElement>(null);
  const map = state.scene.map, grid = state.scene.grid, terrain = state.terrain ?? emptyTerrain();
  const context = () => ({ boardEpoch: state.boardEpoch ?? 0, revision: state.terrainRevision ?? 0 });
  const cancel = () => { stroke.current = null; activePointer.current = false; setPreview([]); setError(null); };
  const send = async (command: CommandInput, hint = "") => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null);
    try { const result = await connection.command(command); if (!result.ok) setError(result.message + hint); return result.ok; }
    catch { setError(t("terrain.saveFailed", { hint })); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const validCell = (col: number, row: number) => !!map && cellInMap(col, row, grid, map);
  const fill = (to: { col: number; row: number }) => {
    const current = stroke.current;
    if (!current || !map || mode === "pan") return;
    const problem = extendStroke(current, to, { shape: mode, paint: kind, grid, map });
    if (problem === "rectTooBig") { setError(t("terrain.rectTooBig")); return; }
    if (problem === "strokeTooBig") setError(t("terrain.strokeTooBig"));
    setPreview(strokeRuns(current));
  };
  const begin = (at: Point) => {
    if (busyRef.current || mode === "pan") return;
    const cell = cellAt(at, grid);
    stroke.current = startStroke(cell, kind, "base", context());
    setError(null); setCursor(cell); fill(cell);
  };
  const commit = async () => {
    const current = stroke.current;
    activePointer.current = false;
    const paint = current ? strokePaint(current) : [];
    if (!current || paint.length === 0) return;
    // A failed save keeps the stroke: Enter retries, Esc cancels, so hand keyboard focus back to the canvas.
    if (await send({ type: "terrain.paint", layerId: current.layerId, paint, context: current.context }, t("terrain.retryHint"))) cancel();
    else canvasFocus.current?.closest(".terrain-editor")?.querySelector<SVGSVGElement>("svg[role=application]")?.focus();
  };
  if (!map) return <p className="map-editor-empty">{t("terrain.needsMap")}</p>;
  const erasing = stroke.current?.erase && preview.length > 0;
  const displayedTerrain = erasing ? replaceTerrainLayer(terrain, stroke.current!.layerId, paintTerrain(terrainLayer(terrain, stroke.current!.layerId) ?? [], preview.map((run) => ({ ...run, kind: null })))) : terrain;
  return <HudLayout className="map-editor-split terrain-editor">
    <MapCanvas map={map} grid={grid} mode={mode} pan={mode === "pan"} label={live ? t("terrain.liveCanvas") : t("terrain.prepCanvas")}
      onPress={(at) => { if (busyRef.current) return; if (stroke.current) cancel(); activePointer.current = true; begin(at); }}
      onMove={(at) => { if (at) { setCursor(cellAt(at, grid)); if (activePointer.current) fill(cellAt(at, grid)); } }}
      onRelease={(at) => { if (activePointer.current) { fill(cellAt(at, grid)); void commit(); } }}
      onCancel={cancel} onSecondary={cancel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && stroke.current) { e.preventDefault(); e.stopPropagation(); cancel(); return; }
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (delta) { e.preventDefault(); const next = { col: cursor.col + delta[0]!, row: cursor.row + delta[1]! }; if (validCell(next.col, next.row)) { setCursor(next); if (stroke.current) fill(next); } }
        if (e.key === "Enter") { e.preventDefault(); if (stroke.current) void commit(); else { const r = cellRect(cursor.col, cursor.row, grid); begin({ x: r.minX + grid.cellSize / 2, y: r.minY + grid.cellSize / 2 }); } }
      }}>
      {() => <>
        <TerrainCells runs={effectiveTerrain(displayedTerrain)} grid={grid} />
        <TerrainCells runs={effectiveTerrain({ base: [], effects: displayedTerrain.effects })} grid={grid} temporary />
        {preview.length > 0 && <g opacity=".85" aria-label={stroke.current?.erase ? t("terrain.erasePreview") : t("terrain.preview")}><TerrainCells runs={preview} grid={grid} erase={stroke.current?.erase} outline="cell" /></g>}
        <rect {...(() => { const r = cellRect(cursor.col, cursor.row, grid); return { x: r.minX, y: r.minY, width: grid.cellSize, height: grid.cellSize }; })()} fill={kind === null && mode !== "pan" ? "#ffffff" : "none"} fillOpacity=".18" stroke="#ffffff" strokeWidth={grid.cellSize / 25} pointerEvents="none" />
      </>}
    </MapCanvas>
    <aside className="map-editor-hud" aria-label={t("terrain.tools")} ref={canvasFocus}>
      <div className="terrain-head">
        <h3>{live ? t("terrain.live") : t("terrain.prepare")}</h3>
        <PopoverButton label={t("common.guide")} title={t("common.guide")} align="right" placement="fixed" className="terrain-icon" buttonContent={<Question size={18} aria-hidden />}>
          <ul className="terrain-guide">
            <li><PaintBrush aria-hidden /><span>{t("terrain.help.tools")}</span></li>
            <li><Keyboard aria-hidden /><span>{t("terrain.help.keys")}</span></li>
            <li><ArrowCounterClockwise aria-hidden /><span>{live ? t("terrain.undoActivity") : t("terrain.onlyYou")}</span></li>
          </ul>
        </PopoverButton>
      </div>
      <fieldset className="terrain-controls" disabled={busy}>
        <div className="terrain-tools">
          <div className="terrain-group"><span className="terrain-group-label" aria-hidden>{t("common.tool")}</span><div className="terrain-seg" role="group" aria-label={t("terrain.selection")}>{TOOLS.map(([tool, label, Icon]) => <button type="button" key={tool} className="terrain-icon" aria-label={t(label)} title={t(label)} aria-pressed={mode === tool} onClick={() => { cancel(); setMode(tool); }}><Icon size={20} aria-hidden /></button>)}</div></div>
          <div className="terrain-group"><span className="terrain-group-label" aria-hidden>{t("terrain.paint")}</span><div className="terrain-seg" role="group" aria-label={t("terrain.kind")}>{KINDS.map(([value, label, Icon]) => <button type="button" key={value ?? "normal"} data-tutorial-tool={value ?? "normal"} className={`terrain-icon terrain-kind-${value ?? "normal"}`} aria-label={t(label)} title={t(label)} aria-pressed={kind === value} onClick={() => { cancel(); setKind(value); }}><Icon size={20} aria-hidden />{value === "difficult" && <sup>×2</sup>}</button>)}</div></div>
        </div>
      </fieldset>
      {busy && <p role="status">{t("terrain.saving")}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted small-print" aria-live="polite">{t("terrain.cell", { col: cursor.col + 1, row: cursor.row + 1 })}{preview.length ? t("terrain.previewReady") : ""}</p>
    </aside>
  </HudLayout>;
}
