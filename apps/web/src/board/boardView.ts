import { effectiveTerrain, emptyTerrain, cellRect, type TerrainRun } from "@vtt/shared";
import { budgetLabel, defaultMovementSettings, movementPreview, type MovementPreview, type MovementSettings } from "./movementRuler";
import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Matrix,
  Particle,
  ParticleContainer,
  Sprite,
  Text,
  Texture,
  Ticker,
  type FederatedPointerEvent,
} from "pixi.js";
import {
  can,
  conditionSpec,
  gridLineStyle,
  hpFraction,
  pointInPolygon,
  snapTokenCenter,
  type ConditionId,
  type ConditionShape,
  type GridSpec,
  type Participant,
  type Point,
  type RoomState,
  type Token,
  type AreaTemplate,
  type MovementPreviewRequest,
  type MovementPreviewFeedback,
} from "@vtt/shared";
import { footprint, placementPoint, type PlacementGhost } from "./placement";
import { clientToBoard, type BoardTransform } from "./diceThrow";
import { recenterOnResize } from "./recenter";
import { exceedsPanThreshold, pinchIsManual, resizeAction, zoomChangesScale } from "./viewFit";
import { conditionRowY, tokenLabelFontSize, tokenLabelStroke } from "./tokenLabel";
import { canRenderGrid, DEFAULT_BOARD_SIZE } from "./gridRenderLimit";
import { gridLines } from "./gridLines";
import {
  MAX_ATTACK_EFFECTS,
  artStyleFor,
  attackPlan,
  conditionLoopWanted,
  loopFrameDue,
  loopingConditions,
  prefersReducedMotion,
  watchReducedMotion,
  type AttackEffect,
} from "./effects";
import { playNuke, playStrike, type FxHost, type RunningFx } from "./fx";
import { loadFxTextures } from "./fxTextures";
import { conditionIcon, loadConditionIcons } from "./conditionIcons";
import { armSound, withSound } from "./fxSound";
import { getClientSettings, graphicsBudget, subscribeGraphicsSettings } from "../ui/clientSettings";
import { averageColor, fogDistanceField, fogPalette, makeFogDensityCanvas, makeFogDistanceCanvas, type Rgb } from "./fogTexture";
import { WISP_ANCHOR, layoutFogPuffs, puffPose, type FogPuff } from "./fogPuffs";
import { fogArt, loadFogArt } from "./fogArt";
import { FogBody } from "./fogShader";
import { makeSightMaskCanvas, sightColor, sightMaskAlpha } from "./sightMask";

/** How long the old line-of-sight mask takes to fade out over the new one. */
const SIGHT_FADE_MS = 160;
import { areaColorValue, areaOrigin, areaShape, areaSizeFromDrag, fogDraftPoints, fogRegionAt, formatDistance, hitMark, measure, portalAt, sweepPoints, templateArea, templateMark, type BoardTool, type FogDraft, type Mark } from "./tools";
import { aimExpiry, expiredAims } from "./aims";
import { PING_MS, pingPulse } from "./ping";
import { boardFontFamily, boardMonoFamily, relabelWhenFontsReady, relabelledFamily, waitForBoardFont } from "./boardFont";
import { hpColor, readBoardPalette, type BoardPalette } from "../ui/palette";

/**
 * How a GM's board shows fog (FR-GM-17): see-through with outlines ("tint") or not at all ("off").
 * Players, and the GM viewing as a player, always see it opaque.
 */
export type GmFogView = "tint" | "off";

/** An area being aimed, as sent to the others (KAN-35); mirrors the `templatePreview` payload. */
export type AimPreview = { shape: AreaTemplate["shape"]; origin: Point; toward: Point; size: number; width?: number; color?: AreaTemplate["color"]; gmOnly: boolean };

/** Pixi animations playing at once; the oldest ends first, so a flood of attacks never lags the board. */
const MAX_FX_RUNS = 4;

export interface BoardCallbacks {
  nukeImpact?: () => void;
  /** Commit a move. Resolves false if the server rejected it. */
  moveToken(tokenId: string, to: Point, origin?: Point, boardEpoch?: number): Promise<boolean>;
  /** Every pointer move of a token drag; the connection coalesces them (KAN-39). */
  dragPreview(tokenId: string, at: Point): void;
  /** Private advisory query; geometry and feedback are never relayed to other viewers. */
  requestMovementPreview?(request: MovementPreviewRequest): void;
  /**
   * The drag ended. `at` is where the token now rests (the drop point, or back where it started),
   * so other viewers' ghosts end there too; null when there is nothing to show.
   */
  dragEnd(tokenId: string, at: Point | null): void;
  ping(at: Point): void;
  /** Place a shared area template (ADR 0007). Resolves false if the server rejected it. */
  placeTemplate(template: { shape: AreaTemplate["shape"]; origin: Point; toward: Point; size: number; width?: number; color?: AreaTemplate["color"]; gmOnly: boolean }): Promise<boolean>;
  /** The area being aimed, as others should see it (KAN-35); the connection coalesces these. */
  aimPreview(preview: AimPreview): void;
  /** Aiming stopped (placed or cancelled): clear it for the others. */
  aimEnd(gmOnly: boolean): void;
  /** Resolves false if the server rejected the removal. */
  removeTemplate(templateId: string): Promise<boolean>;
  /** GM: fog a region (FR-GM-17). Resolves false if the server rejected it. */
  addFog(region: FogDraft): Promise<boolean>;
  /** GM: remove a fog region. Resolves false if the server rejected it. */
  removeFog(regionId: string): Promise<boolean>;
  /** The viewer clicked the token `attackerId` attacks (attack-targeting). */
  pickTarget(attackerId: string, targetId: string): void;
  /** The viewer right-clicked while picking a target: stop without attacking. */
  cancelAttack(): void;
  /** GM: Shift-click on a token adds it to the group selection, or takes it out (ADR 0046). */
  toggleGroupToken(tokenId: string): void;
  /** GM: clicked a placed template in From template; its tokens become the selection (ADR 0046). */
  pickTemplate(templateId: string): void;
  /** GM: right-clicked while picking a template: stop without picking. */
  cancelPickTemplate(): void;
  /** The GM clicked a square while placing a new token (place-token-on-board). */
  placeToken(at: Point): void;
  /** A press on a token that stayed put (a click, not a drag) selects it (`extend`: Shift was held); a click on bare map clears (null). */
  selectToken(tokenId: string | null, extend?: boolean): void;
  movementFeedback?(text: string): void;
  /** The GM right-clicked while placing: put the token back. */
  cancelPlacement(): void;
  /**
   * The viewer clicked a door or window with the Select tool (FR-GM-18, ADR 0030); `lock` when
   * Shift was held. The server decides what the viewer may do.
   */
  togglePortal(wallId: string, lock: boolean): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** Oldest marks drop off past this, so a long session can't grow the scene without bound. */
const MAX_MARKS = 100;
/** A tool drag shorter than this (screen pixels) is a click and makes no mark. */
const MIN_MARK_DRAG_PX = 4;
/** Stand-in id for the token being placed; never a real token's id. */
const GHOST_ID = "placement-ghost";
/** How close (screen pixels) a click must be to a fog polygon's first corner to close it. */
const FOG_CLOSE_PX = 12;
/** The longest step the fog's clock takes in one frame, in seconds, so a stall does not jump it. */
const FOG_MAX_STEP_S = 0.25;
/**
 * The GM sees fog as a flat tint over the map and tokens, so what is under it stays visible
 * (gm-view-as-player), with a thin outline in the fog's own pale tone, faint enough not to read as a frame.
 */
const FOG_GM_FILL = 0x000000;
const FOG_GM_FILL_ALPHA = 0.25;
const FOG_EDGE_ALPHA = 0.45;
/** The outline of a fog region the GM is drawing with the Fog tool. */
const FOG_EDGE = 0x9fb3c8;
/** How close (screen pixels) a click has to come to a door or window to use it (ADR 0030). */
const PORTAL_REACH_PX = 10;
/** Portal colours by kind: wood for doors, glass for windows. Locked ones get a red lock mark. */
const DOOR_COLOR = 0xc8873a;
const WINDOW_COLOR = 0x5dade2;
const LOCK_COLOR = 0xc0392b;
/** The thinnest a door or window is drawn, in screen pixels, however far the board is zoomed out. */
const PORTAL_MIN_PX = 6;
/** How close (screen pixels) the eraser has to come to a line to erase it. */
const ERASER_REACH_PX = 12;
/** A brush stroke adds a point once the pointer has moved this far (screen pixels). */
const BRUSH_STEP_PX = 2;
/**
 * Named fonts, never `system-ui`: Pixi measures text on an OffscreenCanvas but draws it on a
 * DOM canvas, and Firefox resolves `system-ui` to a narrower font offscreen, which crops the
 * end of long token names (fix-token-label-clipping).
 */
/** The smallest a token's name is drawn on screen, in CSS pixels. */
const MIN_LABEL_SCREEN_PX = 12;
/** Auto-focus on an attack: the closest it zooms, and how long the glide takes. */
const MAX_FIGHT_ZOOM = 2;
const FIGHT_FOCUS_MS = 450;
/** Strikes this soon after a focus are part of the same attack and keep its framing. */
const FIGHT_REFOCUS_MS = 2500;
/** Longest brush stroke, in points, so one stroke can't grow without bound. */
const MAX_STROKE_POINTS = 2000;

/** A fog particle's colour: `shade` of the way from the fog's bank colour to its mist colour. */
function fogTint(dark: Rgb, light: Rgb, shade: number): number {
  const c = (i: 0 | 1 | 2) => Math.round(dark[i] + (light[i] - dark[i]) * shade);
  return (c(0) << 16) | (c(1) << 8) | c(2);
}

/**
 * Tool cursors (KAN-69): 24px SVGs, light shapes with a dark outline so they read on any map.
 * Each hotspot is the point the tool acts on.
 */
function svgCursor(body: string, hotX: number, hotY: number) {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' " +
    "stroke-linecap='round' stroke-linejoin='round'>" + body + "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, crosshair`;
}
/** A path drawn light on top of a dark outline. */
const outlined = (d: string, width = 1.6) =>
  `<path d='${d}' fill='none' stroke='#111' stroke-width='${width + 2}'/><path d='${d}' fill='none' stroke='#fff' stroke-width='${width}'/>`;
const TOOL_CURSORS = {
  // A crosshair to aim from, with a small ruler beside it.
  measure: svgCursor(
    outlined("M5 1v8M1 5h8") +
      "<g transform='rotate(-35 16 16)'><rect x='9' y='13' width='14' height='6' rx='1' fill='#f1c40f' stroke='#111' stroke-width='1.2'/>" +
      "<path d='M12 13v2.5M15 13v1.8M18 13v2.5M21 13v1.8' stroke='#111' stroke-width='1.1'/></g>",
    5, 5,
  ),
  // A brush, tip at the bottom left.
  draw: svgCursor(
    "<g transform='rotate(45 12 12)'><rect x='9.5' y='-1' width='5' height='13' rx='1.2' fill='#c9955c' stroke='#111' stroke-width='1.2'/>" +
      "<rect x='9.3' y='11' width='5.4' height='3' fill='#d8dde3' stroke='#111' stroke-width='1.2'/>" +
      "<path d='M9.6 14h4.8c0 4-1.2 7-2.4 9.5-1.2-2.5-2.4-5.5-2.4-9.5Z' fill='#fff' stroke='#111' stroke-width='1.2'/></g>",
    3, 21,
  ),
  // A burst ring round the origin point.
  area: svgCursor(
    "<circle cx='12' cy='12' r='8.5' fill='rgba(230,126,34,0.25)' stroke='#111' stroke-width='3'/>" +
      "<circle cx='12' cy='12' r='8.5' fill='none' stroke='#e67e22' stroke-width='1.5' stroke-dasharray='3 2'/>" +
      outlined("M12 8v8M8 12h8", 1.4),
    12, 12,
  ),
  // A block eraser, rubber tip at the bottom left.
  erase: svgCursor(
    "<g transform='rotate(-45 12 12)' stroke='#111' stroke-width='1.5'>" +
      "<rect x='2' y='8' width='20' height='8' rx='2' fill='#f4f1ec'/>" +
      "<rect x='2' y='8' width='8' height='8' rx='2' fill='#e07a8a'/></g>",
    4, 20,
  ),
  // A crosshair over a dark fog square.
  fog: svgCursor(
    "<rect x='9' y='9' width='13' height='13' rx='2' fill='rgba(11,13,18,0.75)' stroke='#9fb3c8' stroke-width='1.5'/>" +
      outlined("M5 1v8M1 5h8"),
    5, 5,
  ),
  // Picking a template's tokens (ADR 0046).
  pickTemplate: "crosshair",
  // A red reticle, aimed from its centre.
  attack: svgCursor(
    "<circle cx='12' cy='12' r='7.5' fill='none' stroke='#111' stroke-width='3.6'/>" +
      "<circle cx='12' cy='12' r='7.5' fill='none' stroke='#e74c3c' stroke-width='1.8'/>" +
      outlined("M12 1v6M12 17v6M1 12h6M17 12h6", 1.6),
    12, 12,
  ),
} as const;
const MEASURE_COLOR = 0xf1c40f;
/**
 * The attack aim (attack-targeting): the board's neutral mark style, a warm off-white on a soft
 * charcoal edge like the token direction arrows and ruler labels, so it reads on bright and dark
 * maps alike without shouting over the tokens.
 */
const AIM_COLOR = 0xf4ede4;
const AIM_EDGE = 0x14171b;
/** GM-only areas are hatched (ADR 0040): stripes about a quarter of a cell apart, so they zoom with the map. */
const HATCH_TILE_PX = 16;
const HATCH_SPACING_CELLS = 0.25;
/** Neutral stand-in for a map image that no longer exists (board-asset-fallback). */
const EMPTY_MAP_FILL = 0x2b2e35;

/**
 * Image URLs that failed to load this session — typically a deleted library asset. The
 * log keeps old URLs forever, so without this every state sync would re-request a 404.
 */
const failedImageUrls = new Set<string>();

interface TokenView {
  container: Container;
  /**
   * The token's body, art and mask. Condition looks (tilt, fade, grey) and shake apply here, never
   * to `container.position`, which is the token's board position (KAN-76).
   */
  art: Container;
  body: Graphics;
  /** Token art clipped to the token circle; hidden when there is none or it failed to load. */
  image: Sprite;
  imageMask: Graphics;
  /** URL the sprite is showing or loading, so a late load for an old URL is ignored. */
  imageUrl: string | null;
  radius: number;
  /** Resource bar and focus ring (FR-TAC-07). */
  decor: Graphics;
  /** Condition markers: one shape + abbreviation each (FR-TAC-08). */
  markers: Container;
  label: Text;
  drawnKey: string;
  conditions: ConditionId[];
  /** Conditions whose effect moves, so the condition loop knows whom to redraw. */
  looping: boolean;
  /** Offsets from a hit shake and from trembling, added up on `art.position`. */
  shake: Point;
  /** The hit whose shake `shake` holds, or null (KAN-76). */
  shakeOwner: AttackFx | null;
  tremble: Point;
  /** Greyscale filter while Unconscious; made once, then reused. */
  grey: ColorMatrixFilter | null;
}

/** An attack effect playing; `stop` removes it and gives the tokens back their position. */
interface AttackFx {
  step: (now: number) => boolean;
  stop(): void;
}

/**
 * Imperative PixiJS renderer. React owns the panels; this owns the canvas.
 * All positions it reports are board coordinates; each viewer's pan/zoom is local (FR-TAC-01).
 */
export class BoardView {
  private app = new Application();
  /** Token highlighted from the roster (FR-GM-24). */
  private focusedId: string | null = null;
  /** Status and focus colours from :root, read once: the table is always dark. */
  private readonly palette: BoardPalette = readBoardPalette();
  /** The GM's group selection for a group roll or an area effect (ADR 0046). */
  private groupSelection: ReadonlySet<string> = new Set();
  /** Tokens the GM is looking through (gm-token-sight-view), ringed with a dashed outline. */
  private viewedIds = new Set<string>();
  private world = new Container();
  /** Untransformed parent of the map world; screen-space blasts are its sibling. */
  private screenLayer = new Container();
  /** Screen-space blasts never inherit the map zoom or huge offscreen map bounds. */
  private screenFxLayer = new Container();
  private mapSprite = new Sprite(Texture.EMPTY);
  private grid = new Graphics();
  /**
   * Fog regions (FR-GM-17), between the grid and the tokens: a player's own token stays visible
   * on top, and anything else under fog is not in a player's state at all (ADR 0016).
   */
  /**
   * The players' mist (flowing-fog): the fog body, a shader quad over the part of the board on
   * screen (`fogShader.ts`), and the puffs and wisps drifting over it, each laid out to stay on the
   * board. No mask: a stencil mask here corrupted the GM's board after viewing as a player (the mist
   * is hidden for the GM). The body's distance field and the particles' layout are rebuilt only
   * when fog or the grid changes.
   */
  private fogMist = new Container();
  private fogBody: FogBody | null = null;
  private fogPuffLayer = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, vertex: true, color: true } });
  private fogPuffs: Array<{ puff: FogPuff; particle: Particle }> = [];
  private fogShape = "";
  private fogShapeKey = "";
  /** The fog's distance field, and the procedural clouds the body reads until the painted fog bank loads. */
  private fogDistance: Texture | null = null;
  private fogDensity: Texture | null = null;
  /** The GM's fog outlines, kept apart so the fog's feathering never blurs them. */
  private fogEdgeGraphics = new Graphics();
  /** Line of sight (ADR 0044): opaque dark over the map with the viewer's sight polygons cut out, soft-edged. */
  private sightLayer = new Container();
  private sightSprite: Sprite | null = null;
  /** The previous mask, fading out on top of the new one. */
  private sightFading: Sprite | null = null;
  private sightFadeStep: ((now: number) => boolean) | null = null;
  private drawnSight: unknown = null;
  private drawnSightKey = "";
  private fogLayer = new Container();
  /** The map's average colour, which the fog takes after (null until the map has loaded). */
  private fogBase: Rgb | null = null;
  /** The fog loop is in `animations`; it advances the fog's clock, in seconds. */
  private gmFogView: GmFogView = "tint";
  private readOnly = false;
  private fogLoopRegistered = false;
  private lastFogDraw = 0;
  private fogTime = 0;
  /** Walls and portals. Plain walls reach the GM only; players get the portals they can see (ADR 0030). */
  private terrainGraphics = new Graphics();
  private showTerrain = true;
  private drawnTerrain: unknown = null;
  private drawnTerrainGrid: unknown = null;
  private drawnTerrainShown = true;
  private repositionToken: string | null = null;
  private wallGraphics = new Graphics();
  private drawnWalls: RoomState["walls"] | null = null;
  /** Doors and windows, over the walls; redrawn on zoom so they stay thick enough to find (ADR 0030). */
  private portalGraphics = new Graphics();
  private portalsScale = 0;
  private tokenLayer = new Container();
  /** The viewer's own measure, draw and area marks (KAN-69); never sent anywhere. */
  private markLayer = new Container();
  private marksGraphics = new Graphics();
  /** The measurement and the shape being dragged out. */
  private overlayGraphics = new Graphics();
  private measureLabel = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: boardMonoFamily(), fontWeight: "600", stroke: { color: 0x000000, width: 4 } },
  });
  private fxLayer = new Container();
  private tokens = new Map<string, TokenView>();
  private ghosts = new Map<string, { g: Graphics; expires: number }>();
  /** Other participants' areas being aimed, by sender (KAN-35). Each fades 1 s after its last update. */
  private aims = new Map<string, { view: Container; expires: number }>();

  private state: RoomState | null = null;
  private you: Participant | null = null;
  private mapUrl: string | null = null;
  private gridPreview: GridSpec | null = null;
  /** The current map's image could not be loaded; draw the generic surface instead. */
  private mapMissing = false;
  private gridKey = "";

  private drag: { tokenId: string; offset: Point; movable: boolean; origin: Point; epoch: number; target?: { at: Point; free: boolean } } | null = null;
  private movementRequest: MovementPreviewRequest | null = null;
  private movementPreviewId = 0;
  private localMovementPreview: MovementPreview | null = null;
  private movementFeedbackStatus: MovementPreview["obstruction"] | null = null;
  /** Screen position where the token press began, to tell a click from a drag. */
  private dragDownAt: Point | null = null;
  private pan: { start: Point; origin: Point; button?: number } | null = null;
  private tool: BoardTool = { kind: "select" };
  private marks: Mark[] = [];
  /** Templates sent to the server but not yet back in state, so a release doesn't blink. */
  private pendingAreas: Extract<Mark, { kind: "area" }>[] = [];
  /**
   * Placements Clear all caught before the server's answer. They have no id yet, so each is
   * removed once its template shows up in state.
   */
  private cancelledAreas: Extract<Mark, { kind: "area" }>[] = [];
  /** Templates the eraser has asked to remove, so one sweep sends each only once. */
  private removing = new Set<string>();
  private drawnTemplates: RoomState["templates"] | null = null;
  private drawnFog: RoomState["fog"] | null = null;
  /** Fog regions sent to the server but not yet back in state, drawn so a release doesn't blink. */
  private pendingFog: FogDraft[] = [];
  /** Fog regions Reveal has asked to remove; hidden at once, shown again if refused. */
  private removingFog = new Set<string>();
  /** Corners of the fog polygon being clicked out, and the pointer for its next edge. */
  private fogPoints: Point[] = [];
  private fogHover: Point | null = null;
  /** The token under the pointer while picking an attack target; null over the map or the attacker. */
  private attackHover: string | null = null;
  /** When a target was last picked: a double-click there is part of the pick, not a ping. */
  private lastPickAt = 0;
  /** The last measurement; stays until the next one starts, the tool changes, or Clear. */
  private measurement: Mark | null = null;
  private movementSettings: MovementSettings | null = null;
  private movementOrigin: Point | null = null;
  private movementTokenSize = 1;
  /** A Measure/Draw/Area/Eraser drag in progress, in board coordinates. */
  private gesture: { from: Point; to: Point; screenFrom: Point; free: boolean; dragged: boolean; path: Point[]; tokenSize?: number } | null = null;
  /** Zoom the marks were last drawn at; stroke widths are divided by it. NaN forces a redraw. */
  private marksScale = Number.NaN;
  /** Moves sent but not yet reflected in state, so tokens don't snap back while waiting. */
  private pendingMoves = new Map<string, Point>();
  /** The new token being placed (place-token-on-board); null when not placing. */
  private placement: PlacementGhost | null = null;
  /** Where the pointer is over the board while placing; null when it is off the canvas. */
  private hover: { at: Point; free: boolean } | null = null;
  /** Screen point of a press while placing: released in place, it drops the token; dragged, it pans. */
  private placeDown: Point | null = null;
  /** The token drawn under the pointer while placing, and the squares it would cover. */
  private ghost: TokenView | null = null;
  private ghostFootprint = new Graphics();
  private initialized = false;
  /** Keep auto-fitting (map changes, window resizes) until the viewer pans or zooms themselves. */
  private autoFit = true;
  private hostObserver: ResizeObserver | null = null;
  /**
   * Rendering is on demand: nothing draws while the picture is unchanged. `invalidate()`
   * marks the picture dirty and asks for a frame; running animations (pings), drag ghosts
   * and a host that is still changing size keep frames coming until they settle.
   */
  private frame = 0;
  private dirty = false;
  /** Host size seen last frame while a resize waits to settle; null when none is pending. */
  private pendingSize: { width: number; height: number } | null = null;
  /** Per-frame animation steps; each returns false once it has finished. */
  private animations = new Set<(now: number) => boolean>();
  /** Set by a step that skipped its frame, so the frame is not redrawn for nothing. */
  private stepSkipped = false;
  /** Attack animations playing (KAN-76), oldest first. */
  private attackFx: AttackFx[] = [];
  /** The device's reduced-motion preference, and the GM's table-wide setting (`RoomState.reducedEffects`). */
  private osReduced = prefersReducedMotion();
  private tableReduced = false;
  private get reducedMotion() {
    return this.osReduced || this.tableReduced || getClientSettings().reducedAnimations;
  }
  /** Nuke and strike renderers (fx.ts) playing, oldest first. */
  private fxRuns: Array<{ run: RunningFx; started: number; timer: number; step: (now: number) => boolean }> = [];
  private stopMotionWatch: (() => void) | null = null;
  private stopSettingsWatch: (() => void) | null = null;
  /** The condition loop is in `animations`. */
  private loopRegistered = false;
  private lastLoopDraw = 0;
  /** Told the world transform whenever a frame draws it changed (throw-dice-on-board). */
  private viewListeners = new Set<(view: BoardTransform) => void>();
  private lastView: BoardTransform | null = null;

  constructor(
    private host: HTMLElement,
    private callbacks: BoardCallbacks,
  ) {}

  async init() {
    // Fetched in the background: until they arrive, attacks draw their vector look.
    void loadFxTextures();
    // Until the condition icons arrive, markers draw their shape and abbreviation.
    void loadConditionIcons().then(() => {
      if (!this.initialized) return;
      for (const view of this.tokens.values()) view.drawnKey = "";
      if (this.state && this.you) this.syncTokens();
      this.invalidate();
    });
    // Until the painted fog arrives, the fog body reads procedural clouds and has no puffs.
    void loadFogArt().then((art) => {
      if (!art || !this.initialized) return;
      this.fogBody?.setBank(art.bank);
      this.fogShape = "";
      this.invalidateFog();
    });
    armSound();
    // Labels are rasterised once, in whatever face has loaded: wait for Geist alongside Pixi's
    // own start-up, so the first token name is already in it (design-language: "One typeface").
    const [fontReady] = await Promise.all([
      waitForBoardFont(),
      this.app.init({
        width: Math.max(1, this.host.clientWidth),
        height: Math.max(1, this.host.clientHeight),
        background: "#14171b",
        antialias: true,
        autoDensity: true,
        // Beyond 2x the extra pixels are not visible on a map, but they cost fill rate.
        resolution: Math.min(window.devicePixelRatio || 1, graphicsBudget().resolution),
        // No continuous render loop; see `invalidate`.
        autoStart: false,
      }),
    ]);
    if (!fontReady) relabelWhenFontsReady(() => this.relabel());
    // Pixi's event system also re-tests hover on every frame of the shared system ticker,
    // for a scene moving under a still pointer. Every change here comes with a pointer
    // event or a render we asked for, so that loop is idle work.
    Ticker.system.stop();
    this.initialized = true;
    this.host.appendChild(this.app.canvas);

    this.measureLabel.anchor.set(0.5, 1.2);
    this.measureLabel.visible = false;
    this.markLayer.addChild(this.marksGraphics, this.overlayGraphics, this.measureLabel);
    // Marks and areas are drawn over the tokens but take no input (the eraser and From template
    // test their geometry), so a token under an area can still be clicked (ADR 0046).
    this.markLayer.eventMode = "none";
    this.fogMist.eventMode = "none";
    this.fogPuffLayer.eventMode = "none";
    this.fogMist.addChild(this.fogPuffLayer);
    this.sightLayer.label = "sight-mask";
    this.sightLayer.eventMode = "none";
    this.fogEdgeGraphics.eventMode = "none";
    this.fogLayer.eventMode = "none";
    this.fogLayer.addChild(this.fogMist, this.fogEdgeGraphics);
    this.wallGraphics.eventMode = "none";
    this.portalGraphics.eventMode = "none";
    this.world.addChild(this.mapSprite, this.grid, this.terrainGraphics, this.fogLayer, this.wallGraphics, this.portalGraphics, this.tokenLayer, this.sightLayer, this.markLayer, this.fxLayer);
    this.fxLayer.addChild(this.ghostFootprint);
    this.screenLayer.addChild(this.world);
    this.app.stage.addChild(this.screenLayer, this.screenFxLayer);

    const stage = this.app.stage;
    stage.eventMode = "static";
    stage.hitArea = this.app.screen;
    stage.on("pointerdown", this.onBackgroundDown);
    stage.on("globalpointermove", this.onPointerMove);
    stage.on("pointerup", this.onPointerUp);
    stage.on("pointerupoutside", this.onPointerUp);

    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.canvas.addEventListener("dblclick", this.onDoubleClick);
    // Touch: a phone has no wheel, so without these the board cannot be zoomed at all.
    this.app.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.app.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.app.canvas.addEventListener("touchend", this.onTouchEnd);
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.app.canvas.addEventListener("pointerleave", this.onPointerLeave);
    // A layout change (sidebar collapse, window resize) must not move what the viewer is
    // looking at. Without this a panned board stays pinned to the top-left and drifts.
    let lastSize = { width: this.app.screen.width, height: this.app.screen.height };
    this.app.renderer.on("resize", () => {
      if (!this.initialized) return;
      const size = { width: this.app.screen.width, height: this.app.screen.height };
      const action = resizeAction(this.autoFit, lastSize, size);
      if (action === "refit") this.fitToScreen();
      else if (action === "recenter") {
        const to = recenterOnResize(this.world.position, lastSize, size);
        this.world.position.set(to.x, to.y);
      }
      lastSize = size;
      this.dirty = true;
    });
    // Watch the host, not the window: collapsing the sidebar resizes the host without
    // resizing the window. Reallocating the canvas every frame of the sidebar's slide made
    // it stutter, so the resize waits until the host has kept one size for a frame. In the
    // meantime the canvas keeps its old size; the board's background covers any gap.
    this.hostObserver = new ResizeObserver(() => {
      this.pendingSize ??= { width: -1, height: -1 };
      this.schedule();
    });
    this.hostObserver.observe(this.host);
    this.stopMotionWatch = watchReducedMotion((reduced) => {
      this.osReduced = reduced;
      this.motionChanged();
    });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.stopSettingsWatch = subscribeGraphicsSettings(() => {
      // Keep world coordinates and camera unchanged when only pixel density changes.
      this.app.renderer.resize(this.app.screen.width, this.app.screen.height, Math.min(window.devicePixelRatio || 1, graphicsBudget().resolution));
      for (const entry of [...this.fxRuns]) this.endFx(entry);
      // The fog's particle budget follows the quality setting.
      this.fogShape = "";
      if (this.state) this.invalidateFog();
      this.motionChanged();
      this.invalidate();
    });
    this.invalidate();
  }

  /** Draw once on the next animation frame. Calls within one frame share it. */
  private invalidate() {
    this.dirty = true;
    this.schedule();
  }

  /**
   * Redraws every label in the face that has just loaded (see board/boardFont.ts): a changed
   * font family is a new style key, so Pixi measures and rasterises each one afresh.
   */
  private relabel() {
    if (!this.initialized) return;
    const visit = (node: Container) => {
      if (node instanceof Text) node.style.fontFamily = relabelledFamily(String(node.style.fontFamily));
      for (const child of node.children) visit(child as Container);
    };
    visit(this.app.stage);
    this.invalidate();
  }

  private schedule() {
    if (this.frame || !this.initialized) return;
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  private renderFrame = (now: number) => {
    if (!this.initialized) return;
    if (this.pendingSize) this.settleResize();
    if (this.animations.size > 0) {
      let drew = false;
      for (const step of this.animations) {
        this.stepSkipped = false;
        if (!step(now)) this.animations.delete(step);
        if (!this.stepSkipped) drew = true;
      }
      if (drew) this.dirty = true;
    }
    for (const [id, ghost] of this.ghosts) {
      if (now > ghost.expires) {
        ghost.g.destroy();
        this.ghosts.delete(id);
        this.dirty = true;
      }
    }
    for (const from of expiredAims(this.aims, now)) this.clearAim(from);
    if (this.dirty && this.marksScale !== this.world.scale.x) this.redrawMarks();
    if (this.dirty && this.portalsScale !== this.world.scale.x) this.drawPortals();
    if (this.dirty) {
      this.driftFog();
      this.app.render();
      this.notifyView();
    }
    this.dirty = false;
    // Cleared only now, so changes made while drawing this frame don't queue another.
    this.frame = 0;
    if (this.animations.size > 0 || this.ghosts.size > 0 || this.aims.size > 0 || this.pendingSize) this.schedule();
  };

  /** In the frame that draws it, so DOM layered over the canvas moves with the picture. */
  private notifyView() {
    const view = this.transform;
    const last = this.lastView;
    if (last && last.scale === view.scale && last.x === view.x && last.y === view.y) return;
    this.lastView = view;
    for (const fn of this.viewListeners) fn(view);
  }

  /**
   * Follow the board's world transform: called now with the current one, then once per drawn
   * frame in which it changed. Returns the unsubscribe.
   */
  onViewChange(fn: (view: BoardTransform) => void): () => void {
    this.viewListeners.add(fn);
    if (this.initialized) fn(this.transform);
    return () => this.viewListeners.delete(fn);
  }

  /** The board's world transform right now. */
  get transform(): BoardTransform {
    return { scale: this.world.scale.x, x: this.world.x, y: this.world.y };
  }

  /** A page point (clientX/Y) in board coordinates, or null when it is not over the canvas. */
  clientToBoard(clientX: number, clientY: number): Point | null {
    if (!this.initialized) return null;
    return clientToBoard({ x: clientX, y: clientY }, this.app.canvas.getBoundingClientRect(), this.transform);
  }

  /** The board point in the middle of the canvas, or null before the board is ready. */
  visibleCentre(): Point | null {
    if (!this.initialized) return null;
    if (this.focusCentre) return this.focusCentre;
    const canvas = this.app.canvas.getBoundingClientRect();
    return this.clientToBoard(canvas.left + canvas.width / 2, canvas.top + canvas.height / 2);
  }

  /** Resize the canvas once the host has held the same size for a whole frame. */
  private settleResize() {
    const size = { width: this.host.clientWidth, height: this.host.clientHeight };
    const last = this.pendingSize!;
    if (size.width !== last.width || size.height !== last.height) {
      this.pendingSize = size;
      return;
    }
    this.pendingSize = null;
    if (size.width === 0 || size.height === 0) return;
    if (size.width === this.app.screen.width && size.height === this.app.screen.height) return;
    // Emits "resize", whose handler keeps the view in place and marks the frame dirty.
    this.app.renderer.resize(size.width, size.height);
  }

  destroy() {
    if (!this.initialized) return;
    cancelAnimationFrame(this.cameraTween);
    this.cameraTween = 0;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.animations.clear();
    for (const { run, timer } of this.fxRuns) { window.clearTimeout(timer); run.destroy(); }
    this.fxRuns = [];
    this.attackFx = [];
    this.loopRegistered = false;
    this.stopMotionWatch?.();
    this.hatch?.destroy(true);
    this.hatch = null;
    // The fog art is shared by every board; only this board's own fog textures go.
    this.fogDistance?.destroy(true);
    this.fogDistance = null;
    this.fogDensity?.destroy(true);
    this.fogDensity = null;
    this.stopSettingsWatch?.();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.viewListeners.clear();
    this.hostObserver?.disconnect();
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.app.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.app.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.app.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.app.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    // Other boards and animation previews share Pixi pools. Boolean true also releases those
    // global pools, invalidating the live board when a checkpoint preview closes.
    this.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
    this.initialized = false;
  }

  /** The effective reduced-motion setting changed: conditions redraw at once, effects already playing finish as they are. */
  private motionChanged() {
    for (const view of this.tokens.values()) view.drawnKey = "";
    if (this.state && this.you) this.syncTokens();
    this.syncConditionLoop();
    this.syncFogLoop();
    this.invalidate();
  }

  update(state: RoomState, you: Participant) {
    const before = this.state;
    this.state = state;
    this.you = you;
    const table = state.reducedEffects ?? false;
    if (table !== this.tableReduced) {
      const before = this.reducedMotion;
      this.tableReduced = table;
      if (this.reducedMotion !== before) this.motionChanged();
    }
    this.syncMap();
    this.syncGrid();
    this.syncWalls();
    this.drawTerrain();
    this.syncSight();
    this.syncTokens();
    if (state.templates !== this.drawnTemplates || state.fog !== this.drawnFog) {
      for (const id of this.removing) if (!state.templates[id]) this.removing.delete(id);
      for (const id of this.removingFog) if (!state.fog[id]) this.removingFog.delete(id);
      this.removeCancelledAreas();
      this.redrawMarks();
    }
    // Tokens may have moved or gone while a target is being picked.
    if (this.tool.kind === "attack") {
      if (this.attackHover && !state.tokens[this.attackHover]) this.attackHover = null;
      this.redrawOverlay();
    }
    if (this.autoFit) this.fitToScreen();
    // A grid change moves the squares under a still pointer.
    if (this.placement) this.redrawGhost();
    this.syncConditionLoop();
    const token = this.drag ? state.tokens[this.drag.tokenId] : undefined;
    const previousToken = this.drag ? before?.tokens[this.drag.tokenId] : undefined;
    if (before?.scene !== state.scene || before?.walls !== state.walls || before?.fog !== state.fog || before?.terrain !== state.terrain || before?.terrainView !== state.terrainView || before?.sight !== state.sight || previousToken?.position !== token?.position || previousToken?.size !== token?.size) this.refreshMovementPreview();
    this.invalidate();
  }

  /** Re-query even redacted edits: the player does not hold plain walls locally. */
  refreshMovementPreview(force = true) {
    const drag = this.drag, state = this.state, you = this.you;
    if (!drag?.target || !drag.movable || !state || !you || this.readOnly) return;
    const token = state.tokens[drag.tokenId];
    if (!token) return;
    const to = drag.target.free ? drag.target.at : snapTokenCenter(drag.target.at, token.size, state.scene.grid);
    const local = movementPreview(state, you, token, drag.origin, to, drag.target.free, this.repositionToken === token.id);
    this.localMovementPreview = local;
    const previous = this.movementRequest;
    if (!force && you.role === "player" && local.obstruction === "clear" && previous && previous.tokenId === token.id && previous.to.x === to.x && previous.to.y === to.y && previous.boardEpoch === drag.epoch) {
      this.drawMovementLine(drag.origin, to, this.movementFeedbackStatus ?? "unknown");
      this.showLabel(local.label, to);
      this.invalidate();
      return;
    }
    this.movementRequest = null;
    this.movementFeedbackStatus = null;
    // Until the server has checked walls, an otherwise clear player route stays tentative.
    this.drawMovementLine(drag.origin, to, you.role === "player" && local.obstruction === "clear" ? "unknown" : local.obstruction);
    this.showLabel(local.label, to);
    if (you.role === "player" && local.obstruction === "clear") {
      const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: `move${++this.movementPreviewId}`, tokenId: token.id, from: drag.origin, to, boardEpoch: drag.epoch };
      this.movementRequest = request;
      this.callbacks.requestMovementPreview?.(request);
    }
    this.invalidate();
  }

  showMovementFeedback(feedback: MovementPreviewFeedback) {
    const request = this.movementRequest;
    if (!this.drag || !request || feedback.requestId !== request.requestId || !this.localMovementPreview || this.readOnly) return;
    this.movementFeedbackStatus = feedback.status;
    this.drawMovementLine(request.from, request.to, feedback.status);
    this.invalidate();
  }

  cancelMovement() {
    if (!this.drag) return false;
    const token = this.state?.tokens[this.drag.tokenId];
    if (token) { const view = this.tokens.get(token.id); view?.container.position.set(token.position.x, token.position.y); if (view) view.container.cursor = "grab"; }
    this.callbacks.dragEnd(this.drag.tokenId, token?.position ?? null);
    this.drag = null; this.dragDownAt = null;
    this.overlayGraphics.clear(); this.measureLabel.visible = false; this.invalidate();
    return true;
  }
  setShowTerrain(show: boolean) { this.showTerrain = show; this.drawTerrain(); this.invalidate(); }
  setRepositionToken(id: string | null) { if (this.repositionToken !== id) { this.repositionToken = id; this.refreshMovementPreview(); } }
  private drawTerrain() {
    const state = this.state;
    if (!state) return;
    const content = this.you?.role === "gm" ? state.terrain : state.terrainView;
    if (this.drawnTerrain === content && this.drawnTerrainGrid === state.scene.grid && this.drawnTerrainShown === this.showTerrain) return;
    this.drawnTerrain = content; this.drawnTerrainGrid = state.scene.grid; this.drawnTerrainShown = this.showTerrain;
    const g = this.terrainGraphics.clear();
    const terrain = state.terrain ?? emptyTerrain();
    const runs = this.you?.role === "gm" ? effectiveTerrain(terrain) : state.terrainView?.runs ?? [];
    const temporary = this.you?.role === "gm" ? effectiveTerrain({ base: [], effects: terrain.effects }) : state.terrainView?.temporary ?? [];
    const draw = (list: TerrainRun[], marker: boolean) => {
      for (const run of list) for (let col = run.start; col <= run.end; col++) {
        const r = cellRect(col, run.row, state.scene.grid), s = state.scene.grid.cellSize;
        const color = run.kind === "blocked" ? 0xc36d74 : 0xd5aa56;
        if (marker) g.rect(r.minX + .73 * s, r.minY + .05 * s, .2 * s, .2 * s).fill({ color, alpha: .95 }).stroke({ color: 0xffffff, alpha: .8, width: s / 50 });
        else {
          g.rect(r.minX, r.minY, s, s).fill({ color, alpha: .17 });
          if (run.kind === "blocked") {
            for (let i = 0; i < 4; i++) { const step = i * s / 4; g.moveTo(r.minX + step, r.minY).lineTo(r.maxX, r.maxY - step); g.moveTo(r.minX, r.minY + step).lineTo(r.maxX - step, r.maxY); }
            g.stroke({ color, alpha: .45, width: s / 70 });
            g.circle(r.minX + s / 2, r.minY + s / 2, s * .13).moveTo(r.minX + s * .41, r.minY + s * .59).lineTo(r.minX + s * .59, r.minY + s * .41).stroke({ color, alpha: .9, width: s / 40 });
          } else {
            g.moveTo(r.minX + s * .38, r.minY + s * .4).lineTo(r.minX + s * .48, r.minY + s * .6).moveTo(r.minX + s * .48, r.minY + s * .4).lineTo(r.minX + s * .38, r.minY + s * .6).stroke({ color, width: s / 30 });
            g.moveTo(r.minX + s * .54, r.minY + s * .4).lineTo(r.minX + s * .64, r.minY + s * .4).lineTo(r.minX + s * .64, r.minY + s * .5).lineTo(r.minX + s * .54, r.minY + s * .5).lineTo(r.minX + s * .54, r.minY + s * .6).lineTo(r.minX + s * .64, r.minY + s * .6).stroke({ color, width: s / 30 });
          }
        }
      }
    };
    if (this.showTerrain) draw(runs, false);
    draw(temporary, true);
  }

  /** Darkens everything outside the viewer's sight polygons; draws nothing when `sight` is absent. */
  private syncSight() {
    const state = this.state;
    if (!state) return;
    const { width, height } = this.boardSize();
    const cell = state.scene.grid.cellSize;
    const key = `${width}x${height}@${cell}:${this.fogBase?.join(",") ?? ""}`;
    if (state.sight === this.drawnSight && key === this.drawnSightKey) return;
    this.drawnSight = state.sight;
    this.drawnSightKey = key;
    let next: Sprite | null = null;
    if (state.sight) {
      const { canvas, scale } = makeSightMaskCanvas(state.sight, width, height, cell, sightColor(this.fogBase));
      next = new Sprite(Texture.from(canvas));
      next.eventMode = "none";
      next.scale.set(1 / scale);
      next.alpha = sightMaskAlpha(state.sight);
    }
    this.finishSightFade();
    const prev = this.sightSprite;
    this.sightSprite = next;
    // New mask below, so the old one on top can fade away over it.
    if (next) this.sightLayer.addChildAt(next, 0);
    if (!prev) return;
    if (this.reducedMotion) return this.destroySightSprite(prev);
    this.sightFading = prev;
    let start = -1;
    // From wherever the old mask was: a dimmed one (no token to see through) starts below 1.
    const from = prev.alpha;
    this.sightFadeStep = (now) => {
      if (start < 0) start = now;
      const t = Math.min(1, (now - start) / SIGHT_FADE_MS);
      prev.alpha = from * 2 ** (-10 * t); // 1 - ease-out(t)
      if (t < 1) return true;
      this.finishSightFade();
      return false;
    };
    this.animations.add(this.sightFadeStep);
  }

  /** Ends any crossfade in flight, dropping the old mask. */
  private finishSightFade() {
    if (this.sightFadeStep) this.animations.delete(this.sightFadeStep);
    this.sightFadeStep = null;
    if (this.sightFading) this.destroySightSprite(this.sightFading);
    this.sightFading = null;
  }

  private destroySightSprite(sprite: Sprite) {
    const texture = sprite.texture;
    sprite.destroy();
    texture.destroy(true);
  }

  /**
   * Draws the room's walls and portals over the map, under tokens (ADR 0029, ADR 0030). Only the
   * GM's state holds plain walls; any viewer's may hold portals. An open portal shows as its two
   * ends with a gap between, a locked one with a lock mark in the middle. The line scales with
   * the grid so it reads at every zoom. Board coordinates (invariant 8).
   */
  private syncWalls() {
    const state = this.state;
    if (!state || state.walls === this.drawnWalls) return;
    this.drawnWalls = state.walls;
    const g = this.wallGraphics.clear();
    const plain = Object.values(state.walls).filter((w) => !w.portal);
    if (plain.length > 0) {
      const width = Math.max(2, state.scene.grid.cellSize * 0.05);
      for (const wall of plain) {
        const { a, b } = wall;
        if (wall.uvttPortal?.closed === false) {
          const along = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          const start = along(0.2), end = along(0.8);
          g.moveTo(a.x, a.y).lineTo(start.x, start.y).moveTo(end.x, end.y).lineTo(b.x, b.y);
        } else g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ width: width + 3, color: 0x14110e, alpha: 0.55, cap: "round", join: "round" });
      for (const wall of plain) {
        const { a, b } = wall;
        if (wall.uvttPortal?.closed === false) {
          const along = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          const start = along(0.2), end = along(0.8);
          g.moveTo(a.x, a.y).lineTo(start.x, start.y).moveTo(end.x, end.y).lineTo(b.x, b.y);
        } else g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ width, color: 0xf0a24a, alpha: 0.95, cap: "round", join: "round" });
    }
    this.drawPortals();
  }

  /**
   * Doors and windows are what players act on, so they are drawn about a fifth of a cell thick
   * and never thinner than PORTAL_MIN_PX on screen, at any zoom (ADR 0030).
   */
  private drawPortals() {
    const state = this.state;
    this.portalsScale = this.world.scale.x;
    const g = this.portalGraphics.clear();
    if (!state) return;
    const px = 1 / this.world.scale.x;
    const width = Math.max(state.scene.grid.cellSize * 0.2, PORTAL_MIN_PX * px);
    for (const wall of Object.values(state.walls)) {
      if (!wall.portal) continue;
      const color = wall.portal.kind === "door" ? DOOR_COLOR : WINDOW_COLOR;
      const { a, b } = wall;
      const along = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const pieces: [Point, Point][] = wall.portal.state === "open" ? [[a, along(0.2)], [along(0.8), b]] : [[a, b]];
      for (const [p, q] of pieces) g.moveTo(p.x, p.y).lineTo(q.x, q.y);
      g.stroke({ width: width + 3 * px, color: 0x111111, alpha: 0.85, cap: "butt" });
      for (const [p, q] of pieces) g.moveTo(p.x, p.y).lineTo(q.x, q.y);
      g.stroke({ width, color, alpha: 1, cap: "butt" });
      if (wall.portal.state === "locked") {
        const mid = along(0.5);
        g.circle(mid.x, mid.y, width * 0.8).fill({ color: LOCK_COLOR }).stroke({ width: 2 * px, color: 0x111111 });
      }
    }
  }

  /** The door or window under a screen point, while the Select tool is free to use one (ADR 0030). */
  private portalUnder(global: Point): RoomState["walls"][string] | null {
    if (!this.state || this.readOnly || this.placement || this.tool.kind !== "select") return null;
    return portalAt(this.state.walls, this.toBoard(global), PORTAL_REACH_PX / this.world.scale.x);
  }

  /** Previewing as a player (gm-view-as-player): tokens take no pointer input, so nothing can be dragged or aimed. */
  setReadOnly(readOnly: boolean) {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    for (const view of this.tokens.values()) view.drawnKey = "";
    if (this.initialized && this.state && this.you) this.syncTokens();
    this.invalidate();
  }

  /** GM only: whether the GM's own board draws the walls. Doors and windows stay, as players see them. */
  setShowWalls(show: boolean) {
    if (this.wallGraphics.visible === show) return;
    this.wallGraphics.visible = show;
    if (this.initialized) this.invalidate();
  }

  /** GM only: whether the GM's own board draws doors and windows. */
  setShowPortals(show: boolean) {
    if (this.portalGraphics.visible === show) return;
    this.portalGraphics.visible = show;
    if (this.initialized) this.invalidate();
  }

  /** GM only: how the GM's own board shows fog (see `GmFogView`). */
  setGmFogView(view: GmFogView) {
    if (this.gmFogView === view) return;
    this.gmFogView = view;
    if (this.initialized) this.invalidateFog();
  }

  private invalidateFog() {
    this.drawnFog = null;
    this.redrawFog();
    this.invalidate();
  }

  /** Only this viewer sees the calibration overlay. Token movement keeps the committed grid. */
  setGridPreview(grid: GridSpec | null) {
    this.gridPreview = grid;
    if (this.initialized && this.state) this.syncGrid();
  }

  showPing(at: Point, color = 0xf1c40f) {
    const ring = new Graphics();
    ring.position.set(at.x, at.y);
    this.fxLayer.addChild(ring);
    const started = performance.now();
    this.animations.add((now) => {
      // rAF timestamps can trail performance.now() slightly on the first frame.
      const pulse = pingPulse((now - started) / PING_MS, this.reducedMotion);
      if (!pulse || ring.destroyed) {
        if (!ring.destroyed) ring.destroy();
        return false;
      }
      const cell = this.state?.scene.grid.cellSize ?? 70;
      ring
        .clear()
        .circle(0, 0, cell * pulse.radiusCells)
        .stroke({ width: 4 / this.world.scale.x, color, alpha: pulse.alpha });
      return true;
    });
    this.invalidate();
  }

  /**
   * Another participant's area being aimed (KAN-35): a translucent outline with their name at the
   * origin, replaced on each update and gone a second after the last one. Null clears it.
   */
  /** One striped tile, white so each area's colour tints it; made once, on first use. */
  private hatch: Texture | null = null;
  private hatchTexture(): Texture {
    if (this.hatch) return this.hatch;
    const size = HATCH_TILE_PX;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Three diagonals, so the stripes run on unbroken across tile edges.
    for (const k of [-size, 0, size]) {
      ctx.moveTo(k, size);
      ctx.lineTo(k + size, 0);
    }
    ctx.stroke();
    const texture = Texture.from(canvas);
    texture.source.style.addressMode = "repeat";
    this.hatch = texture;
    return texture;
  }

  /**
   * An area's fill (ADR 0040): translucent in its colour, or hatched in its colour when GM-only.
   * A plain texture fill, not a FillPattern: Pixi forces a pattern's colour to white, which would
   * lose the tint. Repeating in global texture space is what a FillPattern does anyway.
   */
  private fillArea(g: Graphics, color: number, gmOnly: boolean, alpha: number, grid: GridSpec) {
    if (!gmOnly) {
      g.fill({ color, alpha });
      return;
    }
    // A tile's stripes are its width / sqrt(2) apart; scale so that is a quarter of a cell.
    const scale = (grid.cellSize * HATCH_SPACING_CELLS * Math.SQRT2) / HATCH_TILE_PX;
    g.fill({ texture: this.hatchTexture(), matrix: new Matrix().scale(scale, scale), textureSpace: "global", color, alpha: Math.min(1, alpha * 2.5) });
  }

  showAimPreview(from: string, preview: AimPreview | null, label: string) {
    if (!preview || !this.state) return this.clearAim(from);
    let aim = this.aims.get(from);
    if (!aim) {
      const view = new Container();
      view.addChild(new Graphics());
      view.addChild(new Text({ text: "", style: { fill: 0xffffff, fontSize: 13, fontFamily: boardMonoFamily(), fontWeight: "600", stroke: { color: 0x000000, width: 4 } } }));
      this.fxLayer.addChild(view);
      aim = { view, expires: 0 };
      this.aims.set(from, aim);
    }
    const [g, text] = aim.view.children as [Graphics, Text];
    const grid = this.state.scene.grid;
    const px = 1 / this.world.scale.x;
    const shape = areaShape(preview.shape, preview.origin, preview.toward, preview.size, grid, preview.width);
    g.clear();
    if (shape.kind === "circle") g.circle(shape.center.x, shape.center.y, shape.radius);
    else g.poly(shape.points.flatMap((p) => [p.x, p.y]));
    const color = areaColorValue(preview.color);
    this.fillArea(g, color, preview.gmOnly, 0.1, grid);
    g.stroke({ width: 2 * px, color, alpha: 0.6 });
    text.text = `${label} aiming`;
    text.scale.set(px);
    text.position.set(preview.origin.x + 6 * px, preview.origin.y + 6 * px);
    aim.expires = aimExpiry(performance.now());
    this.invalidate();
  }

  private clearAim(from: string) {
    const aim = this.aims.get(from);
    if (!aim) return;
    aim.view.destroy({ children: true });
    this.aims.delete(from);
    this.dirty = true;
    this.invalidate();
  }

  showDragPreview(tokenId: string, at: Point) {
    const token = this.state?.tokens[tokenId];
    if (!token || !this.state) return;
    let ghost = this.ghosts.get(tokenId);
    if (!ghost) {
      const g = new Graphics();
      this.fxLayer.addChild(g);
      ghost = { g, expires: 0 };
      this.ghosts.set(tokenId, ghost);
    }
    const r = (token.size * this.state.scene.grid.cellSize) / 2 - 2;
    ghost.g.clear().circle(0, 0, r).stroke({ width: 3, color: token.color, alpha: 0.8 });
    ghost.g.position.set(at.x, at.y);
    ghost.expires = performance.now() + 600;
    this.invalidate();
  }

  /**
   * Centre the view on one token and highlight it (FR-GM-24).
   *
   * This is the roster's counterpart to clicking the canvas: keyboard users and anyone
   * hunting for a token in a crowded map get there without a precise mouse gesture.
   */
  focusToken(tokenId: string) {
    const token = this.state?.tokens[tokenId];
    if (!token) return;
    this.focusedId = tokenId;
    this.autoFit = false;
    const screen = this.app.screen;
    const scale = this.world.scale.x;
    this.world.position.set(
      screen.width / 2 - token.position.x * scale,
      screen.height / 2 - token.position.y * scale,
    );
    // Force a redraw so the focus ring appears on the newly focused token and clears
    // from the previous one.
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
    this.invalidate();
  }

  /** Ring the tokens the GM's Token view is showing the sight of. */
  setViewedTokens(ids: readonly string[]) {
    if (ids.length === this.viewedIds.size && ids.every((id) => this.viewedIds.has(id))) return;
    this.viewedIds = new Set(ids);
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
    this.invalidate();
  }

  clearFocus() {
    if (!this.focusedId) return;
    this.focusedId = null;
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
    this.invalidate();
  }

  /** Mark the tokens in the GM's group selection (ADR 0046). */
  setGroupSelection(tokenIds: readonly string[]) {
    const next = new Set(tokenIds);
    if (next.size === this.groupSelection.size && [...next].every((id) => this.groupSelection.has(id))) return;
    this.groupSelection = next;
    if (!this.state) return;
    this.syncTokens();
    this.invalidate();
  }

  // ---------- tools (KAN-69) ----------

  /** Switch the active tool. Changing tool drops the last measurement and any drag in progress. */
  setTool(tool: BoardTool) {
    if (tool.kind !== this.tool.kind || (tool.kind === "fog" && this.tool.kind === "fog" && tool.mode !== this.tool.mode)) {
      if (this.gesture && this.tool.kind === "area") this.callbacks.aimEnd(this.tool.gmOnly);
      this.measurement = null;
      this.gesture = null;
      this.fogPoints = [];
      this.fogHover = null;
    }
    this.attackHover = null;
    this.tool = tool;
    if (this.initialized) this.app.stage.cursor = this.toolCursor();
    if (this.state) this.syncTokens();
    this.redrawOverlay();
  }

  setMovementRuler(settings: MovementSettings, origin: Point | null, tokenSize = 1) {
    this.movementSettings = settings;
    this.movementOrigin = origin;
    this.movementTokenSize = tokenSize;
    this.redrawOverlay();
  }

  private toolCursor() {
    if (this.placement) return "crosshair";
    if (this.tool.kind === "select") return "default";
    return TOOL_CURSORS[this.tool.kind];
  }

  // ---------- placing a new token (place-token-on-board) ----------

  /**
   * Start or stop placing a new token. While placing, a ghost of it follows the pointer,
   * snapped to the square(s) it would cover; a click there calls `placeToken`, a drag still
   * pans, and the rail's tools wait until it is done.
   */
  setPlacement(placement: PlacementGhost | null) {
    this.placement = placement;
    this.placeDown = null;
    if (placement) {
      this.gesture = null;
      this.redrawOverlay();
    } else {
      this.ghost?.container.destroy({ children: true });
      this.ghost = null;
    }
    if (this.initialized) this.app.stage.cursor = this.toolCursor();
    if (this.state) this.syncTokens();
    this.redrawGhost();
  }

  /**
   * Keyboard placement (token-placement-flow): put the ghost on `at`, snapped as a click there
   * would be. The pointer moves it again on its next move; whichever moved last wins.
   */
  setPlacementCursor(at: Point) {
    if (!this.placement) return;
    this.hover = { at, free: false };
    this.redrawGhost();
  }

  private redrawGhost() {
    if (!this.initialized) return;
    const { placement, hover, state, you } = this;
    const g = this.ghostFootprint.clear();
    if (!placement || !hover || !state || !you) {
      if (this.ghost) this.ghost.container.visible = false;
      return this.invalidate();
    }
    const grid = state.scene.grid;
    const at = placementPoint(hover.at, placement.size, grid, hover.free);
    // Alt places freely, so there is no square to highlight.
    if (!hover.free) {
      const r = footprint(at, placement.size, grid);
      g.rect(r.x, r.y, r.width, r.height)
        .fill({ color: 0xffffff, alpha: 0.18 })
        .stroke({ width: 2 / this.world.scale.x, color: 0xffffff, alpha: 0.9 });
    }
    if (!this.ghost) {
      this.ghost = this.createTokenView(GHOST_ID);
      this.fxLayer.addChild(this.ghost.container);
    }
    const token: Token = {
      id: GHOST_ID,
      name: placement.name,
      position: at,
      size: placement.size,
      rotation: placement.rotation,
      color: placement.color,
      imageUrl: placement.imageUrl,
      assetId: null,
      ownerIds: [],
      hidden: placement.hidden,
      stats: placement.stats,
      conditions: [],
    };
    this.drawToken(this.ghost, token, grid, you);
    const view = this.ghost.container;
    // Never a target: a click goes through it to the stage, which places the token.
    view.eventMode = "none";
    view.alpha = placement.hidden ? 0.35 : 0.75;
    view.position.set(at.x, at.y);
    view.visible = true;
    this.invalidate();
  }

  /** Remove every mark this viewer has made, including their shared templates. The tool stays as it is. */
  clearMarks() {
    this.marks = [];
    this.measurement = null;
    this.gesture = null;
    const you = this.you;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (you && t.ownerId === you.id) this.requestRemove(t);
    }
    // Areas still on their way to the server are cleared too, once they arrive.
    this.cancelledAreas.push(...this.pendingAreas);
    this.pendingAreas = [];
    this.redrawMarks();
  }

  private requestRemove(t: AreaTemplate) {
    if (this.removing.has(t.id)) return;
    this.removing.add(t.id);
    // Hidden from now on; shown again if the server refuses, so it never lingers invisibly.
    const restore = () => {
      this.removing.delete(t.id);
      this.redrawMarks();
    };
    this.callbacks.removeTemplate(t.id).then((ok) => {
      if (!ok) restore();
    }, restore);
  }

  /** Remove the templates of placements Clear all cancelled, as they appear in state. */
  private removeCancelledAreas() {
    const you = this.you;
    if (!you || this.cancelledAreas.length === 0) return;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (t.ownerId !== you.id || this.removing.has(t.id)) continue;
      const i = this.cancelledAreas.findIndex(
        (a) =>
          a.shape === t.shape && a.size === t.size && a.gmOnly === t.gmOnly &&
          a.origin.x === t.origin.x && a.origin.y === t.origin.y &&
          a.toward.x === t.toward.x && a.toward.y === t.toward.y,
      );
      if (i === -1) continue;
      this.cancelledAreas.splice(i, 1);
      this.requestRemove(t);
    }
  }

  private finishGesture() {
    const gesture = this.gesture!;
    this.gesture = null;
    const tool = this.tool;
    const { from, to, free, dragged } = gesture;
    if (tool.kind === "measure" && dragged) {
      this.measurement = { kind: "measure", from, to, free, tokenSize: gesture.tokenSize };
    } else if (tool.kind === "draw" && tool.shape === "brush" && dragged) {
      this.addMark({ kind: "stroke", color: tool.color, points: gesture.path });
    } else if (tool.kind === "draw" && tool.shape !== "brush" && dragged) {
      this.addMark({ kind: "draw", shape: tool.shape, color: tool.color, from, to });
    } else if (tool.kind === "area") {
      this.callbacks.aimEnd(tool.gmOnly);
      const area = this.areaFromGesture(gesture, tool);
      if (area?.kind === "area" && this.state) this.placeArea(area, tool.gmOnly);
    } else if (tool.kind === "fog" && tool.mode === "rect" && dragged) {
      this.sendFog({ shape: "rect", from, to });
    }
    this.redrawMarks();
  }

  // ---------- fog of war (FR-GM-17, ADR 0016) ----------

  /** Send a fog region; draw it until the server's answer arrives. */
  private sendFog(region: FogDraft) {
    this.pendingFog.push(region);
    const done = () => {
      this.pendingFog = this.pendingFog.filter((r) => r !== region);
      this.redrawMarks();
    };
    this.callbacks.addFog(region).then(done, done);
  }

  /** Close the polygon being clicked out and send it. False when it has too few corners. */
  closeFogPolygon(): boolean {
    if (this.fogPoints.length < 3) return false;
    this.sendFog({ shape: "polygon", points: this.fogPoints });
    this.fogPoints = [];
    this.fogHover = null;
    this.redrawMarks();
    return true;
  }

  /** Drop the polygon's last corner. False when there is none. */
  undoFogPoint(): boolean {
    if (this.fogPoints.length === 0) return false;
    this.fogPoints = this.fogPoints.slice(0, -1);
    this.redrawOverlay();
    return true;
  }

  /** Abandon the polygon being clicked out. False when there is none, so Escape can leave the tool. */
  cancelFogPolygon(): boolean {
    if (this.fogPoints.length === 0) return false;
    this.fogPoints = [];
    this.fogHover = null;
    this.redrawOverlay();
    return true;
  }

  /** A Fog tool click: a polygon corner, or a region to reveal. */
  private fogClick(at: Point, screen: Point) {
    if (this.tool.kind !== "fog" || !this.state) return;
    if (this.tool.mode === "reveal") {
      const visible = Object.fromEntries(Object.entries(this.state.fog).filter(([id]) => !this.removingFog.has(id)));
      const region = fogRegionAt(visible, at);
      if (!region) return;
      this.removingFog.add(region.id);
      // Cleared on any answer: an undo can bring the same id back, and it must be drawn again.
      const settle = () => {
        this.removingFog.delete(region.id);
        this.redrawMarks();
      };
      this.callbacks.removeFog(region.id).then(settle, settle);
      this.redrawMarks();
      return;
    }
    // Clicking the first corner again closes the polygon.
    const first = this.fogPoints[0];
    if (first && this.fogPoints.length >= 3) {
      const p = this.world.toGlobal(first);
      if (Math.hypot(p.x - screen.x, p.y - screen.y) <= FOG_CLOSE_PX) {
        this.closeFogPolygon();
        return;
      }
    }
    this.fogPoints = [...this.fogPoints, at];
    this.redrawOverlay();
  }

  /**
   * Draw fog: opaque clouds for players; for a GM with fog on, a flat tint over the walls and tokens, so a
   * fogged token looks covered but stays visible; a GM with fog off sees no fog at all. Players
   * never have what is under fog in their state (ADR 0016), so for them the order changes nothing.
   */
  private redrawFog() {
    const state = this.state;
    this.drawnFog = state?.fog ?? null;
    this.layerFog(this.you?.role === "gm" && this.gmFogView !== "off");
    const edge = this.fogEdgeGraphics.clear();
    if (!state) {
      this.fogMist.visible = false;
      return;
    }
    // Viewing as a player, `you` is that player, so fog is drawn exactly as they see it.
    const gm = this.you?.role === "gm";
    const px = 1 / this.world.scale.x;
    const shown = Object.values(state.fog).filter((region) => !this.removingFog.has(region.id)).map((region) => region.points);
    const pending = this.pendingFog.map(fogDraftPoints);
    // Only players get the mist; the GM sees a flat tint, and nothing at all with fog switched off.
    const mist = !gm && shown.length + pending.length > 0;
    this.fogMist.visible = mist;
    if (mist) {
      this.syncFogMist(state, [...shown, ...pending]);
      this.driftFog();
    }
    if (gm && this.gmFogView === "tint") {
      const [er, eg, eb] = fogPalette(this.fogBase).light;
      const edgeColor = (Math.round(er) << 16) | (Math.round(eg) << 8) | Math.round(eb);
      const draw = (points: Point[], isPending: boolean) => {
        const flat = points.flatMap((p) => [p.x, p.y]);
        edge.poly(flat).fill({ color: FOG_GM_FILL, alpha: FOG_GM_FILL_ALPHA });
        edge.poly(flat).stroke({ width: px, color: edgeColor, alpha: FOG_EDGE_ALPHA * (isPending ? 0.5 : 1) });
      };
      for (const points of shown) draw(points, false);
      for (const points of pending) draw(points, true);
    }
    this.syncFogLoop();
  }

  /**
   * Builds the fog body and colours it; when fog or the grid changed, also its distance field and
   * the puffs and wisps.
   */
  private syncFogMist(state: RoomState, regions: Point[][]) {
    const { width, height } = this.boardSize();
    const cell = state.scene.grid.cellSize;
    const art = fogArt();
    if (!this.fogBody) {
      this.fogDensity ??= Texture.from(makeFogDensityCanvas());
      this.fogDensity.source.style.addressMode = "repeat";
      this.fogBody = new FogBody(art?.bank ?? this.fogDensity, Texture.EMPTY);
      this.fogMist.addChildAt(this.fogBody.mesh, 0);
    }
    const { dark, light } = fogPalette(this.fogBase);
    this.fogBody.setPalette(dark, light);
    const tint = (shade: number) => fogTint(dark, light, shade);
    for (const { puff, particle } of this.fogPuffs) particle.tint = tint(puff.shade);
    // Pending and revealing regions change the shape too, so the key is the regions themselves.
    const key = `${width}x${height}x${cell}`;
    const shape = JSON.stringify(regions);
    if (key === this.fogShapeKey && shape === this.fogShape) return;
    this.fogShapeKey = key;
    this.fogShape = shape;
    const field = fogDistanceField(regions, width, height, cell);
    const old = this.fogDistance;
    this.fogDistance = Texture.from(makeFogDistanceCanvas(field));
    this.fogBody.setDistance(this.fogDistance, field.cols, field.rows, field.scale, cell);
    old?.destroy(true);
    this.fogPuffLayer.removeParticles();
    this.fogPuffs = [];
    if (art) {
      for (const puff of layoutFogPuffs(regions, { width, height }, cell, graphicsBudget().fogPuffs)) {
        const wisp = puff.kind === "wisp";
        const particle = new Particle({
          texture: wisp ? art.wisps[puff.art]! : art.puffs[puff.art]!,
          anchorX: wisp ? WISP_ANCHOR : 0.5,
          anchorY: 0.5,
          tint: tint(puff.shade),
        });
        this.fogPuffLayer.addParticle(particle);
        this.fogPuffs.push({ puff, particle });
      }
    }
    this.poseFogPuffs();
  }

  /** Each puff and wisp where the fog's clock puts it. */
  private poseFogPuffs() {
    for (const { puff, particle } of this.fogPuffs) {
      const pose = puffPose(puff, this.fogTime);
      // A puff's size is its picture's side, a wisp's its picture's width.
      const scale = (puff.size / particle.texture.frame.width) * pose.scale;
      particle.x = pose.x;
      particle.y = pose.y;
      particle.rotation = pose.rotation;
      particle.scaleX = scale;
      particle.scaleY = scale;
      particle.alpha = pose.alpha;
    }
  }

  /**
   * Fits the fog body to the part of the board on screen, so the shader runs only for pixels that
   * show, at any zoom.
   */
  private driftFog() {
    if (!this.fogBody || !this.fogMist.visible) return;
    const { width, height } = this.boardSize();
    const k = this.world.scale.x;
    const screen = this.app.screen;
    const x0 = Math.max(0, Math.floor(-this.world.x / k) - 1);
    const y0 = Math.max(0, Math.floor(-this.world.y / k) - 1);
    const x1 = Math.min(width, Math.ceil((screen.width - this.world.x) / k) + 1);
    const y1 = Math.min(height, Math.ceil((screen.height - this.world.y) / k) + 1);
    this.fogBody.setRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    this.fogBody.setTime(this.fogTime);
  }

  /** Puts the fog over the tokens (`covering`) or back under the walls, only when that changes. */
  private layerFog(covering: boolean) {
    const kids = this.world.children;
    const covered = kids.indexOf(this.fogLayer) > kids.indexOf(this.tokenLayer);
    if (covering === covered) return;
    this.world.setChildIndex(this.fogLayer, covering ? kids.indexOf(this.tokenLayer) : kids.indexOf(this.wallGraphics));
  }

  /** Re-colours the fog to the map's average colour (null: the default blue-grey). */
  private setFogBase(base: Rgb | null) {
    if (!base && !this.fogBase) return;
    this.fogBase = base;
    if (this.initialized) {
      this.invalidateFog();
      this.syncSight();
    }
  }

  /**
   * Runs the fog only while fog exists, the page is shown, motion is allowed, and the viewer is a
   * player: the GM's flat tint has no clouds, so there is nothing to animate.
   */
  private fogLoopWanted() {
    const any = Object.keys(this.state?.fog ?? {}).length > 0 || this.pendingFog.length > 0;
    return any && this.you?.role !== "gm" && document.visibilityState === "visible" && !this.reducedMotion;
  }

  private syncFogLoop() {
    if (!this.initialized || this.fogLoopRegistered || !this.fogLoopWanted()) return;
    this.fogLoopRegistered = true;
    // So the first frame after a pause does not apply the whole pause as drift.
    this.lastFogDraw = 0;
    this.animations.add(this.fogLoop);
    this.schedule();
  }

  private fogLoop = (now: number) => {
    if (!this.fogLoopWanted()) {
      this.fogLoopRegistered = false;
      return false;
    }
    if (now - this.lastFogDraw < graphicsBudget().frameMs - 1) {
      this.stepSkipped = true;
      return true;
    }
    const dt = this.lastFogDraw === 0 ? 0 : (now - this.lastFogDraw) / 1000;
    this.lastFogDraw = now;
    this.fogTime += Math.min(dt, FOG_MAX_STEP_S);
    this.poseFogPuffs();
    this.driftFog();
    return true;
  };

  /** Send an area to the table; show it until the server's answer arrives. */
  private placeArea(area: Extract<Mark, { kind: "area" }>, gmOnly: boolean) {
    const origin = areaOrigin(area.origin, this.state!.scene.grid, area.free);
    const pending = { ...area, origin, free: true, gmOnly };
    this.pendingAreas.push(pending);
    this.callbacks
      .placeTemplate({ shape: area.shape, origin, toward: area.toward, size: area.size, width: area.width, color: area.color, gmOnly })
      .then(
        (ok) => {
          // Refused: nothing will arrive to clear, so stop waiting for it.
          if (!ok) this.cancelledAreas = this.cancelledAreas.filter((a) => a !== pending);
          else this.removeCancelledAreas();
        },
        () => {
          this.cancelledAreas = this.cancelledAreas.filter((a) => a !== pending);
        },
      )
      .finally(() => {
        this.pendingAreas = this.pendingAreas.filter((a) => a !== pending);
        this.redrawMarks();
      });
  }

  /**
   * The area a gesture describes. A drag sets its size (the pointer is on the far edge) and
   * aims it; a click places the tool's chosen size, pointing right.
   */
  private areaFromGesture(gesture: NonNullable<BoardView["gesture"]>, tool: Extract<BoardTool, { kind: "area" }>): Mark | null {
    const grid = this.state?.scene.grid;
    if (!grid) return null;
    const { from, to, free, dragged } = gesture;
    const origin = areaOrigin(from, grid, free);
    const size = dragged ? areaSizeFromDrag(origin, to, grid, free, tool.shape) : tool.size;
    // A click aims right from the snapped origin, not at the raw press point beside it.
    const toward = dragged ? to : { x: origin.x + 1, y: origin.y };
    const width = tool.shape === "line" ? tool.lineCells * grid.unitsPerCell : undefined;
    return { kind: "area", shape: tool.shape, size, origin: from, toward, free, gmOnly: tool.gmOnly, width, color: tool.color };
  }

  /** Remove every mark the eraser touches on its way from `from` to `at`. */
  private eraseAt(at: Point, from: Point = at) {
    const grid = this.state?.scene.grid;
    if (!grid) return;
    const reach = ERASER_REACH_PX / this.world.scale.x;
    const path = sweepPoints(from, at, reach);
    const touches = (mark: Mark) => path.some((p) => hitMark(mark, p, reach, grid));
    const kept = this.marks.filter((mark) => !touches(mark));
    const measurementHit = this.measurement !== null && touches(this.measurement);
    // Shared templates: only ones this viewer may remove (their own; any, for the GM).
    const you = this.you;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (you && can.removeTemplate(you, t) && touches(templateMark(t))) this.requestRemove(t);
    }
    if (kept.length === this.marks.length && !measurementHit) return;
    this.marks = kept;
    if (measurementHit) this.measurement = null;
    this.redrawMarks();
  }

  /** The newest placed template at `at`, inside it or within reach of its edge, or null (ADR 0046). */
  private templateAt(at: Point): string | null {
    const grid = this.state?.scene.grid;
    if (!grid) return null;
    const reach = ERASER_REACH_PX / this.world.scale.x;
    const templates = Object.values(this.state?.templates ?? {});
    for (let i = templates.length - 1; i >= 0; i--) {
      const t = templates[i]!;
      const area = templateArea(t, grid);
      const inside = area.kind === "circle" ? Math.hypot(at.x - area.center.x, at.y - area.center.y) <= area.radius : pointInPolygon(at, area.points);
      if (inside || hitMark(templateMark(t), at, reach, grid)) return t.id;
    }
    return null;
  }

  private addMark(mark: Mark) {
    this.marks.push(mark);
    if (this.marks.length > MAX_MARKS) this.marks.shift();
  }

  /** Redraw committed marks and the overlay at the current zoom. */
  private redrawMarks() {
    if (!this.initialized) return;
    this.marksScale = this.world.scale.x;
    this.drawnTemplates = this.state?.templates ?? null;
    const g = this.marksGraphics.clear();
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (!this.removing.has(t.id)) this.drawMark(g, templateMark(t));
    }
    for (const area of this.pendingAreas) this.drawMark(g, area);
    for (const mark of this.marks) this.drawMark(g, mark);
    this.redrawFog();
    this.redrawOverlay();
  }

  private redrawOverlay() {
    if (!this.initialized) return;
    const g = this.overlayGraphics.clear();
    this.measureLabel.visible = false;
    const gesture = this.gesture;
    const tool = this.tool;
    if (!this.measurement && !(gesture && tool.kind === "measure")) this.callbacks.movementFeedback?.("");
    if (gesture && tool.kind === "measure") {
      this.drawMark(g, { kind: "measure", from: gesture.from, to: gesture.to, free: gesture.free, tokenSize: gesture.tokenSize });
    } else if (this.measurement) {
      this.drawMark(g, this.measurement);
    }
    if (gesture && tool.kind === "draw" && tool.shape === "brush") {
      this.drawMark(g, { kind: "stroke", color: tool.color, points: gesture.path });
    } else if (gesture && tool.kind === "draw" && tool.shape !== "brush") {
      this.drawMark(g, { kind: "draw", shape: tool.shape, color: tool.color, from: gesture.from, to: gesture.to });
    } else if (gesture && tool.kind === "area") {
      const area = this.areaFromGesture(gesture, tool);
      if (area?.kind === "area") {
        this.drawMark(g, area);
        // Show the size while dragging it out.
        if (gesture.dragged) this.showLabel(formatDistance(area.size, this.state!.scene.grid), gesture.to);
      }
    }
    if (tool.kind === "fog") this.drawFogDraft(g, tool.mode);
    if (tool.kind === "attack") this.drawAttackLine(g, tool.attackerId);
    this.invalidate();
  }

  /** The fog rectangle being dragged, or the polygon being clicked out with its next edge. */
  private drawFogDraft(g: Graphics, mode: Extract<BoardTool, { kind: "fog" }>["mode"]) {
    const px = 1 / this.world.scale.x;
    const style = { width: 2 * px, color: FOG_EDGE, alpha: 0.95 };
    const gesture = this.gesture;
    if (mode === "rect" && gesture?.dragged) {
      const points = fogDraftPoints({ shape: "rect", from: gesture.from, to: gesture.to });
      g.poly(points.flatMap((p) => [p.x, p.y])).fill({ color: FOG_EDGE, alpha: 0.3 }).stroke(style);
      return;
    }
    if (mode !== "polygon" || this.fogPoints.length === 0) return;
    const [first, ...rest] = this.fogPoints;
    g.moveTo(first!.x, first!.y);
    for (const p of rest) g.lineTo(p.x, p.y);
    if (this.fogHover) g.lineTo(this.fogHover.x, this.fogHover.y);
    g.stroke(style);
    for (const p of this.fogPoints) g.circle(p.x, p.y, 4 * px).fill({ color: FOG_EDGE });
    // The first corner is the one to click to close the shape.
    if (this.fogPoints.length >= 3) g.circle(first!.x, first!.y, FOG_CLOSE_PX * px).stroke(style);
  }

  /**
   * While picking a target: a dashed arrow from the attacker to the token under the pointer, with
   * the distance halfway along. It starts and ends just outside each token's rings (owner, focus,
   * active turn) rather than crossing the portraits, and a thin ring marks the token aimed at.
   * Only this viewer sees it; nothing is sent until the roll (attack-targeting).
   */
  private drawAttackLine(g: Graphics, attackerId: string) {
    const state = this.state;
    const attacker = state?.tokens[attackerId];
    const target = this.attackHover ? state?.tokens[this.attackHover] : undefined;
    if (!state || !attacker || !target) return;
    const grid = state.scene.grid;
    const px = 1 / this.world.scale.x;
    // A token's disc is size × cell / 2 − 2; its active-turn ring reaches 9 beyond (see drawDecor).
    const clearance = (t: Token) => (t.size * grid.cellSize) / 2 - 2 + 9 + 3 * px;

    const from = attacker.position;
    const to = target.position;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const ux = (to.x - from.x) / (length || 1);
    const uy = (to.y - from.y) / (length || 1);
    const start = { x: from.x + ux * clearance(attacker), y: from.y + uy * clearance(attacker) };
    const tip = { x: to.x - ux * clearance(target), y: to.y - uy * clearance(target) };

    // The token aimed at: one thin ring just inside where the arrow stops.
    const ringRadius = clearance(target) - 3 * px;
    g.circle(to.x, to.y, ringRadius).stroke({ width: 3.5 * px, color: AIM_EDGE, alpha: 0.45 });
    g.circle(to.x, to.y, ringRadius).stroke({ width: 1.5 * px, color: AIM_COLOR, alpha: 0.95 });

    // Snapped cell to cell, like Measure: exact for 1-cell tokens, a hint for larger ones.
    const m = measure(from, to, grid, false);
    const span = Math.hypot(tip.x - start.x, tip.y - start.y);
    // Tokens touching or overlapping: no room for an arrow, so the ring and distance say it all.
    if (span <= 0 || (tip.x - start.x) * ux + (tip.y - start.y) * uy <= 0) {
      this.showLabel(m.label, { x: to.x, y: to.y - ringRadius });
      return;
    }

    const head = Math.min(10 * px, span / 2);
    const shaftEnd = { x: tip.x - ux * head, y: tip.y - uy * head };
    const dashes = (style: { width: number; color: number; alpha: number }) => {
      const total = Math.hypot(shaftEnd.x - start.x, shaftEnd.y - start.y);
      const dash = 7 * px;
      const gap = 5 * px;
      for (let d = 0; d < total; d += dash + gap) {
        const e = Math.min(d + dash, total);
        g.moveTo(start.x + ux * d, start.y + uy * d).lineTo(start.x + ux * e, start.y + uy * e);
      }
      g.stroke({ ...style, cap: "round" });
    };
    dashes({ width: 4 * px, color: AIM_EDGE, alpha: 0.45 });
    dashes({ width: 2 * px, color: AIM_COLOR, alpha: 0.95 });

    const wing = 5 * px;
    g.poly([
      tip.x, tip.y,
      shaftEnd.x - uy * wing, shaftEnd.y + ux * wing,
      shaftEnd.x + uy * wing, shaftEnd.y - ux * wing,
    ])
      .fill({ color: AIM_COLOR, alpha: 0.95 })
      .stroke({ width: 1.5 * px, color: AIM_EDGE, alpha: 0.55, join: "round" });

    // Halfway along, above the shaft, so it names the gap rather than sitting on a portrait.
    this.showLabel(m.label, { x: (start.x + tip.x) / 2, y: (start.y + tip.y) / 2 });
  }

  /** The topmost token whose disc contains `p`, other than `exceptId`. */
  private tokenAt(p: Point, exceptId: string): string | null {
    const state = this.state;
    if (!state) return null;
    const cell = state.scene.grid.cellSize;
    // Later children of the token layer draw on top, so search from the top down.
    const views = [...this.tokens.entries()].sort(([, a], [, b]) => this.tokenLayer.getChildIndex(b.container) - this.tokenLayer.getChildIndex(a.container));
    for (const [id] of views) {
      const t = state.tokens[id];
      if (!t || id === exceptId) continue;
      if (Math.hypot(p.x - t.position.x, p.y - t.position.y) <= (t.size * cell) / 2) return id;
    }
    return null;
  }

  /** The size label beside the pointer, kept the same size on screen at any zoom. */
  private showLabel(text: string, at: Point) {
    this.measureLabel.text = text;
    this.measureLabel.scale.set(1 / this.world.scale.x);
    this.measureLabel.position.set(at.x, at.y);
    this.measureLabel.visible = true;
  }

  private drawMark(g: Graphics, mark: Mark) {
    const grid = this.state?.scene.grid;
    if (!grid) return;
    // Stroke widths in screen pixels, so marks stay readable at any zoom.
    const px = 1 / this.world.scale.x;
    switch (mark.kind) {
      case "measure": {
        const settings = this.movementSettings ?? defaultMovementSettings(grid);
        const m = measure(mark.from, mark.to, grid, mark.free, settings.rule, mark.tokenSize);
        const color = m.units > settings.allowance + 1e-9 ? 0xffa570 : MEASURE_COLOR;
        g.moveTo(m.from.x, m.from.y).lineTo(m.to.x, m.to.y).stroke({ width: 3 * px, color });
        g.circle(m.from.x, m.from.y, 4 * px).circle(m.to.x, m.to.y, 4 * px).fill({ color });
        const label = budgetLabel(m.units, settings.allowance, grid);
        this.showLabel(label, m.to);
        this.callbacks.movementFeedback?.(label);
        return;
      }
      case "draw": {
        const { from, to } = mark;
        if (mark.shape === "line") g.moveTo(from.x, from.y).lineTo(to.x, to.y);
        else if (mark.shape === "rect") g.rect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
        else g.circle(from.x, from.y, Math.hypot(to.x - from.x, to.y - from.y));
        g.stroke({ width: 3 * px, color: mark.color });
        return;
      }
      case "stroke": {
        const [first, ...rest] = mark.points;
        if (!first) return;
        g.moveTo(first.x, first.y);
        for (const p of rest) g.lineTo(p.x, p.y);
        g.stroke({ width: 3 * px, color: mark.color, cap: "round", join: "round" });
        return;
      }
      case "area": {
        const origin = areaOrigin(mark.origin, grid, mark.free);
        const shape = areaShape(mark.shape, origin, mark.toward, mark.size, grid, mark.width);
        if (shape.kind === "circle") g.circle(shape.center.x, shape.center.y, shape.radius);
        else g.poly(shape.points.flatMap((p) => [p.x, p.y]));
        // Translucent, so tokens under the area stay visible.
        const color = areaColorValue(mark.color);
        this.fillArea(g, color, !!mark.gmOnly, 0.2, grid);
        g.stroke({ width: 2 * px, color, alpha: 0.9 });
        g.circle(origin.x, origin.y, 3 * px).fill({ color });
        return;
      }
    }
  }

  /** Fit the whole board in view and resume auto-fitting. */
  resetView() {
    this.autoFit = true;
    this.fitToScreen();
    this.invalidate();
  }

  private fitToScreen() {
    const { width, height } = this.boardSize();
    const screen = this.app.screen;
    if (screen.width === 0 || screen.height === 0) return;
    const scale = Math.min(screen.width / width, screen.height / height) * 0.95;
    this.world.scale.set(scale);
    this.syncTextSharpness();
    this.world.position.set((screen.width - width * scale) / 2, (screen.height - height * scale) / 2);
  }

  /**
   * Token names live in board space, so zooming scales them. Keep them readable (never under
   * MIN_LABEL_SCREEN_PX on screen) and rasterised at the pixels they are shown at, so they stay sharp.
   */
  private sharpenLabel(label: Text) {
    const zoom = this.world.scale.x;
    const fontSize = Number(label.style.fontSize) || 14;
    const boost = Math.max(1, MIN_LABEL_SCREEN_PX / (fontSize * zoom));
    const resolution = Math.min(4, Math.max(1, Math.ceil(this.app.renderer.resolution * Math.max(1, zoom * boost) * 2) / 2));
    if (label.scale.x !== boost) label.scale.set(boost);
    if (label.resolution !== resolution) label.resolution = resolution;
  }

  private syncTextSharpness() {
    for (const view of this.tokens.values()) this.sharpenLabel(view.label);
  }

  // ---------- sync from state ----------

  private boardSize() {
    const map = this.state?.scene.map;
    return map ? { width: map.width, height: map.height } : DEFAULT_BOARD_SIZE;
  }

  private syncMap() {
    const url = this.state?.scene.map?.url ?? null;
    if (url === this.mapUrl) return;
    this.mapUrl = url;
    this.autoFit = true;
    this.mapMissing = false;
    this.mapSprite.texture = Texture.EMPTY;
    this.setFogBase(null);
    if (!url) return;
    const markMissing = () => {
      if (this.mapUrl !== url || !this.initialized) return;
      // Board coordinates come from the stored width/height, not the image, so every
      // token stays where it was on the generic surface (invariant 8).
      this.mapMissing = true;
      this.gridKey = "";
      if (this.state) this.syncGrid();
      this.invalidate();
    };
    if (failedImageUrls.has(url)) return markMissing();
    Assets.load<Texture>(url).then(
      (texture) => {
        if (this.mapUrl !== url || !this.initialized) return;
        this.mapSprite.texture = texture;
        this.setFogBase(averageColor(texture.source.resource as CanvasImageSource));
        this.invalidate();
      },
      () => {
        failedImageUrls.add(url);
        markMissing();
      },
    );
  }

  private syncGrid() {
    const g = this.gridPreview ?? this.state!.scene.grid;
    const { width, height } = this.boardSize();
    const key = JSON.stringify([
      g.cellSize, g.offsetX, g.offsetY, g.lineColor, g.lineWidth, g.lineOpacity,
      width, height, this.state!.scene.map?.url ?? null, this.mapMissing, !!this.gridPreview,
    ]);
    if (key === this.gridKey) return;
    this.gridKey = key;
    // Measurements and areas are sized and snapped by the grid.
    this.marksScale = Number.NaN;

    this.grid.clear();
    if (!this.state!.scene.map || this.mapMissing) this.grid.rect(0, 0, width, height).fill({ color: EMPTY_MAP_FILL });
    // Legacy or external grids still need a safety guard even though the editor rejects them.
    if (!canRenderGrid(g.cellSize, { width, height })) {
      this.invalidate();
      return;
    }
    const { xs, ys } = gridLines(g, { x: 0, y: 0, width, height });
    for (const x of xs) this.grid.moveTo(x, 0).lineTo(x, height);
    for (const y of ys) this.grid.moveTo(0, y).lineTo(width, y);
    // The GM's preview stays identifiable while the modal shows the precise line style.
    const style = gridLineStyle(g);
    this.grid.stroke(this.gridPreview
      ? { width: Math.max(style.width, 1.5), color: 0x5b8def, alpha: 0.8 }
      : { width: style.width, color: Number(`0x${style.color.slice(1)}`), alpha: style.opacity });
    this.invalidate();
  }

  private syncTokens() {
    const state = this.state!;
    const you = this.you!;
    const grid = state.scene.grid;

    for (const [id, view] of this.tokens) {
      if (!state.tokens[id]) {
        // A filter is not a child: free the Unconscious greyscale's GPU resources by hand.
        view.grey?.destroy();
        view.container.destroy({ children: true });
        this.tokens.delete(id);
        this.pendingMoves.delete(id);
      }
    }

    for (const token of Object.values(state.tokens)) {
      let view = this.tokens.get(token.id);
      if (!view) {
        view = this.createTokenView(token.id);
        this.tokens.set(token.id, view);
      }
      this.drawToken(view, token, grid, you);

      const pending = this.pendingMoves.get(token.id);
      if (pending && pending.x === token.position.x && pending.y === token.position.y) {
        this.pendingMoves.delete(token.id);
      }
      if (this.drag?.tokenId !== token.id && !this.pendingMoves.has(token.id)) {
        view.container.position.set(token.position.x, token.position.y);
      }
    }
  }

  private createTokenView(tokenId: string): TokenView {
    const container = new Container();
    const body = new Graphics();
    const decor = new Graphics();
    const markers = new Container();
    const label = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 14, fontFamily: boardFontFamily(), stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5, 0);
    const image = new Sprite(Texture.EMPTY);
    image.anchor.set(0.5);
    image.visible = false;
    const imageMask = new Graphics();
    image.mask = imageMask;
    // Disc first so it shows through while the image loads, or instead of one that failed.
    const art = new Container();
    art.addChild(body, image, imageMask);
    container.addChild(art, decor, markers, label);
    container.on("pointerdown", (e: FederatedPointerEvent) => this.onTokenDown(e, tokenId));
    this.tokenLayer.addChild(container);
    return {
      container, art, body, image, imageMask, imageUrl: null, radius: 0, decor, markers, label, drawnKey: "",
      conditions: [], looping: false, shake: { x: 0, y: 0 }, shakeOwner: null, tremble: { x: 0, y: 0 }, grey: null,
    };
  }

  private drawToken(view: TokenView, token: Token, grid: GridSpec, you: Participant) {
    const owned = token.ownerIds.includes(you.id);
    const movable = !this.readOnly && can.moveToken(you, token);
    const focused = this.focusedId === token.id;
    const active = this.activeTokenId() === token.id;
    const grouped = this.groupSelection.has(token.id);
    const viewed = this.viewedIds.has(token.id);
    const key = JSON.stringify([
      token.name, token.size, token.rotation, token.color, token.hidden, owned, movable, grid.cellSize,
      token.stats, token.conditions, focused, active, viewed, token.imageUrl, grouped,
    ]);
    // Every visible token takes presses so a click can select it; only movable ones start a drag.
    view.container.eventMode = "static";
    view.container.cursor = this.placement || this.tool.kind !== "select" ? this.toolCursor() : movable ? "grab" : "pointer";
    if (key === view.drawnKey) return;
    view.drawnKey = key;

    const r = (token.size * grid.cellSize) / 2 - 2;
    view.radius = r;
    view.body.clear().circle(0, 0, r).fill({ color: token.color });
    view.imageMask.clear().circle(0, 0, r).fill({ color: 0xffffff });
    this.syncTokenImage(view, token.imageUrl);
    view.image.rotation = token.rotation * Math.PI / 180;
    view.container.alpha = token.hidden ? 0.45 : 1;
    view.label.text = token.hidden ? `${token.name} (hidden)` : token.name;
    const fontSize = tokenLabelFontSize(r);
    view.label.style.fontSize = fontSize;
    view.label.style.stroke = { color: 0x000000, width: tokenLabelStroke(fontSize) };
    view.label.position.set(0, r + 2);
    this.sharpenLabel(view.label);

    this.drawDecor(view, token, r, focused, active, owned, viewed, grouped);
    this.drawConditions(view, token.conditions, r);
    this.drawConditionLook(view, token.conditions);
  }

  /**
   * The fixed effect of each condition (KAN-76): a look for the art wrapper (fade, tilt, grey) and
   * decoration in the effects layer. Looping ones are redrawn by `conditionLoop`; with reduced
   * motion, or while the loop is not running, they show their still pose.
   */
  private drawConditionLook(view: TokenView, conditions: ConditionId[]) {
    view.conditions = conditions;
    view.looping = !this.reducedMotion && loopingConditions(conditions).length > 0;
    const style = artStyleFor(conditions, this.reducedMotion);
    const { art } = view;
    art.alpha = style.alpha;
    art.rotation = (style.tilt * Math.PI) / 180;
    art.scale.set(1, style.squash);
    if (style.greyscale) {
      view.grey ??= new ColorMatrixFilter();
      view.grey.greyscale(0.6, false);
      art.filters = [view.grey];
    } else {
      art.filters = null;
    }
    if (!view.looping) this.applyArtOffset(view, 0, 0);
  }

  /** Trembling and a hit's shake move the art inside the token; `container.position` is never touched. */
  private applyArtOffset(view: TokenView, trembleX: number, trembleY: number) {
    view.tremble.x = trembleX;
    view.tremble.y = trembleY;
    view.art.position.set(view.shake.x + trembleX, view.shake.y + trembleY);
  }

  private loopWanted() {
    let loopingTokens = 0;
    for (const view of this.tokens.values()) if (view.looping && view.container.visible) loopingTokens++;
    return conditionLoopWanted({ loopingTokens, pageVisible: document.visibilityState === "visible", reducedMotion: this.reducedMotion });
  }

  /** A page that becomes visible again restarts any loop that stopped while it was hidden. */
  private onVisibilityChange = () => {
    // Browsers pause animation frames in a hidden tab, so the drift clock must not count the pause.
    if (document.visibilityState === "hidden") {
      this.lastFogDraw = 0;
      for (const entry of [...this.fxRuns]) this.endFx(entry);
    }
    this.syncConditionLoop();
    this.syncFogLoop();
  };

  /** Runs the condition loop only while a visible token has a moving effect, the page is shown and motion is allowed. */
  private syncConditionLoop = () => {
    if (!this.initialized || this.loopRegistered || !this.loopWanted()) return;
    this.loopRegistered = true;
    this.animations.add(this.conditionLoop);
    this.schedule();
  };

  /** One step of `animations` for every looping condition: redraws at most 30 times a second, then unregisters itself. */
  private conditionLoop = (now: number) => {
    if (!this.loopWanted()) {
      this.loopRegistered = false;
      for (const view of this.tokens.values()) if (view.tremble.x !== 0 || view.tremble.y !== 0) this.applyArtOffset(view, 0, 0);
      return false;
    }
    if (!loopFrameDue(now, this.lastLoopDraw)) {
      this.stepSkipped = true;
      return true;
    }
    this.lastLoopDraw = now;
    const t = now / 1000;
    for (const view of this.tokens.values()) {
      if (!view.looping) continue;
      const amp = artStyleFor(view.conditions, false).tremble * view.radius;
      this.applyArtOffset(view, Math.sin(t * 61) * amp, Math.cos(t * 53) * amp);
    }
    return true;
  };

  /**
   * The board's part of an attack effect (KAN-76): strikes and nukes are drawn in Pixi by fx.ts
   * (ADR 0038), and a hit shakes the target's art. Miss and damage numbers are drawn by the React
   * effects overlay (board-effects-overlay). Nothing here changes a token's recorded position.
   */
  playAttackEffect(effect: AttackEffect) {
    if (!this.initialized || !this.state) return;
    if (effect.kind === "strike") return this.playStrikeFx(effect);
    if (effect.kind === "nuke") return this.playNukeFx(effect);
    // The overlay supplies the still hit marker; no canvas frames are needed without a shake.
    if (effect.kind !== "hit" || this.reducedMotion) return;
    const target = this.tokens.get(effect.tokenId);
    if (!target || target.container.destroyed) return;
    while (this.attackFx.length >= MAX_ATTACK_EFFECTS) this.endAttackFx(this.attackFx[0]!);

    const plan = attackPlan(effect, this.reducedMotion);
    const started = performance.now();
    const fx: AttackFx = {
      step: (now) => {
        const t = Math.max(0, (now - started) / plan.durationMs);
        if (t >= 1 || target.container.destroyed) {
          this.endAttackFx(fx);
          return false;
        }
        const r = target.radius;
        // The newest hit on a token owns its shake, so an older one ending can't cut it off.
        target.shakeOwner = fx;
        target.shake.x = plan.motion ? Math.sin(t * 40) * r * 0.12 * (1 - t) : 0;
        this.applyArtOffset(target, target.tremble.x, target.tremble.y);
        return true;
      },
      stop: () => {
        if (!target.container.destroyed && target.shakeOwner === fx) {
          target.shakeOwner = null;
          target.shake.x = 0;
          this.applyArtOffset(target, target.tremble.x, target.tremble.y);
        }
      },
    };
    this.attackFx.push(fx);
    this.animations.add(fx.step);
    this.invalidate();
  }

  private fxHost(): FxHost {
    return {
      layer: this.fxLayer,
      shakeTarget: this.world,
      filterTarget: this.screenLayer,
      screen: { width: this.app.screen.width, height: this.app.screen.height },
      reducedMotion: this.reducedMotion,
    };
  }

  /** Registers a fx.ts run in the frame loop; it is destroyed when it ends or the board does. */
  private startFx(run: RunningFx) {
    while (this.fxRuns.length >= MAX_FX_RUNS) this.endFx(this.fxRuns[0]!);
    let lastFrame = -Infinity;
    const entry = { run, started: -1, timer: 0, step: (now: number): boolean => {
      if (entry.started < 0) entry.started = now;
      if (now - lastFrame < graphicsBudget().frameMs - 1) {
        this.stepSkipped = true;
        return true;
      }
      lastFrame = now;
      if (run.update((now - entry.started) / 1000)) return true;
      this.endFx(entry);
      return false;
    } };
    this.fxRuns.push(entry);
    if (run.animated === false && run.duration !== undefined) entry.timer = window.setTimeout(() => this.endFx(entry), run.duration * 1000);
    else this.animations.add(entry.step);
    this.invalidate();
  }

  private endFx(entry: { run: RunningFx; timer: number; step: (now: number) => boolean }) {
    window.clearTimeout(entry.timer);
    this.animations.delete(entry.step);
    this.fxRuns = this.fxRuns.filter((e) => e !== entry);
    entry.run.destroy();
    this.invalidate();
  }

  /** Frames the two fighters, over a short glide (or at once with reduced motion); the viewer's own pan or zoom still wins afterwards. */
  /**
   * Called as an attack's roll is committed, before its dice are thrown, so the dice land where the
   * camera is going. Attacks made together (one per target) keep the first one's framing.
   */
  focusStrike(effect: { fromId: string; toId: string }) {
    if (!this.initialized || !getClientSettings().autoFocusAttacks) return;
    const from = this.tokens.get(effect.fromId);
    const to = this.tokens.get(effect.toId);
    if (!from || !to || from.container.destroyed || to.container.destroyed) return;
    const now = performance.now();
    // Strikes that follow closely are one attack at several targets: the frame grows to hold them all.
    if (now - this.lastFocusAt >= FIGHT_REFOCUS_MS) this.fighters = [];
    this.lastFocusAt = now;
    this.fighters.push({ x: from.container.position.x, y: from.container.position.y }, { x: to.container.position.x, y: to.container.position.y });
    this.focusFight(this.fighters, to.radius);
  }

  private fighters: Point[] = [];
  private lastFocusAt = -Infinity;
  /** Where the camera is gliding to, while it glides; the dice thrown meanwhile land there. */
  private focusCentre: Point | null = null;

  private focusFight(points: readonly Point[], radius: number) {
    const screen = this.app.screen;
    if (screen.width === 0 || screen.height === 0) return;
    const margin = Math.max(radius * 3, (this.state?.scene.grid.cellSize ?? 70) * 3);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left + margin * 2;
    const height = bottom - top + margin * 2;
    const scale = Math.min(MAX_FIGHT_ZOOM, MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(screen.width / width, screen.height / height)));
    const centre = { x: (left + right) / 2, y: (top + bottom) / 2 };
    this.focusCentre = centre;
    const from = { scale: this.world.scale.x, x: this.world.x, y: this.world.y };
    const to = { scale, x: screen.width / 2 - centre.x * scale, y: screen.height / 2 - centre.y * scale };
    this.autoFit = false;
    if (this.cameraTween) cancelAnimationFrame(this.cameraTween);
    const apply = (t: number) => {
      const k = t * t * (3 - 2 * t);
      this.world.scale.set(from.scale + (to.scale - from.scale) * k);
      this.world.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
      this.syncTextSharpness();
      this.invalidate();
    };
    if (this.reducedMotion) {
      this.focusCentre = null;
      return apply(1);
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / FIGHT_FOCUS_MS);
      apply(t);
      this.cameraTween = t < 1 ? requestAnimationFrame(step) : 0;
      if (t >= 1) this.focusCentre = null;
    };
    this.cameraTween = requestAnimationFrame(step);
  }

  private cameraTween = 0;

  private playStrikeFx(effect: Extract<AttackEffect, { kind: "strike" }>) {
    const from = this.tokens.get(effect.fromId);
    const to = this.tokens.get(effect.toId);
    if (!from || !to || from.container.destroyed || to.container.destroyed) return;
    const host = this.fxHost();
    this.startFx(withSound(
      playStrike(host, {
        def: effect.animation,
        from: { x: from.container.position.x, y: from.container.position.y },
        to: { x: to.container.position.x, y: to.container.position.y },
        radius: to.radius,
      }),
      effect.animation,
      host.reducedMotion,
    ));
  }

  private playNukeFx(effect: Extract<AttackEffect, { kind: "nuke" }>) {
    // One large blast at a time: repeated clicks replace the previous effect and free its objects.
    for (const entry of [...this.fxRuns]) this.endFx(entry);
    const { width, height } = this.app.screen;
    const host = { ...this.fxHost(), layer: this.screenFxLayer };
    this.startFx(withSound(playNuke(host, {
      onImpact: this.callbacks.nukeImpact,
      def: effect.animation,
      origin: { x: width / 2, y: height / 2 },
      unit: Math.min(64, height / 10),
      extent: Math.hypot(width, height) / 2,
    }), effect.animation, host.reducedMotion));
  }

  private endAttackFx(fx: AttackFx) {
    this.animations.delete(fx.step);
    this.attackFx = this.attackFx.filter((f) => f !== fx);
    fx.stop();
    this.invalidate();
  }

  /**
   * Shows the token's image over its colour disc. A missing image (e.g. a deleted library
   * asset) leaves the disc showing, unchanged in size and position (board-asset-fallback).
   */
  private syncTokenImage(view: TokenView, url: string | null) {
    if (url === view.imageUrl) return this.fitTokenImage(view);
    view.imageUrl = url;
    view.image.visible = false;
    if (!url || failedImageUrls.has(url)) return;
    Assets.load<Texture>(url).then(
      (texture) => {
        if (view.imageUrl !== url || view.container.destroyed) return;
        view.image.texture = texture;
        view.image.visible = true;
        this.fitTokenImage(view);
        this.invalidate();
      },
      () => {
        failedImageUrls.add(url);
      },
    );
  }

  /** Cover the token circle: scale the short edge to the diameter; the mask trims the rest. */
  private fitTokenImage(view: TokenView) {
    const { texture } = view.image;
    if (!view.image.visible || texture.width === 0 || texture.height === 0) return;
    view.image.scale.set((view.radius * 2) / Math.min(texture.width, texture.height));
  }

  /** Focus ring, active-turn ring, and the HP bar (FR-TAC-07, FR-GM-21, FR-GM-24). */
  private drawDecor(view: TokenView, token: Token, r: number, focused: boolean, active: boolean, owned: boolean, viewed: boolean, grouped = false) {
    const g = view.decor.clear();
    // Direction remains visible even when the token has no art; labels and HP stay upright.
    const angle = (token.rotation - 90) * Math.PI / 180;
    const x = Math.cos(angle) * (r - 5);
    const directionY = Math.sin(angle) * (r - 5);
    const side = Math.max(3, Math.min(6, r * 0.15));
    const dx = Math.cos(angle + Math.PI / 2) * side;
    const dy = Math.sin(angle + Math.PI / 2) * side;
    g.poly([x + Math.cos(angle) * side, directionY + Math.sin(angle) * side, x + dx, directionY + dy, x - dx, directionY - dy])
      .fill(0xffffff).stroke({ width: 1, color: 0x000000 });
    // Drawn here, above the token art, so an image never hides whose token it is.
    if (owned) g.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });

    // Rings differ in radius and dash as well as colour, so they remain distinguishable
    // when colour is not available (FR-TAC-08 applies to the whole board, not just markers).
    if (active) g.circle(0, 0, r + 7).stroke({ width: 4, color: 0xf1c40f });
    // The selection ring is the app's focus colour, as on every focused control (design-language).
    if (focused) g.circle(0, 0, r + 3).stroke({ width: 2, color: this.palette.focus, alpha: 0.95 });
    // A dashed ring (gm-token-sight-view), so it differs from the solid ones by shape too.
    if (viewed) {
      const ring = r + 5;
      const step = (Math.PI * 2) / 16;
      for (let i = 0; i < 16; i++) {
        const a = i * step;
        g.moveTo(Math.cos(a) * ring, Math.sin(a) * ring).arc(0, 0, ring, a, a + step * 0.6).stroke({ width: 2.5, color: 0x38bdf8 });
      }
    }
    // The GM's group selection: a dashed-looking double ring, unlike the others (ADR 0046).
    if (grouped) {
      g.circle(0, 0, r + 11).stroke({ width: 3, color: 0x111111, alpha: 0.85 });
      g.circle(0, 0, r + 11).stroke({ width: 1.5, color: 0x5dade2 });
    }

    const fraction = hpFraction(token.stats);
    if (fraction === null) return;
    const w = r * 1.8;
    const h = 6;
    const y = -r - h - 4;
    g.rect(-w / 2, y, w, h).fill({ color: 0x000000, alpha: 0.65 });
    g.rect(-w / 2, y, w * fraction, h).fill({
      // Colour is a convenience; the bar length is the real signal. Same colours and
      // thresholds as the roster's bar (design-language: "Board colours follow the tokens").
      color: hpColor(fraction, this.palette),
    });
    g.rect(-w / 2, y, w, h).stroke({ width: 1, color: 0x000000, alpha: 0.8 });
  }

  /**
   * One marker per condition (FR-TAC-08): its painted icon, or, until the icon has loaded or if it
   * failed, a distinct shape plus its abbreviation.
   */
  private drawConditions(view: TokenView, conditions: ConditionId[], r: number) {
    view.markers.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (conditions.length === 0) return;

    const size = Math.max(11, r * 0.34);
    // An icon is drawn a little larger than a shape: a painting needs the room to read.
    const half = size * 1.15;
    // Below the name label, which scales with the token, so the name never covers the markers.
    const y = conditionRowY(view.label.position.y, view.label.height, half);
    const step = half * 2.1;
    const startX = -((conditions.length - 1) * step) / 2;

    conditions.forEach((id, i) => {
      const marker = new Container();
      marker.position.set(startX + i * step, y);
      view.markers.addChild(marker);
      const icon = conditionIcon(id);
      if (icon) {
        // A dark disc under the painting keeps it readable over any map.
        const disc = new Graphics().circle(0, 0, half).fill({ color: 0x000000, alpha: 0.45 });
        const sprite = new Sprite(icon);
        sprite.anchor.set(0.5);
        sprite.setSize(half * 2);
        marker.addChild(disc, sprite);
        return;
      }
      const spec = conditionSpec(id);
      const shape = new Graphics();
      drawShape(shape, spec.shape, size);
      shape.fill({ color: Number(`0x${spec.color.slice(1)}`) });
      shape.stroke({ width: 1.5, color: 0x000000, alpha: 0.85 });
      const text = new Text({
        text: spec.abbr,
        style: {
          fill: 0xffffff,
          fontSize: size * 0.85,
          fontFamily: boardFontFamily(),
          fontWeight: "700",
          stroke: { color: 0x000000, width: 2 },
        },
      });
      text.anchor.set(0.5);
      marker.addChild(shape, text);
    });
  }

  private activeTokenId(): string | null {
    const init = this.state?.initiative;
    if (!init) return null;
    return init.order[init.activeIndex] ?? null;
  }

  // ---------- input ----------

  private toBoard(global: Point): Point {
    const p = this.world.toLocal(global);
    return { x: p.x, y: p.y };
  }

  private onTokenDown = (e: FederatedPointerEvent, tokenId: string) => {
    // With a tool active or a token being placed, let the press reach the stage so e.g. a
    // measurement starts here, or the new token can go on an occupied square.
    if (e.button !== 0 || this.tool.kind !== "select" || this.placement) return;
    e.stopPropagation();
    // The GM's Shift-click builds a group selection instead of dragging (ADR 0046).
    if (e.shiftKey && this.you?.role === "gm" && !this.readOnly) return this.callbacks.toggleGroupToken(tokenId);
    const view = this.tokens.get(tokenId);
    const token = this.state?.tokens[tokenId];
    if (!view || !token || !this.you) return;
    const movable = !this.readOnly && can.moveToken(this.you, token);
    const p = this.toBoard(e.global);
    this.movementRequest = null; this.movementFeedbackStatus = null;
    this.drag = {
      tokenId,
      offset: { x: p.x - view.container.x, y: p.y - view.container.y },
      movable,
      origin: { ...token.position }, epoch: this.state?.boardEpoch ?? 0,
    };
    this.dragDownAt = { x: e.global.x, y: e.global.y };
    if (!movable) return;
    view.container.cursor = "grabbing";
    this.tokenLayer.addChild(view.container); // bring to front
    this.invalidate();
  };

  private onBackgroundDown = (e: FederatedPointerEvent) => {
    if (this.placement && e.button === 2) return this.callbacks.cancelPlacement();
    if (this.placement && e.button === 0) {
      this.placeDown = { x: e.global.x, y: e.global.y };
      // Falls through to pan: a drag moves the view, and only a press that stays put places.
      this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
      return;
    }
    if (this.tool.kind === "attack") {
      if (e.button === 2) return this.callbacks.cancelAttack();
      const target = e.button === 0 ? this.tokenAt(this.toBoard(e.global), this.tool.attackerId) : null;
      if (target) {
        this.lastPickAt = performance.now();
        return this.callbacks.pickTarget(this.tool.attackerId, target);
      }
      // A press on the map or the attacker picks nothing; dragging still pans.
      this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
      return;
    }
    if (this.tool.kind === "pickTemplate") {
      if (e.button === 2) return this.callbacks.cancelPickTemplate();
      const picked = e.button === 0 ? this.templateAt(this.toBoard(e.global)) : null;
      if (picked) return this.callbacks.pickTemplate(picked);
      // A press beside every template picks nothing; dragging still pans.
      this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
      return;
    }
    if (this.tool.kind === "fog" && this.tool.mode !== "rect" && e.button === 0) {
      return this.fogClick(this.toBoard(e.global), { x: e.global.x, y: e.global.y });
    }
    if (this.tool.kind !== "select" && e.button === 0) {
      const at = this.toBoard(e.global);
      const origin = this.tool.kind === "measure" ? this.movementOrigin : null;
      this.gesture = { from: origin ?? at, to: at, tokenSize: origin ? this.movementTokenSize : undefined, screenFrom: { x: e.global.x, y: e.global.y }, free: e.altKey, dragged: false, path: [at] };
      if (this.tool.kind === "measure") this.measurement = null;
      if (this.tool.kind === "erase") return this.eraseAt(at);
      this.redrawOverlay();
      return;
    }
    this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y }, button: e.button };
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (this.placement) {
      this.hover = { at: this.toBoard(e.global), free: e.altKey };
      this.redrawGhost();
    }
    if (this.tool.kind === "attack" && !this.pan) {
      const hover = this.tokenAt(this.toBoard(e.global), this.tool.attackerId);
      if (hover !== this.attackHover) {
        this.attackHover = hover;
        this.redrawOverlay();
      }
    }
    if (this.tool.kind === "fog" && this.tool.mode === "polygon" && this.fogPoints.length > 0) {
      this.fogHover = this.toBoard(e.global);
      this.redrawOverlay();
    }
    if (this.gesture) {
      const gesture = this.gesture;
      const previous = gesture.to;
      gesture.to = this.toBoard(e.global);
      gesture.free = e.altKey;
      gesture.dragged ||= Math.hypot(e.global.x - gesture.screenFrom.x, e.global.y - gesture.screenFrom.y) >= MIN_MARK_DRAG_PX;
      if (this.tool.kind === "erase") return this.eraseAt(gesture.to, previous);
      const last = gesture.path[gesture.path.length - 1]!;
      const step = Math.hypot(gesture.to.x - last.x, gesture.to.y - last.y) * this.world.scale.x;
      const brushing = this.tool.kind === "draw" && this.tool.shape === "brush";
      if (brushing && step >= BRUSH_STEP_PX && gesture.path.length < MAX_STROKE_POINTS) gesture.path.push(gesture.to);
      // Aiming an area: the others see it take shape (KAN-35).
      if (this.tool.kind === "area" && this.state) {
        const area = this.areaFromGesture(gesture, this.tool);
        if (area?.kind === "area") {
          const origin = areaOrigin(area.origin, this.state.scene.grid, area.free);
          this.callbacks.aimPreview({ shape: area.shape, origin, toward: area.toward, size: area.size, width: area.width, color: area.color, gmOnly: this.tool.gmOnly });
        }
      }
      this.redrawOverlay();
    } else if (this.drag) {
      if (!this.drag.movable) return;
      const view = this.tokens.get(this.drag.tokenId);
      if (!view) return;
      const p = this.toBoard(e.global);
      const at = { x: p.x - this.drag.offset.x, y: p.y - this.drag.offset.y };
      view.container.position.set(at.x, at.y);
      this.callbacks.dragPreview(this.drag.tokenId, at);
      this.drag.target = { at, free: e.altKey };
      this.refreshMovementPreview(false);
      this.invalidate();
    } else if (!this.pan && this.tool.kind === "select" && !this.placement && this.you) {
      // A hand over a door or window the viewer may open or close (ADR 0030).
      const portal = this.portalUnder(e.global);
      const cursor = portal && can.togglePortal(this.you, portal) ? "pointer" : this.toolCursor();
      if (this.app.stage.cursor !== cursor) this.app.stage.cursor = cursor;
    } else if (this.pan) {
      // A press that hardly moves is a tap, not a deliberate pan (KAN-54).
      if (exceedsPanThreshold(this.pan.start, e.global)) this.autoFit = false;
      this.world.position.set(
        this.pan.origin.x + e.global.x - this.pan.start.x,
        this.pan.origin.y + e.global.y - this.pan.start.y,
      );
      this.invalidate();
    }
  };

  private drawMovementLine(from: Point, to: Point, obstruction: MovementPreview["obstruction"]) {
    const g = this.overlayGraphics.clear(), px = 1 / this.world.scale.x;
    if (obstruction === "clear") g.moveTo(from.x, from.y).lineTo(to.x, to.y);
    else {
      const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
      // Keep dashes legible at every zoom and bound work for very long off-map gestures.
      const period = Math.max(12 * px, length / 512);
      for (let start = 0; start < length; start += period) {
        const end = Math.min(start + period / 2, length);
        g.moveTo(from.x + dx * start / length, from.y + dy * start / length).lineTo(from.x + dx * end / length, from.y + dy * end / length);
      }
    }
    g.stroke({ color: obstruction === "blocked" ? 0xf08b8b : 0xffffff, alpha: obstruction === "unknown" ? .35 : obstruction === "blocked" ? .75 : .8, width: (obstruction === "blocked" ? 2.5 : 2) * px, cap: "round" });
  }

  private onPointerUp = (e: FederatedPointerEvent) => {
    const pan = this.pan;
    this.pan = null;
    if (pan && pan.button === 0 && !this.placement && !this.gesture && this.tool.kind === "select" && !exceedsPanThreshold(pan.start, e.global)) {
      // A click on a door or window uses it (FR-GM-18); anywhere else on the map clears the selection.
      const portal = this.portalUnder(e.global);
      if (portal) this.callbacks.togglePortal(portal.id, e.shiftKey);
      else this.callbacks.selectToken(null);
    }
    const down = this.placeDown;
    this.placeDown = null;
    if (down && this.placement && this.state) {
      if (Math.hypot(e.global.x - down.x, e.global.y - down.y) >= MIN_MARK_DRAG_PX) return;
      const at = placementPoint(this.toBoard(e.global), this.placement.size, this.state.scene.grid, e.altKey);
      return this.callbacks.placeToken(at);
    }
    if (this.gesture) return this.finishGesture();
    const drag = this.drag;
    const downAt = this.dragDownAt;
    this.drag = null;
    this.dragDownAt = null;
    if (!drag) return;
    this.overlayGraphics.clear(); this.measureLabel.visible = false;
    // A press that stays put is a click: select the token. Anything further is a drag and moves it.
    const clicked = downAt !== null && Math.hypot(e.global.x - downAt.x, e.global.y - downAt.y) < MIN_MARK_DRAG_PX;
    if (clicked) this.callbacks.selectToken(drag.tokenId, e.shiftKey);
    const token = this.state?.tokens[drag.tokenId];
    const view = this.tokens.get(drag.tokenId);
    if (!drag.movable) return;
    if (!this.state || !token || !view) return this.callbacks.dragEnd(drag.tokenId, null);
    view.container.cursor = "grab";
    if (clicked) {
      // A click never moves the token, even one placed off-centre: put it back and end the ghost.
      view.container.position.set(token.position.x, token.position.y);
      this.invalidate();
      return this.callbacks.dragEnd(token.id, token.position);
    }

    this.invalidate();
    const dropped = { x: view.container.x, y: view.container.y };
    // Snap by default; hold Alt for free placement (FR-TAC-02).
    const to = e.altKey ? dropped : snapTokenCenter(dropped, token.size, this.state.scene.grid);
    view.container.position.set(to.x, to.y);
    this.callbacks.dragEnd(token.id, to);
    if (to.x === token.position.x && to.y === token.position.y) return;
    this.pendingMoves.set(token.id, to);
    this.callbacks.moveToken(token.id, to, drag.origin, drag.epoch).then((ok) => {
      if (ok) return;
      this.pendingMoves.delete(token.id);
      const current = this.state?.tokens[token.id];
      if (current) {
        this.tokens.get(token.id)?.container.position.set(current.position.x, current.position.y);
        // Rejected: the others' ghost goes back to where the token still is.
        this.callbacks.dragEnd(token.id, current.position);
      }
      this.invalidate();
    });
  };

  /**
   * Pinch to zoom and two-finger pan (FR-TAC-01 on touch).
   *
   * One finger is left alone so it still drags tokens and pans the background through the
   * existing pointer handlers. Two fingers are unambiguously a camera gesture, so we take
   * them over and keep the midpoint between the fingers anchored to the same board point —
   * which is what makes a pinch feel like it is grabbing the map rather than scaling it
   * around some arbitrary centre.
   */
  private pinch: { distance: number; midpoint: Point; scale: number; start: Point } | null = null;
  private lastTap = { at: 0, x: 0, y: 0 };

  private touchInfo(touches: TouchList) {
    const rect = this.app.canvas.getBoundingClientRect();
    const a = touches[0]!;
    const b = touches[1]!;
    return {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      midpoint: {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      },
    };
  }

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    // Cancel whatever the first finger started, so a pinch never drags a token with it,
    // leaves half a drawing behind, or drops the token being placed.
    this.pan = null;
    this.placeDown = null;
    if (this.gesture) {
      this.gesture = null;
      this.redrawOverlay();
    }
    if (this.drag) {
      const view = this.tokens.get(this.drag.tokenId);
      const token = this.state?.tokens[this.drag.tokenId];
      if (view && token) view.container.position.set(token.position.x, token.position.y);
      this.callbacks.dragEnd(this.drag.tokenId, token?.position ?? null);
      this.drag = null;
      this.overlayGraphics.clear(); this.measureLabel.visible = false;
      this.invalidate();
    }
    const { distance, midpoint } = this.touchInfo(e.touches);
    this.pinch = { distance, midpoint, scale: this.world.scale.x, start: midpoint };
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const { distance, midpoint } = this.touchInfo(e.touches);
    if (this.pinch.distance === 0) return;

    const scale = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, this.pinch.scale * (distance / this.pinch.distance)),
    );
    // Board point under the starting midpoint, kept under the current midpoint.
    const anchor = {
      x: (this.pinch.midpoint.x - this.world.x) / this.world.scale.x,
      y: (this.pinch.midpoint.y - this.world.y) / this.world.scale.y,
    };
    if (pinchIsManual(this.pinch.start, midpoint, this.world.scale.x, scale)) this.autoFit = false;
    this.world.scale.set(scale);
    this.syncTextSharpness();
    this.world.position.set(midpoint.x - anchor.x * scale, midpoint.y - anchor.y * scale);
    this.pinch = { ...this.pinch, distance, midpoint, scale };
    this.invalidate();
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) this.pinch = null;

    // Double-tap to ping. `dblclick` is synthesised inconsistently on touch, and a ping is
    // the one board gesture a player on a phone actually needs (FR-TAC-05).
    const touch = e.changedTouches[0];
    if (!touch || e.touches.length > 0 || this.pinch || this.placement) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const now = performance.now();
    const quick = now - this.lastTap.at < 350;
    const close = Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30;
    if (quick && close) {
      if (this.partOfAttackPick()) {
        this.lastTap = { at: 0, x: 0, y: 0 };
        return;
      }
      const at = this.toBoard({ x, y });
      this.showPing(at);
      this.callbacks.ping(at);
      this.lastTap = { at: 0, x: 0, y: 0 };
      return;
    }
    this.lastTap = { at: now, x, y };
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const before = this.toBoard(screenPoint);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
    if (zoomChangesScale(this.world.scale.x, scale)) this.autoFit = false;
    this.world.scale.set(scale);
    this.syncTextSharpness();
    this.world.position.set(screenPoint.x - before.x * scale, screenPoint.y - before.y * scale);
    this.invalidate();
  };

  /**
   * Whether a double-click or double-tap belongs to picking an attack target. Such a ping would
   * land on the target for everyone, and the GM may be picking a hidden one (FR-GM-23).
   */
  private partOfAttackPick() {
    return this.tool.kind === "attack" || performance.now() - this.lastPickAt < 600;
  }

  /** The pointer left the board: there is no square to show the new token on. */
  private onPointerLeave = () => {
    if (!this.hover) return;
    this.hover = null;
    this.redrawGhost();
  };

  private onDoubleClick = (e: MouseEvent) => {
    // A double click while placing is two tries at the same square, not a ping.
    if (this.placement) return;
    if (this.partOfAttackPick()) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const at = this.toBoard({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    this.showPing(at);
    this.callbacks.ping(at);
  };
}

/**
 * Condition marker shapes (FR-TAC-08). Each is visually distinct in silhouette, so two
 * conditions never rely on colour alone to be told apart.
 */
function drawShape(g: Graphics, shape: ConditionShape, size: number) {
  const r = size;
  switch (shape) {
    case "circle":
      g.circle(0, 0, r);
      return;
    case "square":
      g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      return;
    case "triangle":
      g.poly([0, -r, r, r * 0.8, -r, r * 0.8]);
      return;
    case "diamond":
      g.poly([0, -r, r, 0, 0, r, -r, 0]);
      return;
    case "hexagon":
      g.poly(
        Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          return [Math.cos(a) * r, Math.sin(a) * r];
        }).flat(),
      );
      return;
    case "heart": {
      const k = r * 0.55;
      g.moveTo(0, r * 0.75)
        .bezierCurveTo(-r * 1.3, -k, -k * 0.5, -r * 1.15, 0, -r * 0.35)
        .bezierCurveTo(k * 0.5, -r * 1.15, r * 1.3, -k, 0, r * 0.75);
      return;
    }
  }
}

