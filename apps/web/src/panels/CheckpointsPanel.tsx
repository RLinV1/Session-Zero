import { useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { previewConnection } from "../net/previewConnection";
import { MAX_CHECKPOINT_NAME, type Checkpoint, type CheckpointPreviewResponse, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/**
 * Named checkpoints (KAN-41, FR-REC-02, ADR 0019, ADR 0036): the GM saves the board under a name,
 * looks at what a checkpoint holds, puts it back later, or deletes it. Restoring resets the map,
 * tokens, areas, fog and initiative, never chat or rolls, and can itself be undone from the
 * activity log. Deleting only removes the bookmark. GM-only: players never get the list.
 */
export function CheckpointsPanel({ connection, state, token }: { connection: RoomConnection; state: RoomState; token: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<Checkpoint | null>(null);
  const [previewing, setPreviewing] = useState<Checkpoint | null>(null);
  const [preview, setPreview] = useState<CheckpointPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const newestFirst = [...state.checkpoints].reverse();

  // The saved board is read from the server (a replay of the log), only while its preview is open.
  useEffect(() => {
    if (!previewing) return;
    const controller = new AbortController();
    setPreview(null);
    setPreviewError(null);
    api.checkpointPreview(state.roomId, token, previewing.id, controller.signal).then(
      setPreview,
      (err: unknown) => {
        if (!controller.signal.aborted) setPreviewError(err instanceof Error ? err.message : "Couldn't load that checkpoint.");
      },
    );
    return () => controller.abort();
  }, [previewing, state.roomId, token]);

  const save = async () => {
    if (busy) return; // Enter pressed twice must not save two checkpoints.
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the checkpoint a name.");
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.create", name: trimmed });
      setError(result.ok ? null : result.message);
      if (result.ok) {
        setName("");
        setStatus(`Saved checkpoint "${trimmed}".`);
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async (checkpoint: Checkpoint) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.restore", checkpointId: checkpoint.id });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Restored checkpoint "${checkpoint.name}". Undo it from the activity log if that was wrong.`);
    } finally {
      setBusy(false);
      setPreviewing(null);
    }
  };

  const remove = async (checkpoint: Checkpoint) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.delete", checkpointId: checkpoint.id });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Deleted checkpoint "${checkpoint.name}".`);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  // The saved table drawn on the real board: the live room's people and chat, the checkpoint's map, tokens, areas, fog, walls and initiative.
  const previewState = useMemo<RoomState | null>(
    () => (preview ? { ...state, ...preview.table, walls: preview.table.walls ?? {} } : null),
    [preview, state],
  );
  const gm = Object.values(state.participants).find((p) => p.role === "gm") ?? null;
  const readOnlyConnection = useMemo(() => previewConnection(connection, "a checkpoint preview"), [connection]);

  return (
    <PanelSection id="gm-checkpoints" title="Checkpoints">
      <p className="muted">Save the board now and put it back later. Chat and dice rolls are kept.</p>
      <form
        className="row checkpoint-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="checkpoint-name">
          <span className="sr-only">Checkpoint name</span>
          <input
            value={name}
            maxLength={MAX_CHECKPOINT_NAME}
            placeholder="Checkpoint name"
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="secondary" disabled={busy}>
          Save
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status" className="sr-only">{status}</p>
      {newestFirst.length === 0 ? (
        <p className="muted">No checkpoints yet.</p>
      ) : (
        <ul className="plain checkpoint-list">
          {newestFirst.map((c) => (
            <li key={c.id} className="checkpoint-row">
              <span>{c.name}</span>
              <span className="row checkpoint-actions">
                <button type="button" className="secondary" disabled={busy} aria-label={`Restore ${c.name}`} onClick={() => setPreviewing(c)}>
                  Restore
                </button>
                <button type="button" className="secondary" disabled={busy} aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal className="checkpoint-preview-modal" open={previewing !== null} title={previewing ? `Preview: ${previewing.name}` : "Preview"} onClose={() => setPreviewing(null)}>
        {previewing && (
          <div className="stack checkpoint-preview">
            <p className="checkpoint-preview-banner" role="note">
              <strong>Preview · View only.</strong> This is the table as it was when "{previewing.name}" was saved. Restoring puts the map, tokens, areas, fog and initiative back to this; chat and dice rolls stay, and you can undo it from the activity log. Nothing changes until you restore.
            </p>
            {previewError && <p role="alert" className="error">{previewError}</p>}
            {!previewState && !previewError && <p className="muted" role="status">Loading the saved board…</p>}
            {previewState && gm && readOnlyConnection && (
              <div className="checkpoint-preview-board">
                <Board connection={readOnlyConnection} state={previewState} you={gm} gridPreview={null} readOnly suppressLiveEffects />
              </div>
            )}
            <div className="row button-row">
              <button type="button" className="secondary" onClick={() => setPreviewing(null)}>
                Cancel
              </button>
              <button className="primary" type="button" disabled={busy || (!previewState && !previewError)} onClick={() => void restore(previewing)}>
                Restore {previewing.name}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={deleting !== null} title="Delete checkpoint?" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="stack">
            <p>
              Delete <strong>{deleting.name}</strong>? The board stays as it is, but this checkpoint can't be restored
              afterwards, and deleting it can't be undone.
            </p>
            <div className="row button-row">
              <button className="primary" type="button" disabled={busy} onClick={() => void remove(deleting)}>
                Delete {deleting.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PanelSection>
  );
}
