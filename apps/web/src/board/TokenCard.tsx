import { useRef, useState } from "react";
import { Copy, Eye, EyeSlash, PencilSimple, Trash } from "@phosphor-icons/react";
import { can, conditionLabel, presetOf, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { Modal } from "../ui/Modal";
import { statHidden } from "../ui/statHidden";

import { getLocale, t } from "../i18n/locale";
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
    <aside className="token-card" aria-label={t("card.details", { name: token.name })}>
      <div className="token-card-head">
        <span className="token-card-swatch" style={{ background: token.color }} aria-hidden="true" />
        <strong>{token.name}</strong>
        <button type="button" className="secondary" onClick={onClose} aria-label={t("card.close")}>×</button>
      </div>
      {showMove && movementReadout && <p className="token-card-readout" role="status">{movementReadout}</p>}
      <div className="token-card-body">
      <dl>
        <dt>{t("creature.stat.hp")}</dt>
        <dd className={token.stats.hp === null ? undefined : "num"}>
          {statHidden(state, you, token, "hp") ? t("card.hidden") : token.stats.hp === null ? t("card.notTracked") : token.stats.maxHp === null ? token.stats.hp : `${token.stats.hp} / ${token.stats.maxHp}`}
        </dd>
        {statHidden(state, you, token, "ac") ? (
          <>
            <dt>{t("creature.ac")}</dt>
            <dd>{t("card.hidden")}</dd>
          </>
        ) : token.stats.ac !== null && (
          <>
            <dt>{t("creature.ac")}</dt>
            <dd className="num">{token.stats.ac}</dd>
          </>
        )}
        {presetOf(state).features.conditions && (
          <>
            <dt>{t("card.status")}</dt>
            <dd>{token.conditions.length ? token.conditions.map((c) => conditionLabel(c, getLocale())).join(t("common.listSep")) : t("card.none")}</dd>
          </>
        )}
        {you.role === "gm" && (
          <>
            <dt>{t("card.owners")}</dt>
            <dd>
              {token.ownerIds.length
                ? token.ownerIds.map((id) => state.participants[id]?.displayName ?? t("card.unknown")).join(t("common.listSep"))
                : t("rail.gmOnly")}
            </dd>
            <dt>{t("card.visible")}</dt>
            <dd>{token.hidden ? t("add.hidden") : t("card.everyone")}</dd>
            {token.initiative != null && (
              <>
                <dt>{t("card.initiative")}</dt>
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
          title={t("card.repositionHint")}
          onClick={reposition.toggle}
        >
          {t("card.reposition")}
        </button>
      )}
      {(showEdit || showDuplicate || showDelete || !!sight) && (
        <div className="row token-card-actions">
          {showEdit && (
            <button type="button" className="icon-button" onClick={onEdit} aria-label={t("roster.editNamed", { name: token.name })} title={t("roster.edit")}>
              <PencilSimple size={18} aria-hidden="true" />
            </button>
          )}
          {showDuplicate && (
            <button type="button" className="icon-button" onClick={onDuplicate} aria-label={t("roster.duplicateNamed", { name: token.name })} title={t("card.duplicate")}>
              <Copy size={18} aria-hidden="true" />
            </button>
          )}
          {sight && (
            <button
              type="button"
              className={`icon-button token-card-sight${sight.on ? " is-on" : ""}`}
              onClick={sight.onToggle}
              aria-pressed={sight.on}
              aria-label={t(sight.on ? "card.stopViewing" : "card.viewAs", { name: token.name })}
              title={t(sight.on ? "card.stopViewing" : "card.viewAs", { name: token.name })}
            >
              {sight.on ? <EyeSlash size={18} weight="fill" aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          )}
          {showDelete && (
            <button type="button" className="icon-button token-card-delete" onClick={() => setConfirmingDelete(true)} aria-label={t("common.deleteNamed", { name: token.name })} title={t("depart.deleteToken")}>
              <Trash size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      </div>
      <Modal
        open={confirmingDelete}
        title={t("common.deleteNamedQ", { name: token.name })}
        onClose={() => setConfirmingDelete(false)}
        initialFocus={cancelDeleteRef}
      >
        <div className="leave-confirm">
          <p>{t("card.deleteBody")}</p>
          <div className="row modal-actions">
            <button ref={cancelDeleteRef} type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              {t("card.keep")}
            </button>
            <button type="button" className="danger-fill" onClick={async () => {
              if (await onDelete?.()) setConfirmingDelete(false);
            }}>
              {t("depart.deleteToken")}
            </button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
