import { useId, useRef, useState } from "react";
import { ArrowCounterClockwise, Eraser, Hand, Keyboard, MapTrifold, Mountains, PaintBrush, PencilSimple, Plus, Prohibit, Question, Rectangle, Stack, Trash } from "@phosphor-icons/react";
import { cellAt, cellRect, compressTerrain, effectiveTerrain, emptyTerrain, paintTerrain, replaceTerrainLayer, terrainLayer, type CommandInput, type PaintRun, type Point, type RoomState, type TerrainKind, type TerrainRun } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { MapCanvas } from "./MapCanvas";
import { HudLayout } from "./HudLayout";
import { PopoverButton } from "../../ui/Popover";
import { t } from "../../i18n/locale";

/** The same cell patterns in private preparation and the synchronized live editor. */
export function TerrainCells({ runs, grid, temporary = false, erase = false }: { runs: TerrainRun[]; grid: RoomState["scene"]["grid"]; temporary?: boolean; erase?: boolean }) {
  const id = useId().replaceAll(":", "");
  return <g pointerEvents="none">
    <defs><pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0L10 10M10 0L0 10" stroke="#d57474" strokeWidth="1" opacity=".7" /></pattern></defs>
    {runs.map((run) => Array.from({ length: run.end - run.start + 1 }, (_, i) => {
      const col = run.start + i, r = cellRect(col, run.row, grid), s = grid.cellSize;
      return <g key={`${run.row}:${col}`}>
        {!temporary && <rect x={r.minX} y={r.minY} width={s} height={s} fill={erase ? "#ffffff" : run.kind === "blocked" ? `url(#${id})` : "#d5a64d"} fillOpacity={erase ? .18 : run.kind === "blocked" ? .65 : .28} stroke={erase ? "#ffffff" : run.kind === "blocked" ? "#d57474" : "#d5a64d"} strokeOpacity={erase ? .7 : .5} strokeWidth={s / 60} />}
        {temporary && <rect x={r.minX + s * .72} y={r.minY + s * .05} width={s * .22} height={s * .22} fill={run.kind === "blocked" ? "#b84c52" : "#b78321"} stroke="#ffffff" strokeWidth={s / 45} />}
        {!temporary && !erase && <text x={r.minX + s / 2} y={r.minY + s * .6} textAnchor="middle" fontSize={s * .28} fill={run.kind === "blocked" ? "#ffe6e6" : "#fff1c9"} stroke="#282018" strokeWidth={s / 80} paintOrder="stroke">{run.kind === "blocked" ? "⊘" : "×2"}</text>}
      </g>;
    }))}
  </g>;
}

const TOOLS = [["brush", "terrain.brush", PaintBrush], ["rect", "common.rectangle", Rectangle], ["pan", "common.pan", Hand]] as const;
const KINDS = [[null, "terrain.normal", Eraser], ["difficult", "terrain.difficult", Mountains], ["blocked", "terrain.blocked", Prohibit]] as const;
type Stroke = { from: { col: number; row: number }; to: { col: number; row: number }; cells: Map<string, TerrainKind>; erase: boolean; context: { boardEpoch: number; revision: number }; layerId: string };
export function TerrainSetup({ connection, state, live = false, layers = live }: { connection: EditorConnection; state: RoomState; live?: boolean; layers?: boolean }) {
  const [mode, setMode] = useState<"brush" | "rect" | "pan">("brush");
  const [kind, setKind] = useState<TerrainKind | null>("difficult");
  const [layerId, setLayerId] = useState("base");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TerrainRun[]>([]);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const stroke = useRef<Stroke | null>(null);
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
  const validCell = (col: number, row: number) => { const r = cellRect(col, row, grid); return !!map && r.minX < map.width && r.maxX > 0 && r.minY < map.height && r.maxY > 0; };
  const fill = (to: { col: number; row: number }) => {
    const current = stroke.current;
    if (!current) return;
    const from = mode === "rect" ? current.from : current.to;
    if (mode === "rect") current.cells.clear();
    const add = (col: number, row: number) => { if (validCell(col, row) && current.cells.size <= 10000) current.cells.set(`${row}:${col}`, kind ?? "difficult"); };
    if (mode === "rect") {
      const width = Math.abs(from.col - to.col) + 1, height = Math.abs(from.row - to.row) + 1;
      if (width * height > 10000) { setError(t("terrain.rectTooBig")); return; }
      for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col++) add(col, row);
    } else {
      const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
      for (let i = 0; i <= steps; i++) add(Math.round(from.col + (to.col - from.col) * i / steps), Math.round(from.row + (to.row - from.row) * i / steps));
    }
    if (current.cells.size > 10000) setError(t("terrain.strokeTooBig"));
    current.to = to; setPreview(compressTerrain(current.cells));
  };
  const begin = (at: Point) => {
    if (busyRef.current || mode === "pan") return;
    const cell = cellAt(at, grid);
    stroke.current = { from: cell, to: cell, cells: new Map(), erase: kind === null, context: context(), layerId: layerId === "base" || terrain.effects.some((e) => e.id === layerId) ? layerId : "base" };
    setError(null); setCursor(cell); fill(cell);
  };
  const commit = async () => {
    const current = stroke.current;
    activePointer.current = false;
    if (!current || current.cells.size === 0 || current.cells.size > 10000) return;
    const paint: PaintRun[] = compressTerrain(current.cells).map((run) => ({ ...run, kind: current.erase ? null : run.kind }));
    // A failed save keeps the stroke: Enter retries, Esc cancels, so hand keyboard focus back to the canvas.
    if (await send({ type: "terrain.paint", layerId: current.layerId, paint, context: current.context }, t("terrain.retryHint"))) cancel();
    else canvasFocus.current?.closest(".terrain-editor")?.querySelector<SVGSVGElement>("svg[role=application]")?.focus();
  };
  if (!map) return <p className="map-editor-empty">{t("terrain.needsMap")}</p>;
  const actualLayer = layerId === "base" || terrain.effects.some((e) => e.id === layerId) ? layerId : "base";
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
        {preview.length > 0 && <g opacity=".85" aria-label={stroke.current?.erase ? t("terrain.erasePreview") : t("terrain.preview")}><TerrainCells runs={preview} grid={grid} erase={stroke.current?.erase} /></g>}
        <rect {...(() => { const r = cellRect(cursor.col, cursor.row, grid); return { x: r.minX, y: r.minY, width: grid.cellSize, height: grid.cellSize }; })()} fill={kind === null && mode !== "pan" ? "#ffffff" : "none"} fillOpacity=".18" stroke="#ffffff" strokeWidth={grid.cellSize / 25} pointerEvents="none" />
      </>}
    </MapCanvas>
    <aside className="map-editor-hud" aria-label={t("terrain.tools")} ref={canvasFocus}>
      <div className="terrain-head">
        <h3>{live ? t("terrain.live") : t("terrain.prepare")}</h3>
        <PopoverButton label={t("common.guide")} title={t("common.guide")} align="right" placement="fixed" className="terrain-icon" buttonContent={<Question size={18} aria-hidden />}>
          <ul className="terrain-guide">
            <li><PaintBrush aria-hidden /><span>{t("terrain.help.tools")}</span></li>
            <li><Prohibit aria-hidden /><span>{t("terrain.help.layers")}</span></li>
            <li><Keyboard aria-hidden /><span>{t("terrain.help.keys")}</span></li>
            <li><ArrowCounterClockwise aria-hidden /><span>{live ? t("terrain.undoActivity") : t("terrain.onlyYou")}</span></li>
          </ul>
        </PopoverButton>
      </div>
      <fieldset className="terrain-controls" disabled={busy}>
        <div className="terrain-tools">
          <div className="terrain-group"><span className="terrain-group-label" aria-hidden>{t("common.tool")}</span><div className="terrain-seg" role="group" aria-label={t("terrain.selection")}>{TOOLS.map(([tool, label, Icon]) => <button type="button" key={tool} className="terrain-icon" aria-label={t(label)} title={t(label)} aria-pressed={mode === tool} onClick={() => { cancel(); setMode(tool); }}><Icon size={20} aria-hidden /></button>)}</div></div>
          <div className="terrain-group"><span className="terrain-group-label" aria-hidden>{t("terrain.paint")}</span><div className="terrain-seg" role="group" aria-label={t("terrain.kind")}>{KINDS.map(([value, label, Icon]) => <button type="button" key={value ?? "normal"} className={`terrain-icon terrain-kind-${value ?? "normal"}`} aria-label={t(label)} title={t(label)} aria-pressed={kind === value} onClick={() => { cancel(); setKind(value); }}><Icon size={20} aria-hidden />{value === "difficult" && <sup>×2</sup>}</button>)}</div></div>
        </div>
        <section className="terrain-layers" aria-label={t("terrain.layers")}>
          <header><span>{t("terrain.layers")}</span>{layers && <button type="button" className="terrain-icon" aria-label={t("terrain.addLayer")} title={terrain.effects.length >= 32 ? t("terrain.layerLimit") : t("terrain.addLayer")} disabled={terrain.effects.length >= 32} onClick={() => setAdding(true)}><Plus size={18} aria-hidden /></button>}</header>
          {/* Library maps store base terrain only. */}
          {!layers && <p className="muted small-print terrain-layers-note">{t("terrain.roomOnly")}</p>}
          {adding && layers && <input className="terrain-new" autoFocus maxLength={60} aria-label={t("terrain.newLayerName")} placeholder={t("terrain.layerPlaceholder")} value={name}
            onChange={(e) => setName(e.target.value)} onBlur={() => { if (!name.trim()) setAdding(false); }}
            onKeyDown={async (e) => {
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setName(""); setAdding(false); }
              else if (e.key === "Enter" && name.trim() && terrain.effects.length < 32) { e.preventDefault(); if (await send({ type: "terrain.effect.create", name: name.trim(), context: context() })) { setName(""); setAdding(false); } }
            }} />}
          <ul>
            {layers && terrain.effects.map((effect) => <li key={effect.id} className="terrain-layer" aria-current={actualLayer === effect.id}>
              {renamingId === effect.id
                ? <><span className="terrain-chip terrain-chip-effect"><Stack size={14} aria-hidden /></span><input className="terrain-rename" autoFocus onFocus={(e) => e.target.select()} aria-label={t("terrain.layerName")} defaultValue={effect.name} maxLength={60}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRenamingId(null); } else if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
                  onBlur={(e) => { const value = e.target.value.trim(); setRenamingId(null); if (value && value !== effect.name) void send({ type: "terrain.effect.rename", effectId: effect.id, name: value, context: context() }); }} /></>
                : <button type="button" className="terrain-layer-pick" aria-label={effect.name} title={effect.name} onClick={() => { cancel(); setLayerId(effect.id); }}><span className="terrain-chip terrain-chip-effect"><Stack size={14} aria-hidden /></span><span className="terrain-layer-name">{effect.name}</span></button>}
              <button type="button" className="terrain-icon" aria-label={t("terrain.renameNamed", { name: effect.name })} title={t("common.rename")} onClick={(e) => { e.stopPropagation(); setRenamingId(effect.id); }}><PencilSimple size={16} aria-hidden /></button>
              <button type="button" className="terrain-icon" aria-label={t("terrain.removeNamed", { name: effect.name })} title={t("terrain.removeNamed", { name: effect.name })} onClick={async (e) => { e.stopPropagation(); if (await send({ type: "terrain.effect.remove", effectId: effect.id, context: context() })) { setLayerId("base"); cancel(); } }}><Trash size={16} aria-hidden /></button>
            </li>)}
            <li className="terrain-layer" aria-current={actualLayer === "base"}>
              <button type="button" className="terrain-layer-pick" aria-label={t("terrain.base")} title={t("terrain.base")} aria-pressed={actualLayer === "base"} onClick={() => { cancel(); setLayerId("base"); }}><span className="terrain-chip terrain-chip-base"><MapTrifold size={14} aria-hidden /></span><span className="terrain-layer-name">{t("terrain.base")}</span></button>
            </li>
          </ul>
        </section>
      </fieldset>
      {busy && <p role="status">{t("terrain.saving")}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted small-print" aria-live="polite">{t("terrain.cell", { col: cursor.col + 1, row: cursor.row + 1 })}{preview.length ? t("terrain.previewReady") : ""}</p>
    </aside>
  </HudLayout>;
}
