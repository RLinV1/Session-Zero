import { useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { previewConnection } from "../net/previewConnection";
import { MAX_CHECKPOINT_NAME, type Checkpoint, type CheckpointPreviewResponse, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { t } from "../i18n/locale";

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
        if (!controller.signal.aborted) setPreviewError(err instanceof Error ? err.message : t("checkpoint.loadFailed"));
      },
    );
    return () => controller.abort();
  }, [previewing, state.roomId, token]);

  const save = async () => {
    if (busy) return; // Enter pressed twice must not save two checkpoints.
    const trimmed = name.trim();
    if (!trimmed) return setError(t("checkpoint.nameRequired"));
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.create", name: trimmed });
      setError(result.ok ? null : result.message);
      if (result.ok) {
        setName("");
        setStatus(t("checkpoint.saved", { name: trimmed }));
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
      if (result.ok) setStatus(t("checkpoint.restored", { name: checkpoint.name }));
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
      if (result.ok) setStatus(t("checkpoint.deleted", { name: checkpoint.name }));
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
    <PanelSection id="gm-checkpoints" title={t("checkpoint.title")}>
      <p className="muted">{t("checkpoint.intro")}</p>
      <form
        className="row checkpoint-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="checkpoint-name">
          <span className="sr-only">{t("checkpoint.name")}</span>
          <input
            value={name}
            maxLength={MAX_CHECKPOINT_NAME}
            placeholder={t("checkpoint.name")}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="secondary" disabled={busy}>
          {t("common.save")}
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status" className="sr-only">{status}</p>
      {newestFirst.length === 0 ? (
        <p className="muted">{t("checkpoint.none")}</p>
      ) : (
        <ul className="plain checkpoint-list">
          {newestFirst.map((c) => (
            <li key={c.id} className="checkpoint-row">
              <span>{c.name}</span>
              <span className="row checkpoint-actions">
                <button type="button" className="secondary" disabled={busy} aria-label={t("checkpoint.restoreNamed", { name: c.name })} onClick={() => setPreviewing(c)}>
                  {t("checkpoint.restore")}
                </button>
                <button type="button" className="secondary" disabled={busy} aria-label={t("common.deleteNamed", { name: c.name })} onClick={() => setDeleting(c)}>
                  {t("common.delete")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal className="checkpoint-preview-modal" open={previewing !== null} title={previewing ? t("checkpoint.previewNamed", { name: previewing.name }) : t("common.preview")} onClose={() => setPreviewing(null)}>
        {previewing && (
          <div className="stack checkpoint-preview">
            <p className="checkpoint-preview-banner" role="note">
              <strong>{t("checkpoint.viewOnly")}</strong> {t("checkpoint.previewBody", { name: previewing.name })}
            </p>
            {previewError && <p role="alert" className="error">{previewError}</p>}
            {!previewState && !previewError && <p className="muted" role="status">{t("checkpoint.loadingBoard")}</p>}
            {previewState && gm && readOnlyConnection && (
              <div className="checkpoint-preview-board">
                <Board connection={readOnlyConnection} state={previewState} you={gm} gridPreview={null} readOnly suppressLiveEffects />
              </div>
            )}
            <div className="row button-row">
              <button type="button" className="secondary" onClick={() => setPreviewing(null)}>
                {t("common.cancel")}
              </button>
              <button className="primary" type="button" disabled={busy || (!previewState && !previewError)} onClick={() => void restore(previewing)}>
                {t("checkpoint.restoreNamed", { name: previewing.name })}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={deleting !== null} title={t("checkpoint.deleteQ")} onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="stack">
            <p>
              {t("checkpoint.deleteBefore")} <strong>{deleting.name}</strong>{t("checkpoint.deleteAfter")}
            </p>
            <div className="row button-row">
              <button className="primary" type="button" disabled={busy} onClick={() => void remove(deleting)}>
                {t("common.delete")} {deleting.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PanelSection>
  );
}
