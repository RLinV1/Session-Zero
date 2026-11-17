import { cellRect, type GridSpec, type TerrainKind, type TerrainRun } from "@vtt/shared";
import { hex, outlineSegment, outlineTone, terrainColour, terrainHatch, terrainOutline } from "../board/mapPalette";

/**
 * The same cell patterns in private preparation and the synchronized live editor. `outline`
 * "area" draws one outline per area, as the board does; "cell" outlines every square, for a
 * stroke preview (board-palette).
 */
export function TerrainCells({ runs, grid, temporary = false, erase = false, outline = "area" }: { runs: readonly TerrainRun[]; grid: GridSpec; temporary?: boolean; erase?: boolean; outline?: "area" | "cell" }) {
  // Two-tone, as the board draws it (board-palette): Difficult single-hatched, Blocked crosshatched, no glyphs.
  const s = grid.cellSize, inset = s / 60;
  const areaSides = !temporary && !erase && outline === "area" ? terrainOutline(runs) : [];
  const outlinePath = (kind: TerrainKind, tone: "outer" | "inner") => areaSides.filter((side) => side.kind === kind)
    .map((side) => { const [p, q] = outlineSegment(side, cellRect(side.col, side.row, grid), outlineTone(tone, s).inset); return `M${p.x} ${p.y}L${q.x} ${q.y}`; }).join("");
  const outlineStroke = (kind: TerrainKind, tone: "outer" | "inner") => {
    const { width, alpha } = outlineTone(tone, s);
    return { d: outlinePath(kind, tone), fill: "none", stroke: hex(terrainColour(kind)[tone]), strokeOpacity: alpha, strokeWidth: width, strokeLinecap: "square" as const };
  };
  const kinds = (["difficult", "blocked"] as const).filter((kind) => areaSides.some((side) => side.kind === kind));
  return <g pointerEvents="none">
    {runs.map((run) => Array.from({ length: run.end - run.start + 1 }, (_, i) => {
      const col = run.start + i, r = cellRect(col, run.row, grid);
      const colour = terrainColour(run.kind);
      const hatch = terrainHatch(run.kind, s).map(([p, q]) => `M${r.minX + p.x} ${r.minY + p.y}L${r.minX + q.x} ${r.minY + q.y}`).join("");
      return <g key={`${run.row}:${col}`} data-terrain={temporary ? undefined : erase ? "erase" : run.kind}>
        {!temporary && erase && <rect x={r.minX} y={r.minY} width={s} height={s} fill="#ffffff" fillOpacity={.18} stroke="#ffffff" strokeOpacity={.7} strokeWidth={s / 60} />}
        {!temporary && !erase && <>
          <rect x={r.minX} y={r.minY} width={s} height={s} fill={hex(colour.inner)} fillOpacity={.22} />
          <path d={hatch} stroke={hex(colour.outer)} strokeOpacity={.5} strokeWidth={s / 30} />
          <path d={hatch} stroke={hex(colour.inner)} strokeOpacity={.85} strokeWidth={s / 60} />
          {outline === "cell" && <>
            <rect x={r.minX + inset} y={r.minY + inset} width={s - 2 * inset} height={s - 2 * inset} fill="none" stroke={hex(colour.outer)} strokeOpacity={.85} strokeWidth={s / 30} />
            <rect x={r.minX + inset * 2.5} y={r.minY + inset * 2.5} width={s - 5 * inset} height={s - 5 * inset} fill="none" stroke={hex(colour.inner)} strokeOpacity={.95} strokeWidth={s / 60} />
          </>}
        </>}
        {temporary && <rect x={r.minX + s * .73} y={r.minY + s * .05} width={s * .2} height={s * .2} fill={hex(colour.inner)} stroke={hex(colour.outer)} strokeWidth={s / 35} />}
      </g>;
    }))}
    {/* One outline per area along its edge: a dark band, the bright line inside it, every dark line first (board-palette). */}
    {kinds.map((kind) => <path key={`outer-${kind}`} data-terrain-outline={kind} {...outlineStroke(kind, "outer")} />)}
    {kinds.map((kind) => <path key={`inner-${kind}`} {...outlineStroke(kind, "inner")} />)}
  </g>;
}

