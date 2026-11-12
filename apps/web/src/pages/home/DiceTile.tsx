import { useState, type FormEvent } from "react";
import { formatExpression, parseDiceExpression, rollDice, sidesOfDice, type DiceExpression } from "@vtt/shared";
import { DiceTray } from "../../ui/DiceTray";
import { DicePoolInput } from "../../ui/DicePoolInput";
import { diceBreakdown, poolOf, type DicePool } from "../../ui/dicePool";
import { t } from "../../i18n/locale";

type Roll = { id: string; expression: DiceExpression; dice: number[]; total: number };

const cryptoRandom = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
};

/** A small seeded generator (mulberry32), so the tile opens on the same roll every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** The roll the tile opens on, made by the table's roller from a fixed seed (gm-home: "Dice open on a result"). */
export function openingRoll(): Roll {
  const parsed = parseDiceExpression("2d6+3");
  if (!parsed.ok) throw new Error(parsed.message);
  return { id: "opening", expression: parsed.expression, ...rollDice(parsed.expression, seeded(416)) };
}

/** The table's own parser and roller, imported from @vtt/shared and run right here. */
export function DiceTile() {
  const [pool, setPool] = useState<DicePool>(poolOf(6, 2, 3));
  const [result, setResult] = useState<Roll>(openingRoll);
  /** The roll whose dice have come to rest; until then its total is withheld. The opening roll starts at rest. */
  const [landed, setLanded] = useState<string>("opening");

  function roll(e: FormEvent) {
    e.preventDefault();
    // The builder only makes formulas the table's parser takes (dice-pool).
    const parsed = parseDiceExpression(formatExpression(pool));
    if (!parsed.ok) return;
    // The real roll happens now, once. The throw is only how it is shown arriving, in the same
    // 3D tray the table throws its rolls into.
    setResult({ id: `demo-${Math.floor(cryptoRandom() * 2 ** 32)}`, expression: parsed.expression, ...rollDice(parsed.expression, cryptoRandom) });
  }

  const throwing = landed !== result.id;
  const formula = formatExpression(result.expression);

  return (
    <>
      <h4>{t("home.dice.title")}</h4>
      <p>{t("home.dice.body")}</p>
      <form className="dice-demo-form" onSubmit={roll}>
        <DicePoolInput value={pool} onChange={setPool} label={t("home.dice.what")} />
        <button type="submit" className="ui-button">
          {t("home.dice.roll")}
        </button>
      </form>
      <div className="dice-result" aria-live="polite">
        <p className="readout">{formula}</p>
        <DiceTray
          key={result.id}
          roll={{ id: result.id, sides: sidesOfDice(formula, result.dice) ?? 20, dice: result.dice }}
          throwing={throwing}
          onLanded={() => setLanded(result.id)}
        />
        {throwing ? (
          <p className="muted small-print">{t("home.dice.rolling")}</p>
        ) : (
          <p className="dice-line">
            <span className="dice-total">{result.total}</span>
            <span className="muted small-print num">{diceBreakdown({ expression: formula, dice: result.dice, total: result.total })}</span>
          </p>
        )}
      </div>
    </>
  );
}
