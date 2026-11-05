import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  emptyRoomState,
  filterStateForViewer,
  reduceReceived,
  type AccountView,
  type ClientMessageInput,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomState,
  type ServerMessage,
} from "@vtt/shared";
import { buildApp, type App } from "../src/app";
import type { Detector, GridDetectionDispatcher } from "../src/domain/gridDetection";
import type { WallJobQueue } from "../src/domain/wallDetection";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

/**
 * Ports `fetch` refuses to connect to (the Fetch standard's "bad ports"), at or above 1024, the
 * lowest port Windows hands out for port 0. Linux starts its random ports above all of them.
 */
const FETCH_BAD_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

/**
 * Listens on a random local port that `fetch` will connect to, and returns the server's base URL.
 * Plain port 0 sometimes lands on a bad port on Windows, failing a test with "fetch failed: bad port".
 */
export async function listenForFetch(app: App): Promise<string> {
  for (;;) {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    if (!FETCH_BAD_PORTS.has(addr.port)) return `http://127.0.0.1:${addr.port}`;
    await new Promise<void>((resolve, reject) => app.server.close((err) => (err ? reject(err) : resolve())));
  }
}

/**
 * `store` lets a test start a second server on the same data, i.e. simulate a restart. `now`
 * replaces the clock that sessions and rate limits read. `detector` and `dispatcher` stand in for
 * the vision service and its job queue; `wallQueue` for the wall-detection queue (none by default, so
 * a REDIS_URL in the environment never reaches tests).
 */
export async function startServer(
  store: MemoryRoomStore = new MemoryRoomStore(),
  opts: { now?: () => number; detector?: Detector; dispatcher?: GridDetectionDispatcher; wallQueue?: WallJobQueue | null; commandRateLimit?: { limit: number; windowMs: number } } = {},
) {
  const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
  const app = await buildApp({
    store, uploadDir, clientOrigin: "*", now: opts.now, detector: opts.detector, dispatcher: opts.dispatcher,
    wallQueue: opts.wallQueue ?? null,
    // Off by default so command-heavy tests aren't throttled; commandRateLimit.test.ts sets a real cap.
    commandRateLimit: opts.commandRateLimit ?? { limit: 1_000_000, windowMs: 10_000 },
  });
  const base = await listenForFetch(app);

  const post = async <T>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  /** Signs up a fresh account (unique email unless given) and returns it signed in. */
  const signUp = async (opts: { email?: string; password?: string; displayName?: string } = {}) => {
    const email = opts.email ?? `${randomUUID()}@example.com`;
    const password = opts.password ?? "correct horse battery";
    const account = new HttpAccount(base, email, password);
    const res = await account.request("POST", "/api/auth/signup", {
      email, password, displayName: opts.displayName ?? "Sam",
    });
    if (res.status !== 201) throw new Error(`signup ${res.status} ${await res.text()}`);
    account.view = ((await res.json()) as { account: AccountView }).account;
    return account;
  };

  /** Signs in as an existing account, as a new device would: a fresh cookie jar. */
  const signIn = async (email: string, password: string) => {
    const account = new HttpAccount(base, email, password);
    const res = await account.request("POST", "/api/auth/signin", { email, password });
    if (res.status !== 200) throw new Error(`signin ${res.status} ${await res.text()}`);
    account.view = ((await res.json()) as { account: AccountView }).account;
    return account;
  };

  return {
    base,
    store,
    app,
    /** Where this server stores uploaded pictures (local disk in tests). */
    uploadDir,
    signUp,
    signIn,
    /** A cookie-less client for requests made signed out. */
    anonymous: () => new HttpAccount(base, "", ""),
    close: () => app.close(),
    /** Mirrors the browser: the client generates its own credential (DESIGN.md §5). */
    newGuestToken,
    /**
     * Creates a room as a signed-in GM (hosting requires an account, FR-GM-01). `cookie` is that
     * account's session cookie; without one, a fresh account is signed up for the room.
     */
    createRoom: async (displayName = "GM", opts: { cookie?: string; roomName?: string } = {}) => {
      const cookie = opts.cookie ?? (await signUp()).cookie;
      const guestToken = newGuestToken();
      const res = await fetch(base + "/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ roomName: opts.roomName ?? "Test", displayName, guestToken }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const room = (await res.json()) as CreateRoomResponse;
      return { ...room, guestToken, cookie };
    },
    join: async (inviteCode: string, displayName: string) => {
      const guestToken = newGuestToken();
      const joined = await post<JoinRoomResponse>(`/api/invites/${inviteCode}/join`, {
        displayName,
        guestToken,
      });
      return { ...joined, guestToken };
    },
    /** Like `join`, but hands back the HTTP status and body instead of throwing on rejection. */
    tryJoin: async (inviteCode: string, displayName: string) => {
      const guestToken = newGuestToken();
      const res = await fetch(`${base}/api/invites/${inviteCode}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, guestToken }),
      });
      return { status: res.status, body: (await res.json()) as Partial<JoinRoomResponse> & { error?: string; code?: string }, guestToken };
    },
    connect: (creds: TestCredentials) => TestClient.connect(base, creds),
    /** A join made while signed in as `who` (room-membership): the seat is kept on the account. */
    joinAs: async (who: HttpAccount, inviteCode: string, displayName: string) => {
      const guestToken = newGuestToken();
      const res = await who.request("POST", `/api/invites/${inviteCode}/join`, { displayName, guestToken });
      return { status: res.status, body: (await res.json()) as Partial<JoinRoomResponse> & { error?: string; code?: string }, guestToken };
    },
    /** Resumes `who`'s seat in the room from this "device" (room-membership, ADR 0017 M2). */
    resume: async (who: HttpAccount, roomId: string) => {
      const guestToken = newGuestToken();
      const res = await who.request("POST", `/api/rooms/${roomId}/seat`, { guestToken });
      return { status: res.status, body: (await res.json()) as { participantId?: string; role?: string; reason?: string }, roomId, guestToken };
    },
  };
}

/**
 * A browser's view of the account API: one cookie jar, so each instance is one device. Requests
 * go through `fetch` with the jar's cookie, and any `Set-Cookie` in a response updates the jar.
 */
export class HttpAccount {
  cookie = "";
  view: AccountView | null = null;

  constructor(
    readonly base: string,
    readonly email: string,
    public password: string,
  ) {}

  async request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.base + url, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(this.cookie && { cookie: this.cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const value = pair!.slice(pair!.indexOf("=") + 1);
      this.cookie = value ? pair! : "";
    }
    return res;
  }

  async json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.request(method, url, body);
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Who the server thinks this device is. */
  async me() {
    return ((await this.json<{ account: AccountView | null }>("GET", "/api/auth/me")).account);
  }
}

/** 32 bytes of entropy, as the browser produces in apps/web/src/net/identity.ts. */
export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface TestCredentials {
  roomId: string;
  guestToken: string;
}

/** Mirrors what the browser client does: snapshot + ordered events through the shared reducer. */
export class TestClient {
  state: RoomState = emptyRoomState("");
  seq = 0;
  participantId = "";
  /** Every raw payload ever received, for leak assertions. */
  readonly rawLog: string[] = [];
  private inbox: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  private listeners = new Set<(msg: ServerMessage) => void>();
  private nextId = 0;

  /** Resolves with Socket.IO's reason once this client is disconnected, by either side. */
  readonly disconnected: Promise<string>;

  private constructor(private socket: Socket) {
    this.disconnected = new Promise((resolve) => socket.once("disconnect", (reason) => resolve(reason)));
    socket.on(SOCKET_EVENTS.event, (msg: ServerMessage) => {
      this.rawLog.push(JSON.stringify(msg));
      this.listeners.forEach((fn) => fn(msg));
      this.apply(msg);
      this.inbox.push(msg);
      this.waiters.splice(0).forEach((w) => w());
    });
  }

  /** Identity travels in the handshake, so a reconnect rebinds with no extra round trip. */
  static async connect(base: string, creds: TestCredentials) {
    const socket = io(base, {
      transports: ["websocket"],
      auth: { roomId: creds.roomId, guestToken: creds.guestToken },
      reconnection: false,
    });
    // Subscribe before the handshake completes: the server sends `welcome` the moment
    // it accepts the connection, and an event with no listener yet is simply dropped.
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (err: Error) => reject(new Error(err.message)));
    });
    const reply = await client.waitFor((m) => m.type === "welcome" || m.type === "error");
    if (reply.type === "error") throw new Error(`${reply.code}: ${reply.message}`);
    return client;
  }

  /** Called synchronously as each message arrives, before it is queued; for timing (KAN-39). */
  onMessage(fn: (msg: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(msg: ClientMessageInput) {
    this.socket.emit(SOCKET_EVENTS.message, msg);
  }

  /** Send a command and resolve with its ack or rejection. */
  async command(command: Extract<ClientMessageInput, { type: "command" }>["command"]) {
    const clientCommandId = `c${++this.nextId}`;
    this.send({ type: "command", clientCommandId, command });
    return this.waitFor(
      (m): m is Extract<ServerMessage, { type: "ack" | "rejected" }> =>
        (m.type === "ack" || m.type === "rejected") && m.clientCommandId === clientCommandId,
    );
  }

  /** Resolves with the first message (already received or future) matching the predicate, consuming it. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs?: number): Promise<T>;
  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0]!;
      await this.nextMessage(deadline, "Timed out waiting for message");
    }
  }

  /** Wait until this client has applied everything up to `seq`. */
  async waitForSeq(seq: number, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (this.seq < seq) {
      await this.nextMessage(deadline, `Client stuck at seq ${this.seq}, wanted ${seq}`);
    }
  }

  private nextMessage(deadline: number, timeoutMessage: string) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error(timeoutMessage));
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, remaining);
      this.waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  close() {
    this.socket.close();
  }

  private apply(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.state = msg.state;
        this.seq = msg.seq;
        this.participantId = msg.you.id;
        break;
      case "event":
        if (msg.committed.seq !== this.seq + 1) throw new Error(`Gap: have ${this.seq}, got ${msg.committed.seq}`);
        // As the browser does: only the GM's events carry `commandId` (ADR 0013).
        this.state = reduceReceived(this.state, msg.committed);
        this.seq = msg.committed.seq;
        break;
      case "redacted":
        if (msg.seq !== this.seq + 1) throw new Error(`Gap: have ${this.seq}, got ${msg.seq}`);
        this.seq = msg.seq;
        break;
    }
  }
}

/**
 * What `client` should hold when it has caught up with `state`: the server's filtered view for
 * that participant. Players never get GM-only data such as the undo history (ADR 0013).
 */
export function viewFor(state: RoomState, client: TestClient): RoomState {
  const viewer = state.participants[client.participantId];
  if (!viewer) throw new Error(`No participant ${client.participantId}`);
  return filterStateForViewer(state, viewer);
}
