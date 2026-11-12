import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Globe } from "@phosphor-icons/react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { useT } from "../i18n/locale";
import { LANGUAGE_CHOICE_ENABLED } from "../i18n/rollout";
import { LanguageSettings } from "./LanguageMenu";
import { Modal } from "./Modal";
import { setClientSettings, useClientSettings, type GraphicsQuality } from "./clientSettings";

/** The room the menu is opened from; absent on the account pages, where there is no table setting to show. */
export interface SettingsRoom { connection: RoomConnection; state: RoomState; you: Participant }

type SettingsTab = "audio" | "graphics" | "language" | "table";

export function SettingsMenu({ open, onClose, onAfterClose, room }: { open: boolean; onClose: () => void; onAfterClose?: () => void; room?: SettingsRoom }) {
  const t = useT();
  const settings = useClientSettings();
  const baseId = useId();
  const showTable = !!room && room.you.role === "gm";
  // The globe marks Language in any language, for a reader who can't read the tab names (design.md §11).
  const tabs: { key: SettingsTab; label: ReactNode }[] = [
    { key: "audio", label: t("settings.tab.audio") },
    { key: "graphics", label: t("settings.tab.graphics") },
    ...(LANGUAGE_CHOICE_ENABLED ? [{ key: "language" as const, label: <span className="tab-with-icon"><Globe aria-hidden="true" />{t("language.label")}</span> }] : []),
    ...(showTable ? [{ key: "table" as const, label: t("settings.tab.table") }] : []),
  ];
  const [chosen, setChosen] = useState<SettingsTab>("audio");
  useEffect(() => { if (open) setChosen("audio"); }, [open]);
  const tab = tabs.some((t) => t.key === chosen) ? chosen : "audio";
  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    const at = tabs.findIndex((t) => t.key === tab);
    const next = event.key === "ArrowRight" ? (at + 1) % tabs.length
      : event.key === "ArrowLeft" ? (at + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const key = tabs[next]!.key;
    setChosen(key);
    document.getElementById(`${baseId}-${key}`)?.focus();
  };
  const browserNote = <p className="muted small-print">{t("settings.browserNote")}</p>;
  return (
    <Modal open={open} title={t("settings.title")} className="client-settings-modal" onClose={onClose} onAfterClose={onAfterClose}>
      <div className="stack client-settings">
        <nav className="map-editor-steps settings-tabs" role="tablist" aria-label={t("settings.sections")} onKeyDown={onTabKey}>
          {tabs.map(({ key, label }) => (
            <button key={key} id={`${baseId}-${key}`} type="button" role="tab" className="map-editor-step" tabIndex={tab === key ? 0 : -1}
              aria-selected={tab === key} aria-controls={`${baseId}-panel`} onClick={() => setChosen(key)}>{label}</button>
          ))}
        </nav>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className="stack settings-panel">
          {tab === "audio" && (
            <>
              {browserNote}
              <VolumeSlider label={t("settings.musicVolume")} value={settings.musicVolume} onChange={(musicVolume) => setClientSettings({ musicVolume })} />
              <VolumeSlider label={t("settings.soundVolume")} value={settings.soundVolume} onChange={(soundVolume) => setClientSettings({ soundVolume })} />
            </>
          )}
          {tab === "graphics" && (
            <>
              {browserNote}
              <label>{t("settings.graphicsQuality")}
                <select value={settings.graphicsQuality} onChange={(e) => setClientSettings({ graphicsQuality: e.target.value as GraphicsQuality })}>
                  <option value="high">{t("settings.quality.high")}</option>
                  <option value="balanced">{t("settings.quality.balanced")}</option>
                  <option value="low">{t("settings.quality.low")}</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.reducedAnimations} onChange={(e) => setClientSettings({ reducedAnimations: e.target.checked })} />
                {t("settings.reducedAnimations")}
              </label>
              <p className="muted small-print">{t("settings.reducedAnimationsHint")}</p>
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.autoFocusAttacks} onChange={(e) => setClientSettings({ autoFocusAttacks: e.target.checked })} />
                {t("settings.focusAttacks")}
              </label>
              <p className="muted small-print">{t("settings.focusAttacksHint")}</p>
            </>
          )}
          {tab === "language" && <LanguageSettings atTable={!!room} />}
          {tab === "table" && room && <TableSection room={room} />}
        </div>
        <div className="row settings-actions"><button type="button" onClick={onClose}>{t("common.done")}</button></div>
      </div>
    </Modal>
  );
}
/** GM only: a setting every player at the table shares (FR-TAC-07). The server decides; this is a hint. */
function TableSection({ room }: { room: SettingsRoom }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const enabled = room.state.autoRemoveDefeated ?? true;
  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const result = await room.connection.command({ type: "room.setAutoRemoveDefeated", enabled: next });
    setBusy(false);
    if (!result.ok) setError(result.message);
  };
  return (
    <div className="stack" aria-busy={busy}>
      <p className="muted small-print">{t("settings.tableShared")}</p>
      <label className="checkbox">
        <input type="checkbox" role="switch" checked={enabled} disabled={busy} aria-describedby={hintId} onChange={(e) => void toggle(e.target.checked)} />
        {t("settings.removeAtZero")}
      </label>
      <p id={hintId} className="muted small-print">{t("settings.removeAtZeroHint")}</p>
      {error && <p role="alert" className="error small">{error}</p>}
    </div>
  );
}
function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="range-field settings-volume">
      <div className="range-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="range-value">{value}%</output>
      </div>
      <input id={id} className="range" type="range" min="0" max="100" step="1"
        value={value} aria-valuetext={t("settings.percent", { value })}
        style={{ "--range-progress": `${value}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
