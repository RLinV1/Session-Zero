/** The step logic of the guest room's interactive demo (guest-gm-hosting, D8a). Pure, no React. */

export const TUTORIAL_STEPS = ["table", "invite", "map", "terrain", "token", "move", "fog", "roll", "done"] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** A step index, "declined" or "done"; null means the question has not been asked yet. */
export type Progress = number | "declined" | "done" | null;

/** What the GM's room shows. The counters count what happened since the demo began. */
export interface TutorialFacts {
  tokens: number;
  fog: number;
  gmRolls: number;
  moves: number;
  invites: number;
  /** Changes to the grid, map image or walls. */
  mapEdits: number;
  /** Changes to the terrain. */
  terrainEdits: number;
}

const isDone: Record<TutorialStep, (f: TutorialFacts) => boolean> = {
  table: () => false, // moves on with the Start button
  invite: (f) => f.invites > 0,
  map: (f) => f.mapEdits > 0,
  terrain: (f) => f.terrainEdits > 0,
  token: (f) => f.tokens > 0,
  move: (f) => f.moves > 0,
  fog: (f) => f.fog > 0,
  roll: (f) => f.gmRolls > 0,
  done: () => false, // ends with Finish
};

/** The first step at or after `index` whose action is not yet done. */
export function settle(index: number, facts: TutorialFacts): number {
  let i = index;
  while (i < TUTORIAL_STEPS.length - 1 && isDone[TUTORIAL_STEPS[i]!](facts)) i++;
  return i;
}

/** How many tokens known to both snapshots (id to "x,y") are somewhere else now. */
export function countMoves(prev: Record<string, string>, next: Record<string, string>): number {
  return Object.keys(next).filter((id) => prev[id] !== undefined && prev[id] !== next[id]).length;
}

/** 1 when a state key (a JSON string of what the GM edits) is not the one seen before, else 0. */
export const countKeyChange = (prev: string, next: string): number => (prev === next ? 0 : 1);

const storageKey = (roomId: string) => `vtt.tutorial.${roomId}`;

/** Storage can be missing or throw (private windows, blocked data); then the demo still runs for this page load. */
export function loadProgress(roomId: string, storage: () => Storage = () => localStorage): Progress {
  try {
    const raw = storage().getItem(storageKey(roomId));
    if (raw === "declined" || raw === "done") return raw;
    const index = raw === null ? NaN : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < TUTORIAL_STEPS.length ? index : null;
  } catch {
    return null;
  }
}

export function saveProgress(roomId: string, progress: Exclude<Progress, null>, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(storageKey(roomId), String(progress));
  } catch {
    // kept for this page load only, in the component's state
  }
}
