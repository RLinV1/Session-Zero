import { X } from "@phosphor-icons/react";
import type { RoomState } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * The GM's group selection (ADR 0046): the tokens a group roll or an area effect is for. Built on
 * the board with Shift-click or From template, edited here. Local to the GM's screen: nothing is
 * sent until a roll is made.
 */
export interface GroupSelection {
  tokenIds: readonly string[];
  remove(tokenId: string): void;
  clear(): void;
  /** Put the board into template-picking mode; the picked template's tokens replace the selection. */
  fromTemplate(): void;
}

/** The selected tokens, with a way to drop each, clear them all, or pick them from a template. */
export function GroupSelectionList({ selection, state, idPrefix }: { selection: GroupSelection; state: RoomState; idPrefix: string }) {
  const tokens = selection.tokenIds.flatMap((id) => state.tokens[id] ?? []);
  const hasTemplates = Object.keys(state.templates).length > 0;
  return (
    <div className="group-selection" role="group" aria-labelledby={`${idPrefix}-selection-label`}>
      <div className="group-selection-head">
        <p id={`${idPrefix}-selection-label`} className="group-selection-label">
          {tokens.length === 0 ? t("group.noneSelected") : t("group.selectedN", { n: tokens.length })}
        </p>
        <div className="group-selection-actions">
          <button
            type="button"
            className="secondary"
            disabled={!hasTemplates}
            title={hasTemplates ? t("group.clickArea") : t("group.placeAreaFirst")}
            onClick={selection.fromTemplate}
          >
            {t("group.fromTemplate")}
          </button>
          {tokens.length > 0 && (
            <button type="button" className="secondary" onClick={selection.clear}>
              {t("rail.clear")}
            </button>
          )}
        </div>
      </div>
      {tokens.length > 0 && (
        <ul className="plain group-selection-tokens">
          {tokens.map((token) => (
            <li key={token.id} className="chip group-selection-token">
              {token.name}
              {token.hidden && <em className="badge">{t("group.hidden")}</em>}
              <button type="button" className="icon-button" aria-label={t("group.removeNamed", { name: token.name })} onClick={() => selection.remove(token.id)}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small-print group-selection-hint">{t("group.shiftClick")}</p>
    </div>
  );
}
