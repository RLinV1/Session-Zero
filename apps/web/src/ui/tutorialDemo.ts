import { INITIAL_SCENE_ID, sceneNameOf, sceneNamesOf, distanceToSegment, overlapsToken, storedWallsFor, terrainAt, type AttackPreset, type Point, type RoomState, type Token } from "@vtt/shared";
import { attackExpression, pendingRulings, presetRollLabel } from "../panels/attackRoll";
import type { RoomConnection } from "../net/roomConnection";
import { t } from "../i18n/locale";
import { TUTORIAL_GRID, TUTORIAL_MAP, TUTORIAL_SCENE_NAME, TUTORIAL_WALLS } from "./tutorialMap";

/**
 * The scripted demo fight of the guest demo (guest-gm-hosting). Every call sends the commands the
 * Initiative and Attack panels send, as the GM; nothing here changes state any other way.
 */

type Command = Parameters<RoomConnection["command"]>[0];
export type DemoResult = { ok: true } | { ok: false; message: string };

export interface DemoPair {
  hero: Token;
  foe: Token;
  /** The hero's attack that has both a to-hit roll and a damage roll. */
  attack: AttackPreset;
}

const strike = (token: Token): AttackPreset | undefined => token.attacks?.find((a) => a.toHit && a.damage);

/** Two tokens the fight can use: one with a full attack, and another with AC and HP left. First match wins, so a GM's own tokens are used. */
export function demoPair(state: RoomState): DemoPair | null {
  const tokens = Object.values(state.tokens);
  for (const hero of tokens) {
    const attack = strike(hero);
    const foe = attack && tokens.find((x) => x.id !== hero.id && x.stats.ac !== null && x.stats.hp !== null && x.stats.hp > 0);
    if (attack && foe) return { hero, foe, attack };
  }
  return null;
}

/** A damage roll of the hero on the foe that is waiting to be applied. */
export const damageWaiting = (state: RoomState): boolean => pendingRulings(state).some((item) => item.kind === "damage");

const trackedKey = (roomId: string) => `vtt.tutorial.tokens.${roomId}`;
const tracked = (roomId: string): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(trackedKey(roomId)) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
};
export function rememberDemoTokens(roomId: string, ids: string[]) {
  try { localStorage.setItem(trackedKey(roomId), JSON.stringify([...new Set([...tracked(roomId), ...ids])])); } catch { /* Storage can be disabled. */ }
}

/** Track ids so renamed sample tokens can still be removed without deleting the guest's own tokens. */
export const demoTokenIds = (state: RoomState): string[] => {
  const ids = new Set(tracked(state.roomId));
  return Object.keys(state.tokens).filter((id) => ids.has(id));
};

/** Keep the original scene intact: all examples run on their own map. */
export async function ensureTutorialScene(connection: RoomConnection): Promise<DemoResult> {
  let state = connection.snapshot?.state;
  if (!state || state.scene.map?.url === TUTORIAL_MAP.url) return { ok: true };
  const existing = Object.entries(state.savedScenes ?? {}).find(([, saved]) => saved.table.scene.map?.url === TUTORIAL_MAP.url);
  const names = new Set(Object.values(sceneNamesOf(state)));
  let name = TUTORIAL_SCENE_NAME;
  for (let suffix = 2; names.has(name); suffix++) name = `${TUTORIAL_SCENE_NAME} ${suffix}`;
  const origin = state.activeSceneId ?? INITIAL_SCENE_ID;
  const opened = await send(connection, existing ? { type: "scene.switch", sceneId: existing[0] } : { type: "scene.create", name, activate: true });
  if (!opened.ok) return opened;
  try { localStorage.setItem(`vtt.tutorial.origin.${state.roomId}`, origin); } catch { /* The scene remains in the scene switcher. */ }
  state = connection.snapshot.state;
  if (state?.scene.map?.url === TUTORIAL_MAP.url) return { ok: true };
  const mapped = await send(connection, { type: "scene.setMap", map: TUTORIAL_MAP, grid: TUTORIAL_GRID });
  if (!mapped.ok) return mapped;
  return send(connection, { type: "wall.add", walls: TUTORIAL_WALLS });
}

/** Leave the practice board without changing the original map, tokens or preparation. */
export async function restoreTutorialScene(connection: RoomConnection): Promise<DemoResult> {
  const state = connection.snapshot?.state;
  if (!state || state.scene.map?.url !== TUTORIAL_MAP.url) return { ok: true };
  let origin: string | null = null;
  try { origin = localStorage.getItem(`vtt.tutorial.origin.${state.roomId}`); } catch { /* No stored origin. */ }
  if (!origin || sceneNameOf(state, origin) === undefined) return { ok: true };
  const result = await send(connection, { type: "scene.switch", sceneId: origin });
  if (result.ok) try { localStorage.removeItem(`vtt.tutorial.origin.${state.roomId}`); } catch { /* Storage can be disabled. */ }
  return result;
}

const send = async (connection: RoomConnection, command: Command): Promise<DemoResult> => {
  const before = new Set(Object.keys(connection.snapshot.state?.tokens ?? {}));
  const result = await connection.command(command);
  const state = connection.snapshot.state;
  if (result.ok && command.type === "token.create" && state) rememberDemoTokens(state.roomId, Object.keys(state.tokens).filter((id) => !before.has(id)));
  return result.ok ? { ok: true } : { ok: false, message: result.message };
};

/**
 * Two neighbouring cells of open floor, chosen on the roomiest open floor: no wall within
 * about a cell of either centre, no blocked terrain or occupied footprints, and inside the map.
 */
export function demoSpots(state: RoomState, sizeInCells = 1, exceptId?: string): [Point, Point] | null {
  const { grid, map } = state.scene;
  const size = grid.cellSize;
  const width = map?.width ?? size * 8, height = map?.height ?? size * 8;
  const cols = Math.floor((width - grid.offsetX) / size), rows = Math.floor((height - grid.offsetY) / size);
  const centre = (col: number, row: number): Point => ({ x: grid.offsetX + (col + sizeInCells / 2) * size, y: grid.offsetY + (row + sizeInCells / 2) * size });
  const layers = [state.terrain?.base ?? [], ...(state.terrain?.effects.map((e) => e.runs) ?? [])];
  const open = (col: number, row: number) => {
    if (col < 0 || row < 0 || col + sizeInCells > cols || row + sizeInCells > rows) return false;
    const p = centre(col, row);
    return !overlapsToken(state.tokens, p, sizeInCells, grid, exceptId)
      && !Object.values(state.walls).some((w) => distanceToSegment(p, w) < size * (sizeInCells / 2 + 0.25))
      && !layers.some((runs) => {
        for (let r = row; r < row + sizeInCells; r++) for (let c = col; c < col + sizeInCells; c++) if (terrainAt(runs, c, r) === "blocked") return true;
        return false;
      });
  };
  // Prefer the roomiest floor: the pair whose nearer cell is farthest from any wall (a shipped map's stored walls count,
  // even before the GM loads them), ties going to the one closest to the middle of the map.
  const stored = map ? storedWallsFor(map) ?? [] : [];
  const walls = [...Object.values(state.walls), ...stored];
  const room = (col: number, row: number) => {
    const p = centre(col, row);
    return Math.min(size * 3, ...walls.map((w) => distanceToSegment(p, w)));
  };
  const mc = (cols - 1) / 2, mr = (rows - 1) / 2;
  let best: { score: number; away: number; at: [number, number] } | null = null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col + sizeInCells < cols; col++) {
      if (!open(col, row) || !open(col + sizeInCells, row)) continue;
      const score = Math.min(room(col, row), room(col + sizeInCells, row));
      const away = Math.hypot(col + 0.5 - mc, row - mr);
      if (!best || score > best.score + 1 || (Math.abs(score - best.score) <= 1 && away < best.away)) best = { score, away, at: [col, row] };
    }
  }
  if (best) return [centre(best.at[0], best.at[1]), centre(best.at[0] + sizeInCells, best.at[1])];
  return null;
}

/** The two demo tokens, side by side on open floor, with built-in token art; their events reach the snapshot before the acks do. */
async function makeDemoTokens(connection: RoomConnection, state: RoomState): Promise<DemoResult> {
  const spots = demoSpots(state);
  if (!spots) return { ok: false, message: t("tutorial.demo.noSpace") };
  const [heroAt, foeAt] = spots;
  const hero = await send(connection, {
    type: "token.create",
    name: t("tutorial.demo.hero"),
    position: heroAt,
    stats: { hp: 12, maxHp: 12, ac: 14 },
    color: "#3b82f6",
    imageUrl: "/img/tokens/enemies/human-swordsman.svg",
    attacks: [{ name: t("tutorial.demo.sword"), toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 } }],
  } as Command);
  if (!hero.ok) return hero;
  return send(connection, {
    type: "token.create",
    name: t("tutorial.demo.goblin"),
    position: foeAt,
    stats: { hp: 12, maxHp: 12, ac: 8 },
    color: "#16a34a",
    imageUrl: "/img/tokens/enemies/goblin-guard.svg",
  } as Command);
}

/** The pair to fight with, creating the demo tokens first if the GM has no two usable ones. */
async function ensurePair(connection: RoomConnection): Promise<DemoPair | string> {
  const state = () => connection.snapshot.state;
  let pair = state() && demoPair(state()!);
  if (!pair && state()) {
    const made = await makeDemoTokens(connection, state()!);
    if (!made.ok) return made.message;
    pair = demoPair(state()!);
  }
  return pair || t("tutorial.demo.noTokens");
}

/** Encounter step: the two tokens, then the turn order with the hero first. */
export async function runDemoEncounter(connection: RoomConnection): Promise<DemoResult> {
  const pair = await ensurePair(connection);
  if (typeof pair === "string") return { ok: false, message: pair };
  if (connection.snapshot.state?.initiative) return { ok: true };
  return send(connection, { type: "initiative.start", entries: [{ tokenId: pair.hero.id, score: 15 }, { tokenId: pair.foe.id, score: 10 }] });
}

/** Attack and damage steps: the hero's named attack on the foe, as the Attack panel rolls it. */
export async function runDemoRoll(connection: RoomConnection, kind: "toHit" | "damage"): Promise<DemoResult> {
  const pair = await ensurePair(connection);
  if (typeof pair === "string") return { ok: false, message: pair };
  const dice = kind === "toHit" ? pair.attack.toHit! : pair.attack.damage!;
  return send(connection, {
    type: "dice.roll",
    expression: attackExpression(dice),
    visibility: "public",
    attack: { actorTokenId: pair.hero.id, targetTokenId: pair.foe.id, kind, label: presetRollLabel(pair.attack, kind) },
  });
}

/** The last step's offer: take the demo tokens (and their encounter) off the table again. */
export async function removeDemoTokens(connection: RoomConnection): Promise<DemoResult> {
  const state = connection.snapshot.state;
  if (!state) return { ok: true };
  if (state.initiative) {
    const ended = await send(connection, { type: "initiative.end" });
    if (!ended.ok) return ended;
  }
  for (const tokenId of demoTokenIds(state)) {
    const deleted = await send(connection, { type: "token.delete", tokenId });
    if (!deleted.ok) return deleted;
  }
  return { ok: true };
}
