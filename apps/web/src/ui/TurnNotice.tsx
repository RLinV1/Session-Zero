import { useEffect, useRef, useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";

/** How long the notice stays before it hides itself. */
const TURN_NOTICE_MS = 6000;

/**
 * The token a player should be told about when the turn moves from `previousActiveId` to the
 * current one: a token they own, newly active. Null for the GM, who runs every other turn anyway,
 * and when the turn didn't change hands (turn-notice).
 */
export function turnNoticeToken(previousActiveId: string | null, state: RoomState, you: Participant): { id: string; name: string } | null {
  if (you.role === "gm" || !state.initiative) return null;
  const activeId = state.initiative.order[state.initiative.activeIndex] ?? null;
  if (!activeId || activeId === previousActiveId) return null;
  const token = state.tokens[activeId];
  return token && token.ownerIds.includes(you.id) ? { id: token.id, name: token.name } : null;
}

/**
 * Tells a player their token's turn has started (turn-notice). Only a turn change seen live
 * produces one, so a reload mid-turn doesn't; it hides itself after a few seconds.
 */
export function TurnNotice({ state, you, onFocusToken }: { state: RoomState; you: Participant; onFocusToken: (tokenId: string) => void }) {
  const activeId = state.initiative ? state.initiative.order[state.initiative.activeIndex] ?? null : null;
  const previous = useRef<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const prev = previous.current;
    previous.current = activeId;
    if (prev === undefined) return;
    // A new turn replaces or clears the last notice, so it never names a turn that has passed.
    setNotice(turnNoticeToken(prev, state, you));
    // Only a change of turn matters; state and you are read as they are then.
  }, [activeId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), TURN_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="board-notice turn-notice">
      <p>
        It's <strong>{notice.name}</strong>'s turn.
      </p>
      <div className="row">
        <button type="button" className="small primary" onClick={() => onFocusToken(notice.id)}>
          Show on board
        </button>
        <button type="button" className="small secondary" onClick={() => setNotice(null)} aria-label={`Dismiss: ${notice.name}'s turn`}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
