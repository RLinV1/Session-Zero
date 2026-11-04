import { ArrowsClockwise, Plus, Play } from "@phosphor-icons/react";
import { useCallback, useContext, useEffect, useState } from "react";
import { MAX_ENCOUNTER_NAME, gridGeometryChanged, type EncounterSummary, type RoomState } from "@vtt/shared";
import { ScenePreparationContext } from "./ScenePreparationContext";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { EncounterThumb, encounterSummary, useLibraryMaps } from "../pages/LibraryEncounters";
import { EncounterPreviewBoard, useEncounterPreview } from "../pages/EncounterPreviewModal";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/**
 * Encounter templates (FR-GM-13, ADR 0024): the GM saves this room's prepared board to their
 * library and applies a saved one here. Applying replaces the map, grid, tokens and fog and ends
 * any running encounter; chat, rolls and players stay, and it can be undone from the activity log.
 * Saving can also replace one of the GM's templates, keeping its id and name (ADR 0033), when this
 * room uses that template's map.
 * The list is the account's, so a GM without an account just doesn't see the panel's actions.
 */
export function EncounterPanel({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const preparing = useContext(ScenePreparationContext)?.preparing ?? false;
  const [templates, setTemplates] = useState<EncounterSummary[] | null>(null);
  const [name, setName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<EncounterSummary | null>(null);
  const [keepSetup, setKeepSetup] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState<EncounterSummary | null>(null);
  const maps = useLibraryMaps();
  const tokenCount = Object.keys(state.tokens).length;
  const roomMapId = state.scene.map?.assetId ?? null;
  /** A template can only be replaced from a room on its own map (the server checks too). */
  const sameMap = (t: EncounterSummary) => t.mapAssetId !== null && t.mapAssetId === roomMapId;

  /** The keep-setup option is offered only on the template's own map and grid (a hint; the server checks, ADR 0050). */
  const canKeepSetup = (t: EncounterSummary) => sameMap(t) && t.grid !== undefined && !gridGeometryChanged(state.scene.grid, t.grid);

  const refresh = useCallback(() => {
    api.library.encounters.list().then(
      (list) => setTemplates(list),
      (err: unknown) => {
        setTemplates([]);
        setError(err instanceof Error ? err.message : "Could not load your encounter templates");
      },
    );
  }, []);
  useEffect(refresh, [refresh]);

  const closeSave = () => {
    setSaveOpen(false);
    setName("");
  };

  const save = async () => {
    if (busy || preparing) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the template a name.");
    setBusy(true);
    try {
      const saved = await api.library.encounters.save({ roomId: state.roomId, name: trimmed });
      setTemplates((all) => [saved, ...(all ?? [])]);
      closeSave();
      setError(null);
      setStatus(`Saved encounter template "${saved.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template");
    } finally {
      setBusy(false);
    }
  };

  const replace = async (template: EncounterSummary) => {
    if (busy || preparing) return;
    setBusy(true);
    try {
      const saved = await api.library.encounters.replaceFromRoom(template.id, state.roomId);
      setTemplates((all) => [saved, ...(all ?? []).filter((t) => t.id !== saved.id)]);
      setError(null);
      setStatus(`Replaced encounter template "${saved.name}" with this room's board.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace the template");
    } finally {
      setBusy(false);
      setConfirmingReplace(null);
    }
  };

  const apply = async (template: EncounterSummary) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "encounter.apply", templateId: template.id, ...(keepSetup && canKeepSetup(template) && { keepMapSetup: true }) });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Applied "${template.name}"${preparing ? " to the private scene." : ". Undo it from the activity log if that was wrong."}`);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <PanelSection
      id="gm-encounters"
      title="Encounter templates"
      actions={!preparing && (
        <button type="button" className="secondary small encounter-save-btn" aria-label="Save as template" title="Save this board as a template" onClick={() => setSaveOpen(true)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      )}
    >
      <p className="muted" title="Saves this room's map, grid, tokens and fog so you can reuse it in any of your rooms.">
        {preparing ? "Apply a template to this private scene." : "Reuse a prepared board in any room."}
      </p>
      {error && !saveOpen && <p role="alert" className="error">{error}</p>}
      <p role="status" className="sr-only">{status}</p>
      {templates === null ? (
        <p className="muted" aria-busy="true">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="muted">No templates yet. Use + above to save this board as your first one.</p>
      ) : (
        <ul className="plain encounter-list">
          {templates.map((t) => (
            <li key={t.id} className="encounter-row">
              <EncounterThumb map={t.mapAssetId ? maps.get(t.mapAssetId) : undefined} />
              <span className="encounter-row-text">
                <strong>{t.name}</strong>
                <span className="muted">{t.mapName === null ? "map deleted" : encounterSummary(t)}</span>
              </span>
              {!preparing && (
                <button
                  type="button"
                  className="secondary small encounter-replace-btn"
                  disabled={busy || !sameMap(t)}
                  aria-label={`Replace ${t.name}`}
                  title={sameMap(t) ? `Replace ${t.name} with this room's board` : "Only available in a room on this template's map"}
                  onClick={() => setConfirmingReplace(t)}
                >
                  <ArrowsClockwise size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="secondary small"
                disabled={busy || t.mapName === null}
                aria-label={`Apply ${t.name}`}
                title={`Apply ${t.name}`}
                onClick={() => { setKeepSetup(false); setConfirming(t); }}
              >
                <Play size={16} aria-hidden="true" /> Apply
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={saveOpen} title="Save encounter template" onClose={closeSave}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="stack">
            <span>Template name</span>
            <input
              autoFocus
              value={name}
              maxLength={MAX_ENCOUNTER_NAME}
              placeholder="Encounter name"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <p className="muted">
            {roomMapId
              ? `Saves this room's map, grid, ${tokenCount} token${tokenCount === 1 ? "" : "s"} and fog. To overwrite an existing template, use its Replace button in the list.`
              : "Add a map from your library to this room first. A template is saved on a map."}
          </p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={closeSave}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || !roomMapId || !name.trim()}>Save</button>
          </div>
        </form>
      </Modal>
      <Modal open={confirmingReplace !== null} title="Replace encounter template?" onClose={() => setConfirmingReplace(null)}>
        {confirmingReplace && (
          <div className="stack">
            <p>
              Replace <strong>{confirmingReplace.name}</strong> with this room's map, grid, tokens and fog? Its name stays,
              and rooms already made from it don't change.
            </p>
            <div className="row button-row">
              <button className="primary" type="button" disabled={busy} onClick={() => void replace(confirmingReplace)}>
                Replace {confirmingReplace.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmingReplace(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal className="checkpoint-preview-modal" open={confirming !== null} title="Apply encounter template?" onClose={() => setConfirming(null)}>
        {confirming && (
          <div className="stack checkpoint-preview">
            <ApplyPreview templateId={confirming.id} name={confirming.name} />
            <p>
              {preparing ? <>Replace this private scene with <strong>{confirming.name}</strong>? Players stay on the live scene.</> : <>Replace this room’s board with <strong>{confirming.name}</strong>? The map, grid, tokens and fog are swapped, and a running encounter ends. Chat, dice rolls and players stay. You can undo this from the activity log.</>}
            </p>
            {canKeepSetup(confirming) && (
              <label className="checkbox">
                <input type="checkbox" checked={keepSetup} disabled={busy} onChange={(e) => setKeepSetup(e.target.checked)} />
                Keep this map's walls, fog, terrain and lighting
              </label>
            )}
            <div className="row button-row">
              <button className="primary" type="button" disabled={busy} onClick={() => void apply(confirming)}>
                Apply {confirming.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PanelSection>
  );
}

/** The template's saved board, shown above the Apply question so the GM sees what will replace the room's. */
function ApplyPreview({ templateId, name }: { templateId: string; name: string }) {
  const { preview, error } = useEncounterPreview(templateId);
  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      {!preview && !error && <p className="muted" role="status">Loading the saved board…</p>}
      {preview && (
        <div className="checkpoint-preview-board">
          <EncounterPreviewBoard preview={preview} name={name} />
        </div>
      )}
    </>
  );
}
