import { useState } from "react";
import { type StudioContext, type StudioSnapshot } from "@vtt/shared";
import { StudioSceneMap } from "./StudioSceneMap";
import { StudioCorrectionWorkspace, type StudioAuthoringClient } from "./StudioCorrectionWorkspace";
import { studioT, type StudioLocale, type StudioTextKey } from "./text";
import "./SceneStudio.css";

export interface SceneStudioProps {
  snapshot: StudioSnapshot;
  media: Readonly<Record<string, string>>;
  locale: StudioLocale;
  onContext: (context: StudioContext) => Promise<void>;
  disabled?: boolean;
  stale?: boolean;
  onWebsiteOpen?: (url: string) => void;
  authoring?: StudioAuthoringClient;
}

/** One native saved scene, rendered identically for website and MCP Apps adapters. */
export function SceneStudio({ snapshot, media, locale, onContext, disabled = false, stale = false, onWebsiteOpen, authoring }: SceneStudioProps) {
  const t = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const [changing, setChanging] = useState(false);
  const [contextError, setContextError] = useState(false);
  const { scene, context } = snapshot;
  const latest = snapshot.outcomes.at(-1);
  const switchContext = async (next: StudioContext) => {
    if (disabled || changing) return;
    setChanging(true); setContextError(false);
    try { await onContext(next); } catch { setContextError(true); }
    finally { setChanging(false); }
  };
  const contextValue = context.mapKey ? `map:${context.mapKey}` : context.sourceFileId ? `source:${context.sourceFileId}` : "";
  const contextKey = `${snapshot.buildId}:${context.sourceFileId}:${context.mapKey}:${context.encounterKey}`;
  return <section className="scene-studio" data-testid="studio-scene" aria-label={t("title")} aria-busy={changing}>
    {onWebsiteOpen && <p className="studio-note">
      {t("attachInChat")}{" "}<a href={snapshot.websitePath} onClick={(event) => { event.preventDefault(); onWebsiteOpen(snapshot.websitePath); }}>{t("uploadOnWebsite")}</a>{" "}
      {t("websiteUploadVisibility")}
    </p>}
    <div className="studio-contexts">
      <label><span>{t("activeMap")}</span><select aria-label={t("activeMap")} value={contextValue} disabled={disabled || changing} onChange={(event) => {
        const value = event.currentTarget.value;
        if (value.startsWith("map:")) {
          const map = snapshot.maps.find((item) => item.key === value.slice(4));
          if (map) void switchContext({ sourceFileId: map.fileId, mapKey: map.key, encounterKey: null });
        } else void switchContext({ sourceFileId: value.slice(7) || null, mapKey: null, encounterKey: null });
      }}>
        <option value="">{t("chooseMap")}</option>
        {snapshot.files.filter((file) => file.kind === "map").map((file) => <option key={file.id} value={`source:${file.id}`}>{t("sourceOnly", { name: file.name })}</option>)}
        {snapshot.maps.map((map) => <option key={map.key} value={`map:${map.key}`}>{map.name}</option>)}
      </select></label>
      <label><span>{t("activeEncounter")}</span><select aria-label={t("activeEncounter")} value={context.encounterKey ?? ""} disabled={disabled || changing || !context.mapKey} onChange={(event) => void switchContext({ ...context, encounterKey: event.currentTarget.value || null })}>
        <option value="">{t("noEncounter")}</option>
        {snapshot.encounters.filter((encounter) => encounter.mapKey === context.mapKey).map((encounter) => <option key={encounter.key} value={encounter.key}>{encounter.name}</option>)}
      </select></label>
    </div>
    <p className={`studio-preparation-status${stale ? " is-stale" : ""}`} role="status" aria-live="polite">
      {stale ? t("stale") : changing ? t("changingContext") : context.mapKey ? t("awaiting") : t("unfinished")}
    </p>
    {contextError && <p role="alert">{t("contextFailed")}</p>}
    {authoring && context.mapKey ? <StudioCorrectionWorkspace key={contextKey} snapshot={snapshot} media={media} locale={locale}
      authoring={authoring} onWebsiteOpen={onWebsiteOpen} disabled={disabled || changing} />
      : <StudioSceneMap key={contextKey} scene={scene} media={media} locale={locale} />}
    <div className="studio-permissions">{(["grids", "walls", "terrain"] as const).filter((choice) => !snapshot.allowed[choice]).map((choice) => <p className="studio-note" key={choice}>{t(`permission.${choice}`)}</p>)}</div>
    {latest && <p className="studio-last-result" role="status" aria-live="polite" key={latest.id}>{t("outcome", { operation: t(`operation.${latest.operation}`), target: latest.targetKey ?? "", status: t(`outcome.${latest.code}`) })}</p>}
    {snapshot.outcomes.length > 0 && <details className="studio-outcomes"><summary>{t("outcomes")}</summary><ul>{[...snapshot.outcomes].reverse().map((outcome) => <li key={outcome.id} data-outcome={outcome.status}>
      {t("outcome", { operation: t(`operation.${outcome.operation}`), target: outcome.targetKey ?? "", status: t(`outcome.${outcome.code}`) })}
    </li>)}</ul></details>}
    {!onWebsiteOpen && <a href={snapshot.websitePath}>{t("website")}</a>}
  </section>;
}
