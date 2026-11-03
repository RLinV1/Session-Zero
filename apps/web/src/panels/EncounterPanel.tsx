import { useCallback, useEffect, useState } from "react";
import { MAX_ENCOUNTER_NAME, type EncounterSummary, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { encounterSummary } from "../pages/LibraryEncounters";
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
  const [templates, setTemplates] = useState<EncounterSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<EncounterSummary | null>(null);
  /** Where Save writes: "" for a new template, or the id of a template to replace. */
  const [target, setTarget] = useState("");
  const [confirmingReplace, setConfirmingReplace] = useState<EncounterSummary | null>(null);
  const roomMapId = state.scene.map?.assetId ?? null;
  /** A template can only be replaced from a room on its own map (the server checks too). */
  const sameMap = (t: EncounterSummary) => t.mapAssetId !== null && t.mapAssetId === roomMapId;
  const replacing = templates?.find((t) => t.id === target) ?? null;

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

  const save = async () => {
    if (busy) return;
    if (replacing) return setConfirmingReplace(replacing);
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the template a name.");
    setBusy(true);
    try {
      const saved = await api.library.encounters.save({ roomId: state.roomId, name: trimmed });
      setTemplates((all) => [saved, ...(all ?? [])]);
      setName("");
      setError(null);
      setStatus(`Saved encounter template "${saved.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template");
    } finally {
      setBusy(false);
    }
  };

  const replace = async (template: EncounterSummary) => {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await api.library.encounters.replaceFromRoom(template.id, state.roomId);
      setTemplates((all) => [saved, ...(all ?? []).filter((t) => t.id !== saved.id)]);
      setTarget("");
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
      const result = await connection.command({ type: "encounter.apply", templateId: template.id });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Applied "${template.name}". Undo it from the activity log if that was wrong.`);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <PanelSection id="gm-encounters" title="Encounter templates">
      <p className="muted">Save this room's map, grid, tokens and fog, then reuse it in any of your rooms.</p>
      <form
        className="row checkpoint-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {templates && templates.length > 0 && (
          <label className="checkpoint-name">
            <span className="sr-only">Save to</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
              <option value="">Save as new</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={!sameMap(t)}>
                  Replace {t.name}{sameMap(t) ? "" : " (different map)"}
                </option>
              ))}
            </select>
          </label>
        )}
        {!replacing && (
          <label className="checkpoint-name">
            <span className="sr-only">Encounter name</span>
            <input
              value={name}
              maxLength={MAX_ENCOUNTER_NAME}
              placeholder="Encounter name"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <button type="submit" className="secondary" disabled={busy}>
          {replacing ? "Replace" : "Save"}
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status" className="sr-only">{status}</p>
      {templates === null ? (
        <p className="muted" aria-busy="true">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="muted">No templates yet.</p>
      ) : (
        <ul className="plain checkpoint-list">
          {templates.map((t) => (
            <li key={t.id} className="checkpoint-row">
              <span>
                {t.name} <span className="muted">· {t.mapName === null ? "map deleted" : encounterSummary(t)}</span>
              </span>
              <button
                type="button"
                className="secondary"
                disabled={busy || t.mapName === null}
                aria-label={`Apply ${t.name}`}
                onClick={() => setConfirming(t)}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}
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
              Replace this room's board with <strong>{confirming.name}</strong>? The map, grid, tokens and fog are swapped,
              and a running encounter ends. Chat, dice rolls and players stay. You can undo this from the activity log.
            </p>
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
