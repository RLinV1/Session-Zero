import { useState } from "react";
import { TokenDisc } from "../../ui/TokenDisc";
import { TurnBanner } from "../../ui/TurnBanner";
import { fightRoom, nextTurn, scoreOf, turnPlayer } from "./turnDemo";
import { t } from "../../i18n/locale";

/**
 * The turn order, from a room whose fight `decide` started and Next turn advances. Under it is
 * the table's own turn banner, as the player who owns Mara gets it when Mara's turn comes up.
 */
export default function TurnTile() {
  const [state, setState] = useState(fightRoom);
  const [you] = useState(turnPlayer);
  const [shown, setShown] = useState<string | null>(null);
  const initiative = state.initiative!;

  return (
    <>
      <ol className="plain turn-order" aria-label={t("home.play.turnOrder")}>
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
          {t("home.turn.roundBefore")}<b>{initiative.round}</b>{t("home.turn.roundAfter")}
        </span>
        <button type="button" className="ui-button" onClick={() => setState(nextTurn)}>
          {t("home.turn.next")}
        </button>
      </div>
      <div className="turn-notice-slot">
        <TurnBanner
          state={state}
          you={you}
          onFocusToken={(id) => setShown(id)}
          onEndTurn={() => {
            setState(nextTurn);
            return { ok: true };
          }}
        />
      </div>
      <p className="turn-hint muted small-print">{t("home.turn.help", { name: "Mara" })}</p>
    </>
  );
}
