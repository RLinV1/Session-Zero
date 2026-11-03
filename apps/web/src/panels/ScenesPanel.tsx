import { useContext, useState } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { INITIAL_SCENE_ID, MAX_SCENES, MAX_SCENE_NAME, sceneNamesOf, type CommandInput, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { ScenePreparationContext } from "./ScenePreparationContext";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

interface Props { state: RoomState; connection: RoomConnection }

function useSceneCommand(connection: RoomConnection) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (command: CommandInput) => {
    setBusy(true);
    setError(null);
    try {
      const result = await connection.command(command);
      if (!result.ok) setError(result.message);
      return result.ok;
    } catch {
      setError("Could not change scenes. Check your connection and try again.");
      return false;
    } finally { setBusy(false); }
  };
  return { busy, error, run };
}

/** Always within reach of the GM, even with the Manage panel closed. */
export function SceneSwitcher({ state }: Props) {
  const preparation = useContext(ScenePreparationContext);
  const viewed = state.activeSceneId ?? INITIAL_SCENE_ID;
  return <div className="scene-switcher">
    <select aria-label="Viewing scene" title="Preview a scene privately"
      value={viewed} onChange={(event) => preparation?.preview(event.target.value)}>
      {Object.entries(sceneNamesOf(state)).map(([id, name]) => <option key={id} value={id}>{name}{id === (preparation?.activeId ?? viewed) ? " · Live" : ""}</option>)}
    </select>
  </div>;
}

/** A nonmodal popup leaves the private board available for preparation. */
export function SceneActivationNotice({ state, connection }: Props) {
  const preparation = useContext(ScenePreparationContext);
  const { busy, error, run } = useSceneCommand(connection);
  if (!preparation?.preparing) return null;
  return <section className="scene-activation-popup" aria-label="Scene activation">
    <div>
      <p>This is not the active scene.</p>
      <span>Activate to start this scene for everyone.</span>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
    <button type="button" disabled={busy} onClick={() => { void run({ type: "scene.switch", sceneId: state.activeSceneId ?? INITIAL_SCENE_ID }); }}>Activate</button>
  </section>;
}

/** Live locations complement reusable templates and recovery checkpoints (ADR 0045). */
export function ScenesPanel({ state, connection }: Props) {
  const { busy, error, run } = useSceneCommand(connection);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const preparation = useContext(ScenePreparationContext);
  const names = sceneNamesOf(state);
  const active = state.activeSceneId ?? INITIAL_SCENE_ID;
  const full = Object.keys(names).length >= MAX_SCENES;
  return <PanelSection id="scenes" title="Scenes">
    <p className="small-print">Prepare privately. Activate when ready.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <ul className="plain scene-list">
      {Object.entries(names).map(([id, sceneName]) => <li key={id} className="scene-row">
        <button type="button" className="secondary scene-name" disabled={busy || id === active}
          aria-label={`Preview ${sceneName}`} aria-current={id === active ? "true" : undefined}
          onClick={() => preparation?.preview(id)}>
          {sceneName}{id === (preparation?.activeId ?? active) && <span className="muted"> · Live</span>}
        </button>
        <button type="button" className="icon-button" aria-label={`Rename ${sceneName}`} title="Rename scene" disabled={busy}
          onClick={() => { setDraft(sceneName); setEditing(id); }}><PencilSimple size={16} aria-hidden="true" /></button>
        <button type="button" className="icon-button" aria-label={`Delete ${sceneName}`} title="Delete scene" disabled={busy || id === (preparation?.activeId ?? active)}
          onClick={() => setDeleting(id)}><Trash size={16} aria-hidden="true" /></button>
      </li>)}
    </ul>
    <form className="scene-create" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim() && !busy && !full) void run({ type: "scene.create", name: name.trim(), activate: false }).then((ok) => { if (ok) setName(""); });
    }}>
      <label>New scene name<input value={name} maxLength={MAX_SCENE_NAME} placeholder="Scene name" disabled={busy || full}
        onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" className="icon-button" aria-label="Create scene" title="Create scene" disabled={busy || full || !name.trim()}><Plus size={18} aria-hidden="true" /></button>
    </form>
    <p className="small-print">Start with a map or encounter template. {full && `${MAX_SCENES}-scene limit reached.`}</p>
    <Modal open={editing !== null} title="Rename scene" onClose={() => { if (!busy) setEditing(null); }}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (editing && draft.trim() && !busy) void run({ type: "scene.rename", sceneId: editing, name: draft.trim() }).then((ok) => { if (ok) setEditing(null); });
      }}>
        <label>Scene name<input value={draft} maxLength={MAX_SCENE_NAME} onChange={(event) => setDraft(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !draft.trim()}>Save name</button>
      </form>
    </Modal>
    <Modal open={deleting !== null} title="Delete scene" onClose={() => { if (!busy) setDeleting(null); }}>
      <p>Delete “{deleting ? names[deleting] : ""}” and its saved board? Other scenes and encounter templates will remain.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">
        <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => {
          if (deleting) void run({ type: "scene.delete", sceneId: deleting }).then((ok) => { if (ok) setDeleting(null); });
        }}>Delete scene</button>
      </div>
    </Modal>
  </PanelSection>;
}
