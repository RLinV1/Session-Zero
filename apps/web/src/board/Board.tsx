import { TerrainSetup } from "../pages/mapEditor/TerrainSetup";
import { Modal } from "../ui/Modal";
import { MovementControls, useRulerMode } from "./MovementControls";
import { slidePointsFor } from "./slidePoints";
import { REPLAY_SLIDE_MARGIN_MS } from "./tokenSlide";
import { REPLAY_STEP_MS } from "../ui/replaySteps";
import { movementReadout } from "./movementRuler";
import { CornersOut, Eye, Funnel, PaintBrush, SlidersHorizontal } from "@phosphor-icons/react";
import { PopoverButton } from "../ui/Popover";
import { usePhone } from "../ui/usePhone";
import { Suspense, forwardRef, lazy, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TOKEN_COLOR, INITIAL_SCENE_ID, EMPTY_STATS, can, type ReplayFrame, type GridSpec, type Participant, type Point, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { guardedConnection } from "../net/previewConnection";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../ui/ToolRail";
import { usePersistentState } from "../ui/usePersistentState";
import { getClientSettings, useClientSettings } from "../ui/clientSettings";
import { BoardFilters } from "./BoardFilters";
import { gmSightPolygons, sightKey, viewedTokenIds } from "./gmSightView";
import { canAnimateDice, type TrayRoll } from "../ui/Die3D";
import { ThrownDice, type ActiveThrow } from "./ThrownDice";
import { DroppedDice, type ActiveDrop } from "./DroppedDice";
import { addDrop, type BoardDrop } from "./tokenDice";
import type { DiceSkin } from "../ui/diceSkin";
import { BoardView, type GmFogView } from "./boardView";
import { useDisplayedHealth } from "./nukeHealth";
import { shakeScreen } from "./screenShake";
import { MAX_ATTACK_EFFECTS, attackEffectFor, attackPlan, effectToPlay, effectiveReducedMotion, type AttackEffect } from "./effects";
import type { OverlayEffect } from "./EffectsOverlay";
import { boardDieSize, centreThrow, crowdedOffset, onMap, throwLanding, type BoardThrow, type BoardTransform } from "./diceThrow";
import { cursorSquare, moveCursor, placementCommand, startCursor, type PlacementGhost, type PlacingSource, type TokenDraft } from "./placement";
import type { BoardTool, MeasureMode } from "./tools";
import { TokenCard } from "./TokenCard";
import { ARROW_STEPS, ownsArrowKeys, stepTo } from "../ui/MoveControl";

import { t, type TextId, useLocale } from "../i18n/locale";
/** Loaded when the first effect or condition needs it, so the board paints before the libraries arrive. */
const EffectsOverlay = lazy(() => import("./EffectsOverlay"));

interface Props {
  replayFrame?: ReplayFrame | null;
  onNukeImpact?: () => void;
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  gridPreview: GridSpec | null;
  /** The GM is previewing as a player (gm-view-as-player): no tool, drag, placement or targeting. Pan and zoom still work. */
  readOnly?: boolean;
  /** Hide events from the live room while displaying a historical board. */
  suppressLiveEffects?: boolean;
  /** Plain React controls shown top left, before Fit (e.g. the participants button). */
  toolbar?: ReactNode;
  /** Notices pinned to the top right of the board, e.g. the GM's "Sam left the table". */
  notices?: ReactNode;
  /** Drawn over the map, under the toolbar and notices; never takes pointer input. */
  overlay?: ReactNode;
  /** The roll whose dice have just landed; an attack's strike plays then, not while they are in the air (KAN-76). */
  landedRollId?: string | null;
  /** The viewer clicked the token `attackerId` attacks, in Pick on board (attack-targeting). */
  onPickTarget?: (attackerId: string, targetId: string) => void;
  /** Only the Select tool: a template being edited (ADR 0033). */
  selectOnly?: boolean;
  /** Open the sidebar's editor for a token, from its card (token-card-actions). */
  onEditToken?: (tokenId: string) => void;
  /** GM: the tokens chosen for a group roll or an area effect, marked on the board (ADR 0046). */
  groupSelection?: readonly string[];
  /** GM: Shift-click on a token adds it to `groupSelection` or takes it out. */
  onToggleGroupToken?: (tokenId: string) => void;
  /** GM: the template picked in From template; its tokens replace the selection. */
  onPickTemplate?: (templateId: string) => void;
}

/** What the roster and initiative list can ask the canvas to do (FR-GM-24). */
export interface BoardHandle {
  focusToken(tokenId: string): void;
  /** Let the GM place a token filled in by New Token or Saved Creatures, once per click, until done (token-placement-flow). */
  placeToken(draft: TokenDraft): void;
  /** Let the GM place copies of `tokenId`, once per click, until done (token-placement-flow, ADR 0033). */
  duplicateToken(tokenId: string): void;
  /** Pick a target on the board for `tokenId` to attack; the pick goes to `onPickTarget` (attack-targeting). */
  startAttack(tokenId: string): void;
  /** GM: pick a placed template on the board; the pick goes to `onPickTemplate` (ADR 0046). */
  startTemplatePick(): void;
  /** Show a ping on this viewer's board only, e.g. the one an attack roll just sent. */
  showPing(at: Point): void;
  /**
   * Where dice released at this page point with this velocity (page px/ms) would fly, in board
   * coordinates, or null when the point is not over the map (throw-dice-on-board).
   */
  aimThrow(client: Point, velocity: Point): { from: Point; to: Point } | null;
  /** Where a roll made with Roll is thrown: into the middle of the visible board, kept on the map. */
  centreAim(): { from: Point; to: Point } | null;
  /**
   * Throw a roll's dice on this viewer's board. False when they can't be animated here (reduced
   * motion, no Web Animations, the board not ready); then neither callback is called. `onGone`
   * comes once the dice have faded off the board, or were cleared early.
   */
  throwDice(t: BoardThrow, roll: TrayRoll, onLanded: () => void, onGone?: () => void): boolean;
  /**
   * Drop a group or area-effect roll's dice onto its tokens (ADR 0046). False when they can't be
   * animated here; then neither callback is called.
   */
  dropDice(drop: BoardDrop, skin: DiceSkin | null, onLanded: () => void, onGone?: () => void): boolean;
}

/** What the Dice panel needs from the board to throw dice onto it (throw-dice-on-board). */
export type DiceBoard = Pick<BoardHandle, "aimThrow">;

/** Rolls on the board at once; a fourth throw clears the oldest away. */
const MAX_BOARD_THROWS = 3;

const PLACING_HINT: TextId = "board.placingHint";

/** Directions for keyboard placement (token-placement-flow): one square per press. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** What the board draws under the pointer for a filled-in draft. */
function ghostOf(draft: TokenDraft): PlacementGhost {
  return {
    name: draft.name,
    size: draft.size ?? 1,
    rotation: draft.rotation ?? 0,
    color: draft.color ?? DEFAULT_TOKEN_COLOR,
    imageUrl: draft.imageUrl ?? null,
    hidden: draft.hidden ?? false,
    stats: draft.stats ?? EMPTY_STATS,
  };
}

/** A placement in progress: what each click creates, how many so far, and the keyboard cursor. */
interface Placing {
  source: PlacingSource;
  placed: number;
  busy: boolean;
  error: string | null;
  cursor: Point;
  /** What the screen reader last heard: a move of the cursor, or a token placed. */
  said: string;
}

const HINTS: Record<BoardTool["kind"], TextId | null> = {
  select: "board.hint.select",
  measure: null,
  draw: "board.hint.draw",
  area: "board.hint.area",
  erase: "board.hint.erase",
  attack: "board.hint.attack",
  pickTemplate: "board.hint.pickTemplate",
  fog: null,
};

/** Measure hints by mode (ruler-modes). */
const MEASURE_HINTS = {
  range: "board.hint.measure",
  movement: "board.hint.measureRoute",
} as const satisfies Record<MeasureMode, TextId>;

/** Fog hints by mode (FR-GM-17). Players never get the Fog tool. */
const FOG_HINTS = {
  rect: "board.fogHint.rect",
  polygon: "board.fogHint.polygon",
  reveal: "board.fogHint.reveal",
} as const satisfies Record<string, TextId>;


/** With GM only ticked, the areas are the GM's alone; saying "everyone sees them" would mislead. */
const GM_ONLY_AREA_HINT: TextId = "board.gmOnlyAreaHint";

/** A strike waits for its dice at most this long, in case their landing is never reported. */
const STRIKE_WAIT_MS = 5000;

/** Keys typed into a field belong to that field, not to the board. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** The PixiJS board plus its React toolbar and notices; Pixi objects stay inside `BoardView`. */
export const Board = forwardRef<BoardHandle, Props>(function Board({ replayFrame, connection, state, you, gridPreview, readOnly = false, suppressLiveEffects = false, toolbar, notices, overlay, landedRollId, onPickTarget, onNukeImpact, selectOnly = false, onEditToken, groupSelection, onToggleGroupToken, onPickTemplate }, ref) {
  const renderedState = useDisplayedHealth(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  // A language change relabels what Pixi draws (token names, condition letters, captions); nothing is sent.
  const locale = useLocale();
  useEffect(() => { viewRef.current?.refreshText(); }, [locale]);
  /** GM only: "off" hides fog from this view. Not remembered: every time the board opens, fog is shown. */
  const [terrainOpen, setTerrainOpen] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [noMapNotice, setNoMapNotice] = useState(false);
  const [movementNotice, setMovementNotice] = useState<string | null>(null);
  const [repositionId, setRepositionId] = useState<string | null>(null);
  const repositionRef = useRef(repositionId); repositionRef.current = repositionId;
  const [gmFog, setGmFog] = useState<GmFogView>("tint");
  /** GM only: whether this browser draws the walls. Players never receive them. */
  const [showWalls, setShowWalls] = usePersistentState<boolean>("vtt.ui.gmShowWalls", true, (v): v is boolean => typeof v === "boolean");
  /** GM only: whether this browser draws doors and windows. Players always see the ones they can reach. */
  const [showPortals, setShowPortals] = usePersistentState<boolean>("vtt.ui.gmShowPortals", true, (v): v is boolean => typeof v === "boolean");
  /** GM only: darken this browser's board to what the selected token sees (gm-token-sight-view). View-only, nothing is sent. */
  const [tokenView, setTokenView] = useState(false);
  /** Narrows Token view to these tokens (set only by a card's eye); empty means every token on the map. */
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const gmCanSee = you.role === "gm" && !readOnly;
  const losOn = state.scene.lineOfSight === true;
  useEffect(() => {
    if (tokenView && !(gmCanSee && losOn)) setTokenView(false);
  }, [tokenView, gmCanSee, losOn]);
  useEffect(() => {
    if (!tokenView && viewedIds.length > 0) setViewedIds([]);
  }, [tokenView, viewedIds]);
  /** True when Token view was switched on from a card's eye (not the Show menu): the eye then switches it back off, otherwise it returns to all tokens. */
  const [eyeStarted, setEyeStarted] = useState(false);
  useEffect(() => {
    if (!tokenView && eyeStarted) setEyeStarted(false);
  }, [tokenView, eyeStarted]);
  const hasFog = Object.keys(state.fog).length > 0;
  const hasPortals = Object.values(state.walls).some((wall) => wall.portal);
  const hasWalls = Object.values(state.walls).some((wall) => !wall.portal);
  /** Strikes waiting for their thrown dice to land, by roll id, oldest first (KAN-76). */
  const waitingStrikes = useRef(new Map<string, { effect: AttackEffect; timer: number }>());
  // The committed seq of `state` when it is the live room's, so the board knows when an edit it sent has landed.
  const live = connection.snapshot as RoomConnection["snapshot"] | undefined; // absent on test doubles
  const shownSeq = live && state === live.state ? live.seq : null;
  const latest = useRef({ shownSeq, tokenView: false, state, renderedState, boardState: renderedState, you, gridPreview, onPickTarget, onNukeImpact, onToggleGroupToken, onPickTemplate, groupSelection, gmFog: "tint" as GmFogView, showWalls: true, showPortals: true, showTerrain: false, readOnly: false, suppressLiveEffects: false, viewing: [] as string[] });
  latest.current = { shownSeq, tokenView: tokenView && gmCanSee, state, renderedState, boardState: renderedState, you, gridPreview, onPickTarget, onNukeImpact, onToggleGroupToken, onPickTemplate, groupSelection, gmFog, showWalls, showPortals, showTerrain, readOnly, suppressLiveEffects, viewing: [] };
  // Sends nothing while previewing as a player, whatever the board is asked to do. Stable for as
  // long as the connection is, so entering and leaving a preview never rebuilds the board view.
  const guarded = useMemo(() => guardedConnection(connection, () => latest.current.readOnly), [connection]);
  /** The token the viewer clicked (not dragged); its details show beside the board. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Why the server refused the last drag, e.g. a wall in the way (ADR 0029) or a locked door (ADR 0030); shown briefly. */
  const [refusal, setRefusal] = useState<{ message: string; at: number } | null>(null);
  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), 4000);
    return () => clearTimeout(timer);
  }, [refusal]);
  /** Closing the card deselects the token and drops the eye's narrowing: back to all tokens, or off if the eye alone turned Token view on. */
  const deselect = () => { setSelectedId(null); setViewedIds([]); if (eyeStarted) setTokenView(false); };
  const selected = selectedId ? renderedState.tokens[selectedId] ?? null : null;
  const [movementFeedback, setMovementFeedback] = useState("");
  const rulerOrigin = selected && can.moveToken(you, selected) ? selected.position : null;
  const rulerRef = useRef({ origin: rulerOrigin, tokenSize: selected?.size ?? 1 });
  rulerRef.current = { origin: rulerOrigin, tokenSize: selected?.size ?? 1 };
  // Token view with no narrowing (viewedIds empty) is "all tokens": the union of every token's sight, hidden ones included.
  // Only a card's eye narrows it to that token; the eye again or closing the card returns to all tokens (or off, if the eye started it).
  const viewing = tokenView && gmCanSee ? viewedTokenIds(state, viewedIds.length > 0 ? viewedIds : Object.keys(state.tokens)) : [];
  const sightId = sightKey(state, viewing);
  // Keyed on what shapes the sight, so an unrelated event keeps the same array and the mask is not rebuilt.
  const sight = useMemo(() => gmSightPolygons(state, viewing), [state.scene, state.walls, state.fog, sightId]);
  const boardState = useMemo(() => (sight ? { ...renderedState, sight } : renderedState), [renderedState, sight]);
  latest.current.boardState = boardState;
  latest.current.viewing = viewing;
  useEffect(() => viewRef.current?.setViewedTokens(viewing), [viewing.join(",")]);
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  // The ruler's mode is remembered in this browser (ruler-modes); the other options last the visit.
  const [measureMode, setMeasureMode] = useRulerMode();
  const [otherToolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const toolOptions = useMemo(() => ({ ...otherToolOptions, measure: { mode: measureMode } }), [otherToolOptions, measureMode]);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  /** The tool to go back to once an attack's target is picked or cancelled. */
  const beforeAttack = useRef<BoardTool>({ kind: "select" });
  const endAttack = () => setTool((current) => (current.kind === "attack" ? beforeAttack.current : current));
  /** What New Token, Saved Creatures or Duplicate handed over; placing repeats until the GM ends it. */
  const [placing, setPlacing] = useState<Placing | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const source = placing?.source ?? null;

  /** Arrow keys move the selected token one square while Settings allows it (WCAG 2.1.1, 2.5.7; client-settings). */
  const arrowKeys = useClientSettings().arrowKeyMove;
  // One move at a time for the buttons and the keys together: a second step must start from the landed square.
  const movePending = useRef(false);
  const moveToken = useCallback(async (tokenId: string, to: Point) => {
    if (movePending.current) return;
    movePending.current = true;
    try {
      const current = latest.current.state, origin = current.tokens[tokenId]?.position;
      const reposition = latest.current.you.role === "gm" && repositionRef.current === tokenId;
      setRepositionId(null); repositionRef.current = null;
      if (origin) setMovementNotice(movementReadout(current, latest.current.you, current.tokens[tokenId]!, origin, to, false, reposition));
      const result = await guarded.command({ type: "token.move", tokenId, to, expectedSceneId: latest.current.state.activeSceneId ?? INITIAL_SCENE_ID, expectedOrigin: origin, boardEpoch: current.boardEpoch ?? 0, ...(reposition ? { reposition: true } : {}) });
      // Unlike a drag there is no snap-back to show, so say why even when offline.
      if (!result.ok) setRefusal({ message: result.message, at: Date.now() });
      else setRefusal(null);
    } finally {
      movePending.current = false;
    }
  }, [guarded]);
  const keyMovable = arrowKeys && !readOnly && selected && can.moveToken(you, selected) ? selected : null;
  const scene = renderedState.scene;
  useEffect(() => {
    if (!keyMovable) return;
    const onKey = (e: KeyboardEvent) => {
      const step = ARROW_STEPS[e.key];
      if (!step || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Placing a token, a field, a tab list or an open dialog keeps its own arrows.
      if (placingRef.current || ownsArrowKeys(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const bounds = scene.map ? { width: scene.map.width, height: scene.map.height } : undefined;
      const to = stepTo(keyMovable.position, scene.grid.cellSize, step[0], step[1], bounds);
      if (to) void moveToken(keyMovable.id, to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyMovable, scene, moveToken]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTyping(event.target) || document.querySelector("dialog[open]")) return;
      // An area edit, then the area's selection, before Escape leaves the tool (ADR 0058).
      if (viewRef.current?.cancelMovement() || viewRef.current?.cancelTemplateEdit()) event.preventDefault();
      setRepositionId(null); repositionRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (repositionId && repositionId !== selectedId) { setRepositionId(null); repositionRef.current = null; } }, [selectedId, repositionId]);
  useEffect(() => { setMovementNotice(null); }, [selectedId, readOnly, you.id]);
  useEffect(() => { viewRef.current?.setShowTerrain(showTerrain); }, [showTerrain]);
  useEffect(() => { viewRef.current?.setRepositionToken(repositionId); }, [repositionId]);
  const ghost = useMemo<PlacementGhost | null>(
    () => source && (source.kind === "create" ? ghostOf(source.draft) : source.ghost),
    [source],
  );
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  /** Dice thrown on this board (throw-dice-on-board); a ref too, so evictions are side-effect free. */
  const [throws, setThrows] = useState<ActiveThrow[]>([]);
  const throwsRef = useRef(throws);
  const setBoardThrows = (next: ActiveThrow[]) => {
    throwsRef.current = next;
    setThrows(next);
  };
  /** Group and area-effect rolls dropping onto tokens (ADR 0046); their own slots, apart from throws. */
  const [drops, setDrops] = useState<ActiveDrop[]>([]);
  const dropsRef = useRef(drops);
  const setBoardDrops = (next: ActiveDrop[]) => {
    dropsRef.current = next;
    setDrops(next);
  };
  const dropDone = useCallback((rollId: string) => {
    const done = dropsRef.current.filter((d) => d.drop.rollId === rollId);
    setBoardDrops(dropsRef.current.filter((d) => d.drop.rollId !== rollId));
    done.forEach((d) => d.onGone());
  }, []);
  /** Attack effects the React overlay is playing, oldest first (board-effects-overlay). */
  const [overlayEffects, setOverlayEffects] = useState<OverlayEffect[]>([]);
  const nextEffectId = useRef(0);
  const dropEffect = useCallback((id: number) => setOverlayEffects((all) => (all.some((e) => e.id === id) ? all.filter((e) => e.id !== id) : all)), []);
  /** The hit shake is the board's; everything else is the overlay's. */
  const playEffect = (effect: AttackEffect) => {
    viewRef.current?.playAttackEffect(effect);
    // Strikes are entirely Pixi: they need neither the DOM overlay nor its animation libraries.
    if (effect.kind === "strike" || effect.kind === "defeat") return;
    // A nuke shakes the whole page, not just the board.
    if (effect.kind === "nuke" && !effectiveReducedMotion(latest.current.state)) shakeScreen(effect.animation);
    const id = nextEffectId.current++;
    setOverlayEffects((all) => [...all, { id, effect }].slice(-MAX_ATTACK_EFFECTS));
    // Also removed here, so an effect that waited for the overlay to load never plays late.
    window.setTimeout(() => dropEffect(id), attackPlan(effect, effectiveReducedMotion(latest.current.state)).durationMs + 300);
  };
  const playEffectRef = useRef(playEffect);
  playEffectRef.current = playEffect;
  const followView = useCallback((fn: (view: BoardTransform) => void) => viewRef.current?.onViewChange(fn) ?? (() => {}), []);
  const throwDone = useCallback((rollId: string) => {
    const done = throwsRef.current.filter((t) => t.throw.rollId === rollId);
    setBoardThrows(throwsRef.current.filter((t) => t.throw.rollId !== rollId));
    done.forEach((t) => t.onGone());
  }, []);
  // Don't leave the Dice panel waiting on dice that are no longer drawn.
  useEffect(
    () => () =>
      [...throwsRef.current, ...dropsRef.current].forEach((t) => {
        t.onLanded();
        t.onGone();
      }),
    [],
  );

  /**
   * Create one token at `at` and keep placing (token-placement-flow). One at a time: a second click
   * while the first is in flight does nothing. The server numbers the names (KAN-62).
   */
  const place = async (at: Point) => {
    const current = placingRef.current;
    if (!current || current.busy) return;
    placingRef.current = { ...current, busy: true };
    setPlacing(placingRef.current);
    const result = await guarded.command(placementCommand(current.source, at));
    // Keep placing either way: on a rejection the GM can read why and try another square.
    setPlacing((now) => {
      if (now?.source !== current.source) return now;
      if (!result.ok) return { ...now, busy: false, error: result.message };
      const placed = now.placed + 1;
      return { ...now, busy: false, error: null, placed, said: t("board.placedSaid", { name: ghostRef.current?.name ?? t("board.token"), n: placed }) };
    });
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    const view = new BoardView(hostRef.current!, {
      movementFeedback: setMovementFeedback,
      nukeImpact: () => latest.current.onNukeImpact?.(),
      moveToken: async (tokenId, to, origin, boardEpoch, via) => {
        const reposition = latest.current.you.role === "gm" && repositionRef.current === tokenId;
        setRepositionId(null); repositionRef.current = null;
        const result = await guarded.command({ type: "token.move", tokenId, to, ...(via?.length ? { via } : {}), expectedSceneId: latest.current.state.activeSceneId ?? INITIAL_SCENE_ID, expectedOrigin: origin, boardEpoch, ...(reposition ? { reposition: true } : {}) });
        // The token snaps back; say why, so a wall the player can't see isn't a mystery (ADR 0029).
        if (!result.ok && result.code !== "offline") setRefusal({ message: result.message, at: Date.now() });
        else if (result.ok) setRefusal(null);
        return result.ok;
      },
      dragPreview: (tokenId, at) => guarded.preview(`drag:${tokenId}`, { type: "tokenDragPreview", tokenId, at }),
      requestMovementPreview: (request) => guarded.preview("movement-feedback", request, 100),
      dragEnd: (tokenId, at) => { guarded.endPreview("movement-feedback", null); guarded.endPreview(`drag:${tokenId}`, at && { type: "tokenDragPreview", tokenId, at }); },
      ping: (at) => guarded.ephemeral({ type: "ping", at }),
      // Aiming is shared live and coalesced like drags (KAN-35, KAN-39); the clear goes at once.
      aimPreview: (preview, templateId) => guarded.preview("aim", { type: "templatePreview", preview, ...(templateId && { templateId }) }),
      aimEnd: (gmOnly, templateId) => guarded.endPreview("aim", { type: "templatePreview", preview: null, gmOnly, ...(templateId && { templateId }) }),
      updateTemplate: async (templateId, geometry, expected) => {
        const result = await guarded.command({ type: "template.update", templateId, ...geometry, expected, expectedSceneId: latest.current.state.activeSceneId ?? INITIAL_SCENE_ID });
        // The area snaps back; say why, e.g. someone else changed it first (ADR 0058).
        if (!result.ok && result.code !== "offline") setRefusal({ message: result.message, at: Date.now() });
        else if (result.ok) setRefusal(null);
        return result.ok && { seq: result.seq };
      },
      placeTemplate: async (template) => {
        const result = await guarded.command({ type: "template.place", ...template });
        if (!result.ok) console.warn("Area rejected:", result.message);
        return result.ok;
      },
      removeTemplate: async (templateId) => {
        const result = await guarded.command({ type: "template.remove", templateId });
        if (!result.ok) console.warn("Area removal rejected:", result.message);
        return result.ok;
      },
      addFog: async (region) => {
        const result = await guarded.command({ type: "fog.add", region });
        if (!result.ok) console.warn("Fog rejected:", result.message);
        return result.ok;
      },
      removeFog: async (regionId) => {
        const result = await guarded.command({ type: "fog.remove", regionId });
        if (!result.ok) console.warn("Fog removal rejected:", result.message);
        return result.ok;
      },
      placeToken: (at) => void placeRef.current(at),
      // Selecting only opens the card; which sight Token view shows changes only through the card's eye.
      selectToken: (tokenId) => setSelectedId(tokenId),
      cancelPlacement: () => setPlacing(null),
      togglePortal: (wallId, lock) => {
        const portal = latest.current.state.walls[wallId]?.portal;
        if (!portal) return;
        // Click opens a closed door and closes an open one; the GM's Shift-click locks and unlocks (ADR 0030).
        const state = lock && latest.current.you.role === "gm"
          ? (portal.state === "locked" ? "closed" : "locked")
          : (portal.state === "open" ? "closed" : "open");
        void guarded.command({ type: "portal.setState", wallId, state, expectedSceneId: latest.current.state.activeSceneId ?? INITIAL_SCENE_ID }).then((result) => {
          if (!result.ok && result.code !== "offline") setRefusal({ message: result.message, at: Date.now() });
        });
      },
      pickTarget: (attackerId, targetId) => {
        endAttack();
        latest.current.onPickTarget?.(attackerId, targetId);
      },
      cancelAttack: () => endAttack(),
      toggleGroupToken: (tokenId) => latest.current.onToggleGroupToken?.(tokenId),
      pickTemplate: (templateId) => {
        setTool({ kind: "select" });
        latest.current.onPickTemplate?.(templateId);
      },
      cancelPickTemplate: () => setTool({ kind: "select" }),
    });

    let disposed = false;
    view.init().then(() => {
      if (disposed) return view.destroy();
      viewRef.current = view;
      view.setGmFogView(latest.current.gmFog);
      view.setShowWalls(latest.current.showWalls);
      view.setShowPortals(latest.current.showPortals);
      view.setShowTerrain(latest.current.showTerrain);
      view.setRepositionToken(repositionRef.current);
      view.setReadOnly(latest.current.readOnly);
      view.setViewedTokens(latest.current.viewing);
      view.setGridPreview(latest.current.gridPreview);
      view.update(latest.current.boardState, latest.current.you, latest.current.shownSeq);
      view.setMovementRuler(rulerRef.current.origin, rulerRef.current.tokenSize);
      view.setTool(toolRef.current);
      view.setPlacement(ghostRef.current);
      view.setGroupSelection(latest.current.groupSelection ?? []);
    });
    const stopEphemeral = connection.onEphemeral((_from, payload) => {
      if (latest.current.suppressLiveEffects) return;
      if (payload.type === "ping") view.showPing(payload.at, 0x3498db);
      else if (payload.type === "tokenDragPreview") view.showDragPreview(payload.tokenId, payload.at);
      else if (payload.type === "tokenMoveFeedback" && _from === latest.current.you.id && payload.atSeq === connection.snapshot.seq && connection.snapshot.status === "open") view.showMovementFeedback(payload);
      else if (payload.type === "templatePreview") {
        view.showAimPreview(_from, payload.preview, latest.current.state.participants[_from]?.displayName ?? "Someone", payload.templateId);
      }
    });

    const stopMovementUpdates = connection.store.subscribe((snapshot, previous) => {
      if (snapshot.seq !== previous.seq || snapshot.status !== previous.status) view.refreshMovementPreview();
    });

    // Live events only, already filtered for this viewer; a snapshot never gets here (KAN-76).
    const stopCommitted = connection.onCommitted((committed, _before, after) => {
      if (latest.current.suppressLiveEffects) return;
      // Every move slides here, along its path or straight, cut to what this viewer may see
      // (token-slide, ADR 0055): someone else's, and this account's from another tab or device.
      // A move this board dropped is already sliding, so the board leaves it alone.
      const moved = committed.event;
      if (moved.type === "TokenMoved") {
        const { points, gaps } = slidePointsFor(moved, latest.current.you, after);
        view.slide(moved.tokenId, points, gaps);
      }
      const viewer = latest.current.you;
      const seen = attackEffectFor(committed.event, after, viewer);
      // The viewer's Attack animations choice, decided now, against the turn as it stands (board-attack-effects).
      const effect = seen && effectToPlay(seen, getClientSettings().attackAnimations, after);
      if (!effect) return;
      if (effect.kind === "strike") view.focusStrike(effect);
      // Every public roll is thrown over the board first: the strike leaves when the dice land.
      // Rulings and damage have no dice and play at once.
      if (effect.kind === "strike" && committed.event.type === "DiceRolled") {
        const rollId = committed.event.roll.id;
        // A flood of rolls must not pile up strikes and timers: keep only the newest few.
        const waiting = waitingStrikes.current;
        while (waiting.size >= MAX_ATTACK_EFFECTS) {
          const [oldest, strike] = waiting.entries().next().value!;
          window.clearTimeout(strike.timer);
          waiting.delete(oldest);
        }
        const timer = window.setTimeout(() => {
          waitingStrikes.current.delete(rollId);
          playEffectRef.current(effect);
        }, STRIKE_WAIT_MS);
        waitingStrikes.current.set(rollId, { effect, timer });
      } else {
        playEffectRef.current(effect);
      }
    });

    return () => {
      disposed = true;
      stopEphemeral();
      stopMovementUpdates();
      stopCommitted();
      waitingStrikes.current.forEach((waiting) => window.clearTimeout(waiting.timer));
      waitingStrikes.current.clear();
      if (viewRef.current === view) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, [connection]);

  useEffect(() => {
    viewRef.current?.update(boardState, you, shownSeq);
  }, [boardState, you, shownSeq]);

  useEffect(() => {
    // Each replay step shows its state at once: any slide still running ends first (token-slide).
    viewRef.current?.stopSlides();
    if (replayFrame?.kind !== "event") return;
    // A move stepped forward to slides like a live one, cut to what this viewer may see, and ends
    // before the next auto-play step.
    const moved = replayFrame.committed.event;
    if (moved.type === "TokenMoved") {
      const { points, gaps } = slidePointsFor(moved, latest.current.you, latest.current.state);
      viewRef.current?.slide(moved.tokenId, points, gaps, { capMs: REPLAY_STEP_MS - REPLAY_SLIDE_MARGIN_MS });
    }
    const seen = attackEffectFor(replayFrame.committed.event, latest.current.state, latest.current.you);
    const effect = seen && effectToPlay(seen, getClientSettings().attackAnimations, latest.current.state);
    if (effect) playEffectRef.current(effect);
  }, [replayFrame]);

  // Landing a roll releases its own strike. Each roll is thrown on its own, so the others keep
  // waiting for their dice, or for the fallback timer if a landing never reaches us.
  useEffect(() => {
    const waiting = waitingStrikes.current;
    const strike = landedRollId ? waiting.get(landedRollId) : undefined;
    if (!landedRollId || !strike) return;
    waiting.delete(landedRollId);
    window.clearTimeout(strike.timer);
    playEffectRef.current(strike.effect);
  }, [landedRollId]);

  useEffect(() => {
    viewRef.current?.setReadOnly(readOnly);
    if (readOnly) {
      // Nothing to place, aim or draw while previewing.
      setPlacing(null);
      setTool({ kind: "select" });
    }
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.setShowWalls(showWalls);
    viewRef.current?.setShowPortals(showPortals);
  }, [showWalls, showPortals]);

  useEffect(() => {
    viewRef.current?.setGmFogView(gmFog);
  }, [gmFog, state.fog, connection]);

  useEffect(() => {
    viewRef.current?.setGridPreview(gridPreview);
  }, [gridPreview]);

  useEffect(() => {
    viewRef.current?.setMovementRuler(rulerOrigin, selected?.size ?? 1);
  }, [rulerOrigin?.x, rulerOrigin?.y, selected?.size]);

  useEffect(() => {
    viewRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    viewRef.current?.setGroupSelection(groupSelection ?? []);
  }, [groupSelection]);

  useEffect(() => {
    viewRef.current?.setPlacement(ghost);
  }, [ghost]);

  // Keyboard path: the board takes focus, and the arrows and Enter place from there. New Token and
  // Saved Creatures start placing only once their dialog has closed and handed focus back, so
  // nothing takes it away again.
  useEffect(() => {
    if (!source) return;
    hostRef.current?.focus();
    viewRef.current?.setPlacementCursor(placingRef.current!.cursor);
  }, [source]);

  // Escape ends placing, unless it is meant for a field or an open dialog. Tokens placed stay.
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source]);

  /** Arrows move the keyboard cursor one square; Enter places there (token-placement-flow). */
  const onBoardKey = (e: React.KeyboardEvent) => {
    const current = placingRef.current;
    if (!current || e.defaultPrevented) return;
    const size = ghostRef.current?.size ?? 1;
    if (e.key === "Enter") {
      e.preventDefault();
      void place(current.cursor);
      return;
    }
    const step = ARROWS[e.key];
    if (!step) return;
    e.preventDefault();
    const cursor = moveCursor(current.cursor, step[0], step[1], size, state);
    viewRef.current?.setPlacementCursor(cursor);
    const said = t(cursor === current.cursor ? "board.cursorEdge" : "board.cursorSaid", { name: ghostRef.current?.name ?? t("board.token"), square: cursorSquare(cursor, size, state.scene.grid) });
    setPlacing({ ...current, cursor, said });
  };

  // Escape puts the board back to Select, unless it is meant for a field or an open dialog.
  // An attack being aimed goes back to whatever tool was in use before it.
  useEffect(() => {
    if (tool.kind === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      // The Fog polygon takes Enter to close and Backspace to drop a corner; Escape abandons it first.
      if (toolRef.current.kind === "fog" && e.key === "Enter" && viewRef.current?.closeFogPolygon()) return e.preventDefault();
      if (toolRef.current.kind === "fog" && e.key === "Backspace" && viewRef.current?.undoFogPoint()) return e.preventDefault();
      // A Movement-mode ruler route: Enter finishes, Backspace drops a point, Escape clears it first (ruler-modes).
      if (toolRef.current.kind === "measure" && e.key === "Enter" && viewRef.current?.closeRoute()) return e.preventDefault();
      if (toolRef.current.kind === "measure" && e.key === "Backspace" && viewRef.current?.dropRoutePoint()) return e.preventDefault();
      if (e.key !== "Escape") return;
      if (viewRef.current?.cancelFogPolygon()) return;
      if (toolRef.current.kind === "measure" && viewRef.current?.cancelRoute()) return;
      if (toolRef.current.kind === "attack") endAttack();
      else setTool({ kind: "select" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);

  // The attacker can vanish while its target is being picked: deleted, or hidden from a player.
  const attackerId = tool.kind === "attack" ? tool.attackerId : null;
  const attackerGone = attackerId !== null && !state.tokens[attackerId];
  useEffect(() => {
    if (attackerGone) endAttack();
  }, [attackerGone]);

  /** Start a placement with the keyboard cursor on the square(s) nearest the map's centre. */
  const startPlacing = (next: PlacingSource, size: number) => {
    const cursor = startCursor(latest.current.state, size);
    setPlacing({ source: next, placed: 0, busy: false, error: null, cursor, said: "" });
  };

  /** Place copies of a token, once per click, from the roster or the token card (ADR 0033). */
  const duplicateToken = (tokenId: string) => {
    const token = latest.current.state.tokens[tokenId];
    if (!token) return;
    // The rail's tools would compete with placing for the same clicks.
    setTool({ kind: "select" });
    const { name, size, rotation, color, imageUrl, hidden, stats } = token;
    startPlacing({ kind: "duplicate", tokenId, ghost: { name, size, rotation, color, imageUrl, hidden, stats } }, size);
  };

  /** Delete a token through the same guarded room command used by the other board actions. */
  const deleteToken = async (tokenId: string) => {
    const result = await guarded.command({ type: "token.delete", tokenId });
    if (!result.ok) {
      setRefusal({ message: result.message, at: Date.now() });
      return false;
    }
    setRefusal(null);
    setRepositionId(null);
    repositionRef.current = null;
    deselect();
    return true;
  };

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
    placeToken: (next: TokenDraft) => {
      // The rail's tools would compete with placing for the same clicks.
      setTool({ kind: "select" });
      startPlacing({ kind: "create", draft: next }, next.size ?? 1);
    },
    duplicateToken,
    startAttack: (tokenId: string) => {
      // Aiming and placing would compete for the same click; the aim wins.
      setPlacing(null);
      if (toolRef.current.kind !== "attack") beforeAttack.current = toolRef.current;
      setTool({ kind: "attack", attackerId: tokenId });
    },
    startTemplatePick: () => {
      setPlacing(null);
      setTool({ kind: "pickTemplate" });
    },
    showPing: (at: Point) => viewRef.current?.showPing(at),
    aimThrow: (client: Point, velocity: Point) => {
      const view = viewRef.current;
      const { map, grid } = latest.current.state.scene;
      if (!view || !map) return null;
      const from = view.clientToBoard(client.x, client.y);
      if (!from || !onMap(from, map)) return null;
      return { from, to: throwLanding(from, velocity, view.transform, grid, map) };
    },
    centreAim: () => {
      const view = viewRef.current;
      const centre = view?.visibleCentre();
      if (!view || !centre) return null;
      const { map, grid } = latest.current.state.scene;
      return centreThrow(centre, view.transform, grid, map);
    },
    throwDice: (t: BoardThrow, roll: TrayRoll, onLanded: () => void, onGone?: () => void) => {
      const view = viewRef.current;
      const { map, grid } = latest.current.state.scene;
      if (!view || !canAnimateDice(hostRef.current)) return false;
      let landed = false;
      const once = () => {
        if (landed) return;
        landed = true;
        onLanded();
      };
      const size = boardDieSize(grid, view.transform);
      // A roll thrown while others still lie on the board lands beside them, not on them.
      const shift = crowdedOffset(throwsRef.current.length, size);
      const apart: BoardThrow = { ...t, from: { x: t.from.x + shift.x, y: t.from.y + shift.y }, to: { x: t.to.x + shift.x, y: t.to.y + shift.y } };
      const next = [...throwsRef.current, { throw: apart, roll, size, map, onLanded: once, onGone: onGone ?? (() => {}) }];
      const evicted = next.splice(0, Math.max(0, next.length - MAX_BOARD_THROWS));
      setBoardThrows(next);
      evicted.forEach((e) => {
        e.onLanded();
        e.onGone();
      });
      return true;
    },
    dropDice: (drop: BoardDrop, skin: DiceSkin | null, onLanded: () => void, onGone?: () => void) => {
      const view = viewRef.current;
      if (!view || !canAnimateDice(hostRef.current)) return false;
      let landed = false;
      const once = () => {
        if (landed) return;
        landed = true;
        onLanded();
      };
      const { grid, map } = latest.current.state.scene;
      // The same die size as a Roll-button throw, so these read as ordinary rolls.
      const size = boardDieSize(grid, view.transform);
      // One slot per roll, however many tokens: a big roll never pushes its own dice off.
      const { kept, evicted } = addDrop(dropsRef.current, { drop, size, skin, map, onLanded: once, onGone: onGone ?? (() => {}) });
      setBoardDrops(kept);
      evicted.forEach((e) => {
        e.onLanded();
        e.onGone();
      });
      return true;
    },
  }), []);

  const phone = usePhone();
  const canPaint = you.role === "gm" && !readOnly && !selectOnly;
  const filters = (inline: boolean) => (
    <BoardFilters
      inline={inline}
      value={{ fog: gmFog !== "off", walls: showWalls, portals: showPortals, terrain: showTerrain }}
      available={{ fog: you.role === "gm" && hasFog, walls: you.role === "gm" && hasWalls, portals: you.role === "gm" && hasPortals, terrain: true }}
      sight={gmCanSee && losOn ? {
        checked: tokenView,
        onChange: (on) => { setEyeStarted(false); setTokenView(on); setViewedIds([]); },
      } : undefined}
      onChange={(next) => {
        setGmFog(next.fog ? "tint" : "off");
        setShowWalls(next.walls);
        setShowPortals(next.portals);
        setShowTerrain(next.terrain);
      }}
    />
  );

  return (
    <div className="board" data-tour="board">
      <div
        ref={hostRef}
        className="board-canvas"
        tabIndex={-1}
        aria-label={placing ? t("board.placingAria", { name: ghost?.name ?? t("board.aToken") }) : undefined}
        onKeyDown={onBoardKey}
      />
      {(overlayEffects.length > 0 || Object.values(state.tokens).some((t) => t.conditions.length > 0)) && (
        <Suspense fallback={null}>
          <EffectsOverlay state={state} effects={overlayEffects} subscribe={followView} onDone={dropEffect} isGm={you.role === "gm"} />
        </Suspense>
      )}
      {throws.length > 0 && <ThrownDice throws={throws} subscribe={followView} onDone={throwDone} />}
      {drops.length > 0 && <DroppedDice drops={drops} subscribe={followView} onDone={dropDone} />}
      <div className="board-toolbar">
        {toolbar}
        {phone ? (
          <>
          {/* Two 44px buttons on a phone: board options (Paint terrain, Fit) and, separately, the view filter. */}
          <PopoverButton label={t("board.options")} title={t("board.options")} className="tool-button board-menu-button" buttonContent={<SlidersHorizontal size={18} aria-hidden="true" />}>
            {(close) => (
              <div className="room-menu">
                {canPaint && (
                  <button type="button" className="tool-button" onClick={() => { close(); if (state.scene.map) setTerrainOpen(true); else setNoMapNotice(true); }}>
                    <PaintBrush size={16} aria-hidden="true" /> {t("board.paintTerrain")}
                  </button>
                )}
                <button type="button" className="tool-button" data-tour="fit" onClick={() => { close(); viewRef.current?.resetView(); }}>
                  <CornersOut size={16} aria-hidden="true" /> {t("board.fitScreen")}
                </button>
              </div>
            )}
          </PopoverButton>
          <PopoverButton label={t("board.viewFilters")} title={t("board.viewFilters")} placement="fixed" className="tool-button board-menu-button" buttonContent={<Funnel size={18} aria-hidden="true" />}>
            <div className="room-menu">{filters(true)}</div>
          </PopoverButton>
          </>
        ) : (
          <>
            {canPaint && <button type="button" className="tool-button" onClick={() => (state.scene.map ? setTerrainOpen(true) : setNoMapNotice(true))}>{t("board.paintTerrain")}</button>}
            <button type="button" className="tool-button" data-tour="fit" onClick={() => viewRef.current?.resetView()} title={t("board.fitTitle")}>
              <CornersOut size={16} aria-hidden="true" />
              {t("common.fit")}
            </button>
            {filters(false)}
          </>
        )}
      </div>
      {tokenView && gmCanSee && viewing.length === 0 && (
        <p className="board-status" role="status"><Eye size={14} aria-hidden="true" />{t("board.noTokensSee")}</p>
      )}
      {/* Line of sight with no token to see through: the map shows dimmed, and this says why. */}
      {you.role === "player" && losOn && state.scene.map && state.sight?.length === 0 && (
        <p className="board-status" role="status"><Eye size={14} aria-hidden="true" />{t("board.seeOnceGiven")}</p>
      )}
      {gridPreview && <p className="grid-preview-label" role="status">{t("board.previewNotApplied")}</p>}
      {!readOnly && !selectOnly && (
      <ToolRail
        movementControls={<MovementControls
          mode={measureMode}
          onMode={(mode) => {
            setMeasureMode(mode);
            setTool((current) => (current.kind === "measure" ? { kind: "measure", mode } : current));
          }} />}
        active={tool.kind}
        options={toolOptions}
        isGm={you.role === "gm"}
        onSelect={(kind) => {
          setPlacing(null);
          setTool(toolFor(kind, toolOptions));
        }}
        onOptions={(options) => {
          setToolOptions(options);
          setMeasureMode(options.measure.mode);
          setTool((current) => (current.kind === "attack" ? current : toolFor(current.kind, options)));
        }}
        onClear={() => viewRef.current?.clearMarks()}
        selectOnly={selectOnly}
        lineOfSight={state.scene.lineOfSight ?? false}
        onToggleLineOfSight={() => void guarded.command({ type: "scene.setLineOfSight", enabled: !state.scene.lineOfSight })}
      />
      )}
      {tool.kind === "measure" && movementFeedback && <p className="movement-feedback" role="status">{movementFeedback}</p>}
      {overlay}
      {notices}
      {noMapNotice && !state.scene.map && <p className="board-movement-readout" role="status">{t("board.addMapFirst")}</p>}
      {movementNotice && !selected && !readOnly && <p className="board-movement-readout" role="status">{movementNotice}</p>}
      {terrainOpen && you.role === "gm" && !readOnly && <Modal open title={t("terrain.live")} className="map-editor" onClose={() => setTerrainOpen(false)}><div className="map-editor-body"><TerrainSetup connection={connection} state={state} live layers /></div></Modal>}
      {refusal && <p key={refusal.at} className="board-refusal" role="alert">{refusal.message}</p>}
      {selected && (
        <TokenCard
          token={selected}
          state={state}
          you={you}
          readOnly={readOnly}
          onClose={deselect}
          // Out of the way of the editor and the placement ghost.
          onEdit={onEditToken && (() => { deselect(); onEditToken(selected.id); })}
          onDuplicate={() => { deselect(); duplicateToken(selected.id); }}
          onDelete={() => deleteToken(selected.id)}
          onMove={(to) => moveToken(selected.id, to)}
          movementReadout={movementNotice}
          reposition={you.role === "gm" && !readOnly ? { on: repositionId === selected.id, toggle: () => setRepositionId((id) => id === selected.id ? null : selected.id) } : undefined}
          sight={gmCanSee && losOn ? (() => {
            const on = tokenView && viewedIds.includes(selected.id);
            return {
              on,
              onToggle: () => {
                if (on) {
                  if (eyeStarted) setTokenView(false); else setViewedIds([]);
                } else {
                  if (!tokenView) setEyeStarted(true);
                  setTokenView(true);
                  setViewedIds([selected.id]);
                }
              },
            };
          })() : undefined}
        />
      )}
      {placing && (
        <div className="placement-bar">
          <p>
            {t("board.placingBefore")}<strong>{ghost?.name}</strong>{t("board.placingAfter")}
            {placing.placed > 0 ? t("board.placedN", { n: placing.placed }) : ""}
          </p>
          {/* Each cursor move and each token placed, for screen readers (token-placement-flow). */}
          <p className="sr-only" aria-live="polite">{placing.said}</p>
          {placing.error && <p role="alert" className="error">{placing.error}</p>}
          <div className="row">
            <button type="button" className="secondary" disabled={placing.busy} onClick={() => setPlacing(null)}>
              {placing.placed > 0 ? t("common.done") : t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {/* Announced when the tool changes; while placing, the placement bar already speaks. */}
      {/* Read-only boards (a player preview, a checkpoint preview) can't ping or place, so no hint. */}
      {!readOnly && (
        <p className="board-hint" aria-live={placing ? "off" : "polite"}>
          {(() => { const hint = placing ? PLACING_HINT : tool.kind === "area" && tool.gmOnly ? GM_ONLY_AREA_HINT : tool.kind === "fog" ? FOG_HINTS[tool.mode] : tool.kind === "measure" ? MEASURE_HINTS[tool.mode] : HINTS[tool.kind]; return hint ? t(hint) : ""; })()}
        </p>
      )}
    </div>
  );
});
