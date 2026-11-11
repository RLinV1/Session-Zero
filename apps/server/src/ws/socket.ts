import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  ClientMessage,
  HandshakeAuth,
  SOCKET_EVENTS,
  type ServerMessage,
} from "@vtt/shared";
import { englishText, sharedMsg, validationRef, type MessageRef, type RejectionCode } from "@vtt/shared";

/** A `rejected` message: English for every client, the id and params for one that formats its own (ADR 0054). */
const rejection = (clientCommandId: string, code: RejectionCode, text: MessageRef): ServerMessage =>
  ({ type: "rejected", clientCommandId, code, message: englishText(text), messageId: text.id, params: text.params });
import { hashToken } from "../domain/credentials";
import type { LiveRoom, RoomClient } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { Sessions } from "../identity/sessions";
import type { RoomStore } from "../store/roomStore";

const EPHEMERAL_PER_SECOND = 40;
const MOVE_PREVIEWS_PER_SECOND = 10;
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
 * Commands of any kind one player may send (ADR 0051). An invite link is all it takes to hold a seat,
 * and most commands add a permanent event. The burst limit sits above what a person can send: the
 * fastest is a held arrow key, one `token.move` per key repeat, about 33 a second at the fastest
 * system setting.
 */
const PLAYER_BURST_PER_WINDOW = 800;
const PLAYER_BURST_WINDOW_MS = 20_000;
/** The same budget over a longer stretch, which is what bounds a room's log: a minute of holding an arrow key. */
const PLAYER_SUSTAINED_PER_WINDOW = 1800;
const PLAYER_SUSTAINED_WINDOW_MS = 5 * 60_000;
/**
 * The GM's budget, far above any player's: making every imported opening a door sends one command
 * per opening, up to MAX_WALLS, as fast as the acks come back.
 */
const GM_COMMANDS_PER_WINDOW = 3000;
const GM_COMMAND_WINDOW_MS = 30_000;
/** Full snapshots one participant may ask for per minute. A client asks only after missing an event. */
const RESYNCS_PER_WINDOW = 30;
const RESYNC_WINDOW_MS = 60_000;
/** Open connections per participant: a few tabs and devices. A new one closes the oldest (ADR 0051). */
const MAX_CONNECTIONS_PER_SEAT = 8;
/** New connections per participant per minute. Each costs a full snapshot, so this bounds a reconnect loop. */
const CONNECTS_PER_WINDOW = 120;
const CONNECT_WINDOW_MS = 60_000;
const TOO_MANY_CONNECTIONS = "This seat is open in too many tabs or devices. Close some, then reload this page.";
/**
 * Handshakes one connection may try (ADR 0051). Socket.IO keeps a refused connection open for another
 * try, so a single upgrade, all a proxy can count, could run thousands of credential lookups. Socket.IO's
 * own client sends one: it closes the connection when refused, and a reconnect is a new connection.
 */
const HANDSHAKES_PER_CONNECTION = 3;

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
 * Live traffic per participant in each loaded room, one second at a time. Shared by all of a
 * participant's connections, so opening more doesn't buy more (ADR 0051).
 */
class SeatLiveTraffic {
  private rooms = new WeakMap<LiveRoom, Map<string, { windowStart: number; total: number; previews: number }>>();

  /** Counts one message at `now` and returns whether to relay it. */
  allow(room: LiveRoom, participantId: string, preview: boolean, now: number): boolean {
    let seats = this.rooms.get(room);
    if (!seats) this.rooms.set(room, (seats = new Map()));
    let seat = seats.get(participantId);
    if (!seat || now - seat.windowStart >= 1000) seats.set(participantId, (seat = { windowStart: now, total: 0, previews: 0 }));
    if (++seat.total > EPHEMERAL_PER_SECOND) return false;
    return !(preview && ++seat.previews > MOVE_PREVIEWS_PER_SECOND);
  }
}

/** The id of a message that at least looks like a command, valid or not, so its sender can be answered. */
function commandIdOf(raw: unknown): string | null {
  return raw && typeof raw === "object" && "type" in raw && raw.type === "command"
    && "clientCommandId" in raw && typeof raw.clientCommandId === "string"
    && raw.clientCommandId.length > 0 && raw.clientCommandId.length <= 64
    ? raw.clientCommandId
    : null;
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
  const playerCommandWindows = [
    new SeatWindows(PLAYER_BURST_PER_WINDOW, PLAYER_BURST_WINDOW_MS),
    new SeatWindows(PLAYER_SUSTAINED_PER_WINDOW, PLAYER_SUSTAINED_WINDOW_MS),
  ];
  const gmCommandWindows = [new SeatWindows(GM_COMMANDS_PER_WINDOW, GM_COMMAND_WINDOW_MS)];
  const resyncWindows = new SeatWindows(RESYNCS_PER_WINDOW, RESYNC_WINDOW_MS);
  const connectWindows = new SeatWindows(CONNECTS_PER_WINDOW, CONNECT_WINDOW_MS);
  const liveTraffic = new SeatLiveTraffic();
  const handshakes = new WeakMap<Socket["conn"], number>();

  // Authenticate during the handshake so an unauthorized socket never reaches a room.
  io.use(async (socket, next) => {
    // Counted on arrival, not on refusal: a burst has all landed before the first lookup returns.
    const tried = (handshakes.get(socket.conn) ?? 0) + 1;
    handshakes.set(socket.conn, tried);
    if (tried > HANDSHAKES_PER_CONNECTION) {
      socket.conn.close();
      // Nothing is sent on a closed connection, but Socket.IO only forgets this socket once called.
      return next(new Error("too_many_handshakes"));
    }

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

    // Decided here, in the same tick as attach, so a burst of handshakes can't all pass on one count.
    if (!connectWindows.take(room, participantId, Date.now())) {
      send({ type: "error", code: "too_many_connections", message: TOO_MANY_CONNECTIONS });
      socket.disconnect(true);
      return;
    }
    room.closeOldestConnections(participantId, MAX_CONNECTIONS_PER_SEAT - 1, TOO_MANY_CONNECTIONS);

    // FR-PL-06: every connection starts from an authoritative, filtered snapshot.
    room.attach(client);

    // Commands are handled one at a time so a socket's commands commit in the order sent.
    // Ephemeral messages skip that queue: a ping must not wait behind a command still
    // awaiting the store (KAN-39, FR-SYNC-03), and it has no ordering relation to commits.
    let queue: Promise<void> = Promise.resolve();
    socket.on(SOCKET_EVENTS.message, (raw: unknown) => {
      const parsed = ClientMessage.safeParse(raw);
      if (parsed.success && parsed.data.type === "ephemeral") return relay(parsed.data.payload);
      // Counted on arrival, not in the queue, so a flood can't pile up behind a slow store (ADR 0051).
      const now = Date.now();
      if (parsed.success && parsed.data.type === "resync") {
        // Nothing to answer: the client asks again on the next event it can't place.
        if (!resyncWindows.take(room, participantId, now)) return;
      } else {
        const budget = room.activeParticipant(participantId)?.role === "gm" ? gmCommandWindows : playerCommandWindows;
        if (!budget.every((windows) => windows.take(room, participantId, now))) {
          const clientCommandId = commandIdOf(raw);
          if (clientCommandId) {
            send(rejection(clientCommandId, "invalid", sharedMsg("reject.tooFastCommands")));
          }
          return;
        }
      }
      queue = queue.then(async () => void (await handle(raw, parsed))).catch((err) => {
        if (deps.logger) console.error("[vtt]", err);
        send({ type: "error", code: "bad_request", message: "Internal error" });
      });
    });

    const relay = (payload: Extract<ClientMessage, { type: "ephemeral" }>["payload"]) => {
      if (!liveTraffic.allow(room, participantId, payload.type === "tokenMovePreview", Date.now())) return;
      room.relayEphemeral(client, payload);
    };

    const handle = async (raw: unknown, parsed: ReturnType<typeof ClientMessage.safeParse>) => {
      if (!parsed.success) {
        // A malformed command still needs a matching response so the browser can
        // settle its pending Apply request and show the validation error.
        const clientCommandId = commandIdOf(raw);
        if (clientCommandId) {
          // Our own schema messages carry their id, so the client can show them in its language;
          // zod's built-in ones stay as zod wrote them (ADR 0054).
          const issue = parsed.error.issues[0]?.message;
          const ours = issue === undefined ? sharedMsg("reject.invalidCommand") : validationRef(issue);
          return send({
            type: "rejected",
            clientCommandId,
            code: "bad_request",
            message: issue ?? englishText(sharedMsg("reject.invalidCommand")),
            ...(ours && { messageId: ours.id, params: ours.params }),
          });
        }
        return send({ type: "error", code: "bad_request", message: parsed.error.message });
      }
      const msg = parsed.data;

      switch (msg.type) {
        case "command": {
          if (msg.command.type === "chat.send" && !chatWindows.take(room, participantId, Date.now())) {
            return send(rejection(msg.clientCommandId, "invalid", sharedMsg("reject.tooFastMessages")));
          }
          const diceLookChange = msg.command.type === "participant.setDiceLook" || msg.command.type === "participant.clearDiceLook";
          if (diceLookChange && !diceLookWindows.take(room, participantId, Date.now())) {
            return send(rejection(msg.clientCommandId, "invalid", sharedMsg("reject.tooFastDice")));
          }
          const result = await room.submit(participantId, msg.command);
          if (result.ok) send({ type: "ack", clientCommandId: msg.clientCommandId, seq: result.seq });
          else send({ type: "rejected", clientCommandId: msg.clientCommandId, code: result.code, message: result.message, messageId: result.text.id, params: result.text.params });
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
