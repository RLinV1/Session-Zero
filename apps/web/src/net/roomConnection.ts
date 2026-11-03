import { io, type Socket } from "socket.io-client";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  SOCKET_EVENTS,
  reduceReceived,
  type ClientMessageInput,
  type CommandInput,
  type CommittedEvent,
  type DiceRoll,
  type EphemeralPayload,
  type Participant,
  type RoomState,
  type ServerMessage,
  type WallDetectionStatus,
  type SessionEndReason,
} from "@vtt/shared";

/** `ended`: this seat left the room (ADR 0006). Terminal, like `unauthorized`: never reconnects. */
export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "unauthorized" | "ended";

export interface RoomSnapshot {
  status: ConnectionStatus;
  state: RoomState | null;
  you: Participant | null;
  seq: number;
  /**
   * Counts full snapshots (`welcome`) received: on connect, reconnect and resync. A new value
   * means `state` was replaced wholesale rather than moved on by events (board-dice-rolls).
   */
  snapshots: number;
  /** Set with status `ended`: whether this seat left or was removed by the GM (ADR 0006). */
  endReason: SessionEndReason | null;
  /**
   * Set with status `unauthorized`: the server's code. `unauthorized` means the credential no
   * longer exists (seat or room deleted); `not_found` can also mean the room failed to load.
   */
  refusal: "unauthorized" | "not_found" | null;
}

export type CommandResult =
  | { ok: true; seq: number | null }
  | { ok: false; code: string; message: string };

type EphemeralListener = (from: string, payload: EphemeralPayload) => void;
/** Called with a live event and the viewer's state before and after it (KAN-76). */
type CommittedListener = (committed: CommittedEvent, before: RoomState, after: RoomState) => void;
type RollListener = (roll: DiceRoll) => void;
type WallDetectionListener = (mapUrl: string, status: WallDetectionStatus) => void;

/** Shortest gap between two messages of one preview stream: at most 20 per second. */
export const PREVIEW_INTERVAL_MS = 50;
interface PreviewStream {
  lastSent: number;
  /** The newest value not yet sent, flushed when `timer` fires. */
  pending: EphemeralPayload | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Client side of the sync protocol (docs/adr/0001-event-model.md, docs/adr/0002).
 *  - Never changes state except through `reduce` on a server event, or a server snapshot.
 *  - Applies events only in seq order; any gap or reducer error triggers a resync.
 *  - Socket.IO owns reconnection and backoff (FR-PL-05). Credentials ride the handshake,
 *    so a reconnect rebinds to the same participant and the server replies with a full
 *    filtered snapshot (FR-PL-06) — there is no client-side catch-up to get wrong.
 *
 * Observable state lives in a Zustand store (DESIGN.md §2) so components subscribe to
 * exactly the slice they render.
 */
/** Why pending commands failed when this seat ended. */
const ENDED_MESSAGE: Record<SessionEndReason, string> = {
  left: "You left this room",
  revoked: "You were removed from this room",
  deleted: "This room was deleted",
  signed_out: "You signed out on this device",
};

export class RoomConnection {
  private socket: Socket | null = null;
  private nextCommandId = 0;
  private pending = new Map<string, (r: CommandResult) => void>();
  private ephemeralListeners = new Set<EphemeralListener>();
  private committedListeners = new Set<CommittedListener>();
  private rollListeners = new Set<RollListener>();
  private wallListeners = new Set<WallDetectionListener>();
  private previews = new Map<string, PreviewStream>();

  readonly store: StoreApi<RoomSnapshot> = createStore<RoomSnapshot>(() => ({
    status: "connecting",
    state: null,
    you: null,
    seq: 0,
    snapshots: 0,
    endReason: null,
    refusal: null,
  }));

  constructor(
    private roomId: string,
    private guestToken: string,
  ) {}

  get snapshot(): RoomSnapshot {
    return this.store.getState();
  }

  /** Opens the socket with this seat's credential and wires up message and connection handling. */
  start() {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket"],
      auth: { roomId: this.roomId, guestToken: this.guestToken },
    });
    this.socket = socket;

    socket.on(SOCKET_EVENTS.event, (msg: ServerMessage) => this.handle(msg));
    socket.on("disconnect", () => {
      this.failPending("Connection lost");
      if (!this.isTerminal()) this.update({ status: "reconnecting" });
    });
    // A handshake rejection is terminal: the credential is wrong, so retrying cannot help.
    socket.on("connect_error", (err: Error) => {
      if (err.message === "unauthorized" || err.message === "not_found") {
        socket.disconnect();
        this.update({ status: "unauthorized", refusal: err.message });
      } else if (err.message === "left" || err.message === "revoked" || err.message === "signed_out") {
        socket.disconnect();
        this.update({ status: "ended", endReason: err.message });
      }
    });
  }

  stop() {
    for (const key of [...this.previews.keys()]) this.cancelPreview(key);
    this.socket?.disconnect();
    this.socket = null;
    this.failPending("Disconnected");
  }

  onEphemeral(fn: EphemeralListener) {
    this.ephemeralListeners.add(fn);
    return () => this.ephemeralListeners.delete(fn);
  }

  /**
   * Live events only: called after an in-order `event` message has been applied, never for a
   * snapshot, a redacted event or a failed reduce, so nothing replays on load or resync.
   */
  onCommitted(fn: CommittedListener) {
    this.committedListeners.add(fn);
    return () => this.committedListeners.delete(fn);
  }

  /** GM only: a wall analysis of `mapUrl` changed state (ADR 0029). Not room state. */
  onWallDetection(fn: WallDetectionListener) {
    this.wallListeners.add(fn);
    return () => this.wallListeners.delete(fn);
  }

  command(command: CommandInput): Promise<CommandResult> {
    if (this.snapshot.status !== "open") {
      return Promise.resolve({ ok: false, code: "offline", message: "Not connected" });
    }
    const clientCommandId = `c${++this.nextCommandId}`;
    return new Promise((resolve) => {
      this.pending.set(clientCommandId, resolve);
      this.send({ type: "command", clientCommandId, command });
    });
  }

  /**
   * Called for each roll made while connected, once its event is applied (throw-dice-on-board).
   * Never for rolls that arrive in a snapshot: those are already on the table.
   */
  onRolled(fn: RollListener) {
    this.rollListeners.add(fn);
    return () => this.rollListeners.delete(fn);
  }

  /** One-shot ephemeral message (a ping, a dice drop): sent at once. */
  ephemeral(payload: EphemeralPayload) {
    if (this.snapshot.status === "open") this.send({ type: "ephemeral", payload });
  }

  /**
   * A continuous preview (a drag, later a ruler or an aim), coalesced per `key` (KAN-39,
   * FR-SYNC-03): at most one message per PREVIEW_INTERVAL_MS, and the latest value is always
   * sent once input stops, so the other clients end where the pointer did.
   */
  preview(key: string, payload: EphemeralPayload) {
    const stream = this.previews.get(key) ?? { lastSent: -Infinity, pending: null, timer: null };
    this.previews.set(key, stream);
    const wait = stream.lastSent + PREVIEW_INTERVAL_MS - Date.now();
    if (wait <= 0 && !stream.timer) {
      stream.lastSent = Date.now();
      this.ephemeral(payload);
      return;
    }
    stream.pending = payload;
    stream.timer ??= setTimeout(() => {
      stream.timer = null;
      if (!stream.pending) return;
      stream.lastSent = Date.now();
      this.ephemeral(stream.pending);
      stream.pending = null;
    }, Math.max(0, wait));
  }

  /**
   * Ends a preview stream: any unsent value is replaced by `final`, which goes out at once (no
   * 50 ms wait), so other clients settle where the input actually ended. Null just drops it.
   */
  endPreview(key: string, final: EphemeralPayload | null) {
    this.cancelPreview(key);
    if (final) this.ephemeral(final);
  }

  /** Drops a preview stream's unsent value. */
  cancelPreview(key: string) {
    const stream = this.previews.get(key);
    if (stream?.timer) clearTimeout(stream.timer);
    this.previews.delete(key);
  }

  private clearScenePreviews() {
    for (const key of [...this.previews.keys()]) this.cancelPreview(key);
  }

  /** Applies one server message: snapshots, ordered events, acks, and terminal session ends. */
  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        if (this.snapshot.state?.activeSceneId !== msg.state.activeSceneId) this.clearScenePreviews();
        this.update({ status: "open", state: msg.state, you: msg.you, seq: msg.seq, snapshots: this.snapshot.snapshots + 1 });
        return;

      case "event": {
        const { state, seq } = this.snapshot;
        if (!state || msg.committed.seq !== seq + 1) return this.resync();
        let next: RoomState;
        try {
          // The GM keeps undo history in step with the server's; players keep none (ADR 0013).
          next = reduceReceived(state, msg.committed);
          if (state.activeSceneId !== next.activeSceneId) this.clearScenePreviews();
          const you = this.snapshot.you ? (next.participants[this.snapshot.you.id] ?? null) : null;
          this.update({ state: next, seq: msg.committed.seq, you });
        } catch {
          return this.resync();
        }
        // After the try: a listener's mistake must not read as a broken event stream. Committed
        // listeners first, so a strike is waiting before its roll can land (KAN-76).
        this.emitCommitted(msg.committed, state, next);
        const { event } = msg.committed;
        if (event.type === "DiceRolled") this.rollListeners.forEach((fn) => fn(event.roll));
        return;
      }

      case "redacted":
        if (msg.seq !== this.snapshot.seq + 1) return this.resync();
        this.update({ seq: msg.seq });
        return;

      case "ack":
        this.settle(msg.clientCommandId, { ok: true, seq: msg.seq });
        return;

      case "rejected":
        this.settle(msg.clientCommandId, { ok: false, code: msg.code, message: msg.message });
        return;

      case "ephemeral":
        this.ephemeralListeners.forEach((fn) => fn(msg.from, msg.payload));
        return;

      case "wallDetection":
        this.wallListeners.forEach((fn) => fn(msg.mapUrl, msg.status));
        return;

      case "sessionEnded":
        // Every tab of this seat gets this, not only the one that clicked Leave. The server
        // disconnects next; stop here so Socket.IO doesn't try to reconnect (ADR 0006).
        this.update({ status: "ended", endReason: msg.reason });
        // Before disconnecting: the disconnect listener would fail them as "Connection lost".
        this.failPending(ENDED_MESSAGE[msg.reason]);
        this.socket?.disconnect();
        return;

      case "error":
        if (msg.code === "unauthorized" || msg.code === "not_found") {
          this.update({ status: "unauthorized", refusal: msg.code });
        }
        console.warn("Server error:", msg.message);
        return;
    }
  }

  /** A listener that throws must not look like a bad event and trigger a resync. */
  private emitCommitted(committed: CommittedEvent, before: RoomState, after: RoomState) {
    for (const fn of this.committedListeners) {
      try {
        fn(committed, before, after);
      } catch (err) {
        console.warn("Committed listener failed:", err);
      }
    }
  }

  /** True once the connection can never recover: no access, or this seat has ended. */
  private isTerminal() {
    const { status } = this.snapshot;
    return status === "unauthorized" || status === "ended";
  }

  private resync() {
    this.send({ type: "resync" });
  }

  private send(msg: ClientMessageInput) {
    this.socket?.emit(SOCKET_EVENTS.message, msg);
  }

  private settle(id: string, result: CommandResult) {
    this.pending.get(id)?.(result);
    this.pending.delete(id);
  }

  private failPending(message: string) {
    for (const resolve of this.pending.values()) resolve({ ok: false, code: "offline", message });
    this.pending.clear();
  }

  private update(patch: Partial<RoomSnapshot>) {
    this.store.setState(patch);
  }
}

/** Subscribe a component to the room's Zustand store. */
/**
 * What the map editor's steps need of a connection: commands, wall-detection notices and the
 * snapshot store. A room's `RoomConnection` has all three, and so does the library editor's local one.
 */
export type EditorConnection = Pick<RoomConnection, "command" | "onWallDetection" | "store">;

export function useRoomSnapshot(connection: Pick<RoomConnection, "store">): RoomSnapshot {
  return useStore(connection.store);
}
