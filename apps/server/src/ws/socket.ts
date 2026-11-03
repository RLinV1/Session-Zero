import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  ClientMessage,
  HandshakeAuth,
  SOCKET_EVENTS,
  type ServerMessage,
} from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom, RoomClient } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { Sessions } from "../identity/sessions";
import type { RoomStore } from "../store/roomStore";

const EPHEMERAL_PER_SECOND = 40;
/**
 * Chat messages one participant may send per CHAT_WINDOW_MS (KAN-75). Each one is a permanent
 * event row, so an unbounded loop would grow the log forever and hold the room's queue.
 */
const CHAT_PER_WINDOW = 10;
const CHAT_WINDOW_MS = 10_000;
/**
 * Dice look changes one participant may make per minute (ADR 0018). Each is a permanent event,
 * and nobody changes their dice ten times a minute on purpose.
 */
const DICE_LOOKS_PER_WINDOW = 10;
const DICE_LOOK_WINDOW_MS = 60_000;

/**
 * Recent send times for one limit, per participant in each loaded room, oldest first. Shared by all
 * of a participant's connections, so a second tab doesn't get a second budget (security-hardening
 * D3). Keyed by the room object, so the counters go when a deleted room is evicted.
 */
class SeatWindows {
  private rooms = new WeakMap<LiveRoom, Map<string, number[]>>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Counts one use at `now` and returns true, or returns false when the participant is at the limit. */
  take(room: LiveRoom, participantId: string, now: number): boolean {
    let seats = this.rooms.get(room);
    if (!seats) this.rooms.set(room, (seats = new Map()));
    const recent = (seats.get(participantId) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      seats.set(participantId, recent);
      return false;
    }
    recent.push(now);
    seats.set(participantId, recent);
    return true;
  }
}

/**
 * Socket.IO gateway (DESIGN.md §1, §2).
 *
 * Identity is resolved once, in the handshake: Socket.IO replays `auth` on every
 * automatic reconnect, so a dropped client rebinds to the same participant without a
 * round trip (FR-PL-05). Ephemeral traffic is relayed with `volatile.emit` in
 * `LiveRoom`, so pointer and drag chatter drops under backpressure rather than
 * queueing ahead of committed events (FR-SYNC-03). Dice drops, one per throw, are the
 * exception: they are sent reliably (ADR 0014).
 */
export function registerSocket(
  io: SocketIOServer,
  deps: { store: RoomStore; registry: RoomRegistry; sessions: Sessions; logger?: boolean },
) {
  const chatWindows = new SeatWindows(CHAT_PER_WINDOW, CHAT_WINDOW_MS);
  const diceLookWindows = new SeatWindows(DICE_LOOKS_PER_WINDOW, DICE_LOOK_WINDOW_MS);

  // Authenticate during the handshake so an unauthorized socket never reaches a room.
  io.use(async (socket, next) => {
    const auth = HandshakeAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error("bad_request"));

    // Socket.IO does not await middleware, so anything thrown here would be an unhandled
    // rejection and end the process. A room whose log won't replay (e.g. events from newer
    // code) must fail only this connection (room-load-isolation).
    try {
      const tokenHash = hashToken(auth.data.guestToken);
      const cred = await deps.store.findCredential(tokenHash);
      if (!cred) {
        // The credential row's own lock (FR-GM-20): say why, so the guest sees "removed".
        const revoked = await deps.store.findRevokedCredential(tokenHash);
        return next(new Error(revoked?.roomId === auth.data.roomId ? "revoked" : "unauthorized"));
      }
      if (cred.roomId !== auth.data.roomId) return next(new Error("unauthorized"));
      // A seat bound to a sign-in works only while that session lasts (ADR 0017 M4). The sweep
      // deletes ended sessions with their seats; this catches one that ended since.
      if (cred.sessionHash && !(await deps.sessions.isLive(cred.sessionHash))) return next(new Error("signed_out"));

      const room = await deps.registry.get(cred.roomId);
      // Closed: the room is being deleted (ADR 0009). Same answer as a room that never existed.
      if (!room || room.closed) return next(new Error("not_found"));
      // A seat that has ended stays ended: the credential is refused, not rebound (ADR 0006).
      // The message says why ("left" or "revoked"), so the client can word its screen.
      const ended = room.endReason(cred.participantId);
      if (ended) return next(new Error(ended));

      socket.data.room = room;
      socket.data.participantId = cred.participantId;
      socket.data.credentialHash = tokenHash;
      next();
    } catch (err) {
      console.error(`[vtt] socket handshake for room ${auth.data.roomId} failed:`, err);
      next(new Error("not_found"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const room = socket.data.room as LiveRoom;
    const participantId = socket.data.participantId as string;

    /** Reliable, ordered delivery to this socket. */
    const send = (msg: ServerMessage) => socket.emit(SOCKET_EVENTS.event, msg);
    const client: RoomClient = {
      participantId,
      credentialHash: socket.data.credentialHash as string,
      send,
      sendVolatile: (msg) => socket.volatile.emit(SOCKET_EVENTS.event, msg),
      close: () => socket.disconnect(true),
    };

    // FR-PL-06: every connection starts from an authoritative, filtered snapshot.
    room.attach(client);

    let windowStart = Date.now();
    let ephemeralCount = 0;
    let movementPreviewCount = 0;

    // Commands are handled one at a time so a socket's commands commit in the order sent.
    // Ephemeral messages skip that queue: a ping must not wait behind a command still
    // awaiting the store (KAN-39, FR-SYNC-03), and it has no ordering relation to commits.
    let queue: Promise<void> = Promise.resolve();
    socket.on(SOCKET_EVENTS.message, (raw: unknown) => {
      const parsed = ClientMessage.safeParse(raw);
      if (parsed.success && parsed.data.type === "ephemeral") return relay(parsed.data.payload);
      queue = queue.then(async () => void (await handle(raw, parsed))).catch((err) => {
        if (deps.logger) console.error("[vtt]", err);
        send({ type: "error", code: "bad_request", message: "Internal error" });
      });
    });

    const relay = (payload: Extract<ClientMessage, { type: "ephemeral" }>["payload"]) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        ephemeralCount = 0;
        movementPreviewCount = 0;
      }
      if (++ephemeralCount > EPHEMERAL_PER_SECOND) return;
      if (payload.type === "tokenMovePreview" && ++movementPreviewCount > 10) return;
      room.relayEphemeral(client, payload);
    };

    const handle = async (raw: unknown, parsed: ReturnType<typeof ClientMessage.safeParse>) => {
      if (!parsed.success) {
        // A malformed command still needs a matching response so the browser can
        // settle its pending Apply request and show the validation error.
        if (raw && typeof raw === "object" && "type" in raw && raw.type === "command"
          && "clientCommandId" in raw && typeof raw.clientCommandId === "string"
          && raw.clientCommandId.length > 0 && raw.clientCommandId.length <= 64) {
          return send({
            type: "rejected",
            clientCommandId: raw.clientCommandId,
            code: "bad_request",
            message: parsed.error.issues[0]?.message ?? "Invalid command",
          });
        }
        return send({ type: "error", code: "bad_request", message: parsed.error.message });
      }
      const msg = parsed.data;

      switch (msg.type) {
        case "command": {
          if (msg.command.type === "chat.send" && !chatWindows.take(room, participantId, Date.now())) {
            return send({
              type: "rejected",
              clientCommandId: msg.clientCommandId,
              code: "invalid",
              message: "You're sending messages too fast. Wait a few seconds.",
            });
          }
          const diceLookChange = msg.command.type === "participant.setDiceLook" || msg.command.type === "participant.clearDiceLook";
          if (diceLookChange && !diceLookWindows.take(room, participantId, Date.now())) {
            return send({
              type: "rejected",
              clientCommandId: msg.clientCommandId,
              code: "invalid",
              message: "You're changing dice too fast. Wait a minute.",
            });
          }
          const result = await room.submit(participantId, msg.command);
          if (result.ok) send({ type: "ack", clientCommandId: msg.clientCommandId, seq: result.seq });
          else send({ type: "rejected", clientCommandId: msg.clientCommandId, code: result.code, message: result.message });
          return;
        }
        case "ephemeral":
          // Relayed on arrival, before queueing; never reaches here.
          return;
        case "resync":
          room.sendSnapshot(client);
          return;
      }
    };

    socket.on("disconnect", () => {
      room.detach(client);
    });
  });
}
