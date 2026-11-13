import { t } from "../../i18n/locale";
import { useId } from "react";
import type { IsometricBuilding, MapImage } from "@vtt/shared";
import { buildingGeometry, polygonPoints } from "../../board/buildingGeometry";

/** Raster artwork supplies each roof's texture; the outlined footprint supplies its solid walls. */
export function BuildingLayers({ map, buildings, cellSize, selected, onKeyHeight }: {
  map: MapImage; buildings: IsometricBuilding[]; cellSize: number; selected?: string | null;
  onKeyHeight?: (id: string, delta: number) => void;
}) {
  const prefix = useId().replaceAll(":", "");
  return <>{[...buildings].sort((a, b) => Math.max(...a.footprint.map((p) => p.x + p.y)) - Math.max(...b.footprint.map((p) => p.x + p.y))).map((building) => {
    const geometry = buildingGeometry(building, cellSize);
    const clip = `${prefix}-${building.id}`;
    return <g key={building.id} data-building-id={building.id} className="isometric-building"
      role={onKeyHeight ? "button" : undefined} tabIndex={onKeyHeight ? 0 : undefined}
      aria-label={onKeyHeight ? t("buildings.roofAria", { name: building.name, height: building.height }) : undefined}
      onKeyDown={onKeyHeight ? (event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); event.stopPropagation(); onKeyHeight(building.id, event.key === "ArrowUp" ? 0.25 : -0.25);
        }
      } : undefined}>
      {geometry.faces.map((face, i) => <polygon key={i} points={polygonPoints(face.points)} fill={face.color} stroke="#2c251e" strokeWidth={1} />)}
      <defs><clipPath id={clip}><polygon points={polygonPoints(building.footprint)} /></clipPath></defs>
      <g transform={`translate(${-geometry.rise} ${-geometry.rise})`}>
        <image href={map.url} width={map.width} height={map.height} clipPath={`url(#${clip})`} />
        <polygon points={polygonPoints(building.footprint)} fill="none" stroke={selected === building.id ? "#e9925d" : "#c3ab87"} strokeWidth={selected === building.id ? 4 : 2} />
      </g>
    </g>;
  })}</>;
}
