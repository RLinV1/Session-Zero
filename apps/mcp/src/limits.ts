const MINUTE = 60_000;

export const SEAT_COMMANDS_PER_MINUTE = 60;
export const ROOM_COMMANDS_PER_MINUTE = 240;
export const ROOM_CHATS_PER_MINUTE = 30;
export const JOINS_PER_WINDOW = 40;
export const JOIN_WINDOW_MS = 15 * MINUTE;

const SLOW_DOWN_SEAT = "This seat is sending commands too fast: at most 60 a minute. Wait a minute, then continue.";
const SLOW_DOWN_ROOM = "The AI seats in this room are sending commands too fast together. Wait a minute, then continue.";
const SLOW_DOWN_CHAT = "The AI seats in this room are chatting too fast together. Wait a minute before sending more.";
const SLOW_DOWN_JOIN = "Too many joins to this room from this address. Wait a few minutes, then try again.";

/** At most `limit` hits per key in any `windowMs`. Keeps one timestamp per hit, so its size is bounded by `limit`. */
class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number) {}

  /** Refused attempts aren't recorded, so a seat that slows down recovers on time. */
  hasRoom(key: string) {
    return this.live(key).length < this.limit;
  }

  take(key: string) {
    const live = this.live(key);
    live.push(this.now());
    this.hits.set(key, live);
  }

  refund(key: string) {
    this.hits.get(key)?.pop();
    if (this.hits.get(key)?.length === 0) this.hits.delete(key);
  }

  sweep() {
    for (const key of this.hits.keys()) {
      if (this.live(key).length === 0) this.hits.delete(key);
    }
  }

  private live(key: string) {
    const cutoff = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((at) => at > cutoff);
  }
}

/**
 * What stops a runaway AI (design D11). These run in the MCP server and well below the room
 * server's own limits (ADR 0051), so browser players are never affected. Not a security boundary:
 * a script can reach Socket.IO directly, where those other limits apply.
 */
export class Limits {
  private seatCommands: SlidingWindow;
  private roomCommands: SlidingWindow;
  private roomChats: SlidingWindow;
  private joins: SlidingWindow;

  constructor(now: () => number = Date.now) {
    this.seatCommands = new SlidingWindow(SEAT_COMMANDS_PER_MINUTE, MINUTE, now);
    this.roomCommands = new SlidingWindow(ROOM_COMMANDS_PER_MINUTE, MINUTE, now);
    this.roomChats = new SlidingWindow(ROOM_CHATS_PER_MINUTE, MINUTE, now);
    this.joins = new SlidingWindow(JOINS_PER_WINDOW, JOIN_WINDOW_MS, now);
  }

  /** Counts one command, or returns why it may not be sent. Counted against all budgets or none. */
  takeCommand(seatKey: string, roomId: string, isChat: boolean): string | null {
    if (isChat && !this.roomChats.hasRoom(roomId)) return SLOW_DOWN_CHAT;
    if (!this.seatCommands.hasRoom(seatKey)) return SLOW_DOWN_SEAT;
    if (!this.roomCommands.hasRoom(roomId)) return SLOW_DOWN_ROOM;
    if (isChat) this.roomChats.take(roomId);
    this.seatCommands.take(seatKey);
    this.roomCommands.take(roomId);
    return null;
  }

  /**
   * Counts one join for this invite and client address, or returns why it may not be tried. An
   * invite code stands for its room here: only a successful join would say which room it is.
   */
  takeJoin(inviteCode: string, clientAddress: string): string | null {
    const key = `${inviteCode}|${clientAddress}`;
    if (!this.joins.hasRoom(key)) return SLOW_DOWN_JOIN;
    this.joins.take(key);
    return null;
  }

  /** An invite that matched no room doesn't count, so the limiter can't be filled with made-up codes. */
  refundJoin(inviteCode: string, clientAddress: string) {
    this.joins.refund(`${inviteCode}|${clientAddress}`);
  }

  sweep() {
    for (const window of [this.seatCommands, this.roomCommands, this.roomChats, this.joins]) window.sweep();
  }
}
