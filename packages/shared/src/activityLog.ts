import { z } from "zod";
import { findDiceRoll, formatAttackParties, type DiceRoll } from "./dice";
import { CommittedEvent, type DomainEvent } from "./events";
import { reduceCommitted } from "./reducer";
import { describePortalChange } from "./portals";
import { describeUndo } from "./undo";
import { emptyRoomState, type Participant, type RoomState } from "./state";
import { filterEventForViewer, filterStateForViewer } from "./visibility";

const Sequence = z.number().int().positive().safe();
const QueryInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(Sequence);

/** New REST contracts; existing event and sync contracts are unchanged. */
export const HistoryQuery = z.object({
  before: QueryInteger.optional(),
  limit: QueryInteger.pipe(z.number().max(100)).default(50),
  player: z.string().trim().max(40).default(""),
}).strict();
export type HistoryQuery = z.infer<typeof HistoryQuery>;

export const ActivityLogEntry = z.object({
  committed: CommittedEvent,
  actorName: z.string(),
  sentence: z.string(),
});
export type ActivityLogEntry = z.infer<typeof ActivityLogEntry>;

export const HistoryResponse = z.object({
  entries: z.array(ActivityLogEntry).max(100),
  nextBefore: Sequence.nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;

/** "rectangle" or "polygon", for fog sentences (FR-GM-17). */
const fogLabel = (shape: "rect" | "polygon") => (shape === "rect" ? "rectangle" : "polygon");

/** "1 wall", "42 walls" (ADR 0029). */
const wallCount = (n: number) => `${n} ${n === 1 ? "wall" : "walls"}`;

/** A board point for a sentence: at most 2 decimals, so float noise like 829.1000000000001 reads 829.1. */
const formatPoint = (p: { x: number; y: number }) => `(${Number(p.x.toFixed(2))}, ${Number(p.y.toFixed(2))})`;

/** Pure, exhaustive sentence formatter. Context must already be viewer-filtered. */
export function formatActivity(event: DomainEvent, actorName: string, before: RoomState): string {
  /** A token's name as it was just before this event. */
  const tokenName = (id: string) => before.tokens[id]?.name ?? "an unknown token";
  /** A participant's name as it was just before this event. */
  const participantName = (id: string) => before.participants[id]?.displayName ?? "an unknown participant";
  /** A roll still in the log just before this event (ADR 0011). */
  const rolledEarlier = (id: string) => findDiceRoll(before.rolls, id);
  /** "Aria → Goblin (1d20+5: 17)", with the names the roll recorded. */
  const rollLabel = (roll: DiceRoll | undefined) =>
    roll?.attack ? `${formatAttackParties(roll.attack)} (${roll.expression}: ${roll.total})` : "an earlier roll";
  /** `"Fireball"`, or a generic name for an unlabelled area effect (ADR 0046). */
  const effectName = (label: string | null) => (label ? `area effect "${label}"` : "an area effect");
  const tokenCount = (n: number) => `${n} ${n === 1 ? "token" : "tokens"}`;
  /** "red 20 ft cone", in the room grid's units; no colour word for a template without one. */
  const unit = before.scene.grid.unitLabel;
  const templateLabel = (t: { shape: string; size: number; width?: number; color?: string }) => {
    const label = `${t.color ? `${t.color} ` : ""}${Number(t.size.toFixed(2))} ${unit} ${t.shape}`;
    // A line says its width when it isn't the usual one cell (KAN-35).
    return t.shape === "line" && t.width !== undefined && t.width !== before.scene.grid.unitsPerCell
      ? `${label}, ${Number(t.width.toFixed(2))} ${unit} wide`
      : label;
  };
  // "an orange 20 ft circle"; sizes keep "a", as they always have.
  const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
  switch (event.type) {
    case "RoomCreated": return `${actorName} created room ${event.name}`;
    case "ParticipantJoined": return `${actorName} joined the room as ${event.participant.role === "gm" ? "GM" : "a player"}`;
    case "ParticipantRevoked": return `${actorName} removed ${event.participant.displayName} from the room`;
    case "ParticipantLeft": return `${event.participant.displayName} left the table`;
    case "ParticipantRenamed": return `${actorName} renamed ${event.previous} to ${event.displayName}`;
    case "ParticipantDiceLookSet":
      // Names are unique in a room, so the actor's name says whose dice these are.
      return actorName === participantName(event.participantId)
        ? `${actorName} ${event.look ? "changed their dice look" : "went back to classic dice"}`
        : `${actorName} put ${participantName(event.participantId)}'s dice back to classic`;
    case "MapSet": {
      const count = event.tokenChanges?.length;
      if (event.map) {
        const positions = count === undefined ? "" : `, adjusting ${count} token${count === 1 ? "" : "s"}`;
        return `${actorName} ${event.previous ? "replaced" : "set"} the map${event.gridChange ? " and grid" : ""}${positions}`;
      }
      const restored = [
        ...(event.gridChange ? ["the grid"] : []),
        ...(count === undefined ? [] : [`${count} token position${count === 1 ? "" : "s"}`]),
      ];
      return `${actorName} removed the map${restored.length ? `, restoring ${restored.join(" and ")}` : ""}`;
    }
    case "GridSet": return `${actorName} updated the grid`;
    case "LineOfSightSet": return `${actorName} turned line of sight ${event.to ? "on" : "off"}`;
    case "SightRangeSet": {
      const n = event.to === null ? null : Math.round(event.to * 10) / 10;
      return `${actorName} set sight range to ${n === null ? "unlimited" : `${n} ${before.scene.grid.unitLabel}`}`;
    }
    case "TokenCreated": return `${actorName} created ${event.token.name}${event.token.hidden ? " (hidden)" : ""}`;
    case "TokenMoved": return `${actorName} moved ${tokenName(event.tokenId)} from ${formatPoint(event.from)} to ${formatPoint(event.to)}`;
    case "TokenAppearanceSet": return `${actorName} updated ${event.previous.name} to ${event.name} (size ${event.size}, rotation ${event.rotation}°)`;
    case "TokenDeleted": return `${actorName} deleted ${event.token.name}`;
    case "TokenOwnersSet": return `${actorName} assigned ${tokenName(event.tokenId)} to ${event.ownerIds.length ? event.ownerIds.map(participantName).join(", ") : "no players"}`;
    case "TokenHiddenSet": return `${actorName} ${event.hidden ? "hid" : "revealed"} ${tokenName(event.tokenId)}`;
    case "TokenStatsSet": return `${actorName} updated ${tokenName(event.tokenId)}'s stats: HP ${event.stats.hp ?? "unset"}/${event.stats.maxHp ?? "unset"}, AC ${event.stats.ac ?? "unset"}`;
    case "TokenImageSet": return `${actorName} ${event.imageUrl ? "changed" : "removed"} ${tokenName(event.tokenId)}'s image`;
    case "TokenConditionsSet": return `${actorName} set ${tokenName(event.tokenId)}'s conditions to ${event.conditions.length ? event.conditions.join(", ") : "none"}`;
    // The log is the GM's alone (room-activity-log), so it may name the attacks (ADR 0034).
    case "TokenAttacksSet": return `${actorName} set ${tokenName(event.tokenId)}'s attacks to ${event.attacks.length ? event.attacks.map((a) => a.name).join(", ") : "none"}`;
    case "InitiativeStarted": return `${actorName} started initiative: ${event.initiative.order.map(tokenName).join(", ") || "no tokens"}`;
    case "InitiativeAdvanced": return `${actorName} advanced to round ${event.initiative.round}, ${tokenName(event.initiative.order[event.initiative.activeIndex] ?? "")}'s turn`;
    case "InitiativeEnded": return `${actorName} ended initiative`;
    case "InitiativeStartUndone": return `${actorName} took back the start of initiative`;
    case "GroupCreated": return `${actorName} created group "${event.group.name}"`;
    case "GroupRenamed": return `${actorName} renamed group "${event.previous}" to "${event.name}"`;
    case "GroupDeleted": return `${actorName} deleted group "${event.group.name}"`;
    case "TokensGrouped": {
      const names = event.changes.map((c) => tokenName(c.tokenId)).join(", ");
      return event.groupId === null
        ? `${actorName} took ${names} out of their group`
        : `${actorName} put ${names} in group "${before.groups[event.groupId]?.name ?? "an unknown group"}"`;
    }
    case "DiceRolled": {
      const { attack, expression, total, visibility } = event.roll;
      const what = attack
        ? `an attack: ${formatAttackParties(attack)}${attack.label ? ` with ${attack.label}` : ""}, ${expression}`
        : expression;
      return `${actorName} rolled ${what}: ${total}${visibility === "gm" ? " (GM only)" : ""}`;
    }
    case "GroupRolled": {
      const { expression, label, entries, visibility } = event.roll;
      const results = entries.map((e) => `${e.name} ${e.total}`).join(", ");
      return `${actorName} rolled ${expression}${label ? ` (${label})` : ""} for ${tokenCount(entries.length)}${results ? `: ${results}` : ""}${visibility === "gm" ? " (GM only)" : ""}`;
    }
    case "AreaEffectStarted": {
      const names = event.effect.targets.map((t) => t.name).join(", ");
      return `${actorName} started ${effectName(event.effect.label)} on ${names || "no visible tokens"} (${event.effect.expression})`;
    }
    case "AreaEffectCalled": {
      const effect = before.areaEffect;
      const what = effectName(effect?.id === event.effectId ? effect.label : null);
      return event.previous === null
        ? `${actorName} called ${participantName(event.participantId)} to roll damage for ${what}`
        : `${actorName} moved the damage call for ${what} from ${participantName(event.previous)} to ${participantName(event.participantId)}`;
    }
    case "AreaEffectDamageRolled": {
      const effect = before.areaEffect;
      const what = effectName(effect?.id === event.effectId ? effect.label : null);
      const { damage } = event;
      return damage.mode === "single"
        ? `${actorName} rolled ${damage.expression} damage for ${what}: ${damage.total}`
        : `${actorName} rolled ${damage.expression} damage for each target of ${what}`;
    }
    case "AreaEffectResolved": return `${actorName} resolved ${effectName(event.effect.label)} on ${tokenCount(event.effect.targets.length)}`;
    case "AreaEffectClosed": return `${actorName} closed ${effectName(event.effect.label)} without applying it`;
    case "RollRuled": {
      const roll = rolledEarlier(event.rollId);
      const gmOnly = roll?.visibility === "gm" ? " (GM only)" : "";
      if (!event.verdict) return `${actorName} cleared the ruling on ${rollLabel(roll)}${gmOnly}`;
      if (event.previous) return `${actorName} changed the ruling on ${rollLabel(roll)} from a ${event.previous} to a ${event.verdict}${gmOnly}`;
      return `${actorName} ruled ${rollLabel(roll)} a ${event.verdict}${gmOnly}`;
    }
    case "RollDamageApplied": {
      const roll = rolledEarlier(event.rollId);
      return `${actorName} applied ${event.amount} damage from ${rollLabel(roll)}${roll?.visibility === "gm" ? " (GM only)" : ""}`;
    }
    case "ReducedEffectsSet": return `${actorName} turned reduced animations ${event.enabled ? "on" : "off"} for the table`;
    case "MapNuked": return `${actorName} detonated a nuke (${event.amount} damage)`;
    case "MapNukeUndone": return `${actorName} took back a nuke (${event.amount} damage)`;
    case "RollDamageUnapplied": {
      const roll = rolledEarlier(event.rollId);
      return `${actorName} took back ${event.amount} damage from ${rollLabel(roll)}${roll?.visibility === "gm" ? " (GM only)" : ""}`;
    }
    case "ChatMessageSent": {
      const { text } = event.message;
      return `${actorName} said: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`;
    }
    case "TemplatePlaced": return `${actorName} placed ${withArticle(templateLabel(event.template))}${event.template.gmOnly ? " (GM only)" : ""}`;
    case "TemplateRemoved": return `${actorName} removed ${withArticle(templateLabel(event.template))}${event.template.gmOnly ? " (GM only)" : ""}`;
    case "FogAdded": return `${actorName} added a fog ${fogLabel(event.region.shape)}`;
    case "FogRemoved": return `${actorName} removed a fog ${fogLabel(event.region.shape)}`;
    case "WallUpdated": return `${actorName} edited a ${event.wall.portal ? "portal" : "wall"}`;
    case "WallsAdded": return `${actorName} added ${wallCount(event.walls.length)}`;
    case "WallsRemoved": return `${actorName} removed ${wallCount(event.walls.length)}`;
    case "PortalChanged": return `${actorName} ${describePortalChange(event.from, event.to).past}`;
    case "CheckpointCreated": return `${actorName} saved checkpoint "${event.checkpoint.name}"`;
    case "CheckpointDeleted": return `${actorName} deleted checkpoint "${event.checkpoint.name}"`;
    case "CheckpointRestored": return `${actorName} restored checkpoint "${event.name}"`;
    case "EncounterApplied": return `${actorName} applied encounter template "${event.name}"`;
    case "ActionUndone": {
      // The undone action is still in the history just before this event (ADR 0013).
      const entry = before.undo.find((e) => e.commandId === event.commandId);
      return entry ? `${actorName} undid ${describeUndo(entry, before.tokens).noun}` : `${actorName} undid an action`;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Read-only GM history projection (FR-REC-01). Replay uses pre-event state, not today's
 * state: deleted tokens and former names remain meaningful. Never enable players by
 * removing this guard: historical visibility needs a separate disclosure policy.
 * Input is the store's ascending committed log. No ephemeral payloads enter it.
 */
export function activityHistory(
  roomId: string,
  events: readonly CommittedEvent[],
  viewer: Participant,
  query: HistoryQuery,
): HistoryResponse {
  if (viewer.role !== "gm") return { entries: [], nextBefore: null };
  const initialNames = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === "ParticipantJoined") initialNames.set(event.participant.id, event.participant.displayName);
  }
  let state = emptyRoomState(roomId);
  const entries: ActivityLogEntry[] = [];
  const search = query.player.toLowerCase();
  for (const committed of events) {
    if (query.before !== undefined && committed.seq >= query.before) break;
    const filtered = filterEventForViewer(committed, state, viewer);
    // Dice looks change how rolls look, not what happened: kept out of the log as noise (ADR 0018).
    if (filtered.kind === "event" && committed.event.type !== "ParticipantDiceLookSet") {
      const visible = filterStateForViewer(state, viewer);
      const actorName = committed.actorId === null ? "System"
        : visible.participants[committed.actorId]?.displayName
          ?? initialNames.get(committed.actorId) ?? "Unknown participant";
      if (actorName.toLowerCase().includes(search)) {
        entries.push({
          committed: filtered.committed,
          actorName,
          sentence: formatActivity(filtered.committed.event, actorName, visible),
        });
      }
    }
    state = reduceCommitted(state, committed);
  }
  entries.reverse();
  const page = entries.slice(0, query.limit);
  return { entries: page, nextBefore: entries.length > query.limit ? page.at(-1)!.committed.seq : null };
}
