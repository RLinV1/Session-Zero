import { t } from "../../i18n/locale";
import { useEffect, useRef, useState } from "react";
import { IsometricBuilding, type GridSpec, type MapImage, type Point } from "@vtt/shared";
import { MapCanvas } from "./MapCanvas";
import { HudLayout } from "./HudLayout";
import { BuildingLayers } from "./BuildingLayers";
import { polygonPoints } from "../../board/buildingGeometry";

const heightWithin = (height: number) => Math.min(20, Math.max(0.25, Math.round(height * 4) / 4));

export function BuildingSetup({ map, grid, buildings, onChange }: {
  map: MapImage; grid: GridSpec; buildings: IsometricBuilding[]; onChange: (buildings: IsometricBuilding[]) => void;
}) {
  const [mode, setMode] = useState<"outline" | "height">(buildings.length ? "height" : "outline");
  const [points, setPoints] = useState<Point[]>([]);
  const [selected, setSelected] = useState<string | null>(buildings[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [heightText, setHeightText] = useState<string | null>(null);
  const drag = useRef<{ id: string; y: number; height: number; scale: number } | null>(null);
  const pressedBuilding = useRef(false);
  const selectedBuilding = buildings.find((building) => building.id === selected);
  useEffect(() => setHeightText(null), [selected]);
  const elevation = Math.max(0, ...buildings.map((building) => building.height * grid.cellSize));
  const fitElevation = useRef(elevation);
  if (!dragging) fitElevation.current = elevation;
  const changeHeight = (id: string, height: number) => onChange(buildings.map((building) => building.id === id ? { ...building, height: heightWithin(height) } : building));
  const finish = () => {
    if (buildings.length >= 100) return;
    const result = IsometricBuilding.safeParse({ id: crypto.randomUUID(), name: t("buildings.defaultName", { n: buildings.length + 1 }), footprint: points, height: 1.5 });
    if (!result.success) { setMessage(t("buildings.invalidOutline")); return; }
    onChange([...buildings, result.data]); setSelected(result.data.id); setPoints([]); setMode("height"); setMessage(null);
  };
  return <HudLayout className="map-editor-split">
    <MapCanvas key={mode} map={map} grid={grid} isometric={mode === "height"} elevation={fitElevation.current}
      mode={mode === "outline" ? "place" : "view"} pan={false} label={mode === "outline" ? t("buildings.outlineCanvas") : t("buildings.heightCanvas")}
      onPress={(_at, event, view) => {
        const id = (event.target as Element).closest("[data-building-id]")?.getAttribute("data-building-id");
        pressedBuilding.current = !!id;
        if (!id) return;
        setSelected(id);
        const building = buildings.find((item) => item.id === id);
        if (mode === "height" && building) { drag.current = { id, y: event.clientY, height: building.height, scale: view.scale }; setDragging(true); }
      }}
      onMove={(_at, event) => {
        const start = drag.current;
        if (start) changeHeight(start.id, start.height + (start.y - event.clientY) / (start.scale * grid.cellSize));
      }}
      onRelease={(at, event, moved, view) => {
        const pickedBuilding = pressedBuilding.current;
        pressedBuilding.current = false;
        if (drag.current) { drag.current = null; setDragging(false); return; }
        if (mode !== "outline" || moved || pickedBuilding) return;
        if (points.length >= 3 && Math.hypot(at.x - points[0]!.x, at.y - points[0]!.y) * view.scale < 10) { finish(); return; }
        if (points.length >= 32) { setMessage(t("buildings.finishFirst")); return; }
        setPoints([...points, { x: Math.max(0, Math.min(map.width, at.x)), y: Math.max(0, Math.min(map.height, at.y)) }]); setMessage(null);
      }}
      onCancel={() => { pressedBuilding.current = false; drag.current = null; setDragging(false); }}
      onKeyDown={(event) => {
        if (mode === "outline" && event.key === "Enter" && points.length >= 3) { event.preventDefault(); finish(); }
        if (event.key === "Escape" && points.length) { event.preventDefault(); event.stopPropagation(); setPoints([]); }
      }}>
      {({ px }) => mode === "height" ? <BuildingLayers map={map} buildings={buildings} cellSize={grid.cellSize} selected={selected}
        onKeyHeight={(id, delta) => { setSelected(id); const building = buildings.find((item) => item.id === id); if (building) changeHeight(id, building.height + delta); }} /> : <>
        {buildings.map((building) => <polygon key={building.id} data-building-id={building.id} points={polygonPoints(building.footprint)}
          fill={selected === building.id ? "#c66a3a66" : "#c66a3a33"} stroke="#e9925d" strokeWidth={2 * px} />)}
        {points.length > 0 && <polyline points={polygonPoints(points)} fill="none" stroke="#efb377" strokeWidth={2 * px} />}
        {points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={4 * px} fill="#efb377" />)}
      </>}
    </MapCanvas>
    <aside className="map-editor-hud" aria-label={t("buildings.heights")}>
      <h3 className="map-editor-heading">{t("editor.step.buildings")}</h3>
      <p className="muted">{t("buildings.intro")}</p>
      <div className="map-editor-modes" role="group" aria-label={t("buildings.mode")}>
        <button type="button" className="tool-button" aria-pressed={mode === "outline"} onClick={() => setMode("outline")}>{t("buildings.outlineMap")}</button>
        <button type="button" className="tool-button" aria-pressed={mode === "height"} disabled={!buildings.length} onClick={() => { setPoints([]); setMode("height"); }}>{t("buildings.heightPreview")}</button>
      </div>
      <button type="button" className="secondary" disabled={buildings.length >= 100} onClick={() => { setSelected(null); setPoints([]); setMode("outline"); }}>{t("buildings.new")}</button>
      {mode === "outline" && <>
        <p className="muted small-print">{points.length ? t("buildings.corners", { n: points.length }) : t("buildings.clickCorners")}</p>
        <button type="button" className="primary" disabled={points.length < 3 || buildings.length >= 100} onClick={finish}>{t("buildings.finish")}</button>
        {points.length > 0 && <button type="button" className="secondary small" onClick={() => setPoints(points.slice(0, -1))}>{t("buildings.undoCorner")}</button>}
      </>}
      {buildings.length > 0 && <label className="field"><span>{t("buildings.selected")}</span><select value={selected ?? ""} onChange={(event) => setSelected(event.target.value)}>
        <option value="" disabled>{t("buildings.choose")}</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
      </select></label>}
      {selectedBuilding && <>
        <label className="field"><span>{t("buildings.name")}</span><input aria-label={t("buildings.nameAria")} maxLength={60} value={selectedBuilding.name}
          onChange={(event) => onChange(buildings.map((building) => building.id === selected ? { ...building, name: event.target.value } : building))} /></label>
        <label className="field"><span>{t("buildings.height", { unit: grid.unitLabel })}</span><input type="number" aria-label={t("buildings.heightAria", { unit: grid.unitLabel })}
          min={grid.unitsPerCell / 4} max={grid.unitsPerCell * 20} step={grid.unitsPerCell / 4} value={heightText ?? selectedBuilding.height * grid.unitsPerCell}
          onChange={(event) => {
            setHeightText(event.target.value);
            const value = event.target.valueAsNumber / grid.unitsPerCell;
            if (Number.isFinite(value) && value >= 0.25 && value <= 20) changeHeight(selectedBuilding.id, value);
          }} onBlur={() => {
            if (heightText?.trim() && Number.isFinite(Number(heightText))) changeHeight(selectedBuilding.id, Number(heightText) / grid.unitsPerCell);
            setHeightText(null);
          }} /></label>
        <p className="muted small-print">{t("buildings.dragHint")}</p>
        <button type="button" className="danger secondary" onClick={() => { onChange(buildings.filter((building) => building.id !== selected)); setSelected(null); }}>{t("buildings.remove")}</button>
      </>}
      <p className="muted small-print">{t("buildings.visualHint")}</p>
      {message && <p role="alert" className="error">{message}</p>}
    </aside>
  </HudLayout>;
}
