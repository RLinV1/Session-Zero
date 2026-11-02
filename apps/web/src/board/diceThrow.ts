import { parseDiceExpression, type GridSpec, type MapImage, type Point } from "@vtt/shared";
import { seed, throwTurns, type ThrowPath } from "../ui/diceGeometry";

/**
 * Throwing dice onto the board (throw-dice-on-board): the pure parts. Where a release lands,
 * how the board maps to the page, and when the Dice panel's die can be picked up.
 */

/** Most dice one throw puts on the board; a bigger roll is rolled with the Roll button. */
export const BOARD_THROW_MAX_DICE = 10;

/** The board's world transform: a board point p sits at `offset + p * scale` in the canvas. */
export interface BoardTransform {
  scale: number;
  x: number;
  y: number;
}

/** A throw on this viewer's board, in board coordinates. Plain data, so it could be sent later. */
export interface BoardThrow {
  rollId: string;
  from: Point;
  to: Point;
}

/** A page point (clientX/Y) on the board, or null when it is outside the canvas. */
export function clientToBoard(client: Point, canvas: Pick<DOMRect, "left" | "top" | "width" | "height">, view: BoardTransform): Point | null {
  const x = client.x - canvas.left;
  const y = client.y - canvas.top;
  if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return null;
  return { x: (x - view.x) / view.scale, y: (y - view.y) / view.scale };
}

/** Whether a board point is on the map image. */
export function onMap(p: Point, map: Pick<MapImage, "width" | "height">): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
}

/**
 * Why the Dice panel's die can't be thrown right now, or null when it can. A private roll never
 * goes on the board (board-dice-rolls), so it's rolled with Roll and stays in the panel's tray.
 */
export function throwBlocker(expression: string, hasMap: boolean, privateRoll = false): string | null {
  const parsed = parseDiceExpression(expression);
  if (!parsed.ok) return "Enter a valid expression to throw it";
  if (!hasMap) return "Throwing needs a map on the board";
  if (privateRoll) return "Private rolls stay off the board; use Roll";
  if (parsed.expression.count > BOARD_THROW_MAX_DICE) return `At most ${BOARD_THROW_MAX_DICE} dice can be thrown on the map; use Roll`;
  return null;
}

/** A pointer sample while the die is held: page position and `performance.now()` time. */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

/** How far back the release velocity looks. */
export const VELOCITY_WINDOW_MS = 80;

/** Pointer velocity at release, in page px per ms, from the samples of the last 80 ms. */
export function releaseVelocity(samples: readonly PointerSample[], releasedAt: number): Point {
  const recent = samples.filter((s) => releasedAt - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return { x: 0, y: 0 };
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const dt = Math.max(1, releasedAt - first.t);
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** Screen distance a flick travels per page px/ms of release speed. */
const FLICK_MS = 160;
/** Shortest and longest throws, in grid cells. */
const MIN_CELLS = 0.6;
const MAX_CELLS = 3;
/** A die dropped without a flick still slides a little, down and to the right. */
const DROP_DIRECTION = { x: Math.cos(0.35), y: Math.sin(0.35) };
/** Kept this far inside the map's edge. */
const EDGE_MARGIN = 1;

/**
 * Where a throw released at `from` (board coordinates) with page velocity `velocity` lands:
 * along the flick, further for a faster flick, between 0.6 and 3 grid cells away, and
 * always inside the map.
 */
export function throwLanding(
  from: Point,
  velocity: Point,
  view: Pick<BoardTransform, "scale">,
  grid: Pick<GridSpec, "cellSize">,
  map: Pick<MapImage, "width" | "height">,
): Point {
  const speed = Math.hypot(velocity.x, velocity.y);
  const direction = speed > 0.02 ? { x: velocity.x / speed, y: velocity.y / speed } : DROP_DIRECTION;
  const cells = Math.min(MAX_CELLS, Math.max(MIN_CELLS, (speed * FLICK_MS) / view.scale / grid.cellSize));
  const distance = cells * grid.cellSize;
  return clampToMap({ x: from.x + direction.x * distance, y: from.y + direction.y * distance }, map);
}

/**
 * A roll made with Roll (no die let go): tossed in from up and to the left, landing at `centre`,
 * the middle of the visible board, kept on the map when there is one.
 */
export function centreThrow(
  centre: Point,
  view: Pick<BoardTransform, "scale">,
  grid: Pick<GridSpec, "cellSize">,
  map: Pick<MapImage, "width" | "height"> | null,
): { from: Point; to: Point } {
  const to = map ? clampToMap(centre, map) : centre;
  return { from: throwStart(to, 2 * boardDieSize(grid, view)), to };
}

/** Where a Roll-button throw onto `to` leaves the hand, `reach` board px back along the usual direction. */
export function throwStart(to: Point, reach: number): Point {
  return { x: to.x - DROP_DIRECTION.x * reach, y: to.y - DROP_DIRECTION.y * reach };
}

/**
 * Where the nth throw already on the board's floor leaves room for a new one: the first lands where
 * aimed, the next ones to its right and left in turn, so rolls made together (one per target of a
 * multi-target attack) lie side by side instead of on top of each other.
 */
export function crowdedOffset(active: number, size: number): Point {
  const step = Math.ceil(active / 2) * 2.4 * size;
  return { x: active === 0 ? 0 : active % 2 === 1 ? step : -step, y: 0 };
}

export function clampToMap(p: Point, map: Pick<MapImage, "width" | "height">): Point {
  const clamp = (v: number, max: number) => Math.min(max - EDGE_MARGIN, Math.max(EDGE_MARGIN, v));
  return { x: clamp(p.x, map.width), y: clamp(p.y, map.height) };
}

/** Die size on the board, as a fraction of a grid cell. */
export const DIE_CELLS = 0.9;
/**
 * A die is never drawn smaller than this on screen, however far out the board is zoomed: the
 * size of the die held under the pointer, so the die that was let go is the die that lands.
 */
export const MIN_DIE_SCREEN_PX = 44;

/** Die edge in board px for a throw made at this zoom: about 0.9 cells, never smaller than the held die. */
export function boardDieSize(grid: Pick<GridSpec, "cellSize">, view: Pick<BoardTransform, "scale">): number {
  return Math.max(grid.cellSize * DIE_CELLS, MIN_DIE_SCREEN_PX / view.scale);
}

/** One die of a board throw: where it comes to rest (its centre, board px) and how it gets there. */
export interface BoardDiePath {
  landing: Point;
  path: ThrowPath;
}

/**
 * How each die of a throw travels, in board px. The first die rests on `to`, the others in a
 * loose seeded cluster around it, all inside the map if there is one; every die leaves the hand
 * at `from`. Depends only on its inputs, so the same throw always plays the same way.
 */
export function boardDiePaths(t: BoardThrow, count: number, size: number, map: Pick<MapImage, "width" | "height"> | null): BoardDiePath[] {
  const rng = seed(`${t.rollId}:board`);
  const spin = rng() * Math.PI * 2;
  const inside = (v: number, max: number | undefined) => (max === undefined ? v : Math.min(max - size / 2, Math.max(size / 2, v)));
  return Array.from({ length: count }, (_, i) => {
    // Golden-angle spiral: each die takes the next free spot around the first.
    const angle = spin + i * 2.39996 + (rng() - 0.5) * 0.5;
    const reach = i === 0 ? 0 : size * (0.85 + rng() * 0.25) * Math.sqrt(i);
    const landing = { x: inside(t.to.x + Math.cos(angle) * reach, map?.width), y: inside(t.to.y + Math.sin(angle) * reach, map?.height) };
    const jitter = () => (rng() - 0.5) * size * 0.3;
    return {
      landing,
      path: {
        offset: { x: t.from.x - landing.x + jitter(), y: t.from.y - landing.y + jitter() },
        drop: size * (1.1 + rng() * 0.5),
        turns: throwTurns(rng),
      },
    };
  });
}

/**
 * What a pointer event means for a die held by pointer `holding` (null: none held). Another
 * pointer's events are ignored. The held pointer moving with no button down, losing capture or
 * being cancelled all mean its release will never arrive, so the hold must end there; missing
 * that leaves the die stuck to the pointer.
 */
export function holdEvent(
  holding: number | null,
  e: { type: string; pointerId: number; buttons: number },
): "ignore" | "move" | "release" | "end" {
  if (holding === null || e.pointerId !== holding) return "ignore";
  if (e.type === "pointerup") return "release";
  if (e.type === "pointercancel" || e.type === "lostpointercapture") return "end";
  if (e.type === "pointermove") return e.buttons === 0 ? "end" : "move";
  return "ignore";
}
