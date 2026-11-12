import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { DEFEAT_REMOVAL_LABELS, DEFEAT_REMOVALS, defeatRemovalOf, type CommandInput, type DefeatRemoval, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "./Modal";
import { setClientSettings, useClientSettings, type AttackAnimations, type GraphicsQuality } from "./clientSettings";

/** The room the menu is opened from; absent on the account pages, where there is no table setting to show. */
export interface SettingsRoom { connection: RoomConnection; state: RoomState; you: Participant }

type SettingsTab = "audio" | "graphics" | "controls" | "table";

export function SettingsMenu({ open, onClose, onAfterClose, room }: { open: boolean; onClose: () => void; onAfterClose?: () => void; room?: SettingsRoom }) {
  const settings = useClientSettings();
  const baseId = useId();
  const showTable = !!room && room.you.role === "gm";
  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "audio", label: "Audio" }, { key: "graphics", label: "Graphics" }, { key: "controls", label: "Controls" }, ...(showTable ? [{ key: "table" as const, label: "Table" }] : []),
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
  const browserNote = <p className="muted small-print">Audio, graphics and controls are saved in this browser. Changes apply immediately.</p>;
  return (
    <Modal open={open} title="Settings" className="client-settings-modal" onClose={onClose} onAfterClose={onAfterClose}>
      <div className="stack client-settings">
        <nav className="map-editor-steps settings-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
          {tabs.map(({ key, label }) => (
            <button key={key} id={`${baseId}-${key}`} type="button" role="tab" className="map-editor-step" tabIndex={tab === key ? 0 : -1}
              aria-selected={tab === key} aria-controls={`${baseId}-panel`} onClick={() => setChosen(key)}>{label}</button>
          ))}
        </nav>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className="stack settings-panel">
          {tab === "audio" && (
            <>
              {browserNote}
              <VolumeSlider label="Music volume" value={settings.musicVolume} onChange={(musicVolume) => setClientSettings({ musicVolume })} />
              <VolumeSlider label="Sound effects volume" value={settings.soundVolume} onChange={(soundVolume) => setClientSettings({ soundVolume })} />
            </>
          )}
          {tab === "graphics" && (
            <>
              {browserNote}
              <label>Graphics quality
                <select value={settings.graphicsQuality} onChange={(e) => setClientSettings({ graphicsQuality: e.target.value as GraphicsQuality })}>
                  <option value="high">High</option>
                  <option value="balanced">Balanced</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.reducedAnimations} onChange={(e) => setClientSettings({ reducedAnimations: e.target.checked })} />
                Reduced animations
              </label>
              <p className="muted small-print">Still effects instead of moving ones.</p>
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.autoFocusAttacks} onChange={(e) => setClientSettings({ autoFocusAttacks: e.target.checked })} />
                Focus on attacks
              </label>
              <p className="muted small-print">Zoom the board to the fight.</p>
              <label>Attack animations
                <select value={settings.attackAnimations} onChange={(e) => setClientSettings({ attackAnimations: e.target.value as AttackAnimations })}>
                  <option value="all">All</option>
                  <option value="turn">Current turn</option>
                  <option value="none">None</option>
                </select>
              </label>
            </>
          )}
          {tab === "controls" && (
            <>
              {browserNote}
              <label className="checkbox">
                <input type="checkbox" role="switch" checked={settings.arrowKeyMove} onChange={(e) => setClientSettings({ arrowKeyMove: e.target.checked })} />
                Arrow keys move selected token
              </label>
            </>
          )}
          {tab === "table" && room && <TableSection room={room} />}
        </div>
        <div className="row settings-actions"><button type="button" onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}
/**
 * GM only: the rules every player at the table shares (FR-TAC-07, FR-GM-23, ADR 0054). The server
 * decides and enforces them; this only sends the GM's choice.
 */
function TableSection({ room }: { room: SettingsRoom }) {
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
  const rules: { label: string; on: boolean; command: (enabled: boolean) => CommandInput }[] = [
    { label: "Hide map from players without a token", on: state.hideMapWithoutToken ?? false, command: (enabled) => ({ type: "room.setHideMapWithoutToken", enabled }) },
    { label: "Hide HP from Players", on: state.hideHp ?? false, command: (enabled) => ({ type: "room.setHideHp", enabled }) },
    { label: "Hide AC from Players", on: state.hideAc ?? false, command: (enabled) => ({ type: "room.setHideAc", enabled }) },
  ];
  return (
    <div className="stack" aria-busy={busy}>
      <label>Remove tokens at 0 HP
        <select value={defeatRemovalOf(state)} disabled={busy} onChange={(e) => void send({ type: "room.setDefeatRemoval", mode: e.target.value as DefeatRemoval })}>
          {DEFEAT_REMOVALS.map((mode) => <option key={mode} value={mode}>{DEFEAT_REMOVAL_LABELS[mode]}</option>)}
        </select>
      </label>
      {rules.map(({ label, on, command }) => (
        <label key={label} className="checkbox">
          <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => void send(command(e.target.checked))} />
          {label}
        </label>
      ))}
      {error && <p role="alert" className="error small">{error}</p>}
    </div>
  );
}
function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="range-field settings-volume">
      <div className="range-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="range-value">{value}%</output>
      </div>
      <input id={id} className="range" type="range" min="0" max="100" step="1"
        value={value} aria-valuetext={`${value} percent`}
        style={{ "--range-progress": `${value}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
