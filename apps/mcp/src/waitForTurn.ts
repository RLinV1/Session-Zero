import { isDiceRoll, type ChatMessage, type DiceRoll, type Participant, type RoomState } from "@vtt/shared";
import { ORDER_NOTE, ROOM_TEXT_NOTE } from "./brief";
import { CONNECTION_DROPPED, SeatEndedError, ToolError } from "./errors";
import { squareAt } from "./grid";
import type { SeatConnection } from "./seatConnection";
import type { SeatMemory } from "./seatPool";

/** A client's tool timeout varies, so this stays well inside the shortest we expect (design D8). */
export const WAIT_LIMIT_MS = 25_000;
/**
 * A wait ends the moment there is news, so a longer one only means fewer idle model turns. Past this,
 * clients give up: Claude Code's calls time out at 60 seconds, as the MCP SDK's do by default (design D8).
 */
export const MAX_WAIT_SECONDS = 55;
const MOST_MENTIONS_REPORTED = 5;

/** This seat's token, if it is active and not yet reported. Reads only the seat's filtered state. */
function turnNews(state: RoomState, you: Participant, memory: SeatMemory) {
  const initiative = state.initiative;
  // Past the end of the order means a token hidden from this seat is active, which reads as nobody's turn.
  const activeId = initiative?.order[initiative.activeIndex];
  const token = activeId === undefined ? undefined : state.tokens[activeId];
  if (!initiative || !token || !token.ownerIds.includes(you.id)) {
    memory.turnKey = null;
    return null;
  }
  const key = `${initiative.round}:${token.id}`;
  if (memory.turnKey === key) return null;
  memory.turnKey = key;
  return { tokenId: token.id, name: token.name, round: initiative.round };
}

/** Messages @mentioning this seat since the last report. With no record, just the newest: a restart can repeat one. */
function mentionNews(state: RoomState, you: Participant, memory: SeatMemory): ChatMessage[] {
  // The room never records a sender as mentioning themselves (decide), so a seat's own message can't wake it.
  const mentions = state.chat.filter((m) => m.mentions?.some((x) => x.participantId === you.id));
  const newest = mentions[mentions.length - 1];
  if (!newest || newest.id === memory.mentionCursor) return [];
  const from = memory.mentionCursor === null ? mentions.length - 1 : mentions.findIndex((m) => m.id === memory.mentionCursor) + 1;
  memory.mentionCursor = newest.id;
  return mentions.slice(from).slice(-MOST_MENTIONS_REPORTED);
}

/**
 * This seat's attacks the GM has ruled on since the last report, so a turn can go on without a
 * person having to say so. With no record, what is already ruled counts as known: a restart repeats nothing.
 */
function rulingNews(state: RoomState, you: Participant, memory: SeatMemory): DiceRoll[] {
  const ruled = state.rolls.filter(isDiceRoll).filter((r) => r.byParticipantId === you.id && r.attack && r.verdict);
  const known = memory.ruledRolls;
  // Rebuilt from the log each time, so this stays no bigger than the log.
  memory.ruledRolls = new Set(ruled.map((r) => r.id));
  return known === null ? [] : ruled.filter((r) => !known.has(r.id));
}

/** The person named must be at the table now. An id, because a stranger could take a departed person's name (design D16). */
export function requireOrderGiver(state: RoomState, id: string) {
  const person = Object.hasOwn(state.participants, id) ? state.participants[id] : undefined;
  if (!person) throw new ToolError("Nobody at the table has that id. Take the id, not the name, from the people get_view lists.");
  if (person.left || person.revoked) throw new ToolError("That person isn't at the table any more, so their orders no longer count. Ask your user who to take orders from.");
}

/** A chat entry for a mention. `senderId` is set by the room server, so nothing typed in chat can change who it says this is from. */
function mentionEntry(connection: SeatConnection, message: ChatMessage, ordersFrom: string | undefined) {
  const ping = connection.recentPings().find((p) => p.fromId === message.senderId);
  return {
    from: message.senderName,
    fromId: message.senderId,
    text: message.text,
    at: message.at,
    ...(ordersFrom === undefined ? {} : { isOrder: message.senderId === ordersFrom }),
    ...(ping ? { pointedAt: squareAt(ping.at, connection.state.scene.grid) } : {}),
  };
}

interface WaitOptions {
  limitMs: number;
  signal: AbortSignal;
  ordersFrom?: string;
}

/** `wait_for_turn`: settles on news for this seat, at the limit, or when the seat or the caller goes away. */
export function waitForTurn(connection: SeatConnection, memory: SeatMemory, { limitMs, signal, ordersFrom }: WaitOptions) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => finish(() => resolve(connection.state.initiative
      ? { status: "still_waiting", message: "Nothing new for you yet. Call wait_for_turn again to keep waiting." }
      : { status: "no_encounter", message: "No encounter is running yet. Call wait_for_turn again to keep waiting, or ask the GM what is happening." })), limitMs);
    let stop = () => {};
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      stop();
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => finish(() => resolve({ status: "cancelled" }));

    const check = () => {
      if (!connection.isOpen) {
        const err = connection.ended ? new SeatEndedError(connection.ended) : new ToolError(CONNECTION_DROPPED);
        return finish(() => reject(err));
      }
      const turn = turnNews(connection.state, connection.you, memory);
      const mentions = mentionNews(connection.state, connection.you, memory);
      const rulings = rulingNews(connection.state, connection.you, memory);
      if (!turn && mentions.length === 0 && rulings.length === 0) return;
      finish(() => resolve({
        status: turn ? "your_turn" : mentions.length > 0 ? "mentioned" : "ruled",
        ...(turn ? { turn } : {}),
        ...(rulings.length > 0 ? {
          rulings: rulings.map((r) => ({ attack: r.attack?.label ?? null, target: r.attack?.target?.name ?? "Unknown", total: r.total, verdict: r.verdict })),
          message: "The GM ruled on your attack. If it is a hit, call roll_attack again with the same tokens and attack, with roll set to damage.",
        } : {}),
        ...(mentions.length > 0 ? {
          note: ROOM_TEXT_NOTE,
          ...(ordersFrom === undefined ? {} : { orderNote: ORDER_NOTE }),
          mentions: mentions.map((m) => mentionEntry(connection, m, ordersFrom)),
        } : {}),
      }));
    };

    stop = connection.onChange(check);
    signal.addEventListener("abort", onAbort);
    check();
  });
}
