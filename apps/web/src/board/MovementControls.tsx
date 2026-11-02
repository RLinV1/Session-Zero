import { useEffect, useId, useState } from "react";
import type { GridSpec } from "@vtt/shared";
import { usePersistentState } from "../ui/usePersistentState";
import { defaultMovementSettings, isMovementSettings, validAllowance, type MovementSettings } from "./movementRuler";

/** Mount keyed by room so preferences never carry across rooms. All settings stay in this browser. */
export function MovementControls({ roomId, grid, onChange }: { roomId: string; grid: GridSpec; onChange: (value: MovementSettings) => void }) {
  const [settings, setSettings] = usePersistentState(`vtt.movement.${roomId}`, defaultMovementSettings(grid), isMovementSettings);
  const [draft, setDraft] = useState(String(settings.allowance));
  const errorId = useId();
  const invalid = draft.trim() === "" || !validAllowance(Number(draft));
  useEffect(() => onChange(settings), [settings, onChange]);
  return <div className="tool-options movement-options" role="group" aria-label="Personal movement planner">
    <label>Movement ({grid.unitLabel})
      <input type="number" min="0" max="100000" step="any" value={draft} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          if (value.trim() && validAllowance(Number(value))) setSettings({ ...settings, allowance: Number(value) });
        }} />
    </label>
    {invalid && <p id={errorId} role="alert">Enter a positive value up to 100,000.</p>}
    <label>Diagonals
      <select value={settings.rule} onChange={(e) => {
        const next = { ...settings, rule: e.target.value };
        if (isMovementSettings(next)) setSettings(next);
      }}>
        <option value="equal">Equal cost</option>
        <option value="alternating">Alternating (1, 2)</option>
        <option value="euclidean">Euclidean</option>
      </select>
    </label>
    <small>Private preview.</small>
  </div>;
}
