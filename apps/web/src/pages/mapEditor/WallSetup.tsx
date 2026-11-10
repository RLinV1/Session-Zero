import { useEffect, useRef, useState } from "react";
import { Cursor, Door, Eraser, Eyedropper, LineSegments } from "@phosphor-icons/react";
import {
  isDoubtfulWall, MIN_LENGTH_MAX, SAMPLE_TOLERANCE_DEFAULT, SAMPLE_TOLERANCE_MAX, SAMPLE_TOLERANCE_MIN,
  STRICTNESS_DEFAULT, STRICTNESS_MAX, STRICTNESS_MIN,
  type CommandInput, type DetectedWall, type Point, type Portal, type PortalKind, type PortalState, type RoomState, type WallStyle, type WallDetectionAvailability, type WallDetectionRequest, type WallDetectionStatus,
} from "@vtt/shared";
import { api } from "../../net/api";
import { useRoomSnapshot, type EditorConnection } from "../../net/roomConnection";
import { rangeFill } from "../../ui/rangeFill";
import { WallProperties } from "./WallProperties";
import { openingsToDoors } from "./importedOpenings";
import { Modal } from "../../ui/Modal";
import { WallCanvas, type CanvasMode } from "./WallCanvas";
import { HudLayout } from "./HudLayout";
import { t, type TextId } from "../../i18n/locale";

const MODES: { key: CanvasMode; label: TextId; icon: typeof Eraser; needsDetection?: boolean }[] = [
  { key: "select", label: "common.select", icon: Cursor },
  { key: "draw", label: "common.draw", icon: LineSegments },
  { key: "erase", label: "common.erase", icon: Eraser },
  { key: "portal", label: "common.door", icon: Door },
  { key: "sample", label: "common.pick", icon: Eyedropper, needsDetection: true },
];

/** Detected walls the model was unsure about (wall-review) get a halo in this colour in the preview and its legend. */
const DOUBTFUL_COLOR = "#ff5fa2";
/** Preview stroke colours, shared with the Sight step: plain wall, door, window. */
const KIND_COLOR = { wall: "#f0a24a", door: "#e8c46a", window: "#6cc6ff" } as const;
const kindOf = (w: DetectedWall): "wall" | PortalKind => w.portal?.kind ?? "wall";

/** What the Door / window tool turns a clicked wall into (ADR 0030). "wall" makes it plain again. */
const PORTAL_KINDS: { key: PortalKind | "wall"; label: TextId }[] = [
  { key: "door", label: "common.door" },
  { key: "window", label: "common.window" },
  { key: "wall", label: "common.wall" },
];
const PORTAL_KIND_WORD: Record<PortalKind, TextId> = { door: "common.door", window: "common.window" };
const PORTAL_STATE_WORD: Record<PortalState, TextId> = { closed: "common.closed", open: "common.openState", locked: "common.locked" };
const PORTAL_STATES: { key: PortalState; label: TextId }[] = [
  { key: "closed", label: "common.closed" },
  { key: "open", label: "common.openState" },
  { key: "locked", label: "common.locked" },
];

const HINTS: Record<CanvasMode, TextId> = {
  select: "walls.hint.select",
  draw: "walls.hint.draw",
  erase: "walls.hint.erase",
  portal: "walls.hint.door",
  sample: "walls.hint.pick",
};

/** The detection result (by resultId) the GM already applied or dismissed per room + map; module-level so it survives a remount. */
const handledResults = new Map<string, string>();
const handledKey = (roomId: string, mapUrl: string) => `${roomId}|${mapUrl}`;
/** For tests: forget which results were handled. */
export const resetHandledDetections = () => handledResults.clear();

/**
 * The map editor's Walls step (map-editor, FR-GM-09/11): the wall canvas, and a side HUD with the
 * tools and automatic detection. A finished detection opens in a modal preview with Apply and Discard. Detection controls are hidden
 * when the server can't detect walls; drawing and erasing always work.
 */
export function WallSetup({ connection, state, token, detection: detectionEnabled = true, initialMode = "draw" }: {
  connection: EditorConnection;
  state: RoomState;
  token: string;
  /** False where there is no room to run detection against (a library map): the detection controls are left out. */
  detection?: boolean;
  initialMode?: CanvasMode;
}) {
  const map = state.scene.map;
  const mapUrl = map?.url ?? "";
  const wallCount = Object.keys(state.walls).length;
  const [mode, setMode] = useState<CanvasMode>(initialMode);
  const [selected, setSelected] = useState<string>("");
  const [portalKind, setPortalKind] = useState<PortalKind | "wall">("door");
  const [portalState, setPortalState] = useState<PortalState>("closed");
  const [availability, setAvailability] = useState<WallDetectionAvailability | null>(null);
  const [detection, setDetection] = useState<{ mapUrl: string; status: WallDetectionStatus | null }>({ mapUrl, status: null });
  const [busy, setBusy] = useState(false);
  // The detected segments waiting in the preview modal to be applied.
  const [candidates, setCandidates] = useState<{ mapUrl: string; resultId: string; walls: DetectedWall[]; erased: ReadonlySet<number>; review: number | null } | null>(null);
  const detectButton = useRef<HTMLButtonElement>(null);
  const [tolerance, setTolerance] = useState(SAMPLE_TOLERANCE_DEFAULT);
  // null: automatic, the detector's own choice per map; a number is the GM's fixed setting.
  const [strictness, setStrictness] = useState<number | null>(null);
  const [minLength, setMinLength] = useState(0);
  // null: try both light stone and dark ink walls and keep the better.
  const [style, setStyle] = useState<WallStyle | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const { snapshots } = useRoomSnapshot(connection);
  // Counts the changes to `detection` made by a notice or a Detect click, so a slower status fetch never overwrites them.
  const detectionChanges = useRef(0);
  const status = detection.mapUrl === mapUrl ? detection.status : null;
  // Detection is offered only while the vision service is up; otherwise its controls are left out, not greyed.
  const canDetect = detectionEnabled && availability?.available === true;
  // Picking a wall colour needs the vision service even when a built-in map's stored walls are available.
  const canSample = canDetect && (availability?.sampleAvailable ?? true);

  useEffect(() => {
    if (!detectionEnabled) return;
    const abort = new AbortController();
    api.walls.availability(state.roomId, token, abort.signal)
      .then(setAvailability)
      .catch(() => { if (!abort.signal.aborted) setAvailability({ available: false, reason: t("walls.noServer") }); });
    return () => abort.abort();
    // The answer depends on the room's current map and its size (stored walls fit one size only).
  }, [detectionEnabled, state.roomId, token, mapUrl, map?.width, map?.height]);

  // The latest analysis of this map, then every change the server announces for it.
  useEffect(() => {
    if (!mapUrl || !detectionEnabled) return;
    const abort = new AbortController();
    const started = detectionChanges.current;
    api.walls.status(state.roomId, token, mapUrl, abort.signal)
      .then((next) => setDetection((current) => (detectionChanges.current !== started && current.mapUrl === mapUrl ? current : { mapUrl, status: next })))
      .catch(() => {});
    const stop = connection.onWallDetection((url, next) => {
      if (url !== mapUrl) return;
      detectionChanges.current += 1;
      // A fresh run (the id is a hash of the walls, so it can repeat) must open its result again.
      if (next.status === "queued" || next.status === "running") handledResults.delete(handledKey(state.roomId, mapUrl));
      setDetection({ mapUrl, status: next });
      if (next.status === "done") setMessage({ text: t("walls.found", { n: next.wallCount }), error: false });
      if (next.status === "failed") setMessage({ text: next.message, error: true });
    });
    return () => { abort.abort(); stop(); };
  }, [connection, state.roomId, token, mapUrl, snapshots, detectionEnabled]);

  const done = status?.status === "done";

  // The detected segments themselves, for the preview modal.
  useEffect(() => {
    if (!done || !mapUrl || !detectionEnabled) {
      setCandidates(null);
      return;
    }
    const abort = new AbortController();
    api.walls.detected(state.roomId, token, mapUrl, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if (handledResults.get(handledKey(state.roomId, mapUrl)) === result.resultId) {
          // Already applied or dismissed: no modal; clear the stale "done" status so Detect is ready.
          setDetection((current) => (current.mapUrl === mapUrl && current.status?.status === "done" ? { mapUrl, status: null } : current));
          return;
        }
        setCandidates({ mapUrl, ...result, erased: new Set(), review: null });
      })
      .catch(() => {});
    return () => abort.abort();
  }, [done, status, state.roomId, token, mapUrl]);

  if (!map) return <p className="map-editor-empty">{t("walls.applyMapFirst")}</p>;

  /** The detection request: the sliders' values, and the clicked wall's point when there is one. */
  const request = (sample?: Point): WallDetectionRequest => ({
    ...(sample && { sample, tolerance }),
    ...(strictness !== null && { strictness }),
    ...(style !== null && { style }),
    minLength,
  });

  const detect = async (sample?: Point) => {
    setBusy(true);
    setMessage(null);
    handledResults.delete(handledKey(state.roomId, mapUrl));
    try {
      const started = await api.walls.detect(state.roomId, token, request(sample));
      detectionChanges.current += 1;
      setDetection({ mapUrl, status: started });
      setMessage({ text: sample ? t("walls.detectingLike") : t("walls.detecting"), error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : t("walls.startFailed"), error: true });
    } finally {
      setBusy(false);
    }
  };

  const run = async (command: CommandInput, doneText?: string) => {
    const result = await connection.command(command);
    if (!result.ok) setMessage({ text: result.message, error: true });
    else if (doneText) setMessage({ text: doneText, error: false });
    return result.ok;
  };

  /** Makes the clicked wall what the Door / window tool is set to; nothing to send when it already is. */
  const markPortal = (wallId: string) => {
    const portal: Portal | null = portalKind === "wall" ? null : { kind: portalKind, state: portalState };
    const current = state.walls[wallId]?.portal ?? null;
    if (current?.kind === portal?.kind && current?.state === portal?.state) return;
    void run({ type: "portal.set", wallId, portal });
  };

  // What the Door tool would send for each imported UVTT opening that is still GM-only (ADR 0041).
  const openings = openingsToDoors(state.walls);
  /** Makes every imported opening a door at once, open or closed as its file marks it; stops at the first refusal. */
  const makeOpeningsDoors = async () => {
    for (const command of openings) if (!(await run(command))) return;
    setMessage({ text: t("walls.madeDoors", { n: openings.length }), error: false });
  };

  const pendingWalls = candidates?.mapUrl === mapUrl ? candidates : null;
  // Walls the model was unsure about (wall-review): every one, and how many the preview holds.
  const doubtfulKeys = new Set<number>();
  pendingWalls?.walls.forEach((w, i) => { if (isDoubtfulWall(w)) doubtfulKeys.add(i); });
  const doubtfulList = [...doubtfulKeys];
  const erased = pendingWalls?.erased ?? new Set<number>();
  const doubtfulLeft = doubtfulList.filter((i) => !erased.has(i)).length;
  const confident = pendingWalls ? pendingWalls.walls.length - new Set([...erased, ...doubtfulKeys]).size : 0;
  const keeping = pendingWalls ? pendingWalls.walls.length - erased.size : 0;
  const reviewing = pendingWalls?.review ?? null;
  const kindCounts = { wall: 0, door: 0, window: 0 };
  const stateSeen = new Set<PortalState>();
  pendingWalls?.walls.forEach((w) => { kindCounts[kindOf(w)]++; if (w.portal) stateSeen.add(w.portal.state); });
  const hasPortals = kindCounts.door + kindCounts.window > 0;
  const kindBreakdown = hasPortals
    ? [
      kindCounts.wall > 0 && t("walls.nWalls", { n: kindCounts.wall }),
      kindCounts.door > 0 && t("walls.nDoors", { n: kindCounts.door }),
      kindCounts.window > 0 && t("walls.nWindows", { n: kindCounts.window }),
    ].filter((part) => part !== false).join(t("common.sep"))
    : "";
  const reviewKey = reviewing === null ? null : doubtfulList[reviewing] ?? null;
  const toggleCandidate = (key: number) => setCandidates((current) => {
    if (!current) return current;
    const next = new Set(current.erased);
    if (!next.delete(key)) next.add(key);
    return { ...current, erased: next };
  });
  const setReview = (review: number | null) => setCandidates((current) => (current ? { ...current, review } : current));
  /** Steps to the next doubtful wall, or ends the review after the last. */
  const reviewStep = (by: number) => {
    if (reviewing === null) return;
    const next = reviewing + by;
    setReview(next >= 0 && next < doubtfulList.length ? next : by > 0 ? null : 0);
  };
  const eraseReviewed = () => {
    if (reviewKey === null) return;
    const wasErased = erased.has(reviewKey);
    toggleCandidate(reviewKey);
    if (!wasErased) reviewStep(1);
  };
  /** Drops the result without adding anything. */
  const markHandled = () => { if (pendingWalls) handledResults.set(handledKey(state.roomId, mapUrl), pendingWalls.resultId); };
  const discard = () => { markHandled(); setDetection({ mapUrl, status: null }); };

  /** Applies the detected walls the GM has not erased; `confidentOnly` also leaves out the doubtful ones. */
  const apply = async (confidentOnly = false) => {
    const left = confidentOnly ? new Set([...erased, ...doubtfulKeys]) : erased;
    const exclude = pendingWalls && left.size > 0
      ? { resultId: pendingWalls.resultId, indices: [...left].sort((a, b) => a - b) }
      : undefined;
    const count = pendingWalls ? pendingWalls.walls.length - left.size : found;
    const ok = await run({ type: "wall.applyDetected", mapUrl, ...(exclude && { exclude }) }, t("walls.applied", { n: count ?? 0 }));
    // The result is spent: drop its overlay so the new walls aren't drawn twice.
    if (ok) { markHandled(); setDetection({ mapUrl, status: null }); }
  };

  const pending = status?.status === "queued" || status?.status === "running";
  const found = status?.status === "done" ? status.wallCount : null;

  return (
    <HudLayout className="map-editor-split">
      <WallCanvas
        map={map}
        grid={state.scene.grid}
        walls={state.walls}
        mode={mode}
        busy={busy}
        onAdd={(a, b) => void run({ type: "wall.add", walls: [{ a, b }] })}
        onRemove={(wallId) => void run({ type: "wall.remove", wallIds: [wallId] })}
        onPortal={markPortal}
        onSelect={setSelected}
        selected={selected}
        onSample={(at) => void detect(at)}
      />
      <aside className="map-editor-hud" aria-label={t("walls.tools")}>
        <section className="stack">
          <h3 className="map-editor-heading">{t("common.tools")}</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label={t("walls.tool")}>
            {MODES.filter(({ needsDetection }) => !needsDetection || canSample).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                className="tool-button map-editor-mode"
                title={t(label)}
                onClick={() => setMode(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
          {mode === "portal" && (
            <div className="stack map-editor-portal">
              <OptionRow label={t("walls.makeWalls")} options={PORTAL_KINDS} value={portalKind} onChange={setPortalKind} />
              <OptionRow label={t("walls.startingState")} options={PORTAL_STATES} value={portalState} onChange={setPortalState} disabled={portalKind === "wall"} />
            </div>
          )}
          <p className="muted small-print">{t(HINTS[mode])}</p>
          <label className="stack">{t("walls.selected")}
            <select value={state.walls[selected] ? selected : ""} onChange={(e) => setSelected(e.target.value)}>
              <option value="">{t("walls.selectOne")}</option>
              {Object.values(state.walls).map((wall, i) => <option key={wall.id} value={wall.id}>{wall.portal?.kind === "window" ? t("common.window") : wall.portal || wall.uvttPortal ? t("common.door") : t("common.wall")} {i + 1}</option>)}
            </select>
          </label>
          {state.walls[selected] && <WallProperties key={JSON.stringify(state.walls[selected])} wall={state.walls[selected]!} map={map} disabled={busy} onSave={async (wall) => {
            const result = await connection.command({ type: "wall.update", wall });
            if (!result.ok) throw new Error(result.message);
          }} />}
          {mode === "sample" && (
            <label className="stack">
              <span className="small-print">{t("walls.colourRange", { n: tolerance })}</span>
              <input
                type="range"
                className="range range-filled"
                min={SAMPLE_TOLERANCE_MIN}
                max={SAMPLE_TOLERANCE_MAX}
                value={tolerance}
                style={rangeFill(tolerance, SAMPLE_TOLERANCE_MIN, SAMPLE_TOLERANCE_MAX)}
                onChange={(event) => setTolerance(Number(event.target.value))}
                title={t("walls.sensitivity")}
              />
            </label>
          )}
          <p className="map-editor-count">
            {t("walls.countPans", { n: wallCount })}
          </p>
        </section>

        {openings.length > 0 && (
          <section className="stack" aria-label={t("walls.importedOpenings")}>
            <h3 className="map-editor-heading">{t("walls.importedOpenings")}</h3>
            <p className="muted small-print">
              {t("walls.openingsNote", { n: openings.length })}
            </p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void makeOpeningsDoors()}>
              {t("walls.makeAllDoors")}
            </button>
          </section>
        )}

        {canDetect && <section className="stack" data-guide="walls-detection">
          <h3 className="map-editor-heading">{t("walls.auto")}</h3>
          {canDetect && pending && <p className="walls-status" aria-busy="true">{status?.status === "running" ? t("walls.detecting") : t("walls.waitingVision")}</p>}
          {canDetect && (
            <div className="stack">
              <label className="stack">
                <span className="small-print">{t("walls.colour")}</span>
                <select title={t("walls.colourHint")} value={style ?? "auto"} onChange={(event) => setStyle(event.target.value === "auto" ? null : (event.target.value as WallStyle))}>
                  <option value="auto">{t("walls.colour.auto")}</option>
                  <option value="bright">{t("walls.colour.light")}</option>
                  <option value="dark">{t("walls.colour.dark")}</option>
                  <option value="outlined">{t("walls.colour.inked")}</option>
                </select>
              </label>
              <label className="stack">
                <span className="small-print">{t("walls.strictness", { value: strictness === null ? t("walls.automatic") : strictness.toFixed(2) })}</span>
                <input
                  type="range"
                  className="range range-filled"
                  min={STRICTNESS_MIN}
                  max={STRICTNESS_MAX}
                  step={0.05}
                  value={strictness ?? STRICTNESS_DEFAULT}
                  style={rangeFill(strictness ?? STRICTNESS_DEFAULT, STRICTNESS_MIN, STRICTNESS_MAX)}
                  onChange={(event) => setStrictness(Number(event.target.value))}
                  title={t("walls.edgeHint")}
                />
                {strictness !== null && <button type="button" className="secondary" onClick={() => setStrictness(null)}>{t("walls.backToAuto")}</button>}
              </label>
              <label className="stack">
                <span className="small-print">{t("walls.shortest", { value: minLength === 0 ? t("walls.anyLength") : t("walls.nCells", { n: minLength }) })}</span>
                <input
                  type="range"
                  className="range range-filled"
                  min={0}
                  max={MIN_LENGTH_MAX}
                  step={0.5}
                  value={minLength}
                  style={rangeFill(minLength, 0, MIN_LENGTH_MAX)}
                  onChange={(event) => setMinLength(Number(event.target.value))}
                  title={t("walls.minLengthHint")}
                />
              </label>
            </div>
          )}
          <div className="row button-row walls-actions">
            <button ref={detectButton} type="button" className="secondary" disabled={!canDetect || busy || pending} onClick={() => void detect()}>
              {status ? t("walls.detectAgain") : t("walls.detect")}
            </button>
          </div>
        </section>}

        {wallCount > 0 && (
          <button type="button" className="secondary danger" onClick={() => void run({ type: "wall.clear" }, t("walls.cleared"))}>
            {t("walls.clearAll")}
          </button>
        )}
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
        <Modal
          className="walls-preview-modal"
          open={pendingWalls !== null && pendingWalls.walls.length > 0}
          title={t("walls.detected")}
          onClose={discard}
          onAfterClose={() => detectButton.current?.focus()}
        >
          {pendingWalls && (
            <div className="stack">
              <svg className="walls-preview-map" style={{ aspectRatio: `${map.width} / ${map.height}` }} viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={t("walls.detectedOver", { n: pendingWalls.walls.length })}>
                <image href={map.url} width={map.width} height={map.height} />
                <g strokeLinecap="round" fill="none">
                  {pendingWalls.walls.map((w, i) => {
                    const gone = erased.has(i);
                    const unsure = doubtfulKeys.has(i) && !gone;
                    const kind = kindOf(w);
                    const portalState = w.portal?.state;
                    const color = gone ? "#9aa5b1" : KIND_COLOR[kind];
                    // Every doubtful wall keeps its kind colour and gains a dashed pink halo, so the dashes of the line itself still mean "open".
                    const dash = gone ? "3 6" : portalState === "open" ? "8 6" : undefined;
                    const haloed = unsure;
                    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
                    const toggle = () => toggleCandidate(i);
                    return (
                      <g
                        key={i}
                        role="button"
                        tabIndex={0}
                        aria-pressed={gone}
                        aria-label={[
                          t("walls.detectedWall", { n: i + 1 }),
                          ...(w.portal ? [t(PORTAL_KIND_WORD[w.portal.kind]).toLowerCase(), t(PORTAL_STATE_WORD[w.portal.state]).toLowerCase()] : []),
                          ...(doubtfulKeys.has(i) ? [t("walls.doubtfulTag")] : []),
                          ...(gone ? [t("walls.erasedTag")] : []),
                        ].join(t("common.sep"))}
                        className="walls-preview-wall"
                        opacity={gone ? 0.55 : 1}
                        data-doubtful={unsure ? "true" : undefined}
                        data-kind={kind}
                        data-state={portalState}
                        data-erased={gone ? "true" : undefined}
                        data-focus={reviewKey === i ? "true" : undefined}
                        onClick={toggle}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                      >
                        {reviewKey === i && <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#fff" strokeOpacity={0.9} strokeWidth={9} vectorEffect="non-scaling-stroke" />}
                        <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
                        {haloed && <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={DOUBTFUL_COLOR} strokeWidth={w.portal ? 13 : 9} strokeDasharray="3 4" strokeOpacity={0.85} vectorEffect="non-scaling-stroke" />}
                        {w.portal && !gone && <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#111" strokeWidth={9} vectorEffect="non-scaling-stroke" />}
                        <line
                          x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
                          stroke={color}
                          strokeWidth={w.portal ? 6 : 3}
                          strokeDasharray={dash}
                          vectorEffect="non-scaling-stroke"
                        />
                        {portalState === "locked" && !gone && (
                          // A zero-length round-capped line is a dot that keeps its screen size at any zoom.
                          <line x1={mid.x} y1={mid.y} x2={mid.x} y2={mid.y} stroke="#111" strokeWidth={15} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        )}
                        {portalState === "locked" && !gone && (
                          <line x1={mid.x} y1={mid.y} x2={mid.x} y2={mid.y} stroke={color} strokeWidth={10} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
              <p className="walls-status" role="status">{kindBreakdown ? t("walls.foundBreakdown", { n: pendingWalls.walls.length, parts: kindBreakdown }) : t("walls.foundCount", { n: pendingWalls.walls.length })}</p>
              <p className="small-print">{t("walls.eraseHint")}</p>
              {(hasPortals || doubtfulKeys.size > 0 || erased.size > 0) && (
                <ul className="walls-legend" aria-label={t("walls.colours")}>
                  {kindCounts.wall > 0 && <li><span className="walls-legend-swatch" aria-hidden="true" />{t("common.wall")}</li>}
                  {kindCounts.door > 0 && <li><span className="walls-legend-swatch portal" style={{ borderColor: KIND_COLOR.door }} aria-hidden="true" />{t("common.door")}</li>}
                  {kindCounts.window > 0 && <li><span className="walls-legend-swatch portal" style={{ borderColor: KIND_COLOR.window }} aria-hidden="true" />{t("common.window")}</li>}
                  {hasPortals && <li className="walls-legend-sep" role="presentation" aria-hidden="true" />}
                  {stateSeen.has("closed") && <li><span className="walls-legend-swatch state" aria-hidden="true" />{t("common.closed")}</li>}
                  {stateSeen.has("open") && <li><span className="walls-legend-swatch state open" aria-hidden="true" />{t("common.openState")}</li>}
                  {stateSeen.has("locked") && <li><span className="walls-legend-swatch state locked" aria-hidden="true" />{t("common.locked")}</li>}
                  {hasPortals && (doubtfulKeys.size > 0 || erased.size > 0) && <li className="walls-legend-sep" role="presentation" aria-hidden="true" />}
                  {doubtfulKeys.size > 0 && <li><span className="walls-legend-swatch doubtful" style={{ borderColor: DOUBTFUL_COLOR }} aria-hidden="true" />{t("walls.doubtful")}</li>}
                  {erased.size > 0 && <li><span className="walls-legend-swatch erased" aria-hidden="true" />{t("walls.erased")}</li>}
                </ul>
              )}
              {doubtfulKeys.size > 0 && (
                <div className="stack walls-review">
                  <p className="walls-status" role="status">{t("walls.doubtfulCount", { n: doubtfulLeft })}</p>
                  {reviewing === null ? (
                    <button type="button" className="secondary" disabled={doubtfulLeft === 0} onClick={() => setReview(0)}>{t("walls.reviewDoubtful")}</button>
                  ) : (
                    <div className="stack" role="group" aria-label={t("walls.reviewDoubtful")}>
                      <p className="small-print">{t("walls.reviewPosition", { n: reviewing + 1, total: doubtfulList.length })}{reviewKey !== null && erased.has(reviewKey) ? t("walls.erasedSuffix") : ""}</p>
                      <div className="row button-row">
                        <button type="button" className="secondary" disabled={reviewing === 0} onClick={() => reviewStep(-1)}>{t("common.back")}</button>
                        <button type="button" className="secondary" onClick={eraseReviewed}>{reviewKey !== null && erased.has(reviewKey) ? t("walls.bringBack") : t("common.erase")}</button>
                        <button type="button" className="secondary" onClick={() => reviewStep(1)}>{reviewing === doubtfulList.length - 1 ? t("common.finish") : t("common.keep")}</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="row button-row">
                <button type="button" className="secondary" disabled={busy} onClick={discard}>{t("common.discard")}</button>
                {doubtfulKeys.size > 0 && (
                  <button type="button" className="secondary" disabled={busy || confident === 0} onClick={() => void apply(true)}>
                    {t("walls.applyConfident", { n: confident })}
                  </button>
                )}
                <button className="primary" type="button" disabled={busy || keeping === 0} onClick={() => void apply()}>
                  {wallCount > 0 ? t("walls.replaceN", { n: keeping }) : t("walls.applyN", { n: keeping })}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </aside>
    </HudLayout>
  );
}

/** A small radio row for the Door / window tool's choices. */
function OptionRow<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: { key: T; label: TextId }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="map-editor-option-row" role="radiogroup" aria-label={label} aria-disabled={disabled}>
      <span className="muted small-print">{label}</span>
      <div className="map-editor-options">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={value === option.key}
            className="tool-button map-editor-option"
            disabled={disabled}
            onClick={() => onChange(option.key)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
