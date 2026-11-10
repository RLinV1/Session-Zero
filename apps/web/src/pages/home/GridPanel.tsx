import { useState, type CSSProperties } from "react";
import { DEFAULT_GRID } from "@vtt/shared";
import { MapGrid } from "../../ui/MapGrid";
import { CROP, MAPS } from "./crops";
import { t } from "../../i18n/locale";

/**
 * Grid alignment, live (gm-home: "Grid alignment is operable"). The faint grid is the map's own
 * squares; the slider sizes the table's grid in map pixels until the two line up at 70, which is
 * the setup step the product is built around.
 */
export function GridPanel() {
  // It opens lined up, on the map's own squares; dragging shows what a mismatch looks like.
  const [cell, setCell] = useState<number>(CROP.cell);
  const lined = cell === CROP.cell;

  return (
    <div className="prepare-step">
      <div className="step-copy">
        <h4>{t("home.grid.title")}</h4>
        <p>
          {t("home.grid.body")}
        </p>
      </div>
      <figure className="map-figure" style={{ "--map": `url(${MAPS.grid.src})` } as CSSProperties}>
        <div className="map-frame">
          <img src={MAPS.grid.src} width={CROP.width} height={CROP.height} alt={MAPS.grid.alt} loading="lazy" decoding="async" />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          <MapGrid width={CROP.width} height={CROP.height} cell={cell} variant="app" />
        </div>
        <div className="demo-bar">
          <label className="demo-slider">
            {t("home.grid.squareSize")}
            <input type="range" min={40} max={110} step={1} value={cell} onChange={(e) => setCell(Number(e.target.value))} />
          </label>
          <output className="readout">
            {t("home.grid.readout", { px: cell, units: DEFAULT_GRID.unitsPerCell, unit: DEFAULT_GRID.unitLabel })}
          </output>
        </div>
        <p className="figure-note" role="status">
          {lined ? t("home.grid.lined") : t("home.grid.drag")}
        </p>
      </figure>
    </div>
  );
}
