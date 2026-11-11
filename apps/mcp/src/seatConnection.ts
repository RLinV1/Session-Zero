import { io, type Socket } from "socket.io-client";
import {
  HandshakeAuth,
  SOCKET_EVENTS,
  isDiceRoll,
  reduceReceived,
  type ClientMessageInput,
  type CommittedEvent,
  type DiceRoll,
  type MovementPreviewRequest,
  type Participant,
  type Point,
  type RoomState,
  type ServerMessage,
  type SessionEndReason,
} from "@vtt/shared";
import { CONNECTION_DROPPED, GM_SEAT_REFUSED, INVALID_SEAT, ROOM_UNAVAILABLE, SeatEndedError, ToolError, UNREACHABLE } from "./errors";

export type SeatCommand = Extract<ClientMessageInput, { type: "command" }>["command"];
export type MoveStatus = "clear" | "blocked" | "unknown";

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 15_000;
const PREVIEW_TIMEOUT_MS = 2_000;
/** The room server allows 30 resyncs a minute (ADR 0051). */
const RESYNC_RETRY_MS = 2_000;
const CATCH_UP_TIMEOUT_MS = 3_000;
/** Long enough to point at the map and then type a message about it. */
const PING_FRESH_MS = 60_000;
/** Enough for any rolls a seat could have in flight together. */
const ROLLS_REMEMBERED = 32;

/** `seat` is `<roomId>.<guestToken>`: everything a socket handshake needs, and nothing stored here (ADR 0052). */
export function formatSeat(roomId: string, guestToken: string): string {
  return `${roomId}.${guestToken}`;
}

export function parseSeat(seat: string): HandshakeAuth | null {
  const dot = seat.indexOf(".");
  if (dot <= 0) return null;
  const parsed = HandshakeAuth.safeParse({ roomId: seat.slice(0, dot), guestToken: seat.slice(dot + 1) });
  return parsed.success ? parsed.data : null;
}

function handshakeError(message: string): ToolError {
  switch (message) {
    case "revoked":
    case "left":
    case "deleted":
    case "signed_out":
      return new SeatEndedError(message as SessionEndReason);
    case "not_found":
      // Not an ending: the server says this too when a room failed to load or the store hiccuped.
      return new ToolError(ROOM_UNAVAILABLE);
    case "unauthorized":
    case "bad_request":
      return new ToolError(INVALID_SEAT);
    default:
      return new ToolError(UNREACHABLE);
  }
}

/**
 * One seat's socket, an ordinary client of the room server (ADR 0052). It holds only what the server
 * filtered for this seat and keeps it current as the web client does: snapshot, then ordered events
 * through the shared reducer, with a `resync` on any gap.
 */
export class SeatConnection {
  state!: RoomState;
  seq = 0;
  you!: Participant;
  ended: SessionEndReason | null = null;
  isOpen = true;

  private pending = new Map<string, { resolve: (seq: number | null) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  private previews = new Map<string, (status: MoveStatus) => void>();
  private listeners = new Set<() => void>();
  private closeListeners = new Set<() => void>();
  private nextId = 0;
  private resyncTimer: NodeJS.Timeout | null = null;
  private ownRolls = new Map<number, DiceRoll>();
  private pings = new Map<string, { at: Point; time: number }>();
  private ready: { resolve: (seat: SeatConnection) => void; reject: (err: Error) => void } | null = null;

  private constructor(private socket: Socket, private now: () => number) {
    socket.on(SOCKET_EVENTS.event, (msg: ServerMessage) => this.receive(msg));
    socket.on("connect_error", (err: Error) => this.closeWith(handshakeError(err.message)));
    socket.on("disconnect", () => this.closeWith(new ToolError(CONNECTION_DROPPED)));
  }

  /** Resolves once the first snapshot has arrived, and refuses a seat that isn't a player's. */
  static open(baseUrl: string, auth: HandshakeAuth, now: () => number = Date.now): Promise<SeatConnection> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, { transports: ["websocket"], reconnection: false, forceNew: true, timeout: CONNECT_TIMEOUT_MS, auth });
      const seat = new SeatConnection(socket, now);
      const timer = setTimeout(() => seat.closeWith(new ToolError(UNREACHABLE)), CONNECT_TIMEOUT_MS);
      seat.ready = {
        resolve: (s) => { clearTimeout(timer); resolve(s); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      };
    });
  }

  /** Sends a command and resolves with its seq. A refusal throws the server's own message. */
  command(command: SeatCommand): Promise<number | null> {
    if (!this.isOpen) return Promise.reject(new ToolError(CONNECTION_DROPPED));
    const clientCommandId = `m${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(clientCommandId);
        reject(new ToolError(CONNECTION_DROPPED));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(clientCommandId, { resolve, reject, timer });
      this.send({ type: "command", clientCommandId, command });
    });
  }

  /** The room's private movement check (ADR 0044): status only, and nothing is recorded. */
  previewMove(request: Omit<MovementPreviewRequest, "type" | "requestId">): Promise<MoveStatus> {
    if (!this.isOpen) return Promise.reject(new ToolError(CONNECTION_DROPPED));
    const requestId = `p${++this.nextId}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.previews.delete(requestId);
        resolve("unknown");
      }, PREVIEW_TIMEOUT_MS);
      this.previews.set(requestId, (status) => {
        clearTimeout(timer);
        this.previews.delete(requestId);
        resolve(status);
      });
      this.send({ type: "ephemeral", payload: { type: "tokenMovePreview", requestId, ...request } });
    });
  }

  /**
   * Waits until the mirror holds this seat's own change. The ack can arrive first when the mirror
   * had missed something and is waiting on a snapshot. Best effort: the room has already decided.
   */
  caughtUpTo(seq: number | null): Promise<void> {
    if (seq === null || this.seq >= seq || !this.isOpen) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        stop();
        resolve();
      };
      const timer = setTimeout(done, CATCH_UP_TIMEOUT_MS);
      const stop = this.onChange(() => {
        if (this.seq >= seq || !this.isOpen) done();
      });
    });
  }

  /** The roll the command with this seq made, even with others in flight. After a snapshot, this seat's newest. */
  rollAt(seq: number | null): DiceRoll | undefined {
    const known = seq === null ? undefined : this.ownRolls.get(seq);
    return known ?? this.state.rolls.filter(isDiceRoll).filter((r) => r.byParticipantId === this.you.id).at(-1);
  }

  /** Where each person last pointed on the map, while that is still fresh. Ephemeral, so memory only (invariant 4). */
  recentPings(): { fromId: string; at: Point }[] {
    const cutoff = this.now() - PING_FRESH_MS;
    for (const [fromId, ping] of this.pings) {
      if (ping.time <= cutoff) this.pings.delete(fromId);
    }
    return [...this.pings].map(([fromId, { at }]) => ({ fromId, at }));
  }

  /** Calls `fn` after every change to the mirror and when the connection closes. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Called at once if it has already closed, so nobody listening can miss it. */
  onClose(fn: () => void) {
    if (this.isOpen) this.closeListeners.add(fn);
    else fn();
  }

  close() {
    this.closeWith(new ToolError(CONNECTION_DROPPED));
  }

  private send(msg: ClientMessageInput) {
    this.socket.emit(SOCKET_EVENTS.message, msg);
  }

  private receive(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        // Before the snapshot is kept: a GM's is unfiltered, and must never reach an AI.
        if (msg.you.role !== "player") return this.closeWith(new ToolError(GM_SEAT_REFUSED));
        this.state = msg.state;
        this.seq = msg.seq;
        this.you = msg.you;
        this.stopResyncing();
        this.ready?.resolve(this);
        this.ready = null;
        return this.notify();
      case "event": {
        if (msg.committed.seq !== this.seq + 1) return this.resync();
        try {
          this.state = reduceReceived(this.state, msg.committed);
        } catch {
          return this.resync();
        }
        this.seq = msg.committed.seq;
        this.you = this.state.participants[this.you.id] ?? this.you;
        this.rememberIfOwnRoll(msg.committed);
        return this.notify();
      }
      case "redacted":
        if (msg.seq !== this.seq + 1) return this.resync();
        this.seq = msg.seq;
        return this.notify();
      case "ack": {
        const pending = this.takePending(msg.clientCommandId);
        pending?.resolve(msg.seq);
        return;
      }
      case "rejected": {
        const pending = this.takePending(msg.clientCommandId);
        pending?.reject(new ToolError(msg.message));
        return;
      }
      case "ephemeral":
        if (msg.payload.type === "tokenMoveFeedback") this.previews.get(msg.payload.requestId)?.(msg.payload.status);
        else if (msg.payload.type === "ping") this.pings.set(msg.from, { at: msg.payload.at, time: this.now() });
        return;
      case "sessionEnded":
        this.ended = msg.reason;
        return this.closeWith(new SeatEndedError(msg.reason));
      case "error":
        if (msg.code === "too_many_connections") this.closeWith(new ToolError(UNREACHABLE));
        return;
      default:
        return;
    }
  }

  private takePending(id: string) {
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    return pending;
  }

  private rememberIfOwnRoll({ seq, event }: CommittedEvent) {
    if (event.type !== "DiceRolled" || !isDiceRoll(event.roll) || event.roll.byParticipantId !== this.you.id) return;
    this.ownRolls.set(seq, event.roll);
    if (this.ownRolls.size > ROLLS_REMEMBERED) this.ownRolls.delete(this.ownRolls.keys().next().value as number);
  }

  /**
   * One request at a time, repeated until a snapshot arrives. The server drops one over its limit
   * and sends nothing back (ADR 0051), and a quiet room would bring no other event to notice by.
   */
  private resync() {
    if (this.resyncTimer) return;
    this.send({ type: "resync" });
    this.resyncTimer = setInterval(() => this.send({ type: "resync" }), RESYNC_RETRY_MS);
    this.resyncTimer.unref();
  }

  private stopResyncing() {
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.resyncTimer = null;
  }

  private notify() {
    for (const fn of [...this.listeners]) fn();
  }

  private closeWith(err: ToolError) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopResyncing();
    if (err instanceof SeatEndedError) this.ended = err.reason;
    this.ready?.reject(err);
    this.ready = null;
    for (const id of [...this.pending.keys()]) this.takePending(id)?.reject(err);
    for (const resolve of [...this.previews.values()]) resolve("unknown");
    this.socket.close();
    this.notify();
    for (const fn of [...this.closeListeners]) fn();
  }
}
