import { useEffect, useState } from "react";
import { can, type Participant, type RoomState } from "@vtt/shared";
import { useClientSettings } from "./clientSettings";
import { t } from "../i18n/locale";

/**
 * The token a banner names, and whether the viewer may end its turn: a player's own active token;
 * with "Turn banner on every turn" chosen in Settings, every turn's token, for the GM and players
 * alike; otherwise none. `canEnd` follows the server's rule: the GM, or one of the token's owners.
 * Null when a token hidden from a player has the turn (their order then has no active entry)
 * (turn-notice, ADR 0060).
 */
export function turnBannerToken(state: RoomState, you: Participant, everyTurn = false): { id: string; name: string; round: number; canEnd: boolean } | null {
  const init = state.initiative;
  if (!init) return null;
  const activeId = init.order[init.activeIndex];
  const token = activeId === undefined ? undefined : state.tokens[activeId];
  if (!token) return null;
  const owned = token.ownerIds.includes(you.id);
  if (!everyTurn && (you.role === "gm" || !owned)) return null;
  return { id: token.id, name: token.name, round: init.round, canEnd: can.endTurn(you, token) };
}

/** What ending a turn answered: nothing to show, or the server's reason it refused. */
export type EndTurnResult = { ok: true } | { ok: false; message: string };

/**
 * Tells a viewer, across the top of the room, whose turn it is: their own token's, or every token's
 * when they chose that in Settings (turn-notice). Read from the current state, so a reload mid-turn shows it again. End turn hands
 * the turn on (ADR 0060).
 */
export function TurnBanner({ state, you, onFocusToken, onEndTurn }: {
  state: RoomState;
  you: Participant;
  onFocusToken: (tokenId: string) => void;
  /** Ends the named token's turn; absent where the viewer can't act, e.g. a replay or a preview. */
  onEndTurn?: (tokenId: string) => Promise<EndTurnResult> | EndTurnResult;
}) {
  const { gmTurnBanner } = useClientSettings();
  const turn = turnBannerToken(state, you, gmTurnBanner);
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
            {onEndTurn && turn.canEnd && (
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
