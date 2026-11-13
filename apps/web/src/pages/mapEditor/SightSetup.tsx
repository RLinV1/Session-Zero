import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Eye, EyeSlash, Infinity as InfinityIcon, Plus, Ruler, Trash, X } from "@phosphor-icons/react";
import { blocksMovement, EMPTY_STATS, filterStateForViewer, snapTokenCenter, viewerSight, type Participant, type Point, type RoomState, type Token, type Wall } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { makeSightMaskCanvas, sightColor } from "../../board/sightMask";
import { rangeFill } from "../../ui/rangeFill";
import { MapCanvas } from "./MapCanvas";
import { HudLayout } from "./HudLayout";
import { t } from "../../i18n/locale";
import { MapStylePicker } from "./MapStylePicker";

const MAX_SQUARES = 60;
/** The editor-only viewer that owns the test tokens: never a room participant, never sent anywhere. */
const TEST_ID = "sight-test-token";
const TEST_VIEWER: Participant = { id: TEST_ID, role: "player", displayName: "Test tokens" };

interface TestToken { id: string; name: string; position: Point }

const isPortal = (w: Wall) => w.portal !== undefined || w.uvttPortal !== undefined;
const isOpen = (w: Wall) => !blocksMovement(w);
/** The wall with its door or window opened, or closed if it was open. */
const flipped = (w: Wall): Wall =>
  w.portal ? { ...w, portal: { ...w.portal, state: isOpen(w) ? "closed" : "open" } } : { ...w, uvttPortal: { ...w.uvttPortal, closed: isOpen(w) } };

/**
 * The map editor's Sight step (map-editor-sight-step): line of sight on or off and the sight range
 * for the whole room, previewed with test tokens the GM adds, removes and drags. The room's own
 * tokens are not shown. Settings go to the editor draft and reach the room only with Save changes;
 * test tokens never leave the editor.
 */
export function SightSetup({ connection, state }: { connection: EditorConnection; state: RoomState }) {
  const { map, grid } = state.scene;
  const [message, setMessage] = useState<string | null>(null);
  // Snapped to a square like a token dropped on the board, and kept on the map.
  const place = (p: Point): Point => {
    if (!map) return p;
    const inside = (q: Point): Point => ({ x: Math.min(map.width, Math.max(0, q.x)), y: Math.min(map.height, Math.max(0, q.y)) });
    const s = snapTokenCenter(inside(p), 1, grid);
    // A snap past the edge steps back one square.
    return { x: s.x > map.width ? s.x - grid.cellSize : s.x < 0 ? s.x + grid.cellSize : s.x, y: s.y > map.height ? s.y - grid.cellSize : s.y < 0 ? s.y + grid.cellSize : s.y };
  };
  const centre = (offset = 0): Point =>
    map ? place({ x: map.width / 2 + offset * grid.cellSize, y: map.height / 2 }) : { x: 0, y: 0 };
  const [tokens, setTokens] = useState<TestToken[]>([]);
  const nextNumber = useRef(1);
  // The step opens asking for a first token; Add token asks again. The next click on the map places it.
  const [placing, setPlacing] = useState(true);
  // The tokens whose sight is shown: they are the ones the test viewer owns.
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  // The popup's Close hides it until `shown` is replaced.
  const [closedFor, setClosedFor] = useState<ReadonlySet<string> | null>(null);
  // A drag only moves the marker; sight updates on drop, like a drag on the board.
  const [drag, setDrag] = useState<{ id: string; at: Point } | null>(null);
  // Where on the token it was grabbed, so it moves with the pointer instead of jumping its centre to it.
  const grab = useRef<Point>({ x: 0, y: 0 });
  // What the press that is still down began on, so its release can tell a door click from a map click.
  const pressed = useRef<Element | null>(null);
  // Doors and windows opened or closed for the preview only: the room's walls don't change.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const walls = useMemo(
    () => Object.fromEntries(Object.values(state.walls).map((w) => [w.id, toggled.has(w.id) ? flipped(w) : w])),
    [state.walls, toggled],
  );
  const toggle = (id: string) => setToggled((now) => {
    const next = new Set(now);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  // Escape stops placing once a token exists (before that the step is always asking); it then doesn't also close the editor.
  const canCancel = placing && tokens.length > 0;
  useEffect(() => {
    if (!canCancel) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPlacing(false);
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [canCancel]);
  const range = state.scene.sightRange ?? null;
  const enabled = state.scene.lineOfSight === true;

  // The room with only the test tokens, as a player owning them would receive it. Line of sight is
  // forced on so the range can be tuned before it is turned on. Only the shown tokens are owned.
  const preview = useMemo(() => {
    if (!map || tokens.length === 0) return null;
    const { sightRange: _drop, ...rest } = state.scene;
    const scene = { ...rest, lineOfSight: true, ...(range !== null && { sightRange: range }) };
    const asToken = (token: TestToken): Token => ({
      id: token.id, name: token.name, position: token.position, size: 1, rotation: 0, color: "#c2410c", imageUrl: null,
      ownerIds: shown.has(token.id) ? [TEST_ID] : [], hidden: false, stats: EMPTY_STATS, conditions: [],
    });
    const seen = { ...state, scene, walls, tokens: Object.fromEntries(tokens.map((token) => [token.id, asToken(token)])) };
    return { polygons: viewerSight(seen, TEST_VIEWER), visible: new Set(Object.keys(filterStateForViewer(seen, TEST_VIEWER).tokens)) };
  }, [map, tokens, shown, state, walls, range]);
  const polygons = preview?.polygons ?? null;

  // The mask as an image the preview SVG can scale with the map (letterboxed like the other steps).
  const mask = useMemo(() => {
    if (!map || !polygons) return null;
    return makeSightMaskCanvas(polygons, map.width, map.height, grid.cellSize, sightColor(null)).canvas.toDataURL();
  }, [polygons, map, grid.cellSize]);

  if (!map) return <p className="map-editor-empty">{t("sight.needsMap")}</p>;

  const send = async (command: { type: "scene.setLineOfSight" | "scene.setIsometric"; enabled: boolean } | { type: "scene.setSightRange"; range: number | null }) => {
    const result = await connection.command(command);
    setMessage(result.ok ? null : result.message);
  };
  const unit = grid.unitLabel;
  const squares = Math.max(1, Math.round((range ?? grid.unitsPerCell * MAX_SQUARES) / grid.unitsPerCell));
  // A longer range typed as an exact distance stretches the slider, so dragging it never cuts the range short.
  const maxSquares = Math.max(MAX_SQUARES, squares);
  const setRange = (next: number) => void send({ type: "scene.setSightRange", range: Math.min(grid.unitsPerCell * 1000, Math.max(grid.unitsPerCell, next)) });

  const clamp = (p: Point): Point => ({ x: Math.min(map.width, Math.max(0, p.x)), y: Math.min(map.height, Math.max(0, p.y)) });
  const moveTo = (id: string, position: Point) => setTokens((now) => now.map((token) => (token.id === id ? { ...token, position } : token)));
  const add = (at?: Point) => {
    const n = nextNumber.current++;
    const id = `test-${n}`;
    // Showing everyone stays that way when another token joins.
    if (tokens.every((token) => shown.has(token.id))) setShown(new Set([...shown, id]));
    setTokens((now) => [...now, { id, name: t("sight.token", { n }), position: at ? place(at) : centre(now.length) }]);
    setPlacing(false);
  };
  const remove = (id: string) => {
    setTokens((now) => now.filter((token) => token.id !== id));
    setShown((now) => new Set([...now].filter((x) => x !== id)));
  };
  // MapCanvas hands over map points; a press on a token starts its drag, on the empty map places a token while placing.
  const press = (at: Point, e: PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    pressed.current = target;
    if (target.closest(".sight-portal") || e.button !== 0) return;
    const id = target.closest<SVGGElement>(".sight-test-token")?.dataset.id;
    const hit = tokens.find((x) => x.id === id);
    if (hit) {
      grab.current = { x: hit.position.x - at.x, y: hit.position.y - at.y };
      setShown(new Set([hit.id]));
      setDrag({ id: hit.id, at: hit.position });
    } else if (placing) {
      add(at);
    }
  };
  const dragTo = (at: Point | null) => {
    if (drag && at) setDrag({ id: drag.id, at: clamp({ x: at.x + grab.current.x, y: at.y + grab.current.y }) });
  };
  // Alt drops it where it is, as on the board.
  const release = (_at: Point, e: PointerEvent<SVGSVGElement>, moved: boolean) => {
    const portal = pressed.current?.closest<SVGGElement>(".sight-portal");
    pressed.current = null;
    if (portal && !moved && portal.dataset.id) toggle(portal.dataset.id);
    if (!drag) return;
    moveTo(drag.id, e.altKey ? drag.at : place(drag.at));
    setDrag(null);
  };
  const onTokenKey = (token: TestToken) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setShown(new Set([token.id]));
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    moveTo(token.id, place({ x: token.position.x + step[0]! * grid.cellSize, y: token.position.y + step[1]! * grid.cellSize }));
  };

  const radius = grid.cellSize / 2 - 4;
  const others = tokens.filter((token) => !shown.has(token.id));
  const seenCount = others.filter((token) => preview?.visible.has(token.id)).length;
  const allShown = tokens.length > 0 && others.length === 0;
  const who = shown.size === 1 ? tokens.find((token) => shown.has(token.id))?.name : undefined;

  return (
    <HudLayout className="map-editor-split map-editor-sight-split">
      <aside className="map-editor-panel sight-token-panel" aria-label={t("sight.testTokens")}>
        <div className="sight-panel-head">
          <h3 className="map-editor-heading">{t("sight.testTokens")}</h3>
          <button
            type="button" data-guide="sight-add" className="icon-button sight-add" aria-pressed={placing}
            aria-label={t("common.addToken")} title={placing ? t("sight.addTokenHint") : t("common.addToken")}
            onClick={() => setPlacing(!placing)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        {tokens.length === 0 ? (
          <p className="muted small-print">{t("sight.clickToPlace")}</p>
        ) : (
          <>
            {tokens.length > 1 && (
              <label className="sight-token-pick sight-select-all">
                <input
                  type="checkbox" checked={allShown} ref={(el) => { if (el) el.indeterminate = shown.size > 0 && !allShown; }}
                  onChange={() => setShown(allShown ? new Set() : new Set(tokens.map((token) => token.id)))}
                />
                <span>{t("sight.selectAll")}</span>
              </label>
            )}
            <ul className="sight-token-list">
              {tokens.map((token) => (
                <li key={token.id} className={`sight-token-row${shown.has(token.id) ? " is-shown" : ""}`}>
                  <label className="sight-token-pick">
                    <input
                      type="checkbox" aria-label={t("sight.showSight", { name: token.name })} checked={shown.has(token.id)}
                      onChange={(e) => setShown((now) => { const next = new Set(now); if (e.target.checked) next.add(token.id); else next.delete(token.id); return next; })}
                    />
                    <span className="sight-token-swatch" aria-hidden="true">{token.id.replace("test-", "")}</span>
                    <span className="sight-token-name">{token.name}</span>
                  </label>
                  <button type="button" className="icon-button token-delete" aria-label={t("sight.removeNamed", { name: token.name })} title={t("sight.removeNamed", { name: token.name })} onClick={() => remove(token.id)}>
                    <Trash size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <div className="sight-preview-stage">
        <MapCanvas
          map={map} grid={grid} isometric={state.scene.isometric} mode={placing ? "place" : "view"} pan={false}
          className={`map-editor-sight-preview${drag ? " is-dragging" : ""}${placing ? " is-placing" : ""}`}
          label={placing ? t("sight.previewHint") : t("sight.preview")}
          onPress={press} onMove={dragTo} onRelease={release} onCancel={() => { pressed.current = null; setDrag(null); }}
          onKeyDown={(e) => { if (placing && e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); add(); } }}
        >
          {() => (<>
          {mask && <image href={mask} width={map.width} height={map.height} opacity={0.78} />}
          {Object.values(walls).filter((w) => !isPortal(w)).map((w) => (
            <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="sight-preview-wall" strokeWidth={Math.max(2, grid.cellSize / 20)} />
          ))}
          {Object.values(walls).filter(isPortal).map((w) => {
            const kind = w.portal?.kind === "window" ? t("common.window") : t("common.door");
            const open = isOpen(w);
            const status = (open ? t("common.openState") : w.portal?.state === "locked" ? t("common.locked") : t("common.closed")).toLowerCase();
            return (
              <g
                key={w.id} data-id={w.id} className={`sight-portal${open ? " is-open" : ""}`} tabIndex={0} role="button" aria-pressed={open}
                aria-label={t(open ? "sight.portalOpenAria" : "sight.portalClosedAria", { kind, status })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(w.id); } }}
              >
                {/* A wide invisible line so a thin door is easy to click. */}
                <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="sight-portal-hit" strokeWidth={Math.max(16, grid.cellSize / 3)} />
                <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className={w.portal?.kind === "window" ? "sight-preview-window" : "sight-preview-portal"} strokeWidth={Math.max(3, grid.cellSize / 12)} />
              </g>
            );
          })}
          {tokens.map((token) => {
            const at = drag?.id === token.id ? drag.at : token.position;
            const unseen = !shown.has(token.id) && !preview?.visible.has(token.id);
            return (
              <g
                key={token.id} data-id={token.id}
                className={`sight-test-token${unseen ? " is-unseen" : ""}`}
                tabIndex={0} role="button" aria-pressed={shown.has(token.id)}
                aria-label={t("sight.tokenAria", { name: token.name })}
                onKeyDown={onTokenKey(token)}
              >
                <circle cx={at.x} cy={at.y} r={radius} strokeWidth={Math.max(2, grid.cellSize / 16)} />
                <text x={at.x} y={at.y} className="sight-test-token-label" fontSize={radius} dominantBaseline="central" textAnchor="middle">
                  {token.id.replace("test-", "")}
                </text>
              </g>
            );
          })}
          </>)}
        </MapCanvas>
        {placing && (
          <div className="sight-place-prompt" role="status">
            <span>{tokens.length === 0 ? t("sight.placeTest") : t("sight.placeAnother")}</span>
          </div>
        )}
        {shown.size > 0 && others.length > 0 && closedFor !== shown && (
          <div className="sight-popup" role="status">
            <span>{who !== undefined ? t("sight.oneSees", { name: who, n: seenCount, total: others.length }) : t("sight.theySee", { n: seenCount, total: others.length })}</span>
            <button type="button" className="icon-button" aria-label={t("common.close")} onClick={() => setClosedFor(shown)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <aside className="map-editor-hud" aria-label={t("sight.settings")}>
        <MapStylePicker isometric={state.scene.isometric ?? false} onChange={(enabled) => void send({ type: "scene.setIsometric", enabled })} />
        <section className="sight-setting">
          <h3 className="map-editor-heading">{t("sight.lineOfSight")}</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label={t("sight.lineOfSight")} data-guide="sight-toggle">
            <button type="button" role="radio" aria-checked={!enabled} className="tool-button map-editor-mode"
              onClick={() => { if (enabled) void send({ type: "scene.setLineOfSight", enabled: false }); }}>
              <EyeSlash size={18} aria-hidden="true" />
              <span>{t("common.off")}</span>
            </button>
            <button type="button" role="radio" aria-checked={enabled} className="tool-button map-editor-mode"
              onClick={() => { if (!enabled) void send({ type: "scene.setLineOfSight", enabled: true }); }}>
              <Eye size={18} aria-hidden="true" />
              <span>{t("common.on")}</span>
            </button>
          </div>
        </section>
        <section className="sight-setting">
          <h3 className="map-editor-heading">{t("sight.range")}</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label={t("sight.rangeLabel")}>
            <button type="button" role="radio" aria-checked={range === null} className="tool-button map-editor-mode"
              onClick={() => { if (range !== null) void send({ type: "scene.setSightRange", range: null }); }}>
              <InfinityIcon size={18} aria-hidden="true" />
              <span>{t("sight.unlimited")}</span>
            </button>
            <button type="button" role="radio" aria-checked={range !== null} className="tool-button map-editor-mode"
              onClick={() => { if (range === null) setRange(12 * grid.unitsPerCell); }}>
              <Ruler size={18} aria-hidden="true" />
              <span>{t("sight.limited")}</span>
            </button>
          </div>
          {range !== null && (
            <>
              <label className="sight-range-field">
                <span className="small-print">{t("sight.distance", { range, unit, squares })}</span>
                <input
                  type="range" className="range range-filled" aria-label={t("sight.rangeSquares")} min={1} max={maxSquares} step={1}
                  value={squares} style={rangeFill(squares, 1, maxSquares)}
                  onChange={(e) => setRange(e.target.valueAsNumber * grid.unitsPerCell)}
                />
              </label>
              <label className="sight-range-exact">
                <span className="small-print">{t("sight.exact")}</span>
                <span className="sight-range-input">
                  <input
                    type="number" inputMode="numeric" aria-label={t("sight.rangeIn", { unit })}
                    min={grid.unitsPerCell} max={grid.unitsPerCell * 1000} step={grid.unitsPerCell} value={range}
                    onChange={(e) => { const n = e.target.valueAsNumber; if (n > 0) setRange(n); }}
                  />
                  <span className="muted">{unit}</span>
                </span>
              </label>
            </>
          )}
        </section>
        {message && <p className="error" role="alert">{message}</p>}
      </aside>
    </HudLayout>
  );
}
