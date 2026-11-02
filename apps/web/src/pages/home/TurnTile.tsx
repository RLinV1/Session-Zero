import { useState } from "react";
import { TokenDisc } from "../../ui/TokenDisc";
import { TurnNotice } from "../../ui/TurnNotice";
import { fightRoom, nextTurn, scoreOf, TURN_PLAYER } from "./turnDemo";

/**
 * The turn order, from a room whose fight `decide` started and Next turn advances. Under it is
 * the table's own turn notice, as the player who owns Mara gets it when Mara's turn comes up.
 */
export default function TurnTile() {
  const [state, setState] = useState(fightRoom);
  const [shown, setShown] = useState<string | null>(null);
  const initiative = state.initiative!;

  return (
    <>
      <ol className="plain turn-order" aria-label="Turn order">
        {initiative.order.map((id, i) => {
          const t = state.tokens[id]!;
          const active = i === initiative.activeIndex;
          return (
            <li key={id} className={[active && "is-active", shown === id && "is-shown"].filter(Boolean).join(" ") || undefined} aria-current={active ? "true" : undefined}>
              <TokenDisc name={t.name} color={t.color} image={t.imageUrl} className="small" size="1.6rem" />
              <span className="turn-name">{t.name}</span>
              <span className="num turn-score">{scoreOf(id)}</span>
            </li>
          );
        })}
      </ol>
      <div className="turn-bar">
        <span className="readout">
          Round <b>{initiative.round}</b>
        </span>
        <button type="button" className="ui-button" onClick={() => setState(nextTurn)}>
          Next turn
        </button>
      </div>
      <div className="turn-notice-slot">
        <TurnNotice state={state} you={TURN_PLAYER} onFocusToken={(id) => setShown(id)} />
      </div>
      <p className="turn-hint muted small-print">Press Next turn. When Mara's turn comes up, Mara's player gets a notice here.</p>
    </>
  );
}
