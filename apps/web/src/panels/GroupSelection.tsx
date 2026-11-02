import { X } from "@phosphor-icons/react";
import type { RoomState } from "@vtt/shared";

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
      <p id={`${idPrefix}-selection-label`} className="group-selection-label">
        {tokens.length === 0 ? "No tokens selected" : `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"} selected`}
      </p>
      {tokens.length > 0 && (
        <ul className="plain group-selection-tokens">
          {tokens.map((token) => (
            <li key={token.id} className="chip group-selection-token">
              {token.name}
              {token.hidden && <em className="badge">hidden</em>}
              <button type="button" className="icon-button" aria-label={`Remove ${token.name}`} onClick={() => selection.remove(token.id)}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row group-selection-actions">
        <button
          type="button"
          className="secondary small"
          disabled={!hasTemplates}
          title={hasTemplates ? "Click an area on the board to select every token it touches" : "Place an area on the board first"}
          onClick={selection.fromTemplate}
        >
          From template
        </button>
        {tokens.length > 0 && (
          <button type="button" className="secondary small" onClick={selection.clear}>
            Clear
          </button>
        )}
      </div>
      <p className="muted small-print">Shift-click tokens on the board to add or remove them.</p>
    </div>
  );
}
