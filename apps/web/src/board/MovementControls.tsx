import { usePersistentState } from "../ui/usePersistentState";
import { isMeasureMode, type MeasureMode } from "./tools";
import { t, type TextId } from "../i18n/locale";

/** The ruler's Range/Movement mode, remembered in this browser for every room (ruler-modes). */
export function useRulerMode() {
  return usePersistentState<MeasureMode>("vtt.ruler.mode", "range", isMeasureMode);
}

const MODES: { mode: MeasureMode; label: TextId }[] = [
  { mode: "range", label: "move.rangeMode" },
  { mode: "movement", label: "move.movementMode" },
];

/** The Measure tool's options: Range or Movement. Measurements show their length only and stay in this browser. */
export function MovementControls({ mode, onMode }: { mode: MeasureMode; onMode: (mode: MeasureMode) => void }) {
  return <div className="tool-options movement-options" role="group" aria-label={t("move.measureOptions")}>
    <div className="tool-segmented ruler-modes" role="group" aria-label={t("move.rulerMode")}>
      {MODES.map((m) => (
        <button key={m.mode} type="button" className="tool-button rail-button" aria-pressed={mode === m.mode} onClick={() => onMode(m.mode)}>
          {t(m.label)}
        </button>
      ))}
    </div>
    <small>{t("move.private")}</small>
  </div>;
}
