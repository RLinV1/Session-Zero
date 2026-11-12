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
import { t } from "../i18n/locale";

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
        setError(err instanceof Error ? err.message : t("library.encountersLoadFailed"));
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
    if (!trimmed) return setError(t("enc.nameRequired"));
    setBusy(true);
    try {
      const saved = await api.library.encounters.save({ roomId: state.roomId, name: trimmed });
      setTemplates((all) => [saved, ...(all ?? [])]);
      closeSave();
      setError(null);
      setStatus(t("enc.saved", { name: saved.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("enc.saveFailed"));
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
      setStatus(t("enc.replaced", { name: saved.name }));
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : t("enc.replaceFailed"));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (template: EncounterSummary) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "encounter.apply", templateId: template.id, ...(keepSetup && canKeepSetup(template) && { keepMapSetup: true }) });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(t(preparing ? "enc.appliedScene" : "enc.applied", { name: template.name }));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <PanelSection
      id="gm-encounters"
      title={t("enc.title")}
      actions={!preparing && (
        <button type="button" className="secondary small encounter-save-btn" aria-label={t("enc.saveAs")} title={t("enc.saveBoard")} onClick={() => setSaveOpen(true)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      )}
    >
      <p className="muted" title={t("enc.savesHint")}>
        {preparing ? t("enc.applyToScene") : t("enc.reuse")}
      </p>
      {error && !saveOpen && <p role="alert" className="error">{error}</p>}
      {/* Visible: Replace has no dialog, so this line is how the GM sees it happened. */}
      <p role="status" className={status ? "muted small-print" : "sr-only"}>{status}</p>
      {templates === null ? (
        <p className="muted" aria-busy="true">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <p className="muted">{t("enc.none")}</p>
      ) : (
        <ul className="plain encounter-list">
          {templates.map((template) => (
            <li key={template.id} className="encounter-row">
              <EncounterThumb map={template.mapAssetId ? maps.get(template.mapAssetId) : undefined} />
              <span className="encounter-row-text">
                <strong>{template.name}</strong>
                <span className="muted">{template.mapName === null ? t("enc.mapDeleted") : encounterSummary(template)}</span>
              </span>
              {!preparing && (
                <button
                  type="button"
                  className="secondary small encounter-replace-btn"
                  disabled={busy || !sameMap(template)}
                  aria-label={t("enc.replaceNamed", { name: template.name })}
                  title={sameMap(template) ? t("enc.replaceWithBoard", { name: template.name }) : t("enc.sameMapOnly")}
                  // Replace saves at once, with no dialog (encounter-templates spec).
                  onClick={() => void replace(template)}
                >
                  <ArrowsClockwise size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="secondary small"
                disabled={busy || template.mapName === null}
                aria-label={t("enc.applyNamed", { name: template.name })}
                title={t("enc.applyNamed", { name: template.name })}
                onClick={() => { setKeepSetup(false); setConfirming(template); }}
              >
                <Play size={16} aria-hidden="true" /> {t("enc.apply")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={saveOpen} title={t("enc.saveTitle")} onClose={closeSave}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="stack">
            <span>{t("encounter.templateName")}</span>
            <input
              autoFocus
              value={name}
              maxLength={MAX_ENCOUNTER_NAME}
              placeholder={t("enc.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <p className="muted">
            {roomMapId
              ? t("enc.savesCount", { n: tokenCount })
              : t("enc.needsMap")}
          </p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={closeSave}>{t("common.cancel")}</button>
            <button type="submit" className="primary" disabled={busy || !roomMapId || !name.trim()}>{t("common.save")}</button>
          </div>
        </form>
      </Modal>
      <Modal className="checkpoint-preview-modal" open={confirming !== null} title={t("enc.applyQ")} onClose={() => setConfirming(null)}>
        {confirming && (
          <div className="stack checkpoint-preview">
            <ApplyPreview templateId={confirming.id} name={confirming.name} />
            <p>
              {preparing ? <>{t("enc.replaceScene")} <strong>{confirming.name}</strong>{t("enc.replaceSceneAfter")}</> : <>{t("enc.replaceRoom")} <strong>{confirming.name}</strong>{t("enc.replaceRoomAfter")}</>}
            </p>
            {canKeepSetup(confirming) && (
              <label className="checkbox">
                <input type="checkbox" checked={keepSetup} disabled={busy} onChange={(e) => setKeepSetup(e.target.checked)} />
                {t("enc.keepMap")}
              </label>
            )}
            <div className="row button-row">
              <button className="primary" type="button" disabled={busy} onClick={() => void apply(confirming)}>
                {t("enc.apply")} {confirming.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>
                {t("common.cancel")}
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
      {!preview && !error && <p className="muted" role="status">{t("checkpoint.loadingBoard")}</p>}
      {preview && (
        <div className="checkpoint-preview-board">
          <EncounterPreviewBoard preview={preview} name={name} />
        </div>
      )}
    </>
  );
}
