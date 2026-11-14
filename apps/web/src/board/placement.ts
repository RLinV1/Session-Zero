import { snapTokenCenter, type CommandInput, type GridSpec, type Point, type RoomState, type TokenStats } from "@vtt/shared";

import { t } from "../i18n/locale";
/**
 * Placing a new token on the board (place-token-on-board). Pure geometry in board coordinates
 * (invariant 8), so it is testable without Pixi.
 */

/** A token the GM has filled in but not yet put down: everything `token.create` needs except where. */
export type TokenDraft = Omit<Extract<CommandInput, { type: "token.create" }>, "position">;

/** What the board draws under the pointer while placing. */
export interface PlacementGhost {
  name: string;
  size: number;
  /** Degrees clockwise, so the direction marker already points where the token will face. */
  rotation: number;
  color: string;
  imageUrl: string | null;
  hidden: boolean;
  /** Drawn as the HP bar, as on the real token. */
  stats: TokenStats;
}

/** Where a token dropped at `p` lands: the centre of the square(s) under it, or `p` itself with Alt. */
export function placementPoint(p: Point, size: number, grid: GridSpec, free: boolean): Point {
  return free ? p : snapTokenCenter(p, size, grid);
}

/** The squares a token centred at `center` covers, as a rectangle in board pixels. */
export function footprint(center: Point, size: number, grid: GridSpec) {
  const edge = size * grid.cellSize;
  return { x: center.x - edge / 2, y: center.y - edge / 2, width: edge, height: edge };
}

/**
 * "Place automatically": fan tokens out around the map's centre instead of stacking them all on
 * one cell, which made the roster and turn order useless the moment there was a second one.
 */
export function autoPlacementPoint(state: RoomState, size: number): Point {
  const map = state.scene.map;
  const center = map ? { x: map.width / 2, y: map.height / 2 } : { x: 1050, y: 700 };
  const count = Object.keys(state.tokens).length;
  const ring = Math.floor(count / 8) + 1;
  const angle = (count % 8) * (Math.PI / 4);
  const spread = state.scene.grid.cellSize * ring;
  return snapTokenCenter(
    { x: center.x + Math.cos(angle) * spread, y: center.y + Math.sin(angle) * spread },
    size,
    state.scene.grid,
  );
}

/**
 * What a placement creates on each click (token-placement-flow): copies of a filled-in draft (New
 * Token, Saved Creatures), or copies of a token on the board, made by the server (Duplicate, ADR 0033).
 */
export type PlacingSource =
  | { kind: "create"; draft: TokenDraft }
  | { kind: "duplicate"; tokenId: string; ghost: PlacementGhost }
  /** Carried tokens waiting off the map (ADR 0068): one click places them all, spread by the server. */
  | { kind: "staged"; tokenIds: string[]; sceneId: string; ghost: PlacementGhost };

/**
 * The command one placement sends: always one token at `at`. Placing repeats until the GM ends it,
 * so no count and nothing about repeating is ever sent.
 */
export function placementCommand(source: PlacingSource, at: Point): CommandInput {
  if (source.kind === "duplicate") return { type: "token.duplicate", tokenId: source.tokenId, position: at };
  if (source.kind === "staged") return { type: "token.placeStaged", origin: at, tokenIds: source.tokenIds, expectedSceneId: source.sceneId };
  const { count: _count, ...draft } = source.draft;
  return { ...draft, count: 1, position: at };
}

/** Where keyboard placement starts: the square(s) nearest the map's centre. */
export function startCursor(state: RoomState, size: number): Point {
  const map = state.scene.map;
  const center = map ? { x: map.width / 2, y: map.height / 2 } : { x: 1050, y: 700 };
  return snapTokenCenter(center, size, state.scene.grid);
}

/** The keyboard cursor moved `dx`, `dy` squares, kept so the token's squares stay on the map. */
export function moveCursor(cursor: Point, dx: number, dy: number, size: number, state: RoomState): Point {
  const { grid, map } = state.scene;
  const next = { x: cursor.x + dx * grid.cellSize, y: cursor.y + dy * grid.cellSize };
  if (!map) return next;
  const half = (size * grid.cellSize) / 2;
  const inside = next.x - half >= -0.5 && next.y - half >= -0.5 && next.x + half <= map.width + 0.5 && next.y + half <= map.height + 0.5;
  return inside ? next : cursor;
}

/** "column 8, row 5": the square under the cursor's top-left corner, counting from 1, for screen readers. */
export function cursorSquare(cursor: Point, size: number, grid: GridSpec): string {
  const half = (size * grid.cellSize) / 2;
  const column = Math.floor((cursor.x - half - grid.offsetX + grid.cellSize / 2) / grid.cellSize) + 1;
  const row = Math.floor((cursor.y - half - grid.offsetY + grid.cellSize / 2) / grid.cellSize) + 1;
  return `${t("fog.column", { n: column })}${t("common.listSep")}${t("fog.row", { n: row })}`;
}

/**
 * What the board draws under the pointer while placing carried tokens (ADR 0068): the largest one,
 * which the server puts on the clicked square, named for the whole group. Null when none of
 * `tokenIds` is staged.
 */
export function stagedGhost(state: RoomState, tokenIds: readonly string[]): PlacementGhost | null {
  const tokens = tokenIds.flatMap((id) => (Object.hasOwn(state.staged, id) ? [state.staged[id]!] : []));
  const first = [...tokens].sort((a, b) => b.size - a.size)[0];
  if (!first) return null;
  const { name, size, rotation, color, imageUrl, hidden, stats } = first;
  return { name: t("board.carriedGhost", { name, n: tokens.length }), size, rotation, color, imageUrl, hidden, stats };
}
