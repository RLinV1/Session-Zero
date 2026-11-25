import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { DEFAULT_GRID, type StudioScene } from "@vtt/shared";
import { hex, MAP_PALETTE } from "../board/mapPalette";
import { MapViewport } from "./MapViewport";
import { TerrainCells } from "./TerrainCells";
import { studioT, type StudioLocale, type StudioTextKey } from "./text";

export type StudioMapInteraction = Partial<Pick<ComponentProps<typeof MapViewport>,
  "mode" | "pan" | "focus" | "focusRect" | "onPress" | "onMove" | "onRelease" | "onCancel" | "onKeyDown">>;

export function StudioSceneMap({ scene, media, locale, interaction, drawOverlay, toolbar, reportIssues = true }: {
  scene: StudioScene;
  media: Readonly<Record<string, string>>;
  locale: StudioLocale;
  interaction?: StudioMapInteraction;
  drawOverlay?: (px: number) => ReactNode;
  /** Tools docked with the zoom controls at the bottom of the map. */
  toolbar?: ReactNode;
  reportIssues?: boolean;
}) {
  const t = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const id = useId().replace(/:/g, "");
  const [layers, setLayers] = useState({ grid: true, walls: true, terrain: true, tokens: true, marks: true });
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const selecting = interaction?.mode === "region" || interaction?.mode === "objects";
  const source = scene.source;
  const suggestion = scene.detection?.status === "suggested" ? scene.detection.suggestion : null;
  const grid = scene.grid ?? (suggestion ? { ...DEFAULT_GRID, ...suggestion } : null);
  const countTerrain = scene.terrain.reduce((count, run) => count + run.end - run.start + 1, 0);
  const labelFor = (token: StudioScene["tokens"][number]) => t("placementLabel", { name: token.name, visibility: t(token.hidden ? "hidden" : "visible") });
  return source ? <>
      <fieldset className="studio-layer-controls"><legend>{t("layers")}</legend>{(Object.keys(layers) as (keyof typeof layers)[]).map((layer) => <label key={layer}>
        <input type="checkbox" checked={layers[layer]} onChange={(event) => setLayers((current) => ({ ...current, [layer]: event.target.checked }))} />{t(layer)}
      </label>)}</fieldset>
      {media[source.id] ? <MapViewport map={{ url: media[source.id]!, width: source.width, height: source.height }} mode="pan" pan label={t(selecting ? "correction.canvas" : "canvas")} keyboardNavigation minZoom={0.5} wheel="auto" toolbar={toolbar} {...interaction} onImageError={() => setFailedPreview(media[source.id] ?? null)}
        texts={{ zoom: t("zoom"), fit: t("fit"), zoomIn: t("zoomIn"), zoomOut: t("zoomOut") }}>
        {({ scale, px }) => <>
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
            {drawOverlay?.(px)}
          </g>
        </>}
      </MapViewport> : <p className="studio-preview-placeholder">{t("previewUnavailable")}</p>}
      {media[source.id] && failedPreview === media[source.id] && <p role="status">{t("previewUnavailable")}</p>}
      {source.privacy === "legacy-public" && <p className="studio-note">{t("legacy")}</p>}
      <p className="studio-counts" data-testid="studio-layer-counts">{t("counts", { walls: scene.walls.length, terrain: countTerrain, tokens: scene.tokens.length })}</p>
      {scene.gridStatus !== "confirmed" && <p>{t(scene.gridStatus === "proposed" ? "gridProposed" : suggestion ? "gridSuggestion" : "gridMissing")}</p>}
      {scene.detection && <p className="studio-note" data-detector-state={scene.detection.status}>{t(scene.detection.error === "invalid_image" ? "detector.invalid" : `detector.${scene.detection.status}`)}</p>}
      {scene.terrainState === "otherGrid" && <p className="studio-note">{t("terrainStale")}</p>}
      {scene.terrainState === "noGrid" && <p className="studio-note">{t("terrainNoGrid")}</p>}
      {reportIssues && (["problem", "uncertain"] as const).map((kind) => {
        const issues = scene.issues.filter((issue) => issue.kind === kind);
        return issues.length > 0 && <section key={kind} className="studio-issues">
          <h3>{t(kind === "problem" ? "problems" : "uncertain")}</h3>
          <ul>{issues.map((issue, index) => <li key={`${issue.key}:${index}`}>{issue.message}</li>)}</ul>
        </section>;
      })}
      {reportIssues && scene.mapName !== null && !scene.issues.length && <p className="studio-note">{t("noProblems")}</p>}
      {scene.tokens.length > 0 && <details className="studio-placements">
        <summary>{t("placements")}</summary>
        <ul>{scene.tokens.map((token) => <li key={token.index}>
          <strong>{labelFor(token)}</strong>
          <span>{token.square ? t("placementSquare", { column: token.square.column, row: token.square.row, size: token.size }) : t("unplaced")}</span>
          {token.square && !token.center && <span>{t("invalidPlacement")}</span>}
        </li>)}</ul>
      </details>}
  </> : <p className="studio-preview-placeholder">{t("empty")}</p>;
}
