import { MAX_PLAYERS_PER_ROOM } from "@vtt/shared";
import { t } from "../../i18n/locale";

/**
 * How fast a ping reaches the other screens at the table: the p95 target the ephemeral benchmark
 * holds the server to (apps/server/test/ephemeralLatency.test.ts, TARGET_P95_MS). A server test
 * can't be imported here, so homeFacts.test.tsx reads that file and fails when the two disagree.
 */
export const PING_TARGET_MS = 150;

/**
 * Four facts under the hero, each from the product's own limits or a target its tests measure
 * (gm-home: "Figures are sourced"). Undo names what it covers: the table can't undo every action
 * (a deleted token, a chat message or a roll stays), so the row doesn't say it can.
 */
export function FactsRow() {
  return (
    <ul className="plain facts-row" aria-label={t("home.facts.label")}>
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
        <strong>
          <span className="num">{t("home.facts.under", { ms: PING_TARGET_MS })}</span>
        </strong>{" "}
        <span>{t("home.facts.ping")}</span>
      </li>
      <li>
        <strong>{t("home.facts.undo")}</strong> <span>{t("home.facts.undoDetail")}</span>
      </li>
    </ul>
  );
}
