import { useState, type KeyboardEvent } from "react";
import type { AssetKind } from "@vtt/shared";
import { DEFAULT_STAGE_ART, type StageSlot } from "../../board/previewStage";
import { LibraryPicker } from "../LibraryPicker";
import { clearAllStagePicks, clearStagePick, pickForStage, type StagePicks } from "./stagePicks";

const SLOTS: ReadonlyArray<{ slot: StageSlot; label: string; kind: AssetKind; defaultUrl: string }> = [
  { slot: "map", label: "Map", kind: "map", defaultUrl: DEFAULT_STAGE_ART.arena },
  { slot: "attacker", label: "Attacker", kind: "token", defaultUrl: DEFAULT_STAGE_ART.attacker },
  { slot: "target", label: "Target", kind: "token", defaultUrl: DEFAULT_STAGE_ART.target },
];

/**
 * The preview toolbar's way into the stage art: the stage's map and two tokens in miniature, so
 * the button shows what it changes and what is on the stage now.
 */
export function StageButton({ picks, open, controls, onToggle }: { picks: StagePicks; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" className="secondary small stage-button" aria-pressed={open} aria-controls={open ? controls : undefined} onClick={onToggle}>
      <span className="stage-button-art" aria-hidden="true">
        <img className="stage-button-map" src={picks.map?.url ?? DEFAULT_STAGE_ART.arena} alt="" />
        <img className="stage-button-token attacker" src={picks.attacker?.url ?? DEFAULT_STAGE_ART.attacker} alt="" />
        <img className="stage-button-token target" src={picks.target?.url ?? DEFAULT_STAGE_ART.target} alt="" />
      </span>
      Map &amp; tokens
    </button>
  );
}

/**
 * Library art for the preview stage: choose a part of the stage, then a map or token art for it.
 * Each pick shows on the stage beside this panel straight away, so the GM can judge the effect
 * against their own table's art. Nothing here changes the animation being edited.
 */
export function StagePanel({ id, picks, onDone }: { id: string; picks: StagePicks; onDone: () => void }) {
  const [slot, setSlot] = useState<StageSlot>("map");
  const current = SLOTS.find((s) => s.slot === slot)!;
  const chosen = picks[slot];
  const anyChosen = SLOTS.some((s) => picks[s.slot] !== null);
  // The panel sits inside the editor's form: Enter in the library search must not save the animation.
  const keepEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  };

  return (
    <div id={id} className="stage-panel" onKeyDown={keepEnter}>
      <div className="stage-slots" role="group" aria-label="Part of the stage">
        {SLOTS.map((s) => (
          <button key={s.slot} type="button" className={`stage-slot ${s.slot}`} aria-pressed={slot === s.slot} onClick={() => setSlot(s.slot)}>
            <img src={picks[s.slot]?.url ?? s.defaultUrl} alt="" className={s.kind === "token" ? "round" : undefined} />
            <span className="stage-slot-label">{s.label}</span>
            <span className="stage-slot-name">{picks[s.slot]?.name ?? "Default"}</span>
          </button>
        ))}
      </div>
      <section className="stage-choice" aria-label={`${current.label} art`}>
        <div className="stage-choice-head">
          <h4>{current.kind === "map" ? "Choose a map" : `Choose the ${current.label.toLowerCase()}'s token`}</h4>
          <button type="button" className="link" disabled={!chosen} onClick={() => clearStagePick(slot)}>Use default</button>
        </div>
        <LibraryPicker key={slot} kind={current.kind} selectedId={chosen?.id ?? null} onPick={(asset) => pickForStage(slot, asset)} />
      </section>
      <div className="stage-panel-actions">
        <button type="button" className="secondary small" disabled={!anyChosen} onClick={clearAllStagePicks}>Reset stage</button>
        <button type="button" className="small primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
