import { findDiceRoll, formatAttackParties } from "./dice";
import type { CommittedEvent, DomainEvent } from "./events";
import { describePortalChange } from "./portals";
import { normalizeName } from "./decide";
import { MAX_FOG_REGIONS, MAX_GROUPS, MAX_WALLS, tableOf, type RoomState, type TableState } from "./state";

/**
 * Undo for reversible actions (FR-REC-02, FR-REC-03, ADR 0013).
 *
 * An action is one command's batch of events, grouped by the server-assigned `commandId`.
 * `reduce` keeps a short history of recent undoable actions in `RoomState.undo`. The GM
 * picks one from the activity log, and `decide` turns `history.undo` into its inverse events
 * plus an `ActionUndone`.
 *
 * To make another event type reversible: add it to REVERSIBLE_EVENT_TYPES, give it an
 * inverse in `inverseOf`, a conflict check in `undoConflict`, and a phrase in `describeUndo`.
 */

/** How many undoable actions a room keeps. Older ones can no longer be undone. */
export const UNDO_HISTORY_LIMIT = 20;

export const REVERSIBLE_EVENT_TYPES = [
  "MapSet",
  "TokenMoved",
  "TokenHiddenSet",
  "TokenConditionsSet",
  "TokenAttacksSet",
  "TokenStatsSet",
  "RollRuled",
  "RollDamageApplied",
  "MapNuked",
  "FogAdded",
  "FogRemoved",
  "WallsAdded",
  "WallsRemoved",
  "PortalChanged",
  "WallUpdated",
  "CheckpointRestored",
  "EncounterApplied",
  // KAN-82, ADR 0026.
  "TokenCreated",
  "InitiativeStarted",
  "GroupCreated",
  "GroupRenamed",
  "GroupDeleted",
  "TokensGrouped",
  // ADR 0046: the closing mark of a resolve; the HP and condition changes before it carry the values.
  "AreaEffectResolved",
  "LineOfSightSet", // ADR 0044
  "SightRangeSet",
] as const;

type MapSetEvent = Extract<DomainEvent, { type: "MapSet" }>;
type CompleteMapSet = MapSetEvent & {
  gridChange: NonNullable<MapSetEvent["gridChange"]>;
  tokenChanges: NonNullable<MapSetEvent["tokenChanges"]>;
};
export type ReversibleEvent =
  | Exclude<Extract<DomainEvent, { type: (typeof REVERSIBLE_EVENT_TYPES)[number] }>, MapSetEvent>
  | CompleteMapSet;



export interface UndoEntry {
  /** The action's `commandId` (or `seq:<n>` for an event from before undo existed). */
  commandId: string;
  /** Who performed the action; null for system batches. */
  actorId: string | null;
  /** False once the batch contains any event outside the reversible set. */
  undoable: boolean;
  /** The action's reversible events, in commit order. Empty when not undoable. */
  events: ReversibleEvent[];
  /** Token names as they were when the action happened, for labels and refusals. */
  tokenNames: Record<string, string>;
  /** "Aria → Goblin" for each attack roll the action touched, for labels. */
  rollLabels: Record<string, string>;
}

/** What `reduce` needs to group an event into an action. */
export interface EventMeta {
  /**
   * Groups the event into an action for undo. Absent for player clients, whose events carry no
   * `commandId` (ADR 0013): they pass only `at` and keep no history.
   */
  commandId?: string;
  actorId?: string | null;
  /** The committed ISO timestamp, so `reduce` can stamp it without reading a clock (ADR 0015). */
  at?: string | null;
  /**
   * Committed before undo existed, so its batch boundaries are unknown. Never undoable: undoing
   * one event of an old Apply would restore the roll but not the HP (sync review).
   */
  legacy?: boolean;
}

/** Whether an event type can take part in an undoable action. */
export function isReversible(event: DomainEvent): event is ReversibleEvent {
  if (event.type === "MapSet") return event.gridChange !== undefined && event.tokenChanges !== undefined;
  return (REVERSIBLE_EVENT_TYPES as readonly string[]).includes(event.type);
}

/**
 * Grouping metadata for a committed event. Events from before undo existed have no
 * `commandId`: each is its own action, and none can be undone.
 */
export function eventMeta(committed: CommittedEvent): EventMeta {
  return committed.commandId
    ? { commandId: committed.commandId, actorId: committed.actorId, at: committed.at }
    : { commandId: `seq:${committed.seq}`, actorId: committed.actorId, at: committed.at, legacy: true };
}

/**
 * Adds one event to the undo history. Batches are contiguous, so an event either extends
 * the last entry (same `commandId`) or starts a new one. An entry is created on a batch's
 * first event, so a batch that mixes in any non-reversible event is never undoable, in
 * whichever order its events came. A closed non-undoable entry is dropped when the next
 * batch starts; it only existed to track its own batch.
 *
 * The history bound is applied to closed entries only, when the next batch starts. An undo's
 * own inverse events open an entry that its `ActionUndone` removes again, so trimming while
 * that entry is open would evict an unrelated action (sync review).
 */
export function recordUndo(state: RoomState, event: DomainEvent, meta: EventMeta & { commandId: string }): UndoEntry[] {
  const history = state.undo;
  const last = history.at(-1);
  const reversible = !meta.legacy && isReversible(event);
  if (last && last.commandId === meta.commandId) {
    if (!last.undoable) return history;
    const updated: UndoEntry = reversible && isReversible(event)
      ? { ...last, events: [...last.events, event], ...withLabels(last, state, event) }
      : { ...last, undoable: false, events: [], tokenNames: {}, rollLabels: {} };
    return [...history.slice(0, -1), updated];
  }
  // Every closed entry left can be undone; keep the newest UNDO_HISTORY_LIMIT of them.
  const closed = (last && !canUndo(last) ? history.slice(0, -1) : history).slice(-UNDO_HISTORY_LIMIT);
  const empty = { tokenNames: {}, rollLabels: {} };
  const entry: UndoEntry = reversible && isReversible(event)
    ? { commandId: meta.commandId, actorId: meta.actorId ?? null, undoable: true, events: [event], ...withLabels(empty, state, event) }
    : { commandId: meta.commandId, actorId: meta.actorId ?? null, undoable: false, events: [], ...empty };
  return [...closed, entry];
}

/** Records the name of the token, or the label of the roll, that `event` touches. */
function withLabels(
  labels: Pick<UndoEntry, "tokenNames" | "rollLabels">,
  state: RoomState,
  event: ReversibleEvent,
): Pick<UndoEntry, "tokenNames" | "rollLabels"> {
  const { tokenNames, rollLabels } = labels;
  if (event.type === "MapSet") {
    const names = { ...tokenNames };
    for (const change of event.tokenChanges) {
      const token = state.tokens[change.tokenId];
      if (token) names[token.id] = token.name;
    }
    return { tokenNames: names, rollLabels };
  }

  if (event.type === "TokenCreated") return { tokenNames: { ...tokenNames, [event.token.id]: event.token.name }, rollLabels };
  if (event.type === "TokensGrouped") {
    const names = Object.fromEntries(event.changes.flatMap(({ tokenId }) => {
      const token = state.tokens[tokenId];
      return token ? [[tokenId, token.name]] : [];
    }));
    return { tokenNames: { ...tokenNames, ...names }, rollLabels };
  }
  // Only the labels: `labels` may be the whole open entry, whose `events` must not come back.
  if (!("tokenId" in event) && !("rollId" in event)) return { tokenNames, rollLabels };
  if ("tokenId" in event) {
    const token = state.tokens[event.tokenId];
    return token ? { tokenNames: { ...tokenNames, [token.id]: token.name }, rollLabels } : { tokenNames, rollLabels };
  }
  const roll = findDiceRoll(state.rolls, event.rollId);
  return roll?.attack
    ? { tokenNames, rollLabels: { ...rollLabels, [roll.id]: formatAttackParties(roll.attack) } }
    : { tokenNames, rollLabels };
}

/** The action with this `commandId`, if it is still in the history and can be undone. */
export function undoableAction(history: readonly UndoEntry[], commandId: string): UndoEntry | undefined {
  const entry = history.find((e) => e.commandId === commandId);
  return entry && canUndo(entry) ? entry : undefined;
}

/**
 * Whether a whole action can be undone. HP and AC edits on their own are not undoable: the
 * GM just edits them again. A stats change is undone only as part of an Apply, together
 * with the roll's Applied mark. Decided per action, since an Apply's stats change comes first.
 */
function canUndo(entry: UndoEntry): boolean {
  if (!entry.undoable || entry.events.length === 0) return false;
  // A resolve that changed no token has nothing to put back (ADR 0046).
  if (entry.events.every((e) => e.type === "AreaEffectResolved")) return false;
  const statsEdit = entry.events.some((e) => e.type === "TokenStatsSet");
  return !statsEdit || entry.events.some((e) => e.type === "RollDamageApplied" || e.type === "MapNuked" || e.type === "AreaEffectResolved");
}

/** The compensating events that restore what `event` replaced (invariant 6), in order. */
export function inverseOf(event: ReversibleEvent): DomainEvent[] {
  switch (event.type) {
    case "TokenCreated":
      return [{ type: "TokenDeleted", token: event.token }];
    case "InitiativeStarted":
      return [{
        type: "InitiativeStartUndone",
        initiative: event.previous,
        previous: event.initiative,
        scores: (event.scores ?? []).map((s) => ({ tokenId: s.tokenId, score: s.previous, previous: s.score })),
      }];
    case "GroupCreated":
      return [{ type: "GroupDeleted", group: event.group, members: [] }];
    case "GroupRenamed":
      return [{ type: "GroupRenamed", groupId: event.groupId, name: event.previous, previous: event.name }];
    case "GroupDeleted":
      return [
        { type: "GroupCreated", group: event.group },
        ...(event.members.length > 0
          ? [{ type: "TokensGrouped" as const, groupId: event.group.id, changes: event.members.map((tokenId) => ({ tokenId, previous: null })) }]
          : []),
      ];
    case "TokensGrouped": {
      // One event per group the tokens came from, each putting its tokens back.
      const byPrevious = new Map<string | null, string[]>();
      for (const { tokenId, previous } of event.changes) byPrevious.set(previous, [...(byPrevious.get(previous) ?? []), tokenId]);
      return [...byPrevious].map(([groupId, tokenIds]) => ({
        type: "TokensGrouped" as const,
        groupId,
        changes: tokenIds.map((tokenId) => ({ tokenId, previous: event.groupId })),
      }));
    }
    case "AreaEffectResolved":
      // Undo puts back HP and conditions but never reopens the effect (ADR 0046): another may be
      // open by now, and a player should not get a damage prompt back.
      return [];
    default:
      return [inverseOfOne(event)];
  }
}

type SingleInverse = Exclude<ReversibleEvent, { type: "TokenCreated" | "InitiativeStarted" | "GroupCreated" | "GroupRenamed" | "GroupDeleted" | "TokensGrouped" | "AreaEffectResolved" }>;

/** The single compensating event for the reversible types that need only one. */
function inverseOfOne(event: SingleInverse): DomainEvent {
  switch (event.type) {
    case "MapSet":
      return {
        type: "MapSet",
        map: event.previous,
        previous: event.map,
        gridChange: { grid: event.gridChange.previous, previous: event.gridChange.grid },
        tokenChanges: event.tokenChanges.map((change) => ({ tokenId: change.tokenId, from: change.to, to: change.from })),
        ...(event.wallChange ? { wallChange: { walls: event.wallChange.previous, previous: event.wallChange.walls } } : {}),
        ...(event.fogChange ? { fogChange: { fog: event.fogChange.previous, previous: event.fogChange.fog } } : {}),
      };
    case "TokenMoved":
      return { type: "TokenMoved", tokenId: event.tokenId, from: event.to, to: event.from };
    case "TokenHiddenSet":
      return { type: "TokenHiddenSet", tokenId: event.tokenId, hidden: event.previous, previous: event.hidden };
    case "TokenConditionsSet":
      return { type: "TokenConditionsSet", tokenId: event.tokenId, conditions: event.previous, previous: event.conditions };
    case "TokenAttacksSet":
      return { type: "TokenAttacksSet", tokenId: event.tokenId, attacks: event.previous, previous: event.attacks };
    case "TokenStatsSet":
      return { type: "TokenStatsSet", tokenId: event.tokenId, stats: event.previous, previous: event.stats };
    case "RollRuled":
      return { type: "RollRuled", rollId: event.rollId, verdict: event.previous, previous: event.verdict };
    case "RollDamageApplied":
      return { type: "RollDamageUnapplied", rollId: event.rollId, amount: event.amount };
    case "MapNuked":
      return { type: "MapNukeUndone", amount: event.amount, origin: event.origin, ...(event.animation && { animation: event.animation }) };
    case "FogAdded":
      return { type: "FogRemoved", region: event.region };
    case "FogRemoved":
      return { type: "FogAdded", region: event.region };
    case "WallsAdded":
      return { type: "WallsRemoved", walls: event.walls };
    case "WallsRemoved":
      return { type: "WallsAdded", walls: event.walls };
    case "LineOfSightSet":
      return { type: "LineOfSightSet", from: event.to, to: event.from };
    case "SightRangeSet":
      return { type: "SightRangeSet", from: event.to, to: event.from };
    case "WallUpdated":
      return { type: "WallUpdated", wall: event.previous, previous: event.wall };
    case "PortalChanged":
      return { type: "PortalChanged", wallId: event.wallId, from: event.to, to: event.from };
    case "CheckpointRestored":
      // Puts back the board the restore replaced (ADR 0019).
      return { ...event, restored: event.previous, previous: event.restored };
    case "EncounterApplied":
      // Puts back the board the apply replaced (ADR 0024).
      return { ...event, applied: event.previous, previous: event.applied };
  }
}

/**
 * Why undoing `entry` would clobber a newer change, or null when every value it set is
 * still current. Conditions compare as sets: order carries no meaning.
 */
export function undoConflict(state: RoomState, entry: UndoEntry): string | null {
  // Walls the undo would leave behind: today's, less those the action added, plus those it removed.
  const wallsAfter = Object.keys(state.walls).length + entry.events.reduce((n, e) =>
    e.type === "WallsAdded" ? n - e.walls.filter((w) => state.walls[w.id]).length
    : e.type === "WallsRemoved" ? n + e.walls.length : n, 0);
  if (wallsAfter > MAX_WALLS) return `Can't undo: the room would hold more than ${MAX_WALLS} walls.`;
  // Fog the undo would leave behind, counted the same way, so undoing a swap in a full room still fits.
  const fogAfter = Object.keys(state.fog).length + entry.events.reduce((n, e) =>
    e.type === "FogAdded" ? n - (state.fog[e.region.id] ? 1 : 0)
    : e.type === "FogRemoved" ? n + 1 : n, 0);
  if (fogAfter > MAX_FOG_REGIONS) return `Can't undo: the room would hold more than ${MAX_FOG_REGIONS} fog regions.`;
  for (const event of entry.events) {
    if (event.type === "MapSet") {
      if (!sameValue(state.scene.map, event.map)) return "Can't undo: the map has changed since.";
      if (!sameValue(state.scene.grid, event.gridChange.grid)) return "Can't undo: the grid has changed since.";
      if (event.wallChange && !sameValue(state.walls, Object.fromEntries(event.wallChange.walls.map((w) => [w.id, w])))) return "Can't undo: the walls or portals have changed since.";
      if (event.fogChange && !sameValue(state.fog, Object.fromEntries(event.fogChange.fog.map((f) => [f.id, f])))) return "Can't undo: the fog has changed since.";
      for (const change of event.tokenChanges) {
        const token = state.tokens[change.tokenId];
        const name = token?.name ?? entry.tokenNames[change.tokenId] ?? "That token";
        if (!token) return `Can't undo: ${name} no longer exists.`;
        if (token.position.x !== change.to.x || token.position.y !== change.to.y) return `Can't undo: ${name} has changed since.`;
      }
      continue;
    }

    if (isGroupEvent(event)) {
      const conflict = groupUndoConflict(state, event);
      if (conflict) return conflict;
      continue;
    }
    if (event.type === "TokenCreated") {
      const token = state.tokens[event.token.id];
      if (!token) return `Can't undo: ${event.token.name} no longer exists.`;
      if (!sameValue(token, event.token)) return `Can't undo: ${token.name} has changed since.`;
      continue;
    }
    if (event.type === "InitiativeStarted") {
      if (!sameValue(state.initiative, event.initiative)) return "Can't undo: the turn order has changed since the encounter started.";
      // Starting the same order again with new scores leaves the order equal, so check each saved score too.
      for (const { tokenId, score } of event.scores ?? []) {
        const token = state.tokens[tokenId];
        if (token && (token.initiative ?? null) !== score) return `Can't undo: ${token.name} has changed since.`;
      }
      continue;
    }
    if (event.type === "CheckpointRestored") {
      // A whole-board swap: undo only while the board is still exactly what the restore made it.
      if (!sameValue(tableOf(state), withWalls(event.restored))) return `Can't undo: the board has changed since "${event.name}" was restored.`;
      continue;
    }
    if (event.type === "EncounterApplied") {
      if (!sameValue(tableOf(state), withWalls(event.applied))) return `Can't undo: the board has changed since "${event.name}" was applied.`;
      continue;
    }
    if (event.type === "WallsAdded") {
      if (event.walls.some((w) => !state.walls[w.id])) return "Can't undo: some of those walls have already been removed.";
      if (event.walls.some((w) => !sameValue(state.walls[w.id], w))) return "Can't undo: some of those walls have changed since.";
      continue;
    }
    if (event.type === "WallsRemoved") {
      if (event.walls.some((w) => state.walls[w.id])) return "Can't undo: those walls are already back.";
      continue;
    }
    if (event.type === "WallUpdated") {
      if (!sameValue(state.walls[event.wall.id], event.wall)) return "Can't undo: that wall or portal has changed since.";
      continue;
    }
    if (event.type === "PortalChanged") {
      const wall = state.walls[event.wallId];
      if (!wall) return "Can't undo: that wall no longer exists.";
      const now = wall.portal;
      if (now?.kind !== event.to?.kind || now?.state !== event.to?.state) {
        return `Can't undo: that ${event.to?.kind ?? "wall"} has changed since.`;
      }
      continue;
    }
    if (event.type === "LineOfSightSet") {
      if ((state.scene.lineOfSight ?? false) !== event.to) return "Can't undo: line of sight has changed since.";
      continue;
    }
    if (event.type === "SightRangeSet") {
      if ((state.scene.sightRange ?? null) !== event.to) return "Can't undo: the sight range has changed since.";
      continue;
    }
    // Fog regions are never edited in place, so "still current" is just "still there" (or still gone).
    if (event.type === "FogAdded") {
      if (!state.fog[event.region.id]) return "Can't undo: that fog has already been removed.";
      continue;
    }
    if (event.type === "FogRemoved") {
      if (state.fog[event.region.id]) return "Can't undo: that fog is already back.";
      continue;
    }
    // The blast has no value of its own to compare: the stats changes in the same action are checked.
    // Nor does a resolve's closing mark (ADR 0046).
    if (event.type === "MapNuked" || event.type === "AreaEffectResolved") continue;
    if (!("tokenId" in event)) {
      // Rulings and applications only exist on rolls still in the state window (ADR 0011).
      const roll = findDiceRoll(state.rolls, event.rollId);
      const label = entry.rollLabels[event.rollId] ?? "that roll";
      if (!roll) return `Can't undo: ${label} is no longer in the roll log.`;
      const current = event.type === "RollRuled" ? (roll.verdict ?? null) === event.verdict : roll.damageApplied === true;
      if (!current) return `Can't undo: ${label} has changed since.`;
      continue;
    }
    const token = state.tokens[event.tokenId];
    const name = token?.name ?? entry.tokenNames[event.tokenId] ?? "That token";
    if (!token) return `Can't undo: ${name} no longer exists.`;
    const current =
      event.type === "TokenMoved" ? token.position.x === event.to.x && token.position.y === event.to.y
      : event.type === "TokenHiddenSet" ? token.hidden === event.hidden
      : event.type === "TokenStatsSet" ? sameStats(token.stats, event.stats)
      : event.type === "TokenAttacksSet" ? JSON.stringify(token.attacks ?? []) === JSON.stringify(event.attacks)
      : sameSet(token.conditions, event.conditions);
    if (!current) return `Can't undo: ${name} has changed since.`;
  }
  return null;
}

/** A table as `reduce` applies it: one from before walls existed had none (ADR 0029). */

const withWalls = (table: TableState): TableState => ({ ...table, walls: table.walls ?? {} });

type GroupEvent = Extract<ReversibleEvent, { type: "GroupCreated" | "GroupRenamed" | "GroupDeleted" | "TokensGrouped" }>;



const isGroupEvent = (event: ReversibleEvent): event is GroupEvent =>

  event.type === "GroupCreated" || event.type === "GroupRenamed" || event.type === "GroupDeleted" || event.type === "TokensGrouped";



/**

 * Why undoing a group event would clobber a newer change: a message, or null when it is safe (KAN-82).

 */

function groupUndoConflict(state: RoomState, event: GroupEvent): string | null {

  const label = (id: string) => `"${state.groups[id]?.name ?? "that group"}"`;

  switch (event.type) {

    case "GroupCreated": {

      const group = state.groups[event.group.id];

      if (!group) return "Can't undo: that group has already been deleted.";

      if (group.name !== event.group.name) return `Can't undo: ${label(group.id)} has been renamed since.`;

      // Deleting it now would also ungroup tokens put in it later.

      if (Object.values(state.tokenGroups).includes(group.id)) return `Can't undo: ${label(group.id)} has tokens in it now.`;

      return null;

    }

    case "GroupRenamed": {

      const group = state.groups[event.groupId];

      if (!group) return "Can't undo: that group has been deleted.";

      return group.name === event.name ? null : `Can't undo: ${label(group.id)} has been renamed since.`;

    }

    case "GroupDeleted": {

      if (state.groups[event.group.id]) return `Can't undo: ${label(event.group.id)} is already back.`;

      if (Object.keys(state.groups).length >= MAX_GROUPS) return `Can't undo: the room already has ${MAX_GROUPS} groups.`;

      const clash = Object.values(state.groups).find((g) => normalizeName(g.name) === normalizeName(event.group.name));

      if (clash) return `Can't undo: another group is now named "${clash.name}".`;

      if (event.members.some((id) => state.tokenGroups[id] !== undefined)) return "Can't undo: some of its tokens are in another group now.";

      return null;

    }

    case "TokensGrouped": {

      if (event.changes.some(({ tokenId }) => (state.tokenGroups[tokenId] ?? null) !== event.groupId)) {

        return "Can't undo: some of those tokens have moved to another group since.";

      }

      if (event.changes.some(({ previous }) => previous !== null && !state.groups[previous])) {

        return "Can't undo: a group those tokens came from has been deleted.";

      }

      return null;

    }

  }

}


/** Deep equality for plain data, ignoring object key order. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Order-insensitive equality for condition lists. */
function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

type Stats = RoomState["tokens"][string]["stats"];
/** Whether two stat blocks hold the same HP, Max HP and AC. */
function sameStats(a: Stats, b: Stats) {
  return a.hp === b.hp && a.maxHp === b.maxHp && a.ac === b.ac;
}

/**
 * Phrases for an undoable action: `verb` for the Undo button ("move Goblin"), `noun` for the
 * activity log ("the move of Goblin"). Names are current ones where the token still exists.
 */
export function describeUndo(entry: UndoEntry, tokens: RoomState["tokens"]): { verb: string; noun: string } {
  const nameOf = (id: string) => tokens[id]?.name ?? entry.tokenNames[id] ?? "a token";
  const rollOf = (id: string) => entry.rollLabels[id] ?? "a roll";
  // An Apply is a stats change plus the roll's mark; it reads as the damage, not the HP edit.
  const applied = entry.events.find((e) => e.type === "RollDamageApplied");
  if (applied) {
    return { verb: `damage ${rollOf(applied.rollId)}`, noun: `the ${applied.amount} damage applied from ${rollOf(applied.rollId)}` };
  }
  const nuked = entry.events.find((e) => e.type === "MapNuked");
  if (nuked) return { verb: `nuke (${nuked.amount})`, noun: `the nuke for ${nuked.amount} damage` };
  const resolved = entry.events.find((e) => e.type === "AreaEffectResolved");
  if (resolved) {
    const count = resolved.effect.targets.length;
    const what = `${resolved.effect.label ? `"${resolved.effect.label}"` : "area effect"} (${count} ${count === 1 ? "target" : "targets"})`;
    return { verb: what, noun: `resolving ${what}` };
  }
  const first = entry.events[0];
  if (!first) return { verb: "last action", noun: "an action" };
  if (first.type === "MapSet") {
    const count = first.tokenChanges.length;
    const positions = count ? ` and ${count} token position${count === 1 ? "" : "s"}` : "";
    const action = first.map ? first.previous ? "map replacement" : "map placement" : "map removal";
    return { verb: `${action}${positions}`, noun: `the ${action}${positions}` };
  }
  // Unreachable once `nuked` and `resolved` are handled; narrows `first` for the token cases below.
  if (first.type === "MapNuked") return { verb: "nuke", noun: "the nuke" };
  if (first.type === "AreaEffectResolved") return { verb: "area effect", noun: "resolving an area effect" };
  if (first.type === "CheckpointRestored") {
    return { verb: `restore of "${first.name}"`, noun: `restoring checkpoint "${first.name}"` };
  }
  if (first.type === "EncounterApplied") {
    return { verb: `apply of "${first.name}"`, noun: `applying encounter template "${first.name}"` };
  }
  // Applying walls replaces the old ones, so the action reads as the apply (ADR 0029).
  const wallsAdded = entry.events.find((e) => e.type === "WallsAdded");
  if (wallsAdded) {
    const what = `${wallsAdded.walls.length} ${wallsAdded.walls.length === 1 ? "wall" : "walls"}`;
    return { verb: `apply of ${what}`, noun: `applying ${what}` };
  }
  if (first.type === "WallsAdded" || first.type === "WallsRemoved") {
    const what = `${first.walls.length} ${first.walls.length === 1 ? "wall" : "walls"}`;
    return { verb: `removal of ${what}`, noun: `removing ${what}` };
  }
  if (first.type === "LineOfSightSet") {
    return first.to ? { verb: "turning line of sight on", noun: "turning line of sight on" } : { verb: "turning line of sight off", noun: "turning line of sight off" };
  }
  if (first.type === "SightRangeSet") return { verb: "sight range change", noun: "changing the sight range" };
  if (first.type === "WallUpdated") return { verb: "wall or portal edit", noun: "editing a wall or portal" };
  if (first.type === "PortalChanged") {
    const words = describePortalChange(first.from, first.to);
    return { verb: words.verb, noun: words.gerund };
  }
  if (first.type === "FogAdded" || first.type === "FogRemoved") {
    const what = first.region.shape === "rect" ? "fog rectangle" : "fog polygon";
    return first.type === "FogAdded"
      ? { verb: `add ${what}`, noun: `adding a ${what}` }
      : { verb: `remove ${what}`, noun: `removing a ${what}` };
  }
  if (first.type === "TokenCreated") {
    const name = nameOf(first.token.id);
    return entry.events.length > 1
      ? { verb: `add of ${entry.events.length} tokens`, noun: `adding ${name} and ${entry.events.length - 1} more` }
      : { verb: `add ${name}`, noun: `adding ${name}` };
  }
  if (first.type === "InitiativeStarted") return { verb: "start of initiative", noun: "starting initiative" };
  if (first.type === "GroupCreated") return { verb: `new group "${first.group.name}"`, noun: `creating group "${first.group.name}"` };
  if (first.type === "GroupRenamed") return { verb: `rename of "${first.previous}"`, noun: `renaming group "${first.previous}" to "${first.name}"` };
  if (first.type === "GroupDeleted") return { verb: `delete "${first.group.name}"`, noun: `deleting group "${first.group.name}"` };
  if (first.type === "TokensGrouped") {
    const names = first.changes.map((c) => nameOf(c.tokenId));
    const who = names.length === 1 ? names[0]! : `${names.length} tokens`;
    return first.groupId === null
      ? { verb: `ungroup ${who}`, noun: `taking ${who} out of their group` }
      : { verb: `grouping ${who}`, noun: `grouping ${who}` };
  }
  if (first.type === "RollRuled" || first.type === "RollDamageApplied") {
    return { verb: `ruling on ${rollOf(first.rollId)}`, noun: `the ruling on ${rollOf(first.rollId)}` };
  }
  const name = nameOf(first.tokenId);
  if (entry.events.length > 1) return { verb: `edit ${name}`, noun: `the edit to ${name}` };
  switch (first.type) {
    case "TokenMoved":
      return { verb: `move ${name}`, noun: `the move of ${name}` };
    case "TokenHiddenSet":
      return first.hidden
        ? { verb: `hide ${name}`, noun: `hiding ${name}` }
        : { verb: `reveal ${name}`, noun: `revealing ${name}` };
    case "TokenConditionsSet":
      return { verb: `conditions on ${name}`, noun: `the condition change on ${name}` };
    case "TokenStatsSet":
      return { verb: `stats on ${name}`, noun: `the stats change on ${name}` };
    case "TokenAttacksSet":
      return { verb: `attacks on ${name}`, noun: `the attack change on ${name}` };
  }
}
