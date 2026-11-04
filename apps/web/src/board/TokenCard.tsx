import { useRef, useState } from "react";
import { Copy, Eye, EyeSlash, PencilSimple, Trash } from "@phosphor-icons/react";
import { can, conditionSpec, presetOf, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { Modal } from "../ui/Modal";

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
  onDelete,
  onMove,
  arrowKeys,
  reposition,
  sight,
  movementReadout,
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
  /** Deletes the token for everyone when the GM confirms. */
  onDelete?: () => Promise<boolean>;
  /** Sends `token.move` to a board point; the alternative to dragging. */
  onMove?: (to: Point) => Promise<unknown>;
  /** The switch that lets the arrow keys move this token; the board listens while it's on. */
  arrowKeys?: { on: boolean; onToggle: (on: boolean) => void };
  reposition?: { on: boolean; toggle: () => void };
  /** GM Token view: the eye that narrows the board to this token's sight (gm-token-sight-view). Omit to hide the button. */
  sight?: { on: boolean; onToggle: () => void };
  movementReadout?: string | null;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  // Same rules the server enforces; these only decide whether to draw the buttons.
  const showEdit = !readOnly && !!onEdit && can.editToken(you, token);
  const showDuplicate = !readOnly && !!onDuplicate && you.role === "gm";
  const showDelete = !readOnly && !!onDelete && you.role === "gm";
  const showMove = !readOnly && !!onMove && can.moveToken(you, token);

  return (
    <aside className="token-card" aria-label={`${token.name} details`}>
      <div className="token-card-head">
        <span className="token-card-swatch" style={{ background: token.color }} aria-hidden="true" />
        <strong>{token.name}</strong>
        <button type="button" className="secondary" onClick={onClose} aria-label="Close token details">×</button>
      </div>
      {showMove && movementReadout && <p className="token-card-readout" role="status">{movementReadout}</p>}
      <div className="token-card-body">
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
      {showMove && reposition && (
        <button
          type="button"
          className="secondary token-card-reposition"
          aria-pressed={reposition.on}
          title="For the next move only, ignore walls and blocked terrain along the route. The destination must still be clear."
          onClick={reposition.toggle}
        >
          Reposition next move
        </button>
      )}
      {showMove && arrowKeys && (
        // A switch, not a single-letter shortcut: the arrow keys are claimed only when asked for.
        <label className="checkbox arrow-keys-switch">
          <input type="checkbox" role="switch" checked={arrowKeys.on} onChange={(e) => arrowKeys.onToggle(e.target.checked)} />
          Move with arrow keys
        </label>
      )}
      {(showEdit || showDuplicate || showDelete || !!sight) && (
        <div className="row token-card-actions">
          {showEdit && (
            <button type="button" className="icon-button" onClick={onEdit} aria-label={`Edit ${token.name}`} title="Edit token">
              <PencilSimple size={18} aria-hidden="true" />
            </button>
          )}
          {showDuplicate && (
            <button type="button" className="icon-button" onClick={onDuplicate} aria-label={`Duplicate ${token.name}`} title="Duplicate token">
              <Copy size={18} aria-hidden="true" />
            </button>
          )}
          {sight && (
            <button
              type="button"
              className={`icon-button token-card-sight${sight.on ? " is-on" : ""}`}
              onClick={sight.onToggle}
              aria-pressed={sight.on}
              aria-label={sight.on ? `Stop viewing as ${token.name}` : `View as ${token.name}`}
              title={sight.on ? `Stop viewing as ${token.name}` : `View as ${token.name}`}
            >
              {sight.on ? <EyeSlash size={18} weight="fill" aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          )}
          {showDelete && (
            <button type="button" className="icon-button token-card-delete" onClick={() => setConfirmingDelete(true)} aria-label={`Delete ${token.name}`} title="Delete token">
              <Trash size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      </div>
      <Modal
        open={confirmingDelete}
        title={`Delete ${token.name}?`}
        onClose={() => setConfirmingDelete(false)}
        initialFocus={cancelDeleteRef}
      >
        <div className="leave-confirm">
          <p>This removes the token from the room for everyone.</p>
          <div className="row modal-actions">
            <button ref={cancelDeleteRef} type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              Keep token
            </button>
            <button type="button" className="danger-fill" onClick={async () => {
              if (await onDelete?.()) setConfirmingDelete(false);
            }}>
              Delete token
            </button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
