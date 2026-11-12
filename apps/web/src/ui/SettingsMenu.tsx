import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Globe } from "@phosphor-icons/react";
import { DEFEAT_REMOVAL_IDS, DEFEAT_REMOVALS, DIAGONAL_RULE_IDS, DIAGONAL_RULES, DIFFICULT_TERRAIN_IDS, DIFFICULT_TERRAIN_MODES, defeatRemovalOf, diagonalRuleOf, difficultTerrainOf, type CommandInput, type DefeatRemoval, type DiagonalRule, type DifficultTerrainMode, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { useT, type TextId } from "../i18n/locale";
import { LANGUAGE_CHOICE_ENABLED } from "../i18n/rollout";
import { LanguageSettings } from "./LanguageMenu";
import { Modal } from "./Modal";
import { setClientSettings, useClientSettings, type AttackAnimations, type GraphicsQuality } from "./clientSettings";

/** The room the menu is opened from; absent on the account pages, where there is no table setting to show. */
export interface SettingsRoom { connection: RoomConnection; state: RoomState; you: Participant }

type SettingsTab = "audio" | "graphics" | "controls" | "language" | "table";

export function SettingsMenu({ open, onClose, onAfterClose, room }: { open: boolean; onClose: () => void; onAfterClose?: () => void; room?: SettingsRoom }) {
  const t = useT();
  const settings = useClientSettings();
  const baseId = useId();
  const showTable = !!room && room.you.role === "gm";
  // The globe marks Language in any language, for a reader who can't read the tab names (design.md §11).
  const tabs: { key: SettingsTab; label: ReactNode }[] = [
    { key: "audio", label: t("settings.tab.audio") },
    { key: "graphics", label: t("settings.tab.graphics") },
    { key: "controls", label: t("settings.tab.controls") },
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
              <label>{t("settings.attackAnimations")}
                <select value={settings.attackAnimations} onChange={(e) => setClientSettings({ attackAnimations: e.target.value as AttackAnimations })}>
                  <option value="all">{t("settings.attackAnimations.all")}</option>
                  <option value="turn">{t("settings.attackAnimations.turn")}</option>
                  <option value="none">{t("settings.attackAnimations.none")}</option>
                </select>
              </label>
            </>
          )}
          {tab === "controls" && (
            <>
              {browserNote}
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.arrowKeyMove} onChange={(e) => setClientSettings({ arrowKeyMove: e.target.checked })} />
                {t("settings.arrowKeyMove")}
              </label>
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
/**
 * GM only: the rules every player at the table shares (FR-TAC-07, FR-GM-23, ADR 0057, ADR 0055). The server
 * decides and enforces them; this only sends the GM's choice.
 */
function TableSection({ room }: { room: SettingsRoom }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = room.state;
  const send = async (command: CommandInput) => {
    setBusy(true);
    setError(null);
    const result = await room.connection.command(command);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };
  const rules: { label: TextId; on: boolean; command: (enabled: boolean) => CommandInput }[] = [
    { label: "settings.hideMap", on: state.hideMapWithoutToken ?? false, command: (enabled) => ({ type: "room.setHideMapWithoutToken", enabled }) },
    { label: "settings.hideHp", on: state.hideHp ?? false, command: (enabled) => ({ type: "room.setHideHp", enabled }) },
    { label: "settings.hideAc", on: state.hideAc ?? false, command: (enabled) => ({ type: "room.setHideAc", enabled }) },
  ];
  return (
    <div className="stack" aria-busy={busy}>
      <label>{t("settings.removeAtZero")}
        <select value={defeatRemovalOf(state)} disabled={busy} onChange={(e) => void send({ type: "room.setDefeatRemoval", mode: e.target.value as DefeatRemoval })}>
          {DEFEAT_REMOVALS.map((mode) => <option key={mode} value={mode}>{t(DEFEAT_REMOVAL_IDS[mode])}</option>)}
        </select>
      </label>
      {rules.map(({ label, on, command }) => (
        <label key={label} className="checkbox">
          <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => void send(command(e.target.checked))} />
          {t(label)}
        </label>
      ))}
      <label>{t("settings.diagonals")}
        <select value={diagonalRuleOf(state)} disabled={busy} onChange={(e) => void send({ type: "room.setDiagonalRule", rule: e.target.value as DiagonalRule })}>
          {DIAGONAL_RULES.map((rule) => <option key={rule} value={rule}>{t(DIAGONAL_RULE_IDS[rule])}</option>)}
        </select>
      </label>
      <label>{t("settings.difficultTerrain")}
        <select value={difficultTerrainOf(state)} disabled={busy} onChange={(e) => void send({ type: "room.setDifficultTerrain", mode: e.target.value as DifficultTerrainMode })}>
          {DIFFICULT_TERRAIN_MODES.map((mode) => <option key={mode} value={mode}>{t(DIFFICULT_TERRAIN_IDS[mode])}</option>)}
        </select>
      </label>
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
