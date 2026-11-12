import { useEffect, useRef, useState } from "react";
import { isActive, pendingDepartures, type RoomState } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * Which departures are news. `known` is null before the first snapshot: those departures are
 * remembered silently so a reload replays nothing. Later ones are shown only when the player left
 * on their own; the GM's own removals are not announced.
 */
export function departureNews(known: ReadonlySet<string> | null, participants: RoomState["participants"]) {
  const departed = Object.values(participants).filter((p) => !isActive(p));
  const next = new Set([...(known ?? []), ...departed.map((p) => p.id)]);
  if (known === null) return { known: next, shown: [] as string[] };
  const shown = departed.filter((p) => !known.has(p.id) && p.left === true && !p.revoked).map((p) => p.id);
  return { known: next, shown };
}

/**
 * Tells everyone at the table when a player leaves (KAN-58, KAN-73, ADR 0006).
 *
 * Only departures seen happening in this session produce a notice: the first snapshot's
 * departed players are remembered silently, so a reload doesn't replay old news. Anything
 * still unresolved after a dismiss or reload stays listed in the GM panel. Only the GM passes
 * `onReview`, so only the GM's notice has the token review and the token note.
 */
export function DepartureNotices({ state, onReview }: { state: RoomState; onReview?: (participantId: string) => void }) {
  const known = useRef<Set<string> | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    const { known: next, shown } = departureNews(known.current, state.participants);
    known.current = next;
    if (shown.length > 0) setNotices((n) => [...n, ...shown]);
  }, [state.participants]);

  const pending = new Set(pendingDepartures(state).map((d) => d.participant.id));
  /** Hides one notice; the departure stays listed in the GM panel until resolved. */
  const dismiss = (id: string) => setNotices((n) => n.filter((x) => x !== id));

  return (
    // Cards only: the room page wraps every board notice in one live region (BoardNotices).
    <>
      {notices.map((id) => {
        const name = state.participants[id]?.displayName ?? t("departure.aPlayer");
        return (
          <div key={id} className="board-notice">
            <p>
              {t("departure.leftBefore")}<strong>{name}</strong>{t("departure.leftAfter")}
              {onReview && !pending.has(id) && t("departure.noTokens")}
            </p>
            <div className="row">
              {onReview && pending.has(id) && (
                <button
                  type="button"
                  className="small primary"
                  onClick={() => {
                    dismiss(id);
                    onReview(id);
                  }}
                >
                  {t("departure.review")}
                </button>
              )}
              <button type="button" className="small secondary" onClick={() => dismiss(id)} aria-label={t("departure.dismissNamed", { name })}>
                {t("turn.dismiss")}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
