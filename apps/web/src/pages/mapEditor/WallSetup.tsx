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
import { Modal } from "../../ui/Modal";
import { WallCanvas, type CanvasMode } from "./WallCanvas";
import { HudLayout } from "./HudLayout";

const MODES: { key: CanvasMode; label: string; icon: typeof Eraser; needsDetection?: boolean }[] = [
  { key: "select", label: "Select", icon: Cursor },
  { key: "draw", label: "Draw", icon: LineSegments },
  { key: "erase", label: "Erase", icon: Eraser },
  { key: "portal", label: "Door", icon: Door },
  { key: "sample", label: "Pick", icon: Eyedropper, needsDetection: true },
];

/** Detected walls the model was unsure about (wall-review) get a halo in this colour in the preview and its legend. */
const DOUBTFUL_COLOR = "#ff5fa2";
/** Preview stroke colours, shared with the Sight step: plain wall, door, window. */
const KIND_COLOR = { wall: "#f0a24a", door: "#e8c46a", window: "#6cc6ff" } as const;
const kindOf = (w: DetectedWall): "wall" | PortalKind => w.portal?.kind ?? "wall";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the Door / window tool turns a clicked wall into (ADR 0030). "wall" makes it plain again. */
const PORTAL_KINDS: { key: PortalKind | "wall"; label: string }[] = [
  { key: "door", label: "Door" },
  { key: "window", label: "Window" },
  { key: "wall", label: "Wall" },
];
const PORTAL_STATES: { key: PortalState; label: string }[] = [
  { key: "closed", label: "Closed" },
  { key: "open", label: "Open" },
  { key: "locked", label: "Locked" },
];

const HINTS: Record<CanvasMode, string> = {
  select: "Select geometry on the map, or choose it below, to edit its endpoints and metadata.",
  draw: "Click to start a wall, click again to end it. Alt places freely; Esc stops.",
  erase: "Click a wall to remove it, or a blue detected wall to leave it out.",
  portal: "Pick a type, then click walls.",
  sample: "Click a wall to find walls like it.",
};

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
      .catch(() => { if (!abort.signal.aborted) setAvailability({ available: false, reason: "Couldn't reach the server." }); });
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
      setDetection({ mapUrl, status: next });
      if (next.status === "done") setMessage({ text: `Detection found ${next.wallCount} ${next.wallCount === 1 ? "wall" : "walls"}.`, error: false });
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
      .then((result) => { if (!abort.signal.aborted) setCandidates({ mapUrl, ...result, erased: new Set(), review: null }); })
      .catch(() => {});
    return () => abort.abort();
  }, [done, status, state.roomId, token, mapUrl]);

  if (!map) return <p className="map-editor-empty">Apply a map in the Map step first, then set up its walls here.</p>;

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
    try {
      const started = await api.walls.detect(state.roomId, token, request(sample));
      detectionChanges.current += 1;
      setDetection({ mapUrl, status: started });
      setMessage({ text: sample ? "Detecting walls like the one you clicked…" : "Detecting walls…", error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't start wall detection", error: true });
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
    ? `: ${[plural(kindCounts.wall, "wall", "walls"), plural(kindCounts.door, "door", "doors"), plural(kindCounts.window, "window", "windows")].filter((t) => !t.startsWith("0 ")).join(", ")}`
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
  const discard = () => setDetection({ mapUrl, status: null });

  /** Applies the detected walls the GM has not erased; `confidentOnly` also leaves out the doubtful ones. */
  const apply = async (confidentOnly = false) => {
    const left = confidentOnly ? new Set([...erased, ...doubtfulKeys]) : erased;
    const exclude = pendingWalls && left.size > 0
      ? { resultId: pendingWalls.resultId, indices: [...left].sort((a, b) => a - b) }
      : undefined;
    const count = pendingWalls ? pendingWalls.walls.length - left.size : found;
    const ok = await run({ type: "wall.applyDetected", mapUrl, ...(exclude && { exclude }) }, `Applied ${count} walls.`);
    // The result is spent: drop its overlay so the new walls aren't drawn twice.
    if (ok) setDetection({ mapUrl, status: null });
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
      <aside className="map-editor-hud" aria-label="Wall tools">
        <section className="stack">
          <h3 className="map-editor-heading">Tools</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label="Wall tool">
            {MODES.filter(({ needsDetection }) => !needsDetection || canSample).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                className="tool-button map-editor-mode"
                title={label}
                onClick={() => setMode(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {mode === "portal" && (
            <div className="stack map-editor-portal">
              <OptionRow label="Make walls" options={PORTAL_KINDS} value={portalKind} onChange={setPortalKind} />
              <OptionRow label="Starting state" options={PORTAL_STATES} value={portalState} onChange={setPortalState} disabled={portalKind === "wall"} />
            </div>
          )}
          <p className="muted small-print">{HINTS[mode]}</p>
          <label className="stack">Selected geometry
            <select value={state.walls[selected] ? selected : ""} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a wall, door or window</option>
              {Object.values(state.walls).map((wall, i) => <option key={wall.id} value={wall.id}>{wall.portal?.kind === "window" ? "Window" : wall.portal || wall.uvttPortal ? "Door" : "Wall"} {i + 1}</option>)}
            </select>
          </label>
          {state.walls[selected] && <WallProperties key={JSON.stringify(state.walls[selected])} wall={state.walls[selected]!} map={map} disabled={busy} onSave={async (wall) => {
            const result = await connection.command({ type: "wall.update", wall });
            if (!result.ok) throw new Error(result.message);
          }} />}
          {mode === "sample" && (
            <label className="stack">
              <span className="small-print">Colour range: {tolerance}</span>
              <input
                type="range"
                className="range range-filled"
                min={SAMPLE_TOLERANCE_MIN}
                max={SAMPLE_TOLERANCE_MAX}
                value={tolerance}
                style={rangeFill(tolerance, SAMPLE_TOLERANCE_MIN, SAMPLE_TOLERANCE_MAX)}
                onChange={(event) => setTolerance(Number(event.target.value))}
                title="Lower finds only walls close to the clicked colour; higher finds paler or darker ones, and more noise."
              />
            </label>
          )}
          <p className="map-editor-count">
            {wallCount} {wallCount === 1 ? "wall" : "walls"}. Middle-drag or Space-drag pans.
          </p>
        </section>

        {canDetect && <section className="stack" data-guide="walls-detection">
          <h3 className="map-editor-heading">Automatic detection</h3>
          {canDetect && pending && <p className="walls-status" aria-busy="true">{status?.status === "running" ? "Detecting walls…" : "Waiting for the vision service…"}</p>}
          {canDetect && (
            <div className="stack">
              <label className="stack">
                <span className="small-print">Wall colour</span>
                <select title="Pick one if automatic detection follows shadows instead of walls." value={style ?? "auto"} onChange={(event) => setStyle(event.target.value === "auto" ? null : (event.target.value as WallStyle))}>
                  <option value="auto">Automatic</option>
                  <option value="bright">Light stone walls</option>
                  <option value="dark">Dark ink walls</option>
                  <option value="outlined">Inked outlines (buildings, caves)</option>
                </select>
              </label>
              <label className="stack">
                <span className="small-print">Strictness: {strictness === null ? "automatic" : strictness.toFixed(2)}</span>
                <input
                  type="range"
                  className="range range-filled"
                  min={STRICTNESS_MIN}
                  max={STRICTNESS_MAX}
                  step={0.05}
                  value={strictness ?? STRICTNESS_DEFAULT}
                  style={rangeFill(strictness ?? STRICTNESS_DEFAULT, STRICTNESS_MIN, STRICTNESS_MAX)}
                  onChange={(event) => setStrictness(Number(event.target.value))}
                  title="Higher keeps only walls with a clear drawn edge; it can miss faint ones."
                />
                {strictness !== null && <button type="button" className="secondary" onClick={() => setStrictness(null)}>Back to automatic</button>}
              </label>
              <label className="stack">
                <span className="small-print">Shortest wall: {minLength === 0 ? "any" : `${minLength} ${minLength === 1 ? "cell" : "cells"}`}</span>
                <input
                  type="range"
                  className="range range-filled"
                  min={0}
                  max={MIN_LENGTH_MAX}
                  step={0.5}
                  value={minLength}
                  style={rangeFill(minLength, 0, MIN_LENGTH_MAX)}
                  onChange={(event) => setMinLength(Number(event.target.value))}
                  title="Drops short pieces such as rubble. Detect again to apply."
                />
              </label>
            </div>
          )}
          <div className="row button-row walls-actions">
            <button ref={detectButton} type="button" className="secondary" disabled={!canDetect || busy || pending} onClick={() => void detect()}>
              {status ? "Detect again" : "Detect walls"}
            </button>
          </div>
        </section>}

        {wallCount > 0 && (
          <button type="button" className="secondary danger" onClick={() => void run({ type: "wall.clear" }, "Walls cleared.")}>
            Clear all walls
          </button>
        )}
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
        <Modal
          className="walls-preview-modal"
          open={pendingWalls !== null && pendingWalls.walls.length > 0}
          title="Detected walls"
          onClose={discard}
          onAfterClose={() => detectButton.current?.focus()}
        >
          {pendingWalls && (
            <div className="stack">
              <svg className="walls-preview-map" style={{ aspectRatio: `${map.width} / ${map.height}` }} viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={`The map with ${pendingWalls.walls.length} detected ${pendingWalls.walls.length === 1 ? "wall" : "walls"} drawn over it.`}>
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
                        aria-label={`Detected wall ${i + 1}${w.portal ? `, ${kind}, ${portalState}` : ""}${doubtfulKeys.has(i) ? ", doubtful" : ""}${gone ? ", erased" : ""}`}
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
              <p className="walls-status" role="status">{pendingWalls.walls.length} {pendingWalls.walls.length === 1 ? "wall" : "walls"} found{kindBreakdown}.</p>
              <p className="small-print">Click a wall to erase it, or again to bring it back.</p>
              {(hasPortals || doubtfulKeys.size > 0 || erased.size > 0) && (
                <ul className="walls-legend" aria-label="Detected wall colours">
                  {kindCounts.wall > 0 && <li><span className="walls-legend-swatch" aria-hidden="true" />Wall</li>}
                  {kindCounts.door > 0 && <li><span className="walls-legend-swatch portal" style={{ borderColor: KIND_COLOR.door }} aria-hidden="true" />Door</li>}
                  {kindCounts.window > 0 && <li><span className="walls-legend-swatch portal" style={{ borderColor: KIND_COLOR.window }} aria-hidden="true" />Window</li>}
                  {hasPortals && <li className="walls-legend-sep" role="presentation" aria-hidden="true" />}
                  {stateSeen.has("closed") && <li><span className="walls-legend-swatch state" aria-hidden="true" />Closed</li>}
                  {stateSeen.has("open") && <li><span className="walls-legend-swatch state open" aria-hidden="true" />Open</li>}
                  {stateSeen.has("locked") && <li><span className="walls-legend-swatch state locked" aria-hidden="true" />Locked</li>}
                  {hasPortals && (doubtfulKeys.size > 0 || erased.size > 0) && <li className="walls-legend-sep" role="presentation" aria-hidden="true" />}
                  {doubtfulKeys.size > 0 && <li><span className="walls-legend-swatch doubtful" style={{ borderColor: DOUBTFUL_COLOR }} aria-hidden="true" />Doubtful</li>}
                  {erased.size > 0 && <li><span className="walls-legend-swatch erased" aria-hidden="true" />Erased</li>}
                </ul>
              )}
              {doubtfulKeys.size > 0 && (
                <div className="stack walls-review">
                  <p className="walls-status" role="status">{doubtfulLeft} doubtful {doubtfulLeft === 1 ? "wall" : "walls"}</p>
                  {reviewing === null ? (
                    <button type="button" className="secondary" disabled={doubtfulLeft === 0} onClick={() => setReview(0)}>Review doubtful walls</button>
                  ) : (
                    <div className="stack" role="group" aria-label="Review doubtful walls">
                      <p className="small-print">Wall {reviewing + 1} of {doubtfulList.length}{reviewKey !== null && erased.has(reviewKey) ? " (erased)" : ""}</p>
                      <div className="row button-row">
                        <button type="button" className="secondary" disabled={reviewing === 0} onClick={() => reviewStep(-1)}>Back</button>
                        <button type="button" className="secondary" onClick={eraseReviewed}>{reviewKey !== null && erased.has(reviewKey) ? "Bring back" : "Erase"}</button>
                        <button type="button" className="secondary" onClick={() => reviewStep(1)}>{reviewing === doubtfulList.length - 1 ? "Finish" : "Keep"}</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="row button-row">
                <button type="button" className="secondary" disabled={busy} onClick={discard}>Discard</button>
                {doubtfulKeys.size > 0 && (
                  <button type="button" className="secondary" disabled={busy || confident === 0} onClick={() => void apply(true)}>
                    Apply confident walls only ({confident})
                  </button>
                )}
                <button className="primary" type="button" disabled={busy || keeping === 0} onClick={() => void apply()}>
                  {wallCount > 0 ? `Replace with ${keeping} walls` : `Apply ${keeping} walls`}
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
  options: { key: T; label: string }[];
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
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
