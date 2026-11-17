/** The step logic of the guest room's interactive demo (guest-gm-hosting, D8a). Pure, no React. */

export const TUTORIAL_STEPS = ["table", "invite", "map", "grid", "walls", "fog", "sight", "terrain", "token", "move", "roll", "encounter", "attack", "ruling", "damage", "done"] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];
export const EDITOR_TUTORIAL_STEPS: ReadonlySet<string> = new Set(["grid", "walls", "fog", "sight", "terrain"]);
/** The combat walkthrough. The GM can move past one whose action cannot be repeated (a reload forgets earlier rolls). */
export const COMBAT_TUTORIAL_STEPS: ReadonlySet<string> = new Set(["encounter", "attack", "ruling", "damage"]);

/** A step index, "declined" or "done"; null means the question has not been asked yet. */
export type Progress = number | "declined" | "done" | null;

/** What the GM's room shows. The counters count what happened since the demo began. */
export interface TutorialFacts {
  tokens: number;
  fog: number;
  gmRolls: number;
  moves: number;
  invites: number;
  /** Changes to the map image. Each editor section is counted separately. */
  mapEdits: number;
  gridEdits: number;
  wallEdits: number;
  sightEdits: number;
  /** Changes to the terrain. */
  terrainEdits: number;
  /** 1 while an encounter is running. */
  encounters: number;
  /** To-hit rolls, rulings on them and applied damage rolls made since the demo began (see `rollMarks`). */
  attackRolls: number;
  rulings: number;
  damageApplied: number;
}

type MarkedRoll = { id: string; attack?: { kind: "toHit" | "damage" } | undefined; verdict?: string | undefined; damageApplied?: boolean | undefined };

/** What the roll log shows of the combat lessons, as keys: `attack:id`, `ruling:id`, `damage:id`. */
export function rollMarks(rolls: readonly MarkedRoll[]): Set<string> {
  const marks = new Set<string>();
  for (const roll of rolls) {
    if (roll.attack?.kind === "toHit") {
      marks.add(`attack:${roll.id}`);
      if (roll.verdict) marks.add(`ruling:${roll.id}`);
    } else if (roll.attack?.kind === "damage" && roll.damageApplied) marks.add(`damage:${roll.id}`);
  }
  return marks;
}

/** How many marks of one kind are not in the baseline taken when the demo began. */
export const countMarks = (now: ReadonlySet<string>, base: ReadonlySet<string>, kind: "attack" | "ruling" | "damage"): number =>
  [...now].filter((mark) => mark.startsWith(`${kind}:`) && !base.has(mark)).length;

const isDone: Record<TutorialStep, (f: TutorialFacts) => boolean> = {
  table: () => false, // moves on with the Start button
  invite: (f) => f.invites > 0,
  map: (f) => f.mapEdits > 0,
  grid: (f) => f.gridEdits > 0,
  walls: (f) => f.wallEdits > 0,
  sight: (f) => f.sightEdits > 0,
  terrain: (f) => f.terrainEdits > 0,
  token: (f) => f.tokens > 0,
  move: (f) => f.moves > 0,
  fog: (f) => f.fog > 0,
  encounter: (f) => f.encounters > 0,
  attack: (f) => f.attackRolls > 0,
  ruling: (f) => f.rulings > 0,
  damage: (f) => f.damageApplied > 0,
  roll: (f) => f.gmRolls > 0,
  done: () => false, // ends with Finish
};

/** Whether a step's action has been done (by the guest, or by Next doing it for them). */
export const stepDone = (step: TutorialStep, facts: TutorialFacts): boolean => isDone[step](facts);

/** Steps whose action Next performs when it has not been done yet, so a step is never skipped half-done. */
export const AUTO_TUTORIAL_STEPS: ReadonlySet<string> = new Set(["token", "move", "roll", "encounter", "attack", "ruling", "damage"]);

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
const LEGACY_STEPS = ["table", "invite", "map", "terrain", "token", "move", "fog", "roll", "done"] as const;

/** Storage can be missing or throw (private windows, blocked data); then the demo still runs for this page load. */
export function loadProgress(roomId: string, storage: () => Storage = () => localStorage): Progress {
  try {
    const raw = storage().getItem(storageKey(roomId));
    if (raw === "declined" || raw === "done") return raw;
    const name = raw?.startsWith("step:") ? raw.slice(5) : raw;
    const named = TUTORIAL_STEPS.findIndex((step) => step === name);
    if (named >= 0) return named;
    const index = raw === null ? NaN : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < LEGACY_STEPS.length ? TUTORIAL_STEPS.indexOf(LEGACY_STEPS[index]!) : null;
  } catch {
    return null;
  }
}

export function saveProgress(roomId: string, progress: Exclude<Progress, null>, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(storageKey(roomId), typeof progress === "number" ? `step:${TUTORIAL_STEPS[progress]!}` : progress);
  } catch {
    // kept for this page load only, in the component's state
  }
}
