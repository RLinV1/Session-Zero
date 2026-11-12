import { Fragment, useEffect, useState } from "react";
import { Minus, Plus, X } from "@phosphor-icons/react";
import { MAX_ATTACK_MODIFIER, MAX_DICE, STANDARD_DIE_SIDES } from "@vtt/shared";
import { addDie, clampPoolModifier, maxCountFor, poolDice, poolReadout, removeDie, setCount, setSides, unusedSides, type DicePool } from "./dicePool";
import { t } from "../i18n/locale";

/**
 * The one dice builder every roll input uses (dice-pool, ADR 0061): a row per die type with a
 * count stepper and a die menu, an optional modifier row, + Die and + Modifier, and the formula
 * it makes. There is no text field for formulas anywhere. Controlled: the caller keeps the pool
 * and sends `poolExpression(pool)`.
 */
export function DicePoolInput({
  value,
  onChange,
  label,
  className,
  focusFirst,
}: {
  value: DicePool;
  onChange: (next: DicePool) => void;
  /** The group's name, e.g. "Damage"; read by screen readers, and shown when `showLabel`. */
  label?: string;
  className?: string;
  /** Marks the first die menu with `data-<name>`, for a section that focuses its first control. */
  focusFirst?: string;
}) {
  const [modifierShown, setModifierShown] = useState(value.modifier !== 0);
  const [modifierText, setModifierText] = useState(String(value.modifier));
  const showModifier = modifierShown || value.modifier !== 0;
  // A new value from outside (a preset, another attack) replaces what is being typed.
  useEffect(() => {
    setModifierText((text) => (clampPoolModifier(Number(text)) === value.modifier && text.trim() !== "" ? text : String(value.modifier)));
  }, [value.modifier]);

  const total = poolDice(value);
  const canAddDie = unusedSides(value).length > 0 && total < MAX_DICE;

  return (
    <fieldset className={["dice-pool", className].filter(Boolean).join(" ")}>
      <legend className="sr-only">{label ?? t("dice.builder")}</legend>
      <ul className="plain dice-pool-rows">
        {value.terms.map((term, index) => {
          const die = `d${term.sides}`;
          const max = maxCountFor(value, index);
          return (
            <Fragment key={index}>
            {/* A small + between rows, so the rows read as one sum. */}
            {index > 0 && <li className="dice-pool-plus" aria-hidden="true">+</li>}
            <li className="dice-pool-row">
              <span className="attack-stepper" role="group" aria-label={t("dice.countOf", { die })}>
                <button type="button" className="icon-button" onClick={() => onChange(setCount(value, index, term.count - 1))} disabled={term.count <= 1} aria-label={t("dice.fewerOf", { die })}>
                  <Minus size={12} aria-hidden="true" />
                </button>
                <output aria-live="polite">{term.count}</output>
                <button type="button" className="icon-button" onClick={() => onChange(setCount(value, index, term.count + 1))} disabled={term.count >= max} aria-label={t("dice.moreOf", { die })}>
                  <Plus size={12} aria-hidden="true" />
                </button>
              </span>
              <span aria-hidden="true" className="muted">×</span>
              <select {...(focusFirst && index === 0 && { [`data-${focusFirst}`]: "" })} value={term.sides} onChange={(e) => onChange(setSides(value, index, Number(e.target.value)))} aria-label={t("dice.typeOf", { n: index + 1 })}>
                {STANDARD_DIE_SIDES.filter((s) => s === term.sides || !value.terms.some((other) => other.sides === s)).map((s) => (
                  <option key={s} value={s}>d{s}</option>
                ))}
              </select>
              {value.terms.length > 1 && (
                <button type="button" className="icon-button dice-pool-remove" onClick={() => onChange(removeDie(value, index))} aria-label={t("dice.removeOf", { die })} title={t("dice.removeOf", { die })}>
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </li>
            </Fragment>
          );
        })}
        {showModifier && <li className="dice-pool-plus" aria-hidden="true">+</li>}
        {showModifier && (
          <li className="dice-pool-row">
            <label className="dice-pool-modifier">
              {/* Named for screen readers only: the + before the row already says what it is. */}
              <span className="sr-only">{t("attack.modifier")}</span>
              <input
                type="number"
                inputMode="numeric"
                value={modifierText}
                min={-MAX_ATTACK_MODIFIER}
                max={MAX_ATTACK_MODIFIER}
                step={1}
                onChange={(e) => {
                  setModifierText(e.target.value);
                  onChange({ ...value, modifier: clampPoolModifier(Number(e.target.value)) });
                }}
                onBlur={() => setModifierText(String(value.modifier))}
              />
            </label>
            <button
              type="button"
              className="icon-button dice-pool-remove"
              onClick={() => { setModifierShown(false); setModifierText("0"); onChange({ ...value, modifier: 0 }); }}
              aria-label={t("dice.removeModifier")}
              title={t("dice.removeModifier")}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
      <div className="dice-pool-actions">
        <button type="button" className="secondary small" disabled={!canAddDie} onClick={() => onChange(addDie(value))}>{t("dice.addDie")}</button>
        <button type="button" className="secondary small" disabled={showModifier} onClick={() => setModifierShown(true)}>{t("dice.addModifier")}</button>
        <output className="dice-pool-readout" aria-label={t("dice.formula")}>{poolReadout(value)}</output>
      </div>
    </fieldset>
  );
}
