import { useEffect, useState } from "react";
import { CaretRight, Copy, Image, SquaresFour } from "@phosphor-icons/react";
import type { CommandInput, EncounterSummary, RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { FreeAccountNote, useGuestRoom } from "../ui/GuestRoom";
import { Modal } from "../ui/Modal";
import { t } from "../i18n/locale";

/** New scenes are private; choosing their starting content never activates them. */
export function SceneSetupModal({ open, state, connection, onClose, onChooseMap }: {
  open: boolean; state: RoomState; connection: RoomConnection; onClose: () => void; onChooseMap: () => void;
}) {
  // Templates are an account's (guest-gm-hosting): a guest room gets the sign-up where the template choice is.
  const guest = useGuestRoom();
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
      (err: unknown) => { if (current) setError(err instanceof Error ? err.message : t("sceneSetup.loadFailed")); },
    );
    return () => { current = false; };
  }, [open, choice]);
  const apply = async (command: CommandInput) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await connection.command(command);
      if (result.ok) onClose(); else setError(result.message);
    } catch { setError(t("sceneSetup.failed")); }
    finally { setBusy(false); }
  };
  return <Modal className="scene-setup" open={open} title={t("sceneSetup.title")} onClose={() => { if (!busy) onClose(); }} onAfterClose={() => {
    if (mapRequested) { setMapRequested(false); onChooseMap(); }
  }}>
    <p className="muted">{t("sceneSetup.private")}</p>
    <div className="scene-setup-choices">
      <button type="button" className="secondary" aria-label={t("sceneSetup.currentMap")} title={t("sceneSetup.copyLiveHint")} disabled={busy} onClick={() => void apply({ type: "scene.copyCurrent", sceneId: state.activeSceneId ?? "initial" })}><Copy size={18} aria-hidden="true" /><span>{t("sceneSetup.currentMap")}<small>{t("sceneSetup.copyLive")}</small></span><CaretRight size={14} aria-hidden="true" /></button>
      {guest ? <FreeAccountNote /> : <button type="button" className="secondary" aria-label={t("encounterEdit.template")} aria-pressed={choice === "template"} disabled={busy} onClick={() => { setChoice("template"); setError(null); }}><SquaresFour size={18} aria-hidden="true" /><span>{t("encounterEdit.template")}<small>{t("sceneSetup.fromEncounter")}</small></span><CaretRight size={14} aria-hidden="true" /></button>}
      <button type="button" className="secondary" aria-label={t("common.map")} disabled={busy} onClick={() => { setMapRequested(true); onClose(); }}><Image size={18} aria-hidden="true" /><span>{t("common.map")}<small>{t("sceneSetup.newLocation")}</small></span><CaretRight size={14} aria-hidden="true" /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {choice === "template" && <div className="stack">
      <h3>{t("enc.title")}</h3>
      {templates === null ? !error && <p aria-busy="true">{t("common.loading")}</p> : templates.length === 0 ? <p className="muted">{t("sceneSetup.noTemplates")}</p> : <ul className="plain checkpoint-list">{templates.map((template) => <li key={template.id} className="checkpoint-row"><span>{template.name}</span><button type="button" disabled={busy || template.mapName === null} aria-label={t("enc.applyNamed", { name: template.name })} onClick={() => void apply({ type: "encounter.apply", templateId: template.id })}>{t("enc.apply")}</button></li>)}</ul>}
    </div>}
  </Modal>;
}
