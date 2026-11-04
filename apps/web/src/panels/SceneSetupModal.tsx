import { useEffect, useState } from "react";
import { CaretRight, Copy, Image, SquaresFour } from "@phosphor-icons/react";
import type { CommandInput, EncounterSummary, RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

/** New scenes are private; choosing their starting content never activates them. */
export function SceneSetupModal({ open, state, connection, onClose, onChooseMap }: {
  open: boolean; state: RoomState; connection: RoomConnection; onClose: () => void; onChooseMap: () => void;
}) {
  const [choice, setChoice] = useState<"template" | null>(null);
  const [templates, setTemplates] = useState<EncounterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapRequested, setMapRequested] = useState(false);
  useEffect(() => {
    if (!open || choice !== "template") return;
    let current = true;
    api.library.encounters.list().then(
      (items) => { if (current) { setTemplates(items); setError(null); } },
      (err: unknown) => { if (current) setError(err instanceof Error ? err.message : "Could not load encounter templates."); },
    );
    return () => { current = false; };
  }, [open, choice]);
  const apply = async (command: CommandInput) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await connection.command(command);
      if (result.ok) onClose(); else setError(result.message);
    } catch { setError("Could not set up this scene. Try again."); }
    finally { setBusy(false); }
  };
  return <Modal className="scene-setup" open={open} title="Prepare scene" onClose={() => { if (!busy) onClose(); }} onAfterClose={() => {
    if (mapRequested) { setMapRequested(false); onChooseMap(); }
  }}>
    <p className="muted">Private until you activate.</p>
    <div className="scene-setup-choices">
      <button type="button" className="secondary" aria-label="Current map" title="Copy the live map, tokens and progress" disabled={busy} onClick={() => void apply({ type: "scene.copyCurrent", sceneId: state.activeSceneId ?? "initial" })}><Copy size={18} aria-hidden="true" /><span>Current map<small>Copy the live board and progress</small></span><CaretRight size={14} aria-hidden="true" /></button>
      <button type="button" className="secondary" aria-label="Encounter template" aria-pressed={choice === "template"} disabled={busy} onClick={() => { setChoice("template"); setError(null); }}><SquaresFour size={18} aria-hidden="true" /><span>Encounter template<small>Start from a saved encounter</small></span><CaretRight size={14} aria-hidden="true" /></button>
      <button type="button" className="secondary" aria-label="Map" disabled={busy} onClick={() => { setMapRequested(true); onClose(); }}><Image size={18} aria-hidden="true" /><span>Map<small>Choose a new location</small></span><CaretRight size={14} aria-hidden="true" /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {choice === "template" && <div className="stack">
      <h3>Encounter templates</h3>
      {templates === null ? !error && <p aria-busy="true">Loading…</p> : templates.length === 0 ? <p className="muted">No encounter templates yet.</p> : <ul className="plain checkpoint-list">{templates.map((template) => <li key={template.id} className="checkpoint-row"><span>{template.name}</span><button type="button" disabled={busy || template.mapName === null} aria-label={`Apply ${template.name}`} onClick={() => void apply({ type: "encounter.apply", templateId: template.id })}>Apply</button></li>)}</ul>}
    </div>}
  </Modal>;
}
