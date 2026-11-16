import { Eraser, Mountains, Prohibit, Question, Trash, PaintBrush, Keyboard } from "@phosphor-icons/react";
import { PopoverButton } from "../../ui/Popover";
import { terrainTally, type TerrainRun } from "@vtt/shared";

export function TerrainReview({ runs, kind, onKind, onSave, onCancel, onDiscard, otherGrid, busy, editable }: {
  runs: readonly TerrainRun[]; kind: TerrainRun["kind"] | null | undefined;
  onKind: (kind: TerrainRun["kind"] | null | undefined) => void;
  onSave: () => void; onCancel: () => void; busy: boolean; editable: boolean;
  onDiscard: () => void; otherGrid: boolean;
}) {
  const tally = terrainTally(runs);
  return <section className="build-walls" aria-label="Review terrain">
    <div className="terrain-head">
      <h4>Terrain</h4>
      <PopoverButton label="Terrain guide" title="Terrain guide" align="right" placement="fixed" className="terrain-icon" buttonContent={<Question size={18} aria-hidden />}>
        <ul className="terrain-guide">
          <li><PaintBrush aria-hidden /><span>Select a paint type, then click or drag over squares. Select it again to stop.</span></li>
          <li><Mountains aria-hidden /><span>Violet is Difficult (double movement cost). Red is Blocked. Normal erases terrain.</span></li>
          <li><Keyboard aria-hidden /><span>Use arrow keys on the map and Enter to paint. Save applies changes; Cancel restores the saved terrain.</span></li>
        </ul>
      </PopoverButton>
    </div>
    <p className="muted small-print">{tally.difficult} Difficult &middot; {tally.blocked} Blocked</p>
    {otherGrid && <p className="build-blocked" role="status">Suggestions use another grid. Restore it, or clear terrain and save before repainting.</p>}
    {editable && <>
      <fieldset className="terrain-controls" disabled={busy || otherGrid}>
        <div className="terrain-group">
          <span className="terrain-group-label" aria-hidden>Paint</span>
          <div className="terrain-seg" role="group" aria-label="Paint terrain">
            {([[null, "Normal", Eraser], ["difficult", "Difficult", Mountains], ["blocked", "Blocked", Prohibit]] as const).map(([value, label, Icon]) => <button key={label} type="button" className={`terrain-icon terrain-kind-${value ?? "normal"}`} aria-label={label} title={label} aria-pressed={kind === value} onClick={() => onKind(kind === value ? undefined : value)}><Icon size={20} aria-hidden />{value === "difficult" && <sup>×2</sup>}</button>)}
          </div>
        </div>
      </fieldset>
      <div className="row build-editor-actions"><button type="button" className="small primary" disabled={busy} onClick={onSave}>Save</button><button type="button" className="small" disabled={busy} onClick={onCancel}>Cancel</button></div>
      {runs.length > 0 && <div className="build-reset-setup build-editor-actions"><button type="button" className="small build-text-action" disabled={busy} onClick={onDiscard}><Trash size={15} aria-hidden />Clear terrain</button></div>}
    </>}
  </section>;
}
