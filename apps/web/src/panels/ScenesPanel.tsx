import { useContext, useEffect, useRef, useState } from "react";
import { CaretDown, Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { PopoverButton } from "../ui/Popover";
import { INITIAL_SCENE_ID, MAX_SCENES, MAX_SCENE_NAME, sceneNamesOf, type CommandInput, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { ScenePreparationContext } from "./ScenePreparationContext";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { t } from "../i18n/locale";

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
      setError(t("scenes.changeFailed"));
      return false;
    } finally { setBusy(false); }
  };
  return { busy, error, run };
}

/** Always within reach of the GM, even with the Manage panel closed. */
export function SceneSwitcher({ state }: Props) {
  const preparation = useContext(ScenePreparationContext);
  const viewed = state.activeSceneId ?? INITIAL_SCENE_ID;
  const liveId = preparation?.activeId ?? viewed;
  const scenes = Object.entries(sceneNamesOf(state));
  const viewedName = sceneNamesOf(state)[viewed] ?? viewed;
  return <div className="scene-switcher">
    <PopoverButton label={t("scenes.viewing")} title={t("scenes.previewPrivately")} className="scene-trigger"
      buttonProps={{ "aria-haspopup": "listbox" }}
      buttonContent={<>
        <span className="scene-trigger-name" title={viewedName}>{viewedName}</span>
        {viewed === liveId && <span className="scene-pill">{t("scenes.live")}</span>}
        <CaretDown size={14} aria-hidden="true" />
      </>}>
      {(close) => <SceneOptions scenes={scenes} viewed={viewed} liveId={liveId}
        onPick={(id) => { close(); if (id !== viewed) preparation?.preview(id); }} />}
    </PopoverButton>
  </div>;
}

function SceneOptions({ scenes, viewed, liveId, onPick }: { scenes: [string, string][]; viewed: string; liveId: string; onPick: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const options = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  // Open with the viewed scene focused so arrows start from it.
  useEffect(() => { (options().find((o) => o.getAttribute("aria-selected") === "true") ?? options()[0])?.focus(); }, []);
  const move = (to: (i: number, n: number) => number) => {
    const all = options();
    all[to(all.indexOf(document.activeElement as HTMLElement), all.length)]?.focus();
  };
  return <div ref={list} role="listbox" aria-label={t("scenes.title")} className="scene-options"
    onKeyDown={(e) => {
      const step: Record<string, (i: number, n: number) => number> = {
        ArrowDown: (i, n) => Math.min(i + 1, n - 1), ArrowUp: (i) => Math.max(i - 1, 0),
        Home: () => 0, End: (_i, n) => n - 1,
      };
      const go = step[e.key];
      if (go) { e.preventDefault(); move(go); }
    }}>
    {scenes.map(([id, name]) => <div key={id} role="option" tabIndex={-1} aria-selected={id === viewed}
      className="scene-option" title={name}
      onClick={() => onPick(id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(id); } }}>
      <span className="scene-option-name">{name}</span>
      {id === liveId && <span className="scene-pill">{t("scenes.live")}</span>}
      {id === viewed && <Check size={14} weight="bold" aria-hidden="true" />}
    </div>)}
  </div>;
}

/** A nonmodal popup leaves the private board available for preparation. */
export function SceneActivationNotice({ state, connection }: Props) {
  const preparation = useContext(ScenePreparationContext);
  const { busy, error, run } = useSceneCommand(connection);
  if (!preparation?.preparing) return null;
  return <section className="scene-activation-popup" aria-label={t("scenes.activation")}>
    <div>
      <p>{t("scenes.notActive")}</p>
      <span>{t("scenes.activateHint")}</span>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
    <button type="button" disabled={busy} onClick={() => { void run({ type: "scene.switch", sceneId: state.activeSceneId ?? INITIAL_SCENE_ID }); }}>{t("scenes.activate")}</button>
  </section>;
}

/** Live locations complement reusable templates and recovery checkpoints (ADR 0045). */
export function ScenesPanel({ state, connection }: Props) {
  const { busy, error, run } = useSceneCommand(connection);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const preparation = useContext(ScenePreparationContext);
  const names = sceneNamesOf(state);
  const active = state.activeSceneId ?? INITIAL_SCENE_ID;
  const full = Object.keys(names).length >= MAX_SCENES;
  const closeCreate = () => { if (!busy) { setCreating(false); setName(""); } };
  const newScene = <button type="button" className="icon-button" aria-label={t("scenes.new")} title={t("scenes.new")} disabled={full}
    onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /></button>;
  return <PanelSection id="scenes" title={t("scenes.title")} actions={newScene}>
    <p className="small-print">{t("scenes.intro")}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <ul className="plain scene-list">
      {Object.entries(names).map(([id, sceneName]) => <li key={id} className="scene-row">
        <button type="button" className="secondary scene-name" disabled={busy || id === active}
          aria-label={t("scenes.previewNamed", { name: sceneName })} aria-current={id === active ? "true" : undefined}
          onClick={() => preparation?.preview(id)}>
          {sceneName}{id === (preparation?.activeId ?? active) && <span className="muted"> {t("scenes.liveSuffix")}</span>}
        </button>
        <button type="button" className="icon-button" aria-label={t("scenes.renameNamed", { name: sceneName })} title={t("scenes.rename")} disabled={busy}
          onClick={() => { setDraft(sceneName); setEditing(id); }}><PencilSimple size={16} aria-hidden="true" /></button>
        <button type="button" className="icon-button" aria-label={t("scenes.deleteNamed", { name: sceneName })} title={t("scenes.delete")} disabled={busy || id === (preparation?.activeId ?? active)}
          onClick={() => setDeleting(id)}><Trash size={16} aria-hidden="true" /></button>
      </li>)}
    </ul>
    {full && <p className="small-print">{t("scenes.limit", { max: MAX_SCENES })}</p>}
    <Modal open={creating} title={t("scenes.new")} onClose={closeCreate}>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() && !busy && !full) void run({ type: "scene.create", name: name.trim(), activate: false }).then((ok) => { if (ok) closeCreate(); });
      }}>
        <label>{t("scenes.name")}<input value={name} maxLength={MAX_SCENE_NAME} autoFocus
          onChange={(event) => setName(event.target.value)} /></label>
        <p className="small-print">{t("scenes.startWith")}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={closeCreate}>{t("common.cancel")}</button>
          <button type="submit" className="primary" disabled={busy || full || !name.trim()}>{t("scenes.create")}</button>
        </div>
      </form>
    </Modal>
    <Modal open={editing !== null} title={t("scenes.rename")} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        if (editing && draft.trim() && !busy) void run({ type: "scene.rename", sceneId: editing, name: draft.trim() }).then((ok) => { if (ok) setEditing(null); });
      }}>
        <label>{t("scenes.name")}<input value={draft} maxLength={MAX_SCENE_NAME} onChange={(event) => setDraft(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel")}</button>
          <button type="submit" className="primary" disabled={busy || !draft.trim()}>{t("scenes.saveName")}</button>
        </div>
      </form>
    </Modal>
    <Modal open={deleting !== null} title={t("scenes.delete")} onClose={() => { if (!busy) setDeleting(null); }}>
      <div className="stack">
        <p>{t("common.delete")} <strong>{deleting ? names[deleting] : ""}</strong> {t("scenes.deleteBody")}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)} autoFocus>{t("common.cancel")}</button>
          <button type="button" className="danger-fill" disabled={busy} onClick={() => {
            if (deleting) void run({ type: "scene.delete", sceneId: deleting }).then((ok) => { if (ok) setDeleting(null); });
          }}>{t("scenes.delete")}</button>
        </div>
      </div>
    </Modal>
  </PanelSection>;
}
