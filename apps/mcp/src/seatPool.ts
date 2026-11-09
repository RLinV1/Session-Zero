import { createHash } from "node:crypto";
import type { HandshakeAuth, SessionEndReason } from "@vtt/shared";
import { CONNECTION_DROPPED, INVALID_SEAT, SERVER_BUSY, SeatEndedError, ToolError } from "./errors";
import { SeatConnection, parseSeat } from "./seatConnection";

export const DEFAULT_MAX_SOCKETS = 300;
export const DEFAULT_IDLE_MS = 15 * 60_000;
/** How many seats' small notes this process remembers after their sockets close. */
const MAX_REMEMBERED_SEATS = 2_000;

/** What `wait_for_turn` has already told a seat, so it reports each thing once. In memory: a restart can repeat one. */
export interface SeatMemory {
  turnKey: string | null;
  mentionCursor: string | null;
  /** This seat's ruled attacks already known about. Null until the first look. */
  ruledRolls: Set<string> | null;
}

export interface SeatLease {
  connection: SeatConnection;
  /** The SHA-256 of `seat`, the only form of it that is kept as a key. */
  seatKey: string;
  memory: SeatMemory;
}

interface Entry {
  connecting: Promise<SeatConnection>;
  inUse: number;
  lastUsed: number;
}

interface PoolOptions {
  roomServerUrl: string;
  maxSockets?: number;
  idleMs?: number;
  now?: () => number;
}

/** A Map used as a bounded record: reading or writing moves a key to the newest end. */
class Recent<V> {
  private items = new Map<string, V>();
  constructor(private readonly limit: number) {}
  get(key: string) {
    const value = this.items.get(key);
    if (value !== undefined) {
      this.items.delete(key);
      this.items.set(key, value);
    }
    return value;
  }
  set(key: string, value: V) {
    this.items.delete(key);
    this.items.set(key, value);
    if (this.items.size > this.limit) this.items.delete(this.items.keys().next().value as string);
  }
}

/**
 * The open seat sockets (design D5). HTTP is stateless, so a seat's socket outlives the call that
 * opened it and is found again by the hash of `seat`. A closed socket costs nothing but a fresh
 * snapshot on the next call: the seat itself lives in the room server.
 */
export class SeatPool {
  private entries = new Map<string, Entry>();
  private ended = new Recent<SessionEndReason>(MAX_REMEMBERED_SEATS);
  private memories = new Recent<SeatMemory>(MAX_REMEMBERED_SEATS);
  private readonly maxSockets: number;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly roomServerUrl: string;

  constructor(options: PoolOptions) {
    this.roomServerUrl = options.roomServerUrl;
    this.maxSockets = options.maxSockets ?? DEFAULT_MAX_SOCKETS;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.now = options.now ?? Date.now;
  }

  get openCount() {
    return this.entries.size;
  }

  /** Runs `fn` with this seat's connection, which can't be closed to make room until `fn` finishes. */
  async withSeat<T>(seat: string, fn: (lease: SeatLease) => Promise<T>): Promise<T> {
    const auth = parseSeat(seat);
    if (!auth) throw new ToolError(INVALID_SEAT);
    const seatKey = createHash("sha256").update(seat).digest("hex");
    const endedReason = this.ended.get(seatKey);
    if (endedReason) throw new SeatEndedError(endedReason);

    const entry = this.entryFor(seatKey, auth);
    entry.inUse++;
    try {
      const connection = await entry.connecting;
      // It may have closed while this call waited, and its mirror must not outlive the seat.
      if (!connection.isOpen) throw connection.ended ? new SeatEndedError(connection.ended) : new ToolError(CONNECTION_DROPPED);
      return await fn({ connection, seatKey, memory: this.memoryFor(seatKey) });
    } catch (err) {
      if (err instanceof SeatEndedError) this.ended.set(seatKey, err.reason);
      throw err;
    } finally {
      entry.inUse--;
      entry.lastUsed = this.now();
    }
  }

  /** Closes sockets nobody has used for `idleMs`. The next call for such a seat reconnects. */
  sweep() {
    const cutoff = this.now() - this.idleMs;
    for (const [key, entry] of this.entries) {
      if (entry.inUse === 0 && entry.lastUsed <= cutoff) this.drop(key, entry);
    }
  }

  closeAll() {
    for (const [key, entry] of this.entries) this.drop(key, entry);
  }

  /** Decided before the first `await`, so simultaneous calls for a seat share one connection attempt. */
  private entryFor(seatKey: string, auth: HandshakeAuth): Entry {
    const existing = this.entries.get(seatKey);
    if (existing) return existing;
    if (this.entries.size >= this.maxSockets) this.makeRoom();
    const entry: Entry = { connecting: SeatConnection.open(this.roomServerUrl, auth, this.now), inUse: 0, lastUsed: this.now() };
    this.entries.set(seatKey, entry);
    entry.connecting.then(
      (connection) => connection.onClose(() => {
        if (connection.ended) this.ended.set(seatKey, connection.ended);
        if (this.entries.get(seatKey) === entry) this.entries.delete(seatKey);
      }),
      () => {
        if (this.entries.get(seatKey) === entry) this.entries.delete(seatKey);
      },
    );
    return entry;
  }

  /** The least recently used socket with no call in progress goes. With none, this seat waits its turn. */
  private makeRoom() {
    let oldest: [string, Entry] | null = null;
    for (const item of this.entries) {
      if (item[1].inUse === 0 && (!oldest || item[1].lastUsed < oldest[1].lastUsed)) oldest = item;
    }
    if (!oldest) throw new ToolError(SERVER_BUSY);
    this.drop(oldest[0], oldest[1]);
  }

  private drop(key: string, entry: Entry) {
    this.entries.delete(key);
    void entry.connecting.then((connection) => connection.close(), () => {});
  }

  private memoryFor(seatKey: string): SeatMemory {
    let memory = this.memories.get(seatKey);
    if (!memory) {
      memory = { turnKey: null, mentionCursor: null, ruledRolls: null };
      this.memories.set(seatKey, memory);
    }
    return memory;
  }
}
