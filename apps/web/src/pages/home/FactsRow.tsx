import { MAX_PLAYERS_PER_ROOM } from "@vtt/shared";
import { t } from "../../i18n/locale";

/**
 * Four facts under the hero, each from the product's own limits or its project rules (no tiered or paywalled feature)
 * (gm-home: "Figures are sourced"). Undo names what it covers: the table can't undo every action
 * (a deleted token, a chat message or a roll stays), so the row doesn't say it can.
 */
export function FactsRow() {
  return (
    <ul className="plain facts-row" aria-label={t("home.facts.label")}>
      <li>
        <strong>{t("home.facts.free")}</strong> <span>{t("home.facts.freeDetail")}</span>
      </li>
      <li>
        <strong>{t("home.facts.noAccount")}</strong> <span>{t("home.facts.noAccountDetail")}</span>
      </li>
      <li>
        <strong>
          <span className="num">{t("home.facts.upTo", { n: MAX_PLAYERS_PER_ROOM })}</span>
        </strong>{" "}
        <span>{t("home.facts.players")}</span>
      </li>
      <li>
        <strong>{t("home.facts.undo")}</strong> <span>{t("home.facts.undoDetail")}</span>
      </li>
    </ul>
  );
}
