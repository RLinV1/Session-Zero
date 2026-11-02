import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import type { Point } from "@vtt/shared";
import { TokenDisc } from "../../ui/TokenDisc";
import { MAPS, atPoint, viewRect, type CropView } from "./crops";
import { CropWindow } from "./CropWindow";
import { logLines, moveToken, openingRoom, undoAction, type DemoRoom } from "./recoverRoom";
import { squareCenter, squareOf } from "./sightDemo";

/** The merchant ship's deck from rail to rail, on the deck's home crop. */
const VIEW: CropView = { col: 1, row: 1, cols: 16, rows: 9 };

const STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Whole squares of the view a token can be moved to. */
const inView = (col: number, row: number) =>
  col >= VIEW.col && row >= VIEW.row && col < VIEW.col + VIEW.cols && row < VIEW.row + Math.floor(VIEW.rows);

/**
 * The recovery demo, loaded near the viewport (it runs `decide`): a board with three tokens and
 * the GM's activity log beside it, with Undo on each action that can still be undone.
 */
export default function RecoverDemo() {
  const [room, setRoom] = useState<DemoRoom>(openingRoom);
  const [refusal, setRefusal] = useState<{ commandId: string | null; message: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; at: Point } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const rect = viewRect(VIEW);
  const lines = logLines(room);

  function move(tokenId: string, col: number, row: number) {
    const current = squareOf(room.state.tokens[tokenId]!.position);
    if (!inView(col, row) || (current.col === col && current.row === row)) return;
    const result = moveToken(room, tokenId, squareCenter(col, row));
    setRoom(result.room);
    setRefusal(result.refused ? { commandId: null, message: result.refused } : null);
  }

  function undo(commandId: string) {
    const result = undoAction(room, commandId);
    setRoom(result.room);
    setRefusal(result.refused ? { commandId, message: result.refused } : null);
  }

  /** The crop pixel under the pointer. */
  const boardPoint = (e: PointerEvent): Point => {
    const box = board.current!.getBoundingClientRect();
    return { x: rect.x + ((e.clientX - box.left) / box.width) * rect.width, y: rect.y + ((e.clientY - box.top) / box.height) * rect.height };
  };

  function onKeyDown(tokenId: string, e: KeyboardEvent) {
    const d = STEP[e.key];
    if (!d) return;
    e.preventDefault();
    const { col, row } = squareOf(room.state.tokens[tokenId]!.position);
    move(tokenId, col + d[0], row + d[1]);
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag) return;
    const { col, row } = squareOf(boardPoint(e));
    setDrag(null);
    move(drag.id, col, row);
  }

  return (
    <div className="recover-demo">
      <div
        ref={board}
        className="recover-board"
        onPointerMove={(e) => drag && setDrag({ id: drag.id, at: boardPoint(e) })}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <CropWindow src={MAPS.recover.src} alt={MAPS.recover.alt} view={VIEW}>
          {Object.values(room.state.tokens).map((t) => {
            const dragging = drag?.id === t.id;
            const shownAt = dragging ? squareCenter(squareOf(drag.at).col, squareOf(drag.at).row) : t.position;
            return (
              <button
                key={t.id}
                type="button"
                className={dragging ? "token-chip recover-token is-dragging" : "token-chip recover-token"}
                style={atPoint(VIEW, shownAt)}
                aria-label={`${t.name}. Arrow keys move ${t.name} one square.`}
                onKeyDown={(e) => onKeyDown(t.id, e)}
                onPointerDown={(e) => {
                  setDrag({ id: t.id, at: t.position });
                  board.current?.setPointerCapture?.(e.pointerId);
                }}
              >
                <TokenDisc name={t.name} color={t.color} image={t.imageUrl}>
                  <span className="token-label">{t.name}</span>
                </TokenDisc>
              </button>
            );
          })}
        </CropWindow>
        {refusal && refusal.commandId === null && (
          <p role="alert" className="error">
            {refusal.message}
          </p>
        )}
      </div>

      <div className="recover-log">
        <h4>Activity log</h4>
        <p className="muted small-print">Newest first, as the GM sees it.</p>
        <ol className="plain activity-entries" aria-live="polite">
          {lines.map((line) => (
            <li key={line.seq}>
              <div className="activity-entry-head">
                <p>{line.sentence}</p>
                {line.undo && line.commandId && (
                  <button
                    type="button"
                    className="secondary small activity-undo"
                    aria-label={line.undo.label}
                    title={line.undo.label}
                    onClick={() => undo(line.commandId!)}
                  >
                    <ArrowCounterClockwise size={14} aria-hidden="true" />
                    Undo
                  </button>
                )}
                {line.undone && <span className="activity-undone">Undone</span>}
              </div>
              {refusal && line.commandId !== undefined && refusal.commandId === line.commandId && (
                <p role="alert" className="error">
                  {refusal.message}
                </p>
              )}
              <small className="muted activity-meta">#{line.seq}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
