import { useId, useState } from "react";
import { DEFAULT_GRID, type StudioContext, type StudioSnapshot } from "@vtt/shared";
import { hex, MAP_PALETTE } from "../board/mapPalette";
import { MapViewport } from "./MapViewport";
import { TerrainCells } from "./TerrainCells";
import { studioT, type StudioLocale, type StudioTextKey } from "./text";
import "./SceneStudio.css";

export interface SceneStudioProps {
  snapshot: StudioSnapshot;
  media: Readonly<Record<string, string>>;
  locale: StudioLocale;
  onContext: (context: StudioContext) => Promise<void>;
  disabled?: boolean;
  stale?: boolean;
  onWebsiteOpen?: () => void;
}

/** One native saved scene, rendered identically for website and MCP Apps adapters. */
export function SceneStudio({ snapshot, media, locale, onContext, disabled = false, stale = false, onWebsiteOpen }: SceneStudioProps) {
  const t = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const id = useId().replace(/:/g, "");
  const [layers, setLayers] = useState({ grid: true, walls: true, terrain: true, tokens: true, marks: true });
  const [changing, setChanging] = useState(false);
  const [contextError, setContextError] = useState(false);
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const { scene, context } = snapshot;
  const source = scene.source;
  const suggestion = scene.detection?.status === "suggested" ? scene.detection.suggestion : null;
  const grid = scene.grid ?? (suggestion ? { ...DEFAULT_GRID, ...suggestion } : null);
  const latest = snapshot.outcomes.at(-1);
  const switchContext = async (next: StudioContext) => {
    if (disabled || changing) return;
    setChanging(true); setContextError(false);
    try { await onContext(next); } catch { setContextError(true); }
    finally { setChanging(false); }
  };
  const contextValue = context.mapKey ? `map:${context.mapKey}` : context.sourceFileId ? `source:${context.sourceFileId}` : "";
  const contextKey = `${snapshot.buildId}:${context.sourceFileId}:${context.mapKey}:${context.encounterKey}`;
  const issues = (kind: "problem" | "uncertain") => scene.issues.filter((issue) => issue.kind === kind);
  const countTerrain = scene.terrain.reduce((count, run) => count + run.end - run.start + 1, 0);
  const labelFor = (token: StudioSnapshot["scene"]["tokens"][number]) => t("placementLabel", { name: token.name, visibility: t(token.hidden ? "hidden" : "visible") });
  return <section className="scene-studio" data-testid="studio-scene" aria-label={t("title")} aria-busy={changing}>
    {onWebsiteOpen && <p className="studio-note">
      {t("attachInChat")}{" "}<a href={snapshot.websitePath} onClick={(event) => { event.preventDefault(); onWebsiteOpen(); }}>{t("uploadOnWebsite")}</a>{" "}
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
    {source ? <>
      <fieldset className="studio-layer-controls"><legend>{t("layers")}</legend>{(Object.keys(layers) as (keyof typeof layers)[]).map((layer) => <label key={layer}>
        <input type="checkbox" checked={layers[layer]} onChange={(event) => setLayers((current) => ({ ...current, [layer]: event.target.checked }))} />{t(layer)}
      </label>)}</fieldset>
      {media[source.id] ? <MapViewport key={contextKey} map={{ url: media[source.id]!, width: source.width, height: source.height }} mode="pan" pan label={t("canvas")} keyboardNavigation onImageError={() => setFailedPreview(media[source.id] ?? null)}
        texts={{ zoom: t("zoom"), fit: t("fit"), zoomIn: t("zoomIn"), zoomOut: t("zoomOut") }}>
        {({ scale }) => <>
          <defs><clipPath id={`${id}-bounds`}><rect width={source.width} height={source.height} /></clipPath>
            {grid && <pattern id={`${id}-grid`} width={grid.cellSize} height={grid.cellSize} x={grid.offsetX} y={grid.offsetY} patternUnits="userSpaceOnUse">
              <path d={`M${grid.cellSize} 0H0V${grid.cellSize}`} fill="none" stroke={scene.gridStatus === "confirmed" ? "#ffffff" : "#e6b77d"} strokeOpacity=".7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </pattern>}
          </defs>
          <g clipPath={`url(#${id}-bounds)`}>
            {grid && layers.grid && grid.cellSize * scale >= 6 && <rect width={source.width} height={source.height} fill={`url(#${id}-grid)`} data-layer="grid" />}
            {scene.grid && layers.terrain && scene.terrainState === "ready" && <g data-layer="terrain"><TerrainCells runs={scene.terrain} grid={scene.grid} /></g>}
            {layers.walls && <g data-layer="walls">{scene.walls.map((wall) => {
              const kind = wall.portal?.kind ?? "wall";
              const colour = MAP_PALETTE[kind];
              const dash = wall.portal?.state === "open" || wall.uvttPortal ? "6 4" : undefined;
              return <g key={wall.id} data-kind={wall.uvttPortal && !wall.portal ? "opening" : kind} data-portal-state={wall.portal?.state}>
                <path d={`M${wall.a.x} ${wall.a.y}L${wall.b.x} ${wall.b.y}`} stroke={hex(colour.outer)} strokeDasharray={dash} strokeWidth="7" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
                <path d={`M${wall.a.x} ${wall.a.y}L${wall.b.x} ${wall.b.y}`} stroke={hex(colour.inner)} strokeWidth={kind === "wall" ? 2 : 4} strokeDasharray={dash} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
                {wall.portal?.state === "locked" && <circle cx={(wall.a.x + wall.b.x) / 2} cy={(wall.a.y + wall.b.y) / 2} r={4 / scale} fill={hex(MAP_PALETTE.lock.inner)} stroke={hex(MAP_PALETTE.lock.outer)} strokeWidth={2 / scale} />}
              </g>;
            })}</g>}
            {scene.grid && layers.marks && <g data-layer="marks">{scene.marks.map((mark, index) => <g key={index}>
              <title>{mark.reason}</title><circle cx={scene.grid!.offsetX + (mark.square.column + .5) * scene.grid!.cellSize} cy={scene.grid!.offsetY + (mark.square.row + .5) * scene.grid!.cellSize} r={scene.grid!.cellSize * .35} fill="none" stroke="#ff7fa4" strokeWidth={2 / scale} />
              <text x={scene.grid!.offsetX + (mark.square.column + .5) * scene.grid!.cellSize} y={scene.grid!.offsetY + (mark.square.row + .5) * scene.grid!.cellSize} textAnchor="middle" dominantBaseline="central" fontSize={scene.grid!.cellSize * .4} fill="#fff">!</text>
            </g>)}</g>}
            {scene.grid && layers.tokens && <g data-layer="tokens">{scene.tokens.map((token) => {
              if (!token.center) return null;
              const { x, y } = token.center, radius = token.size * scene.grid!.cellSize * .44;
              const clip = `${id}-token-${token.index}`;
              return <g key={token.index} data-token-index={token.index} data-hidden={token.hidden} aria-label={labelFor(token)} role="img">
                <title>{labelFor(token)}</title><defs><clipPath id={clip}><circle cx={x} cy={y} r={radius} /></clipPath></defs>
                <circle cx={x} cy={y} r={radius} fill={token.color} fillOpacity={token.hidden ? .55 : 1} />
                {token.imageFileId && media[token.imageFileId] && <image href={media[token.imageFileId]} x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} clipPath={`url(#${clip})`} opacity={token.hidden ? .6 : 1} preserveAspectRatio="xMidYMid slice" />}
                <circle cx={x} cy={y} r={radius} fill="none" stroke={token.hidden ? "#f3a26d" : "#ffffff"} strokeDasharray={token.hidden ? "5 3" : undefined} strokeWidth={2 / scale} />
                <text x={x} y={y + radius + 13 / scale} textAnchor="middle" fontSize={12 / scale} fill="#ffffff" stroke="#101114" strokeWidth={3 / scale} paintOrder="stroke">{token.name}</text>
              </g>;
            })}</g>}
          </g>
        </>}
      </MapViewport> : <p className="studio-preview-placeholder">{t("previewUnavailable")}</p>}
      {media[source.id] && failedPreview === media[source.id] && <p role="status">{t("previewUnavailable")}</p>}
      <p className="studio-map-help">{t("keyboard")}</p>
      {source.privacy === "legacy-public" && <p className="studio-note">{t("legacy")}</p>}
      <p className="studio-counts" data-testid="studio-layer-counts">{t("counts", { walls: scene.walls.length, terrain: countTerrain, tokens: scene.tokens.length })}</p>
      <p>{t(scene.gridStatus === "confirmed" ? "gridConfirmed" : scene.gridStatus === "proposed" ? "gridProposed" : suggestion ? "gridSuggestion" : "gridMissing")}</p>
      {scene.detection && <p className="studio-note" data-detector-state={scene.detection.status}>{t(scene.detection.error === "invalid_image" ? "detector.invalid" : `detector.${scene.detection.status}`)}</p>}
      {scene.terrainState === "otherGrid" && <p className="studio-note">{t("terrainStale")}</p>}
      {scene.terrainState === "noGrid" && <p className="studio-note">{t("terrainNoGrid")}</p>}
    </> : <p className="studio-preview-placeholder">{t("empty")}</p>}
    <div className="studio-permissions">{(["grids", "walls", "terrain"] as const).filter((choice) => !snapshot.allowed[choice]).map((choice) => <p className="studio-note" key={choice}>{t(`permission.${choice}`)}</p>)}</div>
    {(["problem", "uncertain"] as const).map((kind) => issues(kind).length > 0 && <section key={kind} className="studio-issues">
      <h3>{t(kind === "problem" ? "problems" : "uncertain")}</h3><ul>{issues(kind).map((issue, index) => <li key={`${issue.key}:${index}`}>{issue.message}</li>)}</ul>
    </section>)}
    {context.mapKey && !scene.issues.length && <p className="studio-note">{t("noProblems")}</p>}
    {scene.tokens.length > 0 && <details className="studio-placements"><summary>{t("placements")}</summary><ul>{scene.tokens.map((token) => <li key={token.index}>
      <strong>{labelFor(token)}</strong><span>{token.square ? t("placementSquare", { column: token.square.column, row: token.square.row, size: token.size }) : t("unplaced")}</span>{token.square && !token.center && <span>{t("invalidPlacement")}</span>}
    </li>)}</ul></details>}
    {latest && <p className="studio-last-result" role="status" aria-live="polite" key={latest.id}>{t("outcome", { operation: t(`operation.${latest.operation}`), target: latest.targetKey ?? "", status: t(`outcome.${latest.code}`) })}</p>}
    {snapshot.outcomes.length > 0 && <details className="studio-outcomes"><summary>{t("outcomes")}</summary><ul>{[...snapshot.outcomes].reverse().map((outcome) => <li key={outcome.id} data-outcome={outcome.status}>
      {t("outcome", { operation: t(`operation.${outcome.operation}`), target: outcome.targetKey ?? "", status: t(`outcome.${outcome.code}`) })}
    </li>)}</ul></details>}
    {!onWebsiteOpen && <a href={snapshot.websitePath}>{t("website")}</a>}
  </section>;
}
