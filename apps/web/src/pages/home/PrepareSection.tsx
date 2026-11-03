import { useMemo, type CSSProperties } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { MAP_IMAGE_TYPES, MAP_IMPORT_TYPES } from "../../net/mapFileTypes";
import { MapGrid } from "../../ui/MapGrid";
import { CROP, MAPS, cropWallLines, onCrop } from "./crops";
import { GridPanel } from "./GridPanel";

/**
 * Preparing a map (gm-home: "The home page covers the four promises"): what the library takes,
 * the grid lined up live, and a built-in map's stored walls drawn as the map editor draws them.
 */
export function PrepareSection() {
  return (
    <section className="home-section prepare-section" aria-labelledby="prepare-heading">
      <div className="section-copy">
        <h3 id="prepare-heading">Bring the map you already have.</h3>
        <p>
          Upload a picture of your map or import one from another map tool. Line up the grid once, and set the walls
          that decide what your players can see.
        </p>
      </div>
      <MapIntake />
      <GridPanel />
      <WallsPanel />
    </section>
  );
}

/** The file types the library's map upload takes, from the same list it uses. */
function MapIntake() {
  return (
    <div className="intake">
      <FileArrowUp className="intake-icon" aria-hidden="true" />
      <div className="intake-copy">
        <h4>Upload or import</h4>
        <p>A UVTT file brings its grid, walls and doors with it.</p>
      </div>
      <dl className="file-types">
        <div>
          <dt>Pictures</dt>
          <dd>
            {MAP_IMAGE_TYPES.map((t) => (
              <span key={t.label} className="file-chip">
                {t.label}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>From other map tools</dt>
          <dd>
            {MAP_IMPORT_TYPES.map((t) => (
              <span key={t.label} className="file-chip">
                {t.label}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** A plain wall as the board draws it in the editor (boardView: width and colour scale with the grid). */
const WALL_WIDTH = Math.max(2, CROP.cell * 0.05);
/** A door or window is drawn a fifth of a square thick, so it reads as something to act on (ADR 0030). */
const PORTAL_WIDTH = CROP.cell * 0.2;

/**
 * A map's walls, doors and windows: the inn's walls on its crop, the same segments line of sight
 * runs on, in the board's colours (amber walls, wooden doors, glass windows, a red mark on a
 * locked door).
 */
export function WallsPanel() {
  const lines = useMemo(() => cropWallLines("moor-inn").filter(onCrop), []);
  const plain = lines.filter((w) => w.kind === "wall");
  const portals = lines.filter((w) => w.kind !== "wall");

  return (
    <div className="prepare-step walls-step">
      <div className="step-copy">
        <h4>Walls, doors and windows</h4>
        <p>
          Draw them in the map editor or bring them in with a UVTT file, and they stay with the map. Walls and shut
          doors stop sight and your players' moves. A window lets them see through, not walk through.
        </p>
        <ul className="plain walls-legend" aria-label="Key to the drawing">
          <li>
            <span className="legend-line is-wall" aria-hidden="true" />
            Wall
          </li>
          <li>
            <span className="legend-line is-door" aria-hidden="true" />
            Door
          </li>
          <li>
            <span className="legend-line is-window" aria-hidden="true" />
            Window
          </li>
          <li>
            <span className="legend-lock" aria-hidden="true" />
            Locked
          </li>
        </ul>
      </div>
      <figure className="map-figure" style={{ "--map": `url(${MAPS.walls.src})` } as CSSProperties}>
        <div className="map-frame">
          <img src={MAPS.walls.src} width={CROP.width} height={CROP.height} alt={MAPS.walls.alt} loading="lazy" decoding="async" />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          <svg className="walls-drawing" viewBox={`0 0 ${CROP.width} ${CROP.height}`} preserveAspectRatio="none" aria-hidden="true">
            <g className="wall-halo" strokeWidth={WALL_WIDTH + 3}>
              {plain.map((w, i) => (
                <line key={i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              ))}
            </g>
            <g strokeWidth={WALL_WIDTH}>
              {plain.map((w, i) => (
                <line key={i} className="wall-stroke" data-kind="wall" x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              ))}
            </g>
            <g className="portal-halo" strokeWidth={PORTAL_WIDTH + 3}>
              {portals.map((w, i) => (
                <line key={i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              ))}
            </g>
            <g strokeWidth={PORTAL_WIDTH}>
              {portals.map((w, i) => (
                <line key={i} className={`wall-stroke is-${w.kind}`} data-kind={w.kind} data-state={w.state ?? undefined} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              ))}
            </g>
            {portals
              .filter((w) => w.state === "locked")
              .map((w, i) => (
                <circle key={i} className="portal-lock" cx={(w.a.x + w.b.x) / 2} cy={(w.a.y + w.b.y) / 2} r={PORTAL_WIDTH * 0.8} />
              ))}
          </svg>
        </div>
      </figure>
    </div>
  );
}
