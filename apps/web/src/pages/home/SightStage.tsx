import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Point } from "@vtt/shared";
import type { Rgb } from "../../board/fogTexture";
import { DIMMED_ALPHA, sightColor } from "../../board/sightMask";
import { MapGrid } from "../../ui/MapGrid";
import { TokenDisc } from "../../ui/TokenDisc";
import { CROP, MAPS, PORTRAITS, cropWalls, inSquare } from "./crops";
import { litArea, moveTo, squareCenter, squareOf, svgPoints } from "./sightDemo";
import { TokenChip } from "./TokenChip";

/** What stops the torch's light, and what stops the torch bearer: the table's two rules. */
const SIGHT_WALLS = cropWalls("sun-tomb");
const MOVE_WALLS = cropWalls("sun-tomb", "movement");
/** In the burial hall, right under the side chamber's doorway, against the hall's north wall. */
const START = squareCenter(16, 5);
/** In the side chamber, among the urns, which is where something would wait. */
const HIDDEN_AT = { col: 17, row: 2 };

const STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * What lies outside a player's sight on a map crop (one lit polygon per token, as `viewerSight`
 * gives the table), its edge softened. Two looks:
 * - `dim`, the line-of-sight stage: the map dimmed in the board's own darkness colour for that map
 *   (`sightColor` of its average) at `DIMMED_ALPHA`. The layout shows; nothing on it outside sight.
 * - `fog`, the hero: a thin layer of drifting fog, as atmosphere for the scene.
 * The GM sees the whole map, with the lit area outlined.
 */
export function SightFog({
  lit,
  view,
  look = "dim",
  average,
}: {
  lit: readonly (readonly Point[])[];
  view: "player" | "gm";
  look?: "dim" | "fog";
  /** The map's average colour (crops.ts), for the dimmed look. */
  average?: Rgb;
}) {
  const id = useId().replace(/:/g, "");
  const [r, g, b] = sightColor(average);
  return (
    <svg className={`sight-fog is-${view}`} viewBox={`0 0 ${CROP.width} ${CROP.height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={CROP.width} height={CROP.height}>
          <rect width={CROP.width} height={CROP.height} fill="white" />
          {lit.map((poly, i) => (
            <polygon key={i} points={svgPoints(poly)} fill="black" filter={`url(#${id}-soft)`} />
          ))}
        </mask>
        {look === "fog" && (
          <pattern id={`${id}-bank`} patternUnits="userSpaceOnUse" width="512" height="512">
            <image href="/img/fog/fog-bank.webp" width="512" height="512" />
          </pattern>
        )}
      </defs>
      {view === "player" && look === "fog" && (
        <g mask={`url(#${id}-mask)`}>
          <rect className="sight-fog-body" width={CROP.width} height={CROP.height} />
          <g className="sight-fog-texture is-drifting">
            <rect x="-512" width={CROP.width + 1024} height={CROP.height} fill={`url(#${id}-bank)`} />
          </g>
        </g>
      )}
      {view === "player" && look === "dim" && (
        <rect
          className="sight-dim"
          width={CROP.width}
          height={CROP.height}
          fill={`rgb(${r}, ${g}, ${b})`}
          opacity={DIMMED_ALPHA}
          mask={`url(#${id}-mask)`}
        />
      )}
      {view === "gm" && lit.map((poly, i) => <polygon key={i} className="sight-edge" points={svgPoints(poly)} />)}
    </svg>
  );
}

/**
 * Line of sight, operable (gm-home: "Line of sight is operable", "Visibility is shown from both
 * sides"). Move the lead token by dragging it or with the arrow keys; the lit area is recomputed
 * from its new square against the map's own walls, by the rules the table uses.
 */
export function SightStage() {
  const [at, setAt] = useState<Point>(START);
  const [view, setView] = useState<"gm" | "player">("player");
  const [note, setNote] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lit = useMemo(() => litArea(SIGHT_WALLS, at), [at]);

  function step(to: Point) {
    const move = moveTo(MOVE_WALLS, at, to);
    setAt(move.at);
    setNote(move.refused === "wall" ? "A wall is in the way." : move.refused === "edge" ? "That is the edge of the map." : null);
  }

  function onKeyDown(e: KeyboardEvent) {
    const d = STEP[e.key];
    if (!d) return;
    e.preventDefault();
    const { col, row } = squareOf(at);
    step(squareCenter(col + d[0], row + d[1]));
  }

  /** The crop pixel under the pointer. */
  const cropPoint = (e: PointerEvent): Point => {
    const box = frame.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * CROP.width, y: ((e.clientY - box.top) / box.height) * CROP.height };
  };

  function onPointerMove(e: PointerEvent) {
    if (!dragging.current) return;
    const target = squareOf(cropPoint(e));
    const here = squareOf(at);
    if (target.col === here.col && target.row === here.row) return;
    // One square at a time toward the pointer, as a token is walked, so a wall stops it there.
    const dc = Math.sign(target.col - here.col);
    const dr = Math.sign(target.row - here.row);
    step(squareCenter(here.col + dc, here.row + dr));
  }

  const { col, row } = squareOf(at);
  return (
    <div className="sight-section">
      <div className="sight-copy">
        <h4>They only see what their torch reaches.</h4>
        <p>
          Walls and closed doors block sight, square by square, the way they do at the table. Hide a monster and your
          players can't see it, can't find it in the turn order, and can't dig it out of their browser either.
        </p>
        <div className="seg" role="group" aria-label="Whose view to show">
          <button type="button" aria-pressed={view === "player"} onClick={() => setView("player")}>
            Player view
          </button>
          <button type="button" aria-pressed={view === "gm"} onClick={() => setView("gm")}>
            GM view
          </button>
        </div>
      </div>
      <figure className="map-figure sight-figure" style={{ "--map": `url(${MAPS.visibility.src})` } as CSSProperties}>
        <div
          ref={frame}
          className="map-frame"
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <img src={MAPS.visibility.src} width={CROP.width} height={CROP.height} alt={MAPS.visibility.alt} loading="lazy" decoding="async" draggable={false} />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          <SightFog lit={[lit]} view={view} average={MAPS.visibility.average} />
          <TokenChip name="Kaveh" color="#3fb950" hp={61} image={PORTRAITS.visibility.kaveh} at={{ col: 12, row: 8 }} />
          {view === "gm" && (
            <TokenChip name="Guardian (hidden)" color="#8a6d3b" hp={100} image={PORTRAITS.visibility.guardian} at={HIDDEN_AT} className="is-hidden" />
          )}
          <button
            type="button"
            className="token-chip sight-lead"
            style={inSquare(col, row)}
            aria-label="Nalani, carrying the torch. Arrow keys move Nalani one square."
            onKeyDown={onKeyDown}
            onPointerDown={(e) => {
              dragging.current = true;
              frame.current?.setPointerCapture?.(e.pointerId);
            }}
          >
            <TokenDisc name="Nalani" color="#5b8def" image={PORTRAITS.visibility.nalani} hp={0.84}>
              <span className="token-label">Nalani</span>
            </TokenDisc>
          </button>
        </div>
      </figure>
      <p className="figure-note" role="status">
        {note ??
          (view === "gm"
            ? "You see the whole tomb and the guardian hidden in the side chamber. The outline is what Nalani can see."
            : "Past what their tokens can see, the tomb is in shadow and empty for your players. The guardian in the side chamber isn't there for them at all, not even in the turn order.")}
      </p>
    </div>
  );
}
