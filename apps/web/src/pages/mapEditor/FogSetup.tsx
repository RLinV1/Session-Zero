import { useState } from "react";
import { ArrowsOutCardinal, Eye, Polygon, Rectangle, UserFocus } from "@phosphor-icons/react";
import type { RoomState } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { FogControls } from "./FogControls";
import { FogCanvas, type FogAdd, type FogCanvasMode } from "./FogCanvas";
import { HudLayout } from "./HudLayout";
import { t, type TextId } from "../../i18n/locale";

const MODES: { key: FogCanvasMode; label: TextId; icon: typeof Eye }[] = [
  { key: "rect", label: "common.rectangle", icon: Rectangle },
  { key: "polygon", label: "common.polygon", icon: Polygon },
  { key: "reveal", label: "fog.reveal", icon: Eye },
  { key: "edit", label: "fog.moveReshape", icon: ArrowsOutCardinal },
];

const HINTS: Record<FogCanvasMode, TextId> = {
  rect: "fog.hint.rect",
  polygon: "fog.hint.polygon",
  reveal: "fog.hint.reveal",
  edit: "fog.hint.move",
};

/**
 * The map editor's Fog step (map-editor, FR-GM-17): the fog canvas, and a side HUD with the tools
 * and the same controls as Manage › Fog of war. It sends the board Fog tool's `fog.add` and
 * `fog.remove`, so players see no difference.
 */
export function FogSetup({ connection, state }: { connection: EditorConnection; state: RoomState }) {
  const map = state.scene.map;
  const [mode, setMode] = useState<FogCanvasMode>("rect");
  const [busy, setBusy] = useState(false);
  const [playerView, setPlayerView] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (!map) return <p className="map-editor-empty">{t("fog.applyMapFirst")}</p>;

  const send = async (command: { type: "fog.add"; region: FogAdd } | { type: "fog.remove"; regionId: string } | { type: "fog.replace"; removeIds: string[]; add: FogAdd[] }) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setMessage(result.ok ? null : { text: result.message, error: true });
  };

  const regions = Object.keys(state.fog).length;
  return (
    <HudLayout className="map-editor-split">
      <FogCanvas
        map={map}
        grid={state.scene.grid}
        fog={state.fog}
        mode={mode}
        busy={busy}
        onAdd={(region) => void send({ type: "fog.add", region })}
        onRemove={(regionId) => void send({ type: "fog.remove", regionId })}
        onUpdate={(regionId, points) => void send({ type: "fog.replace", removeIds: [regionId], add: [{ shape: "polygon", points }] })}
        onNotice={(text) => setMessage({ text, error: true })}
        playerView={playerView}
      />
      <aside className="map-editor-hud" aria-label={t("fog.tools")}>
        <section className="stack">
          <h3 className="map-editor-heading">{t("common.tools")}</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label={t("fog.tool")}>
            {MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                className="tool-button map-editor-mode"
                onClick={() => { setMode(key); setMessage(null); }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
          <p className="muted small-print">{t(HINTS[mode])}</p>
          <button
            type="button"
            className="tool-button map-editor-mode"
            aria-pressed={playerView}
            onClick={() => setPlayerView((on) => !on)}
          >
            <UserFocus size={18} aria-hidden="true" />
            <span>{t("fog.playerView")}</span>
          </button>
          <p className="map-editor-count">
            {t("fog.regionsNote", { n: regions })} {playerView ? t("fog.asPlayers") : t("fog.onlyYou")}
          </p>
        </section>
        <section className="stack">
          <h3 className="map-editor-heading">{t("fog.controls")}</h3>
          <FogControls connection={connection} state={state} intro={t("fog.noPointer")} />
        </section>
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      </aside>
    </HudLayout>
  );
}
