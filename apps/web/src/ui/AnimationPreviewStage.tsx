import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnimationDef } from "@vtt/shared";
import { AnimationPreview } from "../board/animationPreview";
import { DEFAULT_SCENE, type StageScene, type StageSlot } from "../board/previewStage";
import { t } from "../i18n/locale";

/**
 * The editor's preview (ADR 0038): a mount point for `AnimationPreview` and a Play button that
 * plays the values as they are now, saved or not. It sends nothing to any room and changes no data.
 * `scene` is the GM's own map and token art for the stage; a picture that cannot load is reported
 * through `onSceneMissing` and the stage keeps its default there.
 */
export function AnimationPreviewStage({ def, scene = DEFAULT_SCENE, onSceneMissing, autoPlay = false, reducedMotion = false, children }: {
  def: AnimationDef;
  scene?: StageScene;
  onSceneMissing?: (slot: StageSlot) => void;
  /** Play once whenever `def` changes after the stage first shows; not on opening (the attack editor, attack-range). */
  autoPlay?: boolean;
  /** Show the still, reduced-motion version, as the board would for this viewer. */
  reducedMotion?: boolean;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<AnimationPreview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stage = new AnimationPreview(host.current!);
    preview.current = stage;
    let live = true;
    void stage.init().then((ok) => {
      if (live) { setUnavailable(!ok); setReady(ok); }
    });
    return () => {
      live = false;
      stage.destroy();
      preview.current = null;
    };
  }, []);

  // Runs after the stage above is made, so the first scene reaches it too.
  useEffect(() => {
    preview.current?.setScene(scene, onSceneMissing);
  }, [scene, onSceneMissing]);

  const defKey = JSON.stringify(def);
  /** What the stage opened with: choosing something else plays it, opening doesn't. */
  const openedWith = useRef(defKey);
  useEffect(() => {
    // Keyed by the definition's content, so an equal copy doesn't play it again.
    if (autoPlay && ready && defKey !== openedWith.current) {
      openedWith.current = "";
      preview.current?.play(def, { reducedMotion });
    }
  }, [autoPlay, ready, defKey, reducedMotion]);

  return (
    <div className="animation-preview">
      <div ref={host} className="animation-preview-stage" role="img" aria-label={t("anim.stageLabel")} />
      {unavailable && <p className="muted small-print">{t("anim.needsWebgl")}</p>}
      <div className="animation-preview-toolbar">
        <button type="button" disabled={!ready} onClick={() => preview.current?.play(def, { reducedMotion })}>{t("anim.play")}</button>
        <button type="button" className="secondary" disabled={!ready} onClick={() => preview.current?.stop()}>{t("anim.stop")}</button>
        {children}
      </div>
    </div>
  );
}
