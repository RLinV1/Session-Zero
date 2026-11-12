import { useEffect, useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * The token a player's banner names: the active token, when the viewer is a player who owns it.
 * Null for the GM, who runs every other turn anyway, and when a token hidden from the player has
 * the turn (their order then has no active entry) (turn-notice, ADR 0060).
 */
export function turnBannerToken(state: RoomState, you: Participant): { id: string; name: string; round: number } | null {
  const init = state.initiative;
  if (you.role === "gm" || !init) return null;
  const activeId = init.order[init.activeIndex];
  const token = activeId === undefined ? undefined : state.tokens[activeId];
  return token && token.ownerIds.includes(you.id) ? { id: token.id, name: token.name, round: init.round } : null;
}

/** What ending a turn answered: nothing to show, or the server's reason it refused. */
export type EndTurnResult = { ok: true } | { ok: false; message: string };

/**
 * Tells a player, across the top of the room, that it is their token's turn, for as long as it is
 * (turn-notice). Read from the current state, so a reload mid-turn shows it again. End turn hands
 * the turn on (ADR 0060).
 */
export function TurnBanner({ state, you, onFocusToken, onEndTurn }: {
  state: RoomState;
  you: Participant;
  onFocusToken: (tokenId: string) => void;
  /** Ends the named token's turn; absent where the viewer can't act, e.g. a replay or a preview. */
  onEndTurn?: (tokenId: string) => Promise<EndTurnResult> | EndTurnResult;
}) {
  const turn = turnBannerToken(state, you);
  const key = turn ? `${turn.round}:${turn.id}` : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new turn starts clean.
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [key]);

  const endTurn = async () => {
    if (!turn || !onEndTurn) return;
    setBusy(true);
    const result = await onEndTurn(turn.id);
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <>
      {/* Always mounted, so screen readers register the live region before the turn comes up. */}
      <p className="sr-only" role="status" aria-live="polite">
        {turn ? t("turn.announce", { name: turn.name, n: turn.round }) : ""}
      </p>
      {turn && (
        <div className="turn-banner">
          <p className="turn-banner-text">
            {t("turn.bannerBefore", { n: turn.round })}<strong>{turn.name}</strong>{t("turn.bannerAfter", { n: turn.round })}
          </p>
          {error && <p className="turn-banner-error error" role="alert">{error}</p>}
          <div className="turn-banner-actions">
            <button type="button" className="small secondary" onClick={() => onFocusToken(turn.id)}>
              {t("turn.show")}
            </button>
            {onEndTurn && (
              <button type="button" className="small primary" onClick={() => void endTurn()} disabled={busy} aria-label={t("turn.endNamed", { name: turn.name })}>
                {t("turn.end")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
