import { Eye, PencilSimple, TextAa, Trash } from "@phosphor-icons/react";
import { IconAction } from "../ui/IconAction";
import { useEffect, useState, type FormEvent } from "react";
import { MAX_ENCOUNTER_NAME, type EncounterSummary, type LibraryAsset } from "@vtt/shared";
import { MapThumbnail } from "../ui/MapThumbnail";
import { api } from "../net/api";
import { formatRelative } from "../ui/formatRelative";
import { startEncounterEdit } from "./encounterEdit/startEdit";
import { EncounterPreviewModal } from "./EncounterPreviewModal";
import { t } from "../i18n/locale";

/** "3 tokens · 1 fog region", for a template's card and pickers. */
export function encounterSummary(encounter: EncounterSummary): string {
  const tokens = t("encounter.tokensN", { n: encounter.tokenCount });
  const fog = encounter.fogCount > 0 ? t("encounter.fogN", { n: encounter.fogCount }) : "";
  return `${tokens}${fog}`;
}

/** The account's library maps by id, so a template can show its map (no schema change: EncounterSummary carries only mapAssetId). */
export function useLibraryMaps(): Map<string, LibraryAsset> {
  const [maps, setMaps] = useState<Map<string, LibraryAsset>>(new Map());
  useEffect(() => {
    let live = true;
    api.library.list().then(
      (list) => live && setMaps(new Map(list.filter((a) => a.kind === "map").map((a) => [a.id, a]))),
      () => {}, // thumbnails are decoration; the row still works without one
    );
    return () => { live = false; };
  }, []);
  return maps;
}

/** A template's map as a small thumbnail, or an empty frame while it is unknown or deleted. */
export function EncounterThumb({ map }: { map: LibraryAsset | undefined }) {
  return (
    <div className="asset-thumb encounter-thumb" aria-hidden="true">
      {map && <MapThumbnail url={map.url} width={map.width} height={map.height} grid={map.grid} />}
    </div>
  );
}

/**
 * An encounter template in the library's Encounters tab (encounter-templates, FR-GM-13): edit in a
 * temporary room (ADR 0033), rename and delete.
 */
export function EncounterCard(props: {
  encounter: EncounterSummary;
  /** The template's library map, for its preview image. */
  map?: LibraryAsset;
  onChanged: (encounter: EncounterSummary) => void;
  onDeleted: () => void;
}) {
  const { encounter } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(encounter.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === encounter.name) return setEditing(false);
    setBusy(true);
    try {
      props.onChanged(await api.library.encounters.rename(encounter.id, trimmed));
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.renameFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function edit() {
    setBusy(true);
    setError(null);
    try {
      await startEncounterEdit({ templateId: encounter.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("encounter.openFailed"));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.library.encounters.remove(encounter.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.deleteFailed"));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="asset-card encounter-card">
      <EncounterThumb map={props.map} />
      {editing ? (
        <form className="row" onSubmit={(e) => void rename(e)}>
          <label className="grow">
            <span className="sr-only">{t("encounter.templateName")}</span>
            <input value={name} maxLength={MAX_ENCOUNTER_NAME} autoFocus onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <button type="submit" className="small primary" disabled={busy}>{t("common.save")}</button>
          <button type="button" className="secondary small" disabled={busy} onClick={() => { setEditing(false); setName(encounter.name); }}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <strong className="asset-name" title={encounter.name}>{encounter.name}</strong>
      )}
      <span className="muted asset-meta">
        {encounter.mapName ?? t("encounter.mapDeleted")} · {encounterSummary(encounter)}
      </span>
      <span className="muted asset-meta">{t("encounter.saved", { when: formatRelative(encounter.updatedAt) })}</span>
      {encounter.mapName === null && (
        <p role="alert" className="error">{t("encounter.mapDeletedBody")}</p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={t("common.deleteNamedQ", { name: encounter.name })}>
          <p>{t("encounter.deleteBody", { name: encounter.name })}</p>
          <div className="row modal-actions">
            <button type="button" className="secondary small" disabled={busy} onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
            <button type="button" className="small danger-fill" disabled={busy} onClick={() => void remove()}>
              {busy ? t("common.deleting") : t("common.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          {/* A template whose map is gone can't be opened (encounter-templates). */}
          {encounter.mapName !== null && (
            <>
              <IconAction icon={<Eye size={16} aria-hidden="true" />} label={t("common.preview")} disabled={busy} onClick={() => setPreviewing(true)} />
              <IconAction icon={<PencilSimple size={16} aria-hidden="true" />} label={t("common.edit")} disabled={busy} onClick={() => void edit()} />
            </>
          )}
          <IconAction icon={<TextAa size={16} aria-hidden="true" />} label={t("common.rename")} onClick={() => setEditing(true)} />
          <IconAction icon={<Trash size={16} aria-hidden="true" />} label={t("common.delete")} danger onClick={() => setConfirming(true)} />
        </div>
      )}
      <EncounterPreviewModal templateId={previewing ? encounter.id : null} name={encounter.name} onClose={() => setPreviewing(false)} />
    </li>
  );
}
