import { isGroupRoll, type DiceRoll } from "./dice";
import type { AreaEffect } from "./areaEffects";
import { DEFAULT_PRESET_ID } from "./gamePresets";
import type { CommittedEvent, DomainEvent } from "./events";
import { CHAT_LOG_LIMIT, MAX_CHECKPOINTS, ROLL_LOG_LIMIT, emptyRoomState, type RoomState } from "./state";
import { eventMeta, recordUndo, type EventMeta } from "./undo";
import { fogConcealsSide } from "./visibility";

/**
 * Pure state transition. The ONLY way RoomState changes, on both server and client.
 * Must stay deterministic: no I/O, no clocks, no randomness.
 *
 * Throws if an event references something that doesn't exist — that means the event
 * stream is corrupt or out of order, and the caller must resynchronize.
 *
 * With `meta` (the event's action grouping), it also keeps the undo history (ADR 0013).
 * Without it, state changes the same way and the history is left alone.
 */
export function reduce(state: RoomState, event: DomainEvent, meta?: EventMeta): RoomState {
  const next = concealFoggedSides(apply(state, event, meta?.at ?? null), event);
  if (event.type === "ActionUndone") {
    // Drops the undone action, and the entry this undo's own inverse events just opened,
    // so an undo is never itself undoable (no redo).
    const undo = state.undo.filter((e) => e.commandId !== event.commandId && e.commandId !== meta?.commandId);
    return { ...next, undo };
  }
  // `meta` may carry only the commit time (players get no `commandId`); then there is no history to keep.
  if (meta?.commandId === undefined) return next;
  // A restore replaces the whole board, so board edits from before it can no longer be undone:
  // their "still current" check could pass by coincidence and undo across the restore. Only
  // rulings, which live on rolls rather than the board, stay (ADR 0019).
  const history = event.type === "CheckpointRestored" || event.type === "EncounterApplied"
    ? { ...state, undo: state.undo.filter((e) => e.events.length > 0 && e.events.every((ev) => ev.type === "RollRuled")) }
    : event.type === "MapSet" && event.map?.url !== event.previous?.url
      ? { ...state, undo: state.undo.filter((e) => !e.events.some((ev) => ev.type === "WallsAdded" || ev.type === "WallsRemoved" || ev.type === "PortalChanged" || ev.type === "WallUpdated")) }
      : state;
  return { ...next, undo: recordUndo(history, event, { ...meta, commandId: meta.commandId }) };
}

/** `reduce` for a committed event, grouping it into its action for undo. */
export function reduceCommitted(state: RoomState, committed: CommittedEvent): RoomState {
  return reduce(state, committed.event, eventMeta(committed));
}

/**
 * The room as it was right after event `seq`, folded from its log exactly as a room load does
 * (ADR 0019). `events` must be the room's log in order; later events are ignored.
 */
export function replayTo(roomId: string, events: readonly CommittedEvent[], seq: number): RoomState {
  let state = emptyRoomState(roomId);
  for (const committed of events) {
    if (committed.seq > seq) break;
    state = reduceCommitted(state, committed);
  }
  return state;
}

/**
 * `reduce` for an event as a client receives it. The GM's events carry `commandId` and keep the
 * undo history in step with the server's; a player's carry none, so they get only the committed
 * time (chat, ADR 0015) and keep no history (ADR 0013).
 */
export function reduceReceived(state: RoomState, committed: CommittedEvent): RoomState {
  return committed.commandId ? reduceCommitted(state, committed) : reduce(state, committed.event, { at: committed.at });
}

/** The state change for one event, without the undo history (`reduce` adds that). */
function apply(state: RoomState, event: DomainEvent, at: string | null): RoomState {
  switch (event.type) {
    case "RoomCreated":
      return { ...state, name: event.name, preset: event.preset ?? DEFAULT_PRESET_ID };

    case "ParticipantJoined":
      return {
        ...state,
        participants: { ...state.participants, [event.participant.id]: event.participant },
      };

    case "ParticipantRenamed": {
      const p = required(state.participants[event.participantId], event);
      return {
        ...state,
        participants: {
          ...state.participants,
          [p.id]: { ...p, displayName: event.displayName },
        },
      };
    }

    case "ParticipantDiceLookSet": {
      const p = required(state.participants[event.participantId], event);
      return { ...state, participants: { ...state.participants, [p.id]: { ...p, diceLook: event.look } } };
    }

    case "ParticipantLeft": {
      const p = required(state.participants[event.participant.id], event);
      return { ...state, participants: { ...state.participants, [p.id]: { ...p, left: true } } };
    }

    case "ParticipantRevoked": {
      const p = required(state.participants[event.participant.id], event);
      // Only the flag. Tokens keep naming them until the GM resolves each one (ADR 0006).
      return { ...state, participants: { ...state.participants, [p.id]: { ...p, revoked: true } } };
    }

    case "MapSet": {
      const tokens = { ...state.tokens };
      for (const change of event.tokenChanges ?? []) {
        const token = required(tokens[change.tokenId], event);
        tokens[token.id] = { ...token, position: change.to };
      }
      return { ...state, scene: { ...state.scene, map: event.map, grid: event.gridChange?.grid ?? state.scene.grid },
        ...(event.wallChange ? { walls: Object.fromEntries(event.wallChange.walls.map((w) => [w.id, w])) } : {}),
        ...(event.fogChange ? { fog: Object.fromEntries(event.fogChange.fog.map((f) => [f.id, f])) } : {}), tokens };
    }

    case "GridSet":
      return { ...state, scene: { ...state.scene, grid: event.grid } };

    case "LineOfSightSet":
      return { ...state, scene: { ...state.scene, lineOfSight: event.to } };

    case "SightRangeSet": {
      const { sightRange: _old, ...scene } = state.scene;
      return { ...state, scene: event.to === null ? scene : { ...scene, sightRange: event.to } };
    }

    case "TokenCreated":
      return { ...state, tokens: { ...state.tokens, [event.token.id]: event.token } };

    case "TokenMoved": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, position: event.to } } };
    }

    case "TokenAppearanceSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, name: event.name, size: event.size, rotation: event.rotation } } };
    }

    case "TokenDeleted": {
      required(state.tokens[event.token.id], event);
      const { [event.token.id]: _removed, ...rest } = state.tokens;
      return { ...state, tokens: rest };
    }

    case "TokenOwnersSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, ownerIds: event.ownerIds } } };
    }

    case "TokenHiddenSet": {
      const t = required(state.tokens[event.tokenId], event);
      const tokens = { ...state.tokens, [t.id]: { ...t, hidden: event.hidden } };
      if (!event.hidden) return { ...state, tokens };
      return { ...state, tokens, rolls: concealInRolls(state.rolls, t.id), areaEffect: concealInEffect(state.areaEffect ?? null, [t.id]) };
    }

    case "TokenStatsSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, stats: event.stats } } };
    }

    case "TokenImageSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, imageUrl: event.imageUrl, assetId: event.assetId ?? null } } };
    }

    case "TokenConditionsSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, conditions: event.conditions } } };
    }

    case "TokenAttacksSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, attacks: event.attacks } } };
    }

    case "InitiativeStarted": {
      // Each score is saved on its token, so it outlives the encounter.
      const scores = event.scores ?? [];
      const tokens = { ...state.tokens };
      for (const { tokenId, score } of scores) {
        const token = tokens[tokenId];
        if (token) tokens[tokenId] = { ...token, initiative: score };
      }
      return { ...state, initiative: event.initiative, tokens: scores.length > 0 ? tokens : state.tokens };
    }

    case "InitiativeAdvanced":
      return { ...state, initiative: event.initiative };

    case "InitiativeEnded":
      return { ...state, initiative: null };

    case "InitiativeStartUndone": {
      // Back to the order and saved scores the start replaced (KAN-82).
      const tokens = { ...state.tokens };
      for (const { tokenId, score } of event.scores) {
        const token = tokens[tokenId];
        if (token) tokens[tokenId] = { ...token, initiative: score };
      }
      return { ...state, initiative: event.initiative, tokens: event.scores.length > 0 ? tokens : state.tokens };
    }

    case "GroupCreated":
      return { ...state, groups: { ...state.groups, [event.group.id]: event.group } };

    case "GroupRenamed": {
      const group = required(state.groups[event.groupId], event);
      return { ...state, groups: { ...state.groups, [group.id]: { ...group, name: event.name } } };
    }

    case "GroupDeleted": {
      // Its tokens stay on the board, ungrouped (KAN-82).
      const { [event.group.id]: _removed, ...groups } = state.groups;
      const tokenGroups = Object.fromEntries(Object.entries(state.tokenGroups).filter(([, g]) => g !== event.group.id));
      return { ...state, groups, tokenGroups };
    }

    case "TokensGrouped": {
      const tokenGroups = { ...state.tokenGroups };
      for (const { tokenId } of event.changes) {
        if (event.groupId === null) delete tokenGroups[tokenId];
        else tokenGroups[tokenId] = event.groupId;
      }
      return { ...state, tokenGroups };
    }

    case "DiceRolled": {
      // Stored events are loaded without parsing, so an attack roll from before ADR 0011 arrives
      // with no `kind`; the schema's default only applies on parse. Fill it in here instead.
      const roll = event.roll.attack && !event.roll.attack.kind
        ? { ...event.roll, attack: { ...event.roll.attack, kind: "toHit" as const } }
        : event.roll;
      // Newest last, oldest dropped. The full history stays in the event log (FR-REC-01);
      // state keeps only what the roll panel shows.
      return { ...state, rolls: [...state.rolls, roll].slice(-ROLL_LOG_LIMIT) };
    }

    case "GroupRolled":
      // One slot in the log however many tokens it names (ADR 0046).
      return { ...state, rolls: [...state.rolls, event.roll].slice(-ROLL_LOG_LIMIT) };

    case "AreaEffectStarted":
      return { ...state, areaEffect: event.effect };

    case "AreaEffectCalled": {
      const effect = openEffect(state, event.effectId, event);
      return { ...state, areaEffect: { ...effect, call: { participantId: event.participantId } } };
    }

    case "AreaEffectDamageRolled": {
      const effect = openEffect(state, event.effectId, event);
      return { ...state, areaEffect: { ...effect, damage: event.damage } };
    }

    case "AreaEffectResolved":
    case "AreaEffectClosed":
      openEffect(state, event.effect.id, event);
      return { ...state, areaEffect: null };

    // A roll that has left the window (or a player's copy never had) is simply not there to
    // update; `decide` only rules on rolls it can see, so this stays safe on replay (ADR 0011).
    case "RollRuled":
      return updateRoll(state, event.rollId, (roll) => {
        const { verdict: _old, ...rest } = roll;
        return event.verdict ? { ...rest, verdict: event.verdict } : rest;
      });

    case "RollDamageApplied":
      return updateRoll(state, event.rollId, (roll) => ({ ...roll, damageApplied: true }));

    case "RollDamageUnapplied":
      return updateRoll(state, event.rollId, (roll) => {
        const { damageApplied: _applied, ...rest } = roll;
        return rest;
      });

    // Newest last, oldest dropped; the full history stays in the event log. The time comes from
    // the commit metadata because `reduce` cannot read a clock (ADR 0015).
    case "ChatMessageSent":
      return { ...state, chat: [...state.chat, { ...event.message, at }].slice(-CHAT_LOG_LIMIT) };

    case "TemplatePlaced":
      return { ...state, templates: { ...state.templates, [event.template.id]: event.template } };

    case "TemplateRemoved": {
      required(state.templates[event.template.id], event);
      const { [event.template.id]: _removed, ...rest } = state.templates;
      return { ...state, templates: rest };
    }

    case "CheckpointCreated":
      return { ...state, checkpoints: [...state.checkpoints, event.checkpoint].slice(-MAX_CHECKPOINTS) };

    case "CheckpointDeleted":
      required(state.checkpoints.find((c) => c.id === event.checkpoint.id), event);
      return { ...state, checkpoints: state.checkpoints.filter((c) => c.id !== event.checkpoint.id) };

    case "CheckpointRestored":
      // Only the board changes: participants, rolls, chat and history stay (ADR 0019). A table
      // from before walls existed had none (ADR 0029).
      return { ...state, ...event.restored, walls: event.restored.walls ?? {} };

    case "EncounterApplied":
      // Only the board changes, exactly as a checkpoint restore (ADR 0024).
      return { ...state, ...event.applied, walls: event.applied.walls ?? {} };

    case "FogAdded":
      return { ...state, fog: { ...state.fog, [event.region.id]: event.region } };

    case "FogRemoved": {
      required(state.fog[event.region.id], event);
      const { [event.region.id]: _removed, ...rest } = state.fog;
      return { ...state, fog: rest };
    }

    case "WallUpdated":
      required(state.walls[event.wall.id], event);
      return { ...state, walls: { ...state.walls, [event.wall.id]: event.wall } };

    case "WallsAdded": {
      const walls = { ...state.walls };
      for (const wall of event.walls) walls[wall.id] = wall;
      return { ...state, walls };
    }

    case "WallsRemoved": {
      const walls = { ...state.walls };
      for (const wall of event.walls) {
        required(walls[wall.id], event);
        delete walls[wall.id];
      }
      return { ...state, walls };
    }

    case "PortalChanged": {
      const wall = required(state.walls[event.wallId], event);
      const { portal: _previous, ...plain } = wall;
      return { ...state, walls: { ...state.walls, [wall.id]: event.to ? { ...plain, portal: event.to } : plain } };
    }

    // Its compensating events already restored the values; `reduce` updates the history.
    case "ActionUndone":
      return state;

    // The HP changes are the `TokenStatsSet`s around it; the blast itself is only drawn (ADR 0038).
    case "MapNuked":
    case "MapNukeUndone":
      return state;

    case "ReducedEffectsSet":
      return { ...state, reducedEffects: event.enabled };

    default:
      return assertNever(event);
  }
}

export function reduceAll(state: RoomState, events: Iterable<DomainEvent>): RoomState {
  let s = state;
  for (const e of events) s = reduce(s, e);
  return s;
}

function required<T>(value: T | undefined, event: DomainEvent): T {
  if (value === undefined) {
    throw new Error(`Event ${event.type} references a missing entity`);
  }
  return value;
}

function updateRoll(state: RoomState, rollId: string, update: (roll: DiceRoll) => DiceRoll): RoomState {
  if (!state.rolls.some((r) => r.id === rollId && !isGroupRoll(r))) return state;
  return { ...state, rolls: state.rolls.map((r) => (r.id === rollId && !isGroupRoll(r) ? update(r) : r)) };
}

/** The open area effect an event names; anything else means the stream is corrupt (ADR 0046). */
function openEffect(state: RoomState, effectId: string, event: DomainEvent): AreaEffect {
  const effect = state.areaEffect ?? null;
  if (!effect || effect.id !== effectId) throw new Error(`Event ${event.type} references a missing entity`);
  return effect;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

/**
 * After a change that can put a token under fog, marks every unowned fogged token hidden on the
 * attack rolls that name it, so a later delete, reveal or rename never brings back a side players
 * saw as Unknown (ADR 0016). Same permanence as `concealInRolls` for hidden tokens.
 */
function concealFoggedSides(state: RoomState, event: DomainEvent): RoomState {
  const tokenIds =
    event.type === "FogAdded" ? Object.keys(state.tokens)
    : event.type === "MapSet" ? (event.tokenChanges ?? []).map((change) => change.tokenId)
    : event.type === "TokenMoved" || event.type === "TokenOwnersSet" ? [event.tokenId]
    : [];
  let rolls = state.rolls;
  for (const id of tokenIds) {
    const token = state.tokens[id];
    if (token && fogConcealsSide(state, token)) rolls = concealInRolls(rolls, id);
  }
  const areaEffect = concealInEffect(state.areaEffect ?? null, tokenIds.filter((id) => {
    const token = state.tokens[id];
    return token && fogConcealsSide(state, token);
  }));
  if (rolls === state.rolls && areaEffect === (state.areaEffect ?? null)) return state;
  return { ...state, rolls, areaEffect };
}

/** Marks tokens hidden on the open area effect's targets, for good, as `concealInRolls` does (ADR 0046). */
function concealInEffect(effect: AreaEffect | null, tokenIds: readonly string[]): AreaEffect | null {
  if (!effect || !effect.targets.some((t) => !t.hidden && tokenIds.includes(t.tokenId))) return effect;
  return { ...effect, targets: effect.targets.map((t) => (tokenIds.includes(t.tokenId) ? { ...t, hidden: true } : t)) };
}

/**
 * Marks a token hidden on every attack roll that names it (ADR 0010). Once hidden, a roll's
 * side stays concealed from players for good: a later reveal, rename or delete must not bring
 * back a name or id they never saw, or tell them the hidden token is gone.
 */
function concealInRolls(rolls: RoomState["rolls"], tokenId: string): RoomState["rolls"] {
  const conceal = <S extends { tokenId: string; hidden: boolean } | null>(side: S): S =>
    side && side.tokenId === tokenId && !side.hidden ? { ...side, hidden: true } : side;
  let changed = false;
  const next = rolls.map((roll) => {
    if (isGroupRoll(roll)) {
      // A group roll's entries are concealed the same way, for good (ADR 0046).
      if (!roll.entries.some((e) => e.tokenId === tokenId && !e.hidden)) return roll;
      changed = true;
      return { ...roll, entries: roll.entries.map((e) => conceal(e)) };
    }
    if (!roll.attack) return roll;
    const actor = conceal(roll.attack.actor);
    const target = conceal(roll.attack.target);
    if (actor === roll.attack.actor && target === roll.attack.target) return roll;
    changed = true;
    return { ...roll, attack: { ...roll.attack, actor, target } };
  });
  return changed ? next : rolls;
}
