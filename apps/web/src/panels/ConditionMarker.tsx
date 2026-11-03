import { CONDITIONS, conditionSpec, type ConditionId } from "@vtt/shared";
import { conditionIconUrl } from "../ui/conditionIcon";

/**
 * A condition marker outside the canvas (FR-TAC-08).
 *
 * Mirrors what `boardView` draws: the condition's painted icon. Each icon is its own picture,
 * so the marker reads without colour, and its label is real text for a screen reader.
 */
export function ConditionMarker({ id, size = 22 }: { id: ConditionId; size?: number }) {
  const spec = conditionSpec(id);
  return (
    <span
      className="condition-marker"
      style={{ width: size, height: size }}
      title={spec.label}
      role="img"
      aria-label={spec.label}
    >
      <img src={conditionIconUrl(id)} width={size} height={size} alt="" draggable={false} />
    </span>
  );
}

/** Checkbox grid for choosing a token's conditions. */
export function ConditionPicker({
  value,
  onChange,
  disabled,
  locked = [],
}: {
  value: ConditionId[];
  onChange: (next: ConditionId[]) => void;
  disabled?: boolean;
  /** Shown checked and can't be unchecked, e.g. what a token already has when resolving an area effect (ADR 0046). */
  locked?: readonly ConditionId[];
}) {
  const toggle = (id: ConditionId) =>
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);

  return (
    <fieldset className="condition-picker" disabled={disabled}>
      <legend className="sr-only">Conditions</legend>
      {CONDITIONS.map((c) => (
        <label key={c.id} className={value.includes(c.id) || locked.includes(c.id) ? "condition-option on" : "condition-option"}>
          <input
            type="checkbox"
            checked={value.includes(c.id) || locked.includes(c.id)}
            disabled={locked.includes(c.id)}
            onChange={() => toggle(c.id)}
            aria-label={locked.includes(c.id) ? `${c.label} (already has it)` : c.label}
          />
          <ConditionMarker id={c.id} size={24} />
          <span>{c.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
