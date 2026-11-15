import { useId, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_GRID, footprintCenter, footprintOnBlocked, type BuildFileView, type DraftCreatureState, type DraftSquare, type Point, type TerrainRun } from "@vtt/shared";
import { TerrainCells } from "../mapEditor/TerrainSetup";

interface Token { creatureKey: string; name: string; square: DraftSquare | null; hidden: boolean }
export interface EncounterEditGrid { cellSize: number; offsetX: number; offsetY: number }

/** Draft positions use map pixels, regardless of the size the image is displayed at. */
export function DraftEncounterMap({ file, files, grid, terrain, tokens, creature, selected, onSelect, onMove, disabled }: {
  file: BuildFileView;
  files: readonly BuildFileView[];
  grid: EncounterEditGrid;
  terrain: readonly TerrainRun[];
  tokens: readonly Token[];
  creature: (key: string) => DraftCreatureState | undefined;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onMove: (index: number, square: DraftSquare | null) => void;
  disabled: boolean;
}) {
  const id = useId();
  const drag = useRef<{ index: number; pointerId: number; grab: Point; original: DraftSquare | null } | null>(null);
  const [message, setMessage] = useState("");
  const sizeOf = (index: number) => creature(tokens[index]!.creatureKey)?.size ?? 1;
  const nameOf = (index: number) => tokens[index]!.name.trim() || creature(tokens[index]!.creatureKey)?.name || tokens[index]!.creatureKey;
  const centerOf = (square: DraftSquare, size: number) => footprintCenter(square, size, grid, file)
    ?? { x: grid.offsetX + (square.column + size / 2) * grid.cellSize, y: grid.offsetY + (square.row + size / 2) * grid.cellSize };

  function move(index: number, column: number, row: number) {
    const size = sizeOf(index);
    const minColumn = Math.max(0, Math.ceil(-grid.offsetX / grid.cellSize));
    const minRow = Math.max(0, Math.ceil(-grid.offsetY / grid.cellSize));
    const maxColumn = Math.floor((file.width - grid.offsetX) / grid.cellSize - size + 1e-6);
    const maxRow = Math.floor((file.height - grid.offsetY) / grid.cellSize - size + 1e-6);
    const square = { column: Math.max(minColumn, Math.min(maxColumn, column)), row: Math.max(minRow, Math.min(maxRow, row)) };
    const center = footprintCenter(square, size, grid, file);
    if (!center) { setMessage(`${nameOf(index)} does not fit on this map.`); return; }
    if (footprintOnBlocked(center, size, grid, terrain)) {
      setMessage("That space is Blocked terrain. Choose an open space.");
      return;
    }
    setMessage("");
    onMove(index, square);
  }

  function point(e: PointerEvent<SVGSVGElement>): Point | null {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? { x: (e.clientX - rect.left) * file.width / rect.width, y: (e.clientY - rect.top) * file.height / rect.height }
      : null;
  }

  function movePointer(e: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    const at = point(e);
    if (!active || active.pointerId !== e.pointerId || !at) return;
    move(active.index, Math.round((at.x - grid.offsetX - active.grab.x) / grid.cellSize), Math.round((at.y - grid.offsetY - active.grab.y) / grid.cellSize));
  }

  return <>
    <div className="build-token-map" style={{ aspectRatio: `${file.width} / ${file.height}` }}>
      <img src={file.url} alt="Encounter map" draggable={false} />
      <svg viewBox={`0 0 ${file.width} ${file.height}`} preserveAspectRatio="none" aria-label="Token placement map"
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          const target = (e.target as Element).closest<SVGElement>("[data-token-index]");
          const index = target ? Number(target.dataset.tokenIndex) : selected;
          const at = point(e);
          if (index === null || !tokens[index] || !at) return;
          e.preventDefault();
          onSelect(index);
          const square = tokens[index]!.square;
          const half = sizeOf(index) * grid.cellSize / 2;
          const center = square ? centerOf(square, sizeOf(index)) : null;
          const grab = target && center ? { x: at.x - center.x + half, y: at.y - center.y + half } : { x: half, y: half };
          drag.current = { index, pointerId: e.pointerId, grab, original: square };
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!target) movePointer(e);
        }}
        onPointerMove={movePointer}
        onPointerUp={(e) => {
          if (drag.current?.pointerId !== e.pointerId) return;
          movePointer(e);
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (drag.current?.pointerId !== e.pointerId) return;
          onMove(drag.current.index, drag.current.original);
          drag.current = null;
          setMessage("");
        }}
        onLostPointerCapture={() => { drag.current = null; }}>
        {terrain.length > 0 && <TerrainCells runs={[...terrain]} grid={{ ...DEFAULT_GRID, ...grid }} />}
        {tokens.map((token, index) => {
          if (!token.square) return null;
          const of = creature(token.creatureKey);
          const size = sizeOf(index);
          const center = centerOf(token.square, size);
          const radius = size * grid.cellSize * 0.44;
          const art = files.find((f) => f.id === of?.imageFileId);
          const clip = `${id}-token-${index}`;
          return <g key={index} data-token-index={index} className={`build-edit-token${selected === index ? " is-selected" : ""}`}
            role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined} aria-label={`Move ${nameOf(index)}`} aria-pressed={selected === index}
            onFocus={() => onSelect(index)}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(index); return; }
              const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
              if (!delta) return;
              e.preventDefault();
              move(index, token.square!.column + delta[0]!, token.square!.row + delta[1]!);
            }}>
            <title>{nameOf(index)}{token.hidden ? " (hidden)" : ""}. Drag to move, or use arrow keys.</title>
            <defs><clipPath id={clip}><circle cx={center.x} cy={center.y} r={radius} /></clipPath></defs>
            <circle className="build-edit-token-disc" cx={center.x} cy={center.y} r={radius} fill={of?.color ?? "#8a6b58"} />
            {art && <image href={art.url} x={center.x - radius} y={center.y - radius} width={radius * 2} height={radius * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />}
            <circle className="build-edit-token-outline" cx={center.x} cy={center.y} r={radius} fill="none" stroke={token.hidden ? "#f3a26d" : "#fff"} strokeDasharray={token.hidden ? "6 4" : undefined} strokeWidth={Math.max(2, grid.cellSize * 0.05)} />
            <text x={center.x} y={center.y + radius + grid.cellSize * 0.25} textAnchor="middle" fontSize={grid.cellSize * 0.24}>{nameOf(index)}</text>
          </g>;
        })}
      </svg>
    </div>
    <p className="build-placement-status small-print" role="status">{message || (selected === null ? "Select a token to place it, or drag a token already on the map." : `${nameOf(selected)} selected. Click the map to place it, drag to move it, or use arrow keys when focused.`)}</p>
  </>;
}
