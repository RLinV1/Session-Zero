import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "./Modal";
import { setClientSettings, useClientSettings, type GraphicsQuality } from "./clientSettings";

/** The room the menu is opened from; absent on the account pages, where there is no table setting to show. */
export interface SettingsRoom { connection: RoomConnection; state: RoomState; you: Participant }

type SettingsTab = "audio" | "graphics" | "table";

export function SettingsMenu({ open, onClose, onAfterClose, room }: { open: boolean; onClose: () => void; onAfterClose?: () => void; room?: SettingsRoom }) {
  const settings = useClientSettings();
  const baseId = useId();
  const showTable = !!room && room.you.role === "gm";
  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "audio", label: "Audio" }, { key: "graphics", label: "Graphics" }, ...(showTable ? [{ key: "table" as const, label: "Table" }] : []),
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
  const browserNote = <p className="muted small-print">Audio and graphics are saved in this browser. Changes apply immediately.</p>;
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
            </>
          )}
          {tab === "table" && room && <TableSection room={room} />}
        </div>
        <div className="row settings-actions"><button type="button" onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}
/** GM only: a setting every player at the table shares (FR-TAC-07). The server decides; this is a hint. */
function TableSection({ room }: { room: SettingsRoom }) {
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
      <p className="muted small-print">This setting is shared by everyone at the table.</p>
      <label className="checkbox">
        <input type="checkbox" role="switch" checked={enabled} disabled={busy} aria-describedby={hintId} onChange={(e) => void toggle(e.target.checked)} />
        Remove tokens at 0 HP
      </label>
      <p id={hintId} className="muted small-print">Tokens are removed when their HP reaches 0 or below. Undo brings one back.</p>
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
