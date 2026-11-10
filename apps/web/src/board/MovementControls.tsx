import { useEffect, useId, useState } from "react";
import type { GridSpec } from "@vtt/shared";
import { usePersistentState } from "../ui/usePersistentState";
import { defaultMovementSettings, isMovementSettings, validAllowance, type MovementSettings } from "./movementRuler";

import { t } from "../i18n/locale";
/** Mount keyed by room so preferences never carry across rooms. All settings stay in this browser. */
export function MovementControls({ roomId, grid, onChange }: { roomId: string; grid: GridSpec; onChange: (value: MovementSettings) => void }) {
  const [settings, setSettings] = usePersistentState(`vtt.movement.${roomId}`, defaultMovementSettings(grid), isMovementSettings);
  const [draft, setDraft] = useState(String(settings.allowance));
  const errorId = useId();
  const invalid = draft.trim() === "" || !validAllowance(Number(draft));
  useEffect(() => onChange(settings), [settings, onChange]);
  return <div className="tool-options movement-options" role="group" aria-label={t("move.planner")}>
    <label>{t("move.movement", { unit: grid.unitLabel })}
      <input type="number" min="0" max="100000" step="any" value={draft} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          if (value.trim() && validAllowance(Number(value))) setSettings({ ...settings, allowance: Number(value) });
        }} />
    </label>
    {invalid && <p id={errorId} role="alert">{t("move.invalid")}</p>}
    <label>{t("move.diagonals")}
      <select value={settings.rule} onChange={(e) => {
        const next = { ...settings, rule: e.target.value };
        if (isMovementSettings(next)) setSettings(next);
      }}>
        <option value="equal">{t("move.equal")}</option>
        <option value="alternating">{t("move.alternating")}</option>
        <option value="euclidean">{t("move.euclidean")}</option>
      </select>
    </label>
    <small>{t("move.private")}</small>
  </div>;
}
