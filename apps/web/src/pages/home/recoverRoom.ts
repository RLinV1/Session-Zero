import {
  activityHistory,
  decide,
  describeUndo,
  emptyRoomState,
  reduceCommitted,
  undoableAction,
  type Command,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type Point,
  type RoomState,
  type Token,
} from "@vtt/shared";
import { squareCenter } from "./sightDemo";

/**
 * The recovery demo's room (gm-home: "Undo runs the table's undo"). Its log is a list of committed
 * events like a room's; its state is that log folded by `reduceCommitted`, so `reduce` keeps the
 * undo history exactly as it does at the table. The visitor acts as the GM: a move is `token.move`
 * through `decide`, Undo is `history.undo` through `decide`, and the log's lines are `formatActivity`'s.
 */
export const RECOVER_GM: Participant = { id: "gm", role: "gm", displayName: "GM" };
const ROOM_ID = "home-recover";

export interface DemoRoom {
  events: CommittedEvent[];
  state: RoomState;
}

const token = (id: string, name: string, color: string, at: { col: number; row: number }, image?: string): Token => ({
  id,
  name,
  position: squareCenter(at.col, at.row),
  size: 1,
  rotation: 0,
  color,
  imageUrl: image ?? null,
  ownerIds: [],
  hidden: false,
  stats: { hp: null, maxHp: null, ac: null },
  conditions: [],
});

/** The captain and the bosun on deck, a cutthroat by the far rail. */
export const RECOVER_TOKENS: Token[] = [
  token("sela", "Sela", "#2a9d8f", { col: 3, row: 7 }, "/img/home/tokens/ship-sela.webp"),
  token("dunn", "Dunn", "#e76f51", { col: 8, row: 4 }, "/img/home/tokens/ship-dunn.webp"),
  token("cutthroat", "Cutthroat", "#c0392b", { col: 13, row: 7 }, "/img/home/tokens/ship-cutthroat.webp"),
];

/** The room's setup: the GM and the tokens. The log shown starts after it. */
export const SETUP_SEQ = 1 + RECOVER_TOKENS.length;

/** Commit times for the log. The demo never shows them, so a fixed clock keeps it repeatable. */
const at = (seq: number) => new Date(Date.UTC(2026, 9, 31, 19, 0, seq)).toISOString();

/** Commits one action's events, as the server does: the next seqs, one command id for the batch. */
function commit(room: DemoRoom, actorId: string | null, commandId: string, events: DomainEvent[]): DemoRoom {
  let { state } = room;
  const committed: CommittedEvent[] = events.map((event, i) => {
    const seq = room.events.length + i + 1;
    return { seq, at: at(seq), actorId, commandId, event };
  });
  for (const c of committed) state = reduceCommitted(state, c);
  return { events: [...room.events, ...committed], state };
}

export function startRoom(): DemoRoom {
  const empty: DemoRoom = { events: [], state: emptyRoomState(ROOM_ID) };
  return commit(empty, null, "setup", [
    { type: "ParticipantJoined", participant: RECOVER_GM },
    ...RECOVER_TOKENS.map((t): DomainEvent => ({ type: "TokenCreated", token: t })),
  ]);
}

/** Runs one of the GM's commands through `decide` and commits what it decides. */
export function runCommand(room: DemoRoom, command: Command): { room: DemoRoom; refused: string | null } {
  const next = room.events.length + 1;
  const decision = decide(room.state, RECOVER_GM, command, { newId: () => `id-${next}` });
  if (!decision.ok) return { room, refused: decision.message };
  return { room: commit(room, RECOVER_GM.id, `cmd-${next}`, decision.events), refused: null };
}

export const moveToken = (room: DemoRoom, tokenId: string, to: Point) => runCommand(room, { type: "token.move", tokenId, to });
export const undoAction = (room: DemoRoom, commandId: string) => runCommand(room, { type: "history.undo", commandId });

/** The demo room as it opens: Sela already moved one square, so there is something to undo. */
export function openingRoom(): DemoRoom {
  return moveToken(startRoom(), "sela", squareCenter(4, 7)).room;
}

export interface LogLine {
  seq: number;
  sentence: string;
  commandId: string | undefined;
  /** The Undo control on the newest entry of an action that can still be undone. */
  undo: { label: string } | null;
  /** Marked on the newest entry of an action that was undone. */
  undone: boolean;
}

/** The GM's activity log for the room after setup, newest first, as the table's log panel lays it out. */
export function logLines(room: DemoRoom): LogLine[] {
  const { entries } = activityHistory(ROOM_ID, room.events, RECOVER_GM, { limit: 100, player: "" });
  const shown = entries.filter((e) => e.committed.seq > SETUP_SEQ);
  const newestSeq = new Map<string, number>();
  const undone = new Set<string>();
  for (const { committed } of shown) {
    if (committed.commandId && !newestSeq.has(committed.commandId)) newestSeq.set(committed.commandId, committed.seq);
    if (committed.event.type === "ActionUndone") undone.add(committed.event.commandId);
  }
  return shown.map(({ committed, sentence }) => {
    const id = committed.commandId;
    const newest = id !== undefined && newestSeq.get(id) === committed.seq;
    const action = newest ? undoableAction(room.state.undo, id) : undefined;
    return {
      seq: committed.seq,
      sentence,
      commandId: id,
      undo: action ? { label: `Undo ${describeUndo(action, room.state.tokens).verb}` } : null,
      undone: newest && undone.has(id!),
    };
  });
}
