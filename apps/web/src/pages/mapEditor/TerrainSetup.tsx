import { useId, useRef, useState } from "react";
import { cellAt, cellRect, compressTerrain, effectiveTerrain, emptyTerrain, paintTerrain, replaceTerrainLayer, terrainLayer, type CommandInput, type PaintRun, type Point, type RoomState, type TerrainKind, type TerrainRun } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { MapCanvas } from "./MapCanvas";
import { HudLayout } from "./HudLayout";

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

type Stroke = { from: { col: number; row: number }; to: { col: number; row: number }; cells: Map<string, TerrainKind>; erase: boolean; context: { boardEpoch: number; revision: number }; layerId: string };
export function TerrainSetup({ connection, state, live = false }: { connection: EditorConnection; state: RoomState; live?: boolean }) {
  const [mode, setMode] = useState<"brush" | "rect" | "pan">("brush");
  const [kind, setKind] = useState<TerrainKind | null>("difficult");
  const [layerId, setLayerId] = useState("base");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TerrainRun[]>([]);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const stroke = useRef<Stroke | null>(null);
  const activePointer = useRef(false);
  const busyRef = useRef(false);
  const map = state.scene.map, grid = state.scene.grid, terrain = state.terrain ?? emptyTerrain();
  const context = () => ({ boardEpoch: state.boardEpoch ?? 0, revision: state.terrainRevision ?? 0 });
  const cancel = () => { stroke.current = null; activePointer.current = false; setPreview([]); setError(null); };
  const send = async (command: CommandInput) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null);
    try { const result = await connection.command(command); if (!result.ok) setError(result.message); return result.ok; }
    catch { setError("Couldn't save terrain. Your preview has been kept; try again."); return false; }
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
      if (width * height > 10000) { setError("This rectangle exceeds 10,000 cells. Choose a smaller area."); return; }
      for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col++) add(col, row);
    } else {
      const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
      for (let i = 0; i <= steps; i++) add(Math.round(from.col + (to.col - from.col) * i / steps), Math.round(from.row + (to.row - from.row) * i / steps));
    }
    if (current.cells.size > 10000) setError("This stroke exceeds 10,000 cells. Cancel and paint a smaller area.");
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
    if (await send({ type: "terrain.paint", layerId: current.layerId, paint, context: current.context })) cancel();
  };
  if (!map) return <p className="map-editor-empty">Apply a map before painting terrain.</p>;
  const actualLayer = layerId === "base" || terrain.effects.some((e) => e.id === layerId) ? layerId : "base";
  const erasing = stroke.current?.erase && preview.length > 0;
  const displayedTerrain = erasing ? replaceTerrainLayer(terrain, stroke.current!.layerId, paintTerrain(terrainLayer(terrain, stroke.current!.layerId) ?? [], preview.map((run) => ({ ...run, kind: null })))) : terrain;
  return <HudLayout className="map-editor-split terrain-editor">
    <MapCanvas map={map} grid={grid} mode={mode} pan={mode === "pan"} label={live ? "Live terrain canvas" : "Terrain preparation canvas"}
      onPress={(at) => { if (stroke.current) return; activePointer.current = true; begin(at); }}
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
        {preview.length > 0 && <g opacity=".85" aria-label={stroke.current?.erase ? "Erase preview" : "Terrain preview"}><TerrainCells runs={preview} grid={grid} erase={stroke.current?.erase} /></g>}
        <rect {...(() => { const r = cellRect(cursor.col, cursor.row, grid); return { x: r.minX, y: r.minY, width: grid.cellSize, height: grid.cellSize }; })()} fill={kind === null && mode !== "pan" ? "#ffffff" : "none"} fillOpacity=".18" stroke="#ffffff" strokeWidth={grid.cellSize / 25} pointerEvents="none" />
      </>}
    </MapCanvas>
    <aside className="map-editor-hud" aria-label="Terrain tools">
      <fieldset className="stack terrain-controls" disabled={busy}>
        <legend>{live ? "Live terrain" : "Prepare terrain"}</legend>
        <p className="muted small-print">{live ? "Completed strokes update the table immediately. Undo each stroke from Activity." : "Only you see these changes until Save or Apply."}</p>
        <label>Layer<select value={actualLayer} onChange={(e) => { cancel(); setLayerId(e.target.value); }}><option value="base">Base terrain</option>{live && terrain.effects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}</select></label>
        <div className="row" role="group" aria-label="Terrain selection">{(["brush", "rect", "pan"] as const).map((tool) => <button type="button" key={tool} className="secondary" aria-pressed={mode === tool} onClick={() => { cancel(); setMode(tool); }}>{tool === "brush" ? "Cell brush" : tool === "rect" ? "Rectangle" : "Pan"}</button>)}</div>
        <div className="stack" role="group" aria-label="Terrain kind">{([null, "difficult", "blocked"] as const).map((value) => <button type="button" className="secondary" key={value ?? "normal"} aria-pressed={kind === value} onClick={() => { cancel(); setKind(value); }}>{value === null ? "Normal / Erase layer" : value === "difficult" ? "Difficult · ×2" : "Blocked"}</button>)}</div>
        <p className="muted small-print">Arrow keys move the cell cursor. Enter starts a stroke or rectangle; Enter again applies it. Esc cancels. Blocked wins across layers; Difficult doubles once.</p>
        {preview.length > 0 && <div className="row"><button type="button" onClick={() => void commit()}>Apply preview</button><button type="button" className="secondary" onClick={cancel}>Cancel stroke</button></div>}
        {live && <><label>New temporary effect<input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ice, rubble…" /></label><button type="button" disabled={!name.trim() || terrain.effects.length >= 32} onClick={async () => { if (await send({ type: "terrain.effect.create", name: name.trim(), context: context() })) setName(""); }}>Create effect</button>
          {terrain.effects.map((effect) => <div className="stack terrain-effect" key={effect.id}><label>Effect name<input key={effect.name} defaultValue={effect.name} maxLength={60} onBlur={(e) => { const value = e.target.value.trim(); if (value && value !== effect.name) void send({ type: "terrain.effect.rename", effectId: effect.id, name: value, context: context() }); }} /></label><button type="button" className="secondary" onClick={async () => { if (await send({ type: "terrain.effect.remove", effectId: effect.id, context: context() })) { setLayerId("base"); cancel(); } }}>Remove {effect.name}</button></div>)}
        </>}
      </fieldset>
      {busy && <p role="status">Saving terrain…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted small-print" aria-live="polite">Cell {cursor.col + 1}, {cursor.row + 1}{preview.length ? " · Preview ready" : ""}</p>
    </aside>
  </HudLayout>;
}
