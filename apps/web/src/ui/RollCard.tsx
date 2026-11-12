import type { DiceRoll } from "@vtt/shared";
import { rollHeadline } from "../panels/attackRoll";
import { diceBreakdown } from "./dicePool";
import { t } from "../i18n/locale";

/**
 * What was just rolled, as a card that slides into the board's bottom-right corner and back out
 * (board-dice-rolls, throw-dice-on-board): the total, and who rolled what or the attack's summary.
 * It shows once a roll's dice have landed on this viewer's screen, or at once for a roll whose
 * dice aren't thrown here. A GM-only roll's card is marked; players never receive those rolls,
 * and everything shown comes from the viewer's filtered room state.
 */
export function RollCard({ roll, rollerName }: { roll: DiceRoll | undefined; rollerName: (roll: DiceRoll) => string }) {
  if (!roll) return null;
  const { title, meta } = rollHeadline(roll, rollerName(roll));
  return (
    // Keyed by roll, so a new result slides in afresh.
    <div key={roll.id} className={roll.visibility === "gm" ? "board-roll-popup private" : "board-roll-popup"}>
      <span className="board-roll-head" role="status">
        <strong>{title}</strong>
        <span className="board-roll-meta">
          <span className="muted">{meta}</span>
          {roll.visibility === "gm" && <em className="badge">{t("rail.gmOnly")}</em>}
        </span>
      </span>
      {/* Each die, grouped by type (dice-pool): wraps on a narrow board, and isn't read out. */}
      <span className="board-roll-breakdown muted" aria-hidden="true">{diceBreakdown(roll)}</span>
    </div>
  );
}
