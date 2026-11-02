import { can, conditionSpec, presetOf, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { MoveControl } from "../ui/MoveControl";

/**
 * The details card for the token selected on the board, with Edit, Duplicate and a one-square
 * Move control (token-card-actions, WCAG 2.5.7).
 * Plain React: it never touches Pixi objects, so it can be tested on its own.
 */
export function TokenCard({
  token,
  state,
  you,
  readOnly = false,
  onClose,
  onEdit,
  onDuplicate,
  onMove,
  arrowKeys,
}: {
  token: Token;
  state: RoomState;
  you: Participant;
  /** Previewing as a player or replaying: details only, nothing to send. */
  readOnly?: boolean;
  onClose: () => void;
  /** Opens the sidebar's token editor. */
  onEdit?: () => void;
  /** Starts placing copies on the board, once per click. */
  onDuplicate?: () => void;
  /** Sends `token.move` to a board point; the alternative to dragging. */
  onMove?: (to: Point) => Promise<unknown>;
  /** The switch that lets the arrow keys move this token; the board listens while it's on. */
  arrowKeys?: { on: boolean; onToggle: (on: boolean) => void };
}) {
  // Same rules the server enforces; these only decide whether to draw the buttons.
  const showEdit = !readOnly && !!onEdit && can.editToken(you, token);
  const showDuplicate = !readOnly && !!onDuplicate && you.role === "gm";
  const showMove = !readOnly && !!onMove && can.moveToken(you, token);
  const map = state.scene.map;

  return (
    <aside className="token-card" aria-label={`${token.name} details`}>
      <div className="token-card-head">
        <span className="token-card-swatch" style={{ background: token.color }} aria-hidden="true" />
        <strong>{token.name}</strong>
        <button type="button" className="secondary" onClick={onClose} aria-label="Close token details">×</button>
      </div>
      <dl>
        <dt>HP</dt>
        <dd className={token.stats.hp === null ? undefined : "num"}>
          {token.stats.hp === null ? "Not tracked" : token.stats.maxHp === null ? token.stats.hp : `${token.stats.hp} / ${token.stats.maxHp}`}
        </dd>
        {token.stats.ac !== null && (
          <>
            <dt>AC</dt>
            <dd className="num">{token.stats.ac}</dd>
          </>
        )}
        {presetOf(state).features.conditions && (
          <>
            <dt>Status</dt>
            <dd>{token.conditions.length ? token.conditions.map((c) => conditionSpec(c).label).join(", ") : "None"}</dd>
          </>
        )}
        {you.role === "gm" && (
          <>
            <dt>Owners</dt>
            <dd>
              {token.ownerIds.length
                ? token.ownerIds.map((id) => state.participants[id]?.displayName ?? "Unknown").join(", ")
                : "GM only"}
            </dd>
            <dt>Visible</dt>
            <dd>{token.hidden ? "Hidden from players" : "Everyone"}</dd>
            {token.initiative != null && (
              <>
                <dt>Initiative</dt>
                <dd className="num">{String(token.initiative)}</dd>
              </>
            )}
          </>
        )}
      </dl>
      {showMove && (
        <MoveControl
          name={token.name}
          at={token.position}
          step={state.scene.grid.cellSize}
          bounds={map ? { width: map.width, height: map.height } : undefined}
          onMove={onMove!}
        />
      )}
      {showMove && arrowKeys && (
        <>
          {/* A switch, not a single-letter shortcut: the arrow keys are claimed only when asked for. */}
          <label className="checkbox arrow-keys-switch">
            <input type="checkbox" role="switch" checked={arrowKeys.on} onChange={(e) => arrowKeys.onToggle(e.target.checked)} />
            Move with arrow keys
          </label>
          {arrowKeys.on && <p className="muted small-print">Arrow keys move {token.name} one square.</p>}
        </>
      )}
      {(showEdit || showDuplicate) && (
        <div className="row token-card-actions">
          {showEdit && (
            <button type="button" className="secondary" onClick={onEdit} aria-label={`Edit ${token.name}`}>
              Edit
            </button>
          )}
          {showDuplicate && (
            <button type="button" className="secondary" onClick={onDuplicate} aria-label={`Duplicate ${token.name}`}>
              Duplicate
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
