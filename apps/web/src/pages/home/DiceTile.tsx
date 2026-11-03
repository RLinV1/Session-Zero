import { useState, type FormEvent } from "react";
import { formatExpression, parseDiceExpression, rollDice, type DiceExpression } from "@vtt/shared";
import { DiceTray } from "../../ui/DiceTray";

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
  const [input, setInput] = useState("2d6+3");
  const [result, setResult] = useState<Roll>(openingRoll);
  const [error, setError] = useState<string | null>(null);
  /** The roll whose dice have come to rest; until then its total is withheld. The opening roll starts at rest. */
  const [landed, setLanded] = useState<string>("opening");

  function roll(e: FormEvent) {
    e.preventDefault();
    const parsed = parseDiceExpression(input);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    // The real roll happens now, once. The throw is only how it is shown arriving, in the same
    // 3D tray the table throws its rolls into.
    setResult({ id: `demo-${Math.floor(cryptoRandom() * 2 ** 32)}`, expression: parsed.expression, ...rollDice(parsed.expression, cryptoRandom) });
  }

  const throwing = landed !== result.id;
  const modifier = result.expression.modifier;

  return (
    <>
      <h4>Dice</h4>
      <p>Type a roll like 2d6+3. Everyone at the table sees every die land, not just the total.</p>
      <form className="dice-demo-form" onSubmit={roll}>
        <label>
          What to roll
          <input
            id="home-dice-expression"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={32}
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "home-dice-error" : undefined}
          />
        </label>
        <button type="submit" className="ui-button">
          Roll
        </button>
        {error && (
          <p id="home-dice-error" role="alert" className="error">
            {error}
          </p>
        )}
      </form>
      <div className="dice-result" aria-live="polite">
        <p className="readout">{formatExpression(result.expression)}</p>
        <DiceTray
          key={result.id}
          roll={{ id: result.id, sides: result.expression.sides, dice: result.dice }}
          throwing={throwing}
          onLanded={() => setLanded(result.id)}
        />
        {throwing ? (
          <p className="muted small-print">Rolling…</p>
        ) : (
          <p className="dice-line">
            <span className="dice-total">{result.total}</span>
            <span className="muted small-print num">
              {result.dice.join(" + ")}
              {modifier !== 0 && ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`}
            </span>
          </p>
        )}
      </div>
    </>
  );
}
