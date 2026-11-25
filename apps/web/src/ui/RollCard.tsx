import type { DiceRoll } from "@vtt/shared";
import { rollHeadline } from "../panels/attackRoll";
import { diceBreakdown } from "./dicePool";
import { t } from "../i18n/locale";
import { dieSidesAt, traySides } from "./Die3D";
import { useAnimationLevel } from "./motion";

/**
 * What was just rolled, as a card that slides into the board's bottom-right corner and back out
 * (board-dice-rolls, throw-dice-on-board): the total, and who rolled what or the attack's summary.
 * It shows once a roll's dice have landed on this viewer's screen, or at once for a roll whose
 * dice aren't thrown here. A GM-only roll's card is marked; players never receive those rolls,
 * and everything shown comes from the viewer's filtered room state. At the Reduced Animations level,
 * which throws no 3D dice, the card draws each die flat, with its value (animation-levels).
 */
export function RollCard({ roll, rollerName }: { roll: DiceRoll | undefined; rollerName: (roll: DiceRoll) => string }) {
  const level = useAnimationLevel();
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
      {level === "reduced" ? <FlatDice roll={roll} /> : (
        // Each die, grouped by type (dice-pool): wraps on a narrow board, and isn't read out.
        <span className="board-roll-breakdown muted" aria-hidden="true">{diceBreakdown(roll)}</span>
      )}
    </div>
  );
}

/** A die's flat outline in a 0–40 box: the shape players know each die by. Odd sizes borrow the nearest. */
const DIE_OUTLINES: Record<number, string> = {
  4: "20,3 37,35 3,35",
  6: "5,5 35,5 35,35 5,35",
  8: "20,2 38,20 20,38 2,20",
  10: "20,2 37,17 20,38 3,17",
  12: "20,2 38,15 31,37 9,37 2,15",
  20: "20,2 36,11 36,29 20,38 4,29 4,11",
};
const outlineFor = (sides: number) => DIE_OUTLINES[sides] ?? DIE_OUTLINES[sides <= 4 ? 4 : sides <= 6 ? 6 : sides <= 8 ? 8 : sides <= 10 ? 10 : sides <= 12 ? 12 : 20]!;

/**
 * Each die drawn flat, in its own shape with its value, and its type under it, in roll order.
 * Decorative: the card's title already says the total.
 */
function FlatDice({ roll }: { roll: DiceRoll }) {
  const sides = traySides(roll.expression, roll.dice);
  return (
    <ul className="plain board-roll-dice" aria-hidden="true">
      {roll.dice.map((value, i) => {
        const type = dieSidesAt(sides, i);
        return (
          <li key={i} className="board-roll-die" data-sides={type}>
            <svg viewBox="0 0 40 40" className="board-roll-die-shape">
              <polygon points={outlineFor(type)} />
              <text x="20" y={type === 4 ? 28 : 21} textAnchor="middle" dominantBaseline="middle">{value}</text>
            </svg>
            <span className="board-roll-die-type">{t("dice.dieType", { sides: type })}</span>
          </li>
        );
      })}
    </ul>
  );
}
