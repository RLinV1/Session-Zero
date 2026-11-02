import { z } from "zod";
import { formatActivity } from "./activityLog";
import { LoggedRoll } from "./dice";
import { AreaEffect } from "./areaEffects";
import { CommittedEvent, type DomainEvent } from "./events";
import { reduceCommitted, reduceReceived } from "./reducer";
import { emptyRoomState, TableState, tableOf, type Participant, type RoomState } from "./state";
import { filterEventForViewer, filterStateForViewer } from "./visibility";

/**
 * Encounter replay for late joiners (FR-PL-07, ADR 0025).
 *
 * The server folds the room's log and filters every step for the viewer with the same
 * `filterEventForViewer` / `filterStateForViewer` live sync uses, so a replay shows exactly
 * what the viewer would have seen had they watched from the start, and nothing more. The
 * client folds the frames locally; replaying never sends a command.
 */

/** Most steps one replay carries after its point; past this, pick a later point. */
export const MAX_REPLAY_FRAMES = 2000;

/**
 * Where a replay can start. Ids are `start`, `e<seq>` (an encounter start) or `c<n>` (the n-th
 * checkpoint): never a checkpoint's own id, which players must not receive (ADR 0019).
 */
export const ReplayPoint = z.object({
  id: z.string().regex(/^(start|e\d+|c\d+)$/),
  kind: z.enum(["start", "encounter", "checkpoint"]),
  label: z.string().min(1),
  /** The replay starts from the table as it was right after this seq. */
  seq: z.number().int().min(0),
  /** When the point was reached (ISO-8601). */
  at: z.string(),
});
export type ReplayPoint = z.infer<typeof ReplayPoint>;

export const ReplayPointsResponse = z.object({ points: z.array(ReplayPoint) });
export type ReplayPointsResponse = z.infer<typeof ReplayPointsResponse>;

/**
 * One step. `event`: a change the viewer may see, filtered as live sync would deliver it.
 * `table`: a change live sync answers with a fresh snapshot (a reveal, fog, the turn order);
 * only the filtered table and dice log are sent, which is all such a change can alter.
 */
export const ReplayFrame = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), committed: CommittedEvent, sentence: z.string() }),
  z.object({
    kind: z.literal("table"),
    seq: z.number().int().positive(),
    at: z.string(),
    table: TableState,
    rolls: z.array(LoggedRoll),
    /** The viewer's copy of the open area effect (ADR 0046); absent on frames from before it. */
    areaEffect: AreaEffect.nullable().optional(),
    sentence: z.string(),
  }),
]);
export type ReplayFrame = z.infer<typeof ReplayFrame>;

export const ReplayResponse = z.object({
  point: ReplayPoint,
  /** The table at the point, filtered for the viewer. A full room state; not re-validated field by field. */
  start: z.custom<RoomState>((v) => typeof v === "object" && v !== null && "tokens" in v && "scene" in v),
  frames: z.array(ReplayFrame).max(MAX_REPLAY_FRAMES),
  /** More steps followed than the replay carries. */
  truncated: z.boolean(),
});
export type ReplayResponse = z.infer<typeof ReplayResponse>;

/**
 * The replay points one viewer may start from, oldest first: the room's start, each encounter
 * start (just before it, so the start is the first step) and each checkpoint. A player sees a
 * checkpoint only as "Checkpoint N"; its name and id stay with the GM (ADR 0019, ADR 0025).
 */
export function replayPoints(events: readonly CommittedEvent[], viewer: Participant): ReplayPoint[] {
  const points: ReplayPoint[] = [];
  let encounters = 0;
  let checkpoints = 0;
  for (const { seq, at, event } of events) {
    if (event.type === "RoomCreated" && points.length === 0) {
      points.push({ id: "start", kind: "start", label: "Start of the room", seq, at });
    } else if (event.type === "InitiativeStarted") {
      encounters += 1;
      points.push({ id: `e${seq}`, kind: "encounter", label: `Encounter ${encounters} starts`, seq: seq - 1, at });
    } else if (event.type === "CheckpointCreated") {
      checkpoints += 1;
      const label = viewer.role === "gm" ? event.checkpoint.name : `Checkpoint ${checkpoints}`;
      points.push({ id: `c${checkpoints}`, kind: "checkpoint", label, seq: event.checkpoint.seq, at });
    }
  }
  return points;
}

/**
 * The replay from the point at `pointSeq` for `viewer`, up to the end of `events`. `events` must be
 * the room's whole log in order. Changes the viewer could not see are left out entirely.
 */
export function replayFrom(
  roomId: string,
  events: readonly CommittedEvent[],
  viewer: Participant,
  point: ReplayPoint,
  limit = MAX_REPLAY_FRAMES,
): ReplayResponse {
  // A joiner is not yet a participant before their own join: name them from it, as the activity log does.
  const joinedNames = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === "ParticipantJoined") joinedNames.set(event.participant.id, event.participant.displayName);
  }
  let state = emptyRoomState(roomId);
  let index = 0;
  for (; index < events.length && events[index]!.seq <= point.seq; index++) state = reduceCommitted(state, events[index]!);
  const start = filterStateForViewer(state, viewer);
  const frames: ReplayFrame[] = [];
  let truncated = false;
  for (; index < events.length; index++) {
    const committed = events[index]!;
    const filtered = filterEventForViewer(committed, state, viewer);
    const next = reduceCommitted(state, committed);
    if (filtered.kind !== "redacted") {
      if (frames.length === limit) {
        truncated = true;
        break;
      }
      // Participants are public (filterStateForViewer keeps them), so the name needs no filtered copy.
      const actorName = committed.actorId === null ? "System"
        : state.participants[committed.actorId]?.displayName ?? joinedNames.get(committed.actorId) ?? "Someone";
      if (filtered.kind === "event") {
        const visibleBefore = filterStateForViewer(state, viewer);
        frames.push({ kind: "event", committed: filtered.committed, sentence: formatActivity(filtered.committed.event, actorName, visibleBefore) });
      } else {
        const visibleAfter = filterStateForViewer(next, viewer);
        frames.push({
          kind: "table",
          seq: committed.seq,
          at: committed.at,
          table: tableOf(visibleAfter),
          rolls: visibleAfter.rolls,
          areaEffect: visibleAfter.areaEffect ?? null,
          sentence: neutralSentence(committed.event, actorName),
        });
      }
    }
    state = next;
  }
  return { point, start, frames, truncated };
}

/**
 * A description for a step the viewer gets as a snapshot. It names only the actor (public) and
 * the kind of change, never the event's own fields: those may name hidden tokens.
 */
function neutralSentence(event: DomainEvent, actorName: string): string {
  switch (event.type) {
    case "InitiativeStarted": return `${actorName} started initiative`;
    case "InitiativeAdvanced": return `${actorName} advanced the turn`;
    case "FogAdded":
    case "FogRemoved": return `${actorName} changed the fog`;
    case "DiceRolled":
    case "GroupRolled": return `${actorName} rolled dice`;
    case "CheckpointRestored": return `${actorName} restored the board to a checkpoint`;
    case "EncounterApplied": return `${actorName} set up an encounter`;
    case "TokenMoved":
    case "TokenOwnersSet":
    case "TokenHiddenSet":
    case "TokenCreated":
    case "TokenDeleted": return `${actorName} changed what is on the board`;
    default: return "The board changed";
  }
}

/** The client's fold of one frame onto the replayed state. */
export function applyReplayFrame(state: RoomState, frame: ReplayFrame): RoomState {
  if (frame.kind === "event") return reduceReceived(state, frame.committed);
  return { ...state, ...frame.table, rolls: frame.rolls, ...(frame.areaEffect !== undefined && { areaEffect: frame.areaEffect }) };
}

/** Every replayed state, `[start, after frame 1, …]`, so stepping back is a lookup. */
export function replayStates(replay: Pick<ReplayResponse, "start" | "frames">): RoomState[] {
  const states = [replay.start];
  for (const frame of replay.frames) states.push(applyReplayFrame(states.at(-1)!, frame));
  return states;
}
