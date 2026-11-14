import { useMemo } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import { ownerNames, useTicks } from "./CarryChecklist";
import { t } from "../i18n/locale";

const always = () => true;

/**
 * The GM's "Waiting to be placed" list (ADR 0068): every staged token, ticked by default, until
 * none is left. Place selected hands the ticked ones to the board's placement mode. It stays
 * through reloads, so a placement the GM missed or left can always be picked up again.
 */
export function StagedWaitingList({ state, onPlace, disabled }: {
  state: RoomState;
  onPlace: (tokenIds: string[]) => void;
  disabled?: boolean;
}) {
  const staged = Object.values(state.staged ?? {});
  const ids = useMemo(() => Object.keys(state.staged ?? {}), [state.staged]);
  const ticks = useTicks(ids, always);
  if (staged.length === 0) return null;
  return (
    <section className="staged-list" aria-label={t("staged.title")}>
      <h2>{t("staged.title")} ({staged.length})</h2>
      <ul className="plain">
        {staged.map((token) => (
          <li key={token.id}>
            <label className="checkbox">
              <input type="checkbox" checked={ticks.ticked.includes(token.id)} disabled={disabled} onChange={(e) => ticks.toggle(token.id, e.target.checked)} />
              <span>{token.name}</span>
              <span className="muted">{ownerNames(state, token)}</span>
              {token.hidden && <span className="muted">{t("staged.hidden")}</span>}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="primary small" disabled={disabled || ticks.ticked.length === 0} onClick={() => onPlace([...ticks.ticked])}>
        {t("staged.placeSelected")}
      </button>
    </section>
  );
}

/** A player's own carried tokens, while the GM hasn't placed them yet (ADR 0068). The server sends no others. */
export function WaitingTray({ state, you }: { state: RoomState; you: Participant }) {
  const mine = Object.values(state.staged ?? {}).filter((token) => token.ownerIds.includes(you.id));
  if (mine.length === 0) return null;
  return (
    <section className="staged-list staged-tray" role="status" aria-label={t("staged.tray")}>
      <h2>{t("staged.tray")}</h2>
      <ul className="plain">
        {mine.map((token) => <li key={token.id}>{token.name}</li>)}
      </ul>
    </section>
  );
}
