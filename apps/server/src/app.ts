import { registerRoomPreparation } from "./http/roomPreparation";
import { registerMapLibraryRoutes } from "./http/mapLibrary";
import { registerUvttRoutes } from "./http/uvttRoutes";
import { UvttPreparations } from "./uvtt/preparations";
import { UvttValidationPool } from "./uvtt/validationPool";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import { GUEST_ROOM_IDLE_DAYS } from "@vtt/shared";
import { accountDeletion } from "./domain/accountDeletion";
import { roomLifecycle } from "./domain/roomLifecycle";
import { RoomRegistry } from "./domain/roomRegistry";
import { createGridDetectionDispatcher, type Detector, type GridDetectionDispatcher } from "./domain/gridDetection";
import { bullmqWallQueue, WallDetections, type WallJobQueue } from "./domain/wallDetection";
import { registerBuildRoutes } from "./http/build";
import { registerRoutes } from "./http/routes";
import { attachAccount, requireSameOrigin } from "./identity/middleware";
import { accountLimits, registerIdentityRoutes, type AccountLimits } from "./identity/routes";
import { Sessions } from "./identity/sessions";
import { LocalDiskAssetStore, type AssetStore } from "./store/assetStore";
import { MemoryRoomStore } from "./store/memoryRoomStore";
import type { RoomStore } from "./store/roomStore";
import { registerSocket } from "./ws/socket";
import { attachLocale } from "./i18n/locale";

/** How long a temporary encounter-editing room may be left behind before the sweep deletes it (ADR 0033). */
export const TEMPORARY_ROOM_LIFETIME_MS = 24 * 60 * 60_000;

/** How long a guest room may sit without room activity before the sweep deletes it (guest-gm-hosting D7). */
export const GUEST_ROOM_IDLE_MS = GUEST_ROOM_IDLE_DAYS * 24 * 60 * 60_000;

/** A guest identity this young is left alone, so the sweep can't race a room being created for it. */
const GUEST_OWNER_GRACE_MS = 24 * 60 * 60_000;

export interface AppOptions {
  store: RoomStore;
  uploadDir: string;
  /** Defaults to local disk, which is what tests and a container-less `pnpm dev` use. */
  assets?: AssetStore;
  logger?: boolean;
  /** Browser origin allowed to open a socket; Socket.IO enforces CORS itself. */
  clientOrigin?: string;
  detector?: Detector;
  dispatcher?: GridDetectionDispatcher;
  redisUrl?: string;
  visionUrl?: string;
  /**
   * The wall-detection queue (ADR 0029). Defaults to BullMQ on `redisUrl`, or none without Redis;
   * tests pass a stand-in, or null for "unavailable".
   */
  wallQueue?: WallJobQueue | null;
  /**
   * The web app's built-in maps (`apps/web/public/img`), so wall detection can read them too.
   * Defaults to that folder in this repository; null when the server runs without it.
   */
  builtinImageDir?: string | null;
  /**
   * Marks the session cookie `Secure` (ADR 0017 I1). Defaults to `COOKIE_SECURE`, else on in
   * production, so LAN phone testing over plain http still works in dev.
   */
  cookieSecure?: boolean;
  /** The clock sessions and rate limits read; tests move it forward. */
  now?: () => number;
}

/**
 * Express for REST, Socket.IO for the realtime bus (DESIGN.md §2).
 *
 * The two share one HTTP server so a single port serves uploads, the REST API and
 * the socket upgrade — which is what the Vite dev proxy and the deploy target expect.
 */
export interface App {
  express: Express;
  server: HttpServer;
  io: SocketIOServer;
  sessions: Sessions;
  limits: AccountLimits;
  /** The hourly sweep, on demand: ended sessions, then connections whose seat was deleted elsewhere. */
  sweep(): Promise<void>;
  /** The hourly sweep of temporary encounter-editing rooms left behind (ADR 0033), on demand. */
  sweepTemporaryRooms(): Promise<void>;
  /** The hourly sweep of guest rooms idle for 30 days, then of guest identities left with no rooms (guest-gm-hosting D7), on demand. */
  sweepGuestRooms(): Promise<void>;
  /** The hourly sweep that closes AI builds left unchanged for 14 days (ADR 0053), on demand. */
  sweepAbandonedBuilds(): Promise<void>;
  listen(opts: { port: number; host: string }): Promise<void>;
  close(): Promise<void>;
}

export async function buildApp({
  store,
  uploadDir,
  assets,
  logger = false,
  clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  detector,
  dispatcher,
  redisUrl = process.env.REDIS_URL,
  visionUrl = process.env.VISION_URL,
  wallQueue,
  builtinImageDir = fileURLToPath(new URL("../../web/public/img/", import.meta.url)),
  cookieSecure = cookieSecureFromEnv(),
  now = Date.now,
}: AppOptions): Promise<App> {
  const app = express();
  // Don't advertise Express (and its version range) on every response (security-hardening F-02).
  app.disable("x-powered-by");
  // Behind Caddy (deploy/Caddyfile), so `req.ip` (rate limits) and `req.secure` see the client (ADR 0017 I1).
  const trustProxy = trustProxyFromEnv();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: clientOrigin },
    maxHttpBufferSize: 64 * 1024,
  });
  const assetStore = assets ?? new LocalDiskAssetStore(uploadDir);
  // Wall analysis results are suggestions held here; a room reads them only when its GM applies
  // walls, and the GM hears of each finished job over their own socket (ADR 0029).
  const walls = new WallDetections(
    assetStore,
    wallQueue === undefined ? (redisUrl ? bullmqWallQueue(redisUrl) : null) : wallQueue,
    (roomId, mapUrl, status) => {
      void registry.loaded(roomId).then((room) => room?.notifyGm({ type: "wallDetection", mapUrl, status }));
    },
    builtinImageDir,
  );
  const preparations = new UvttPreparations(now);
  const pool = new UvttValidationPool();
  const registry = new RoomRegistry(store, {
    detectedWalls: (roomId, mapUrl) => walls.detectedWalls(roomId, mapUrl),
    uvttLease: (roomId, actorId, id, revision, sceneId) => preparations.lease(roomId, actorId, id, revision, sceneId),
  });
  const sessions = new Sessions(store, { secure: cookieSecure }, now);
  const limits = accountLimits(now);
  // Ending a session ends the seats bound to it; close their open connections (ADR 0017 M4).
  sessions.whenEnded((ended) => void registry.closeCredentials(ended.credentialHashes));
  const closeDeletedSeats = () => registry.closeDeletedCredentials();
  const stopSweeping = sessions.startSweeping(closeDeletedSeats);
  const stopLimitSweep = setInterval(() => Object.values(limits).forEach((l) => l.sweep()), 60_000);
  stopLimitSweep.unref();
  const rooms = roomLifecycle({ store, registry, assets: assetStore, walls, limits });
  // A temporary room is deleted when its GM leaves it; this catches the ones left open (ADR 0033).
  const sweepTemporaryRooms = async () => {
    const before = new Date(now() - TEMPORARY_ROOM_LIFETIME_MS).toISOString();
    for (const roomId of await store.listTemporaryRoomsBefore(before)) {
      await rooms.deleteRoomFully(roomId).catch((err: unknown) => {
        console.error(`[vtt] could not delete temporary room ${roomId}`, err);
      });
    }
  };
  const stopTemporaryRoomSweep = setInterval(() => void sweepTemporaryRooms(), 60 * 60_000);
  stopTemporaryRoomSweep.unref();
  // Same deletion as a GM's delete (ADR 0009). Pre-account identities are never guests, so they are never listed.
  const sweepGuestRooms = async () => {
    const before = new Date(now() - GUEST_ROOM_IDLE_MS).toISOString();
    for (const roomId of await store.listIdleGuestRoomsBefore(before)) {
      // A claim may have moved the room into an account since the list; deletion is irreversible, so recheck.
      // shortcut: a claim landing between this check and the delete is still possible, a store-level atomic delete would close it.
      if (!(await store.isGuestRoom(roomId))) continue;
      await rooms.deleteRoomFully(roomId).catch((err: unknown) => {
        console.error(`[vtt] could not delete idle guest room ${roomId}`, err);
      });
    }
    await store.deleteEmptyGuestOwners(new Date(now() - GUEST_OWNER_GRACE_MS).toISOString());
  };
  const stopGuestRoomSweep = setInterval(() => void sweepGuestRooms().catch((err: unknown) => console.error("[vtt] guest room sweep failed", err)), 60 * 60_000);
  stopGuestRoomSweep.unref();

  // Every /api response carries room or account data, so keep it out of shared caches, stop the
  // browser from MIME-sniffing a JSON body into something executable, and never leak the room URL
  // as a Referer to a third-party resource (security-hardening F-02). Set first, so even an
  // early rejection (same-origin, auth) is covered; a handler may still override Cache-Control.
  app.use("/api", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Every API response knows the language its request asked for (localization; ADR 0054).
  app.use("/api", attachLocale);
  app.use(attachAccount(sessions));
  app.use(requireSameOrigin(sessions, clientOrigin.split(",").map((o) => o.trim())));
  registerRoomPreparation(app, { store, registry, sessions });
  registerUvttRoutes(app, { store, registry, sessions, assets: assetStore, preparations, pool, uploadDir, builtinImageDir, uploads: limits.uploadsPerOwner, now });
  // Room/UVTT preparation authorizes and parses above; library geometry has its own 1 MiB parser.
  const json = express.json({ limit: "64kb" });
  app.use((req, res, next) => (/^\/api\/library\/[^/]+\/(board|preparation)$/.test(req.path) ? next() : json(req, res, next)));
  // Save to library and library export (ADR 0070), after the small JSON parser.
  registerMapLibraryRoutes(app, { store, registry, sessions, assets: assetStore, uploadDir, builtinImageDir, uploads: limits.uploadsPerOwner });
  // Uploaded pictures are drawn on other people's screens (dice looks, ADR 0018): never let a
  // browser second-guess their type into something that runs.
  app.use("/uploads", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  // Objects in object storage are streamed through here so their URLs stay origin-relative and
  // work from any device. Anything object storage does not have falls through to the disk folder,
  // so images uploaded before a checkout started using object storage still load (upload-storage).
  if (assets?.read) {
    app.get("/uploads/:key", (req, res, next) => {
      void assets
        .read!(req.params.key)
        .then((object) => {
          if (!object) return next();
          if (object.contentType) res.type(object.contentType);
          // Content-addressed by UUID, so it can never change under a cached copy.
          res.setHeader("cache-control", "public, max-age=31536000, immutable");
          object.body.on("error", () => res.destroy());
          object.body.pipe(res);
        })
        .catch(() => next());
    });
  }
  app.use("/uploads", express.static(path.resolve(uploadDir)));
  if (logger) {
    app.use((req, _res, next) => {
      console.log(`[vtt] ${req.method} ${req.url}`);
      next();
    });
  }

  // Redis workers may run in any process. A memory store exists only in this process, so
  // another worker could consume and discard its job without ever finding the row.
  const detection = dispatcher ?? await createGridDetectionDispatcher(store, assetStore, {
    detector, redisUrl: store instanceof MemoryRoomStore ? undefined : redisUrl, visionUrl,
  });
  registerIdentityRoutes(app, { store, sessions, limits, deleteAccount: accountDeletion({ store, registry, assets: assetStore, rooms }) });
  registerRoutes(app, { store, registry, uploadDir, assets: assetStore, limits, detection, walls, rooms });
  const builds = registerBuildRoutes(app, { store, assets: assetStore, uploadDir, limits, detection, pool, sessions, now });
  const stopBuildSweep = setInterval(() => void builds.sweepAbandoned(), 60 * 60_000);
  stopBuildSweep.unref();
  registerSocket(io, { store, registry, sessions, logger });

  return {
    express: app,
    server,
    io,
    sessions,
    limits,
    sweep: async () => {
      await sessions.sweep();
      await closeDeletedSeats();
    },
    sweepTemporaryRooms,
    sweepGuestRooms,
    sweepAbandonedBuilds: builds.sweepAbandoned,
    listen: ({ port, host }) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      }),
    // `io.close` also closes the HTTP server it was attached to, so closing it again
    // would raise ERR_SERVER_NOT_RUNNING.
    close: async () => {
      stopSweeping();
      clearInterval(stopLimitSweep);
      clearInterval(stopTemporaryRoomSweep);
      clearInterval(stopGuestRoomSweep);
      clearInterval(stopBuildSweep);
      await detection.close();
      await walls.close();
      await pool.close();
      await new Promise<void>((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function cookieSecureFromEnv(): boolean {
  const value = process.env.COOKIE_SECURE;
  if (value === undefined || value === "") return process.env.NODE_ENV === "production";
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * Whether to log every request's method and URL. The log records room and asset URLs and floods a
 * production log, so it is on by default only outside production (security-hardening F-02).
 * `HTTP_LOG=0` silences it in dev, and `HTTP_LOG=1` turns it back on in production when debugging.
 */
export function httpLogFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.HTTP_LOG;
  if (value === undefined || value === "") return env.NODE_ENV !== "production";
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * `TRUST_PROXY`: a hop count ("1"), or "true" to trust every proxy. Unset leaves Express's default.
 *
 * "true" makes `req.ip` the left-most `X-Forwarded-For` entry, which the client writes itself, so
 * anyone could pick a fresh address per request and walk past every per-address limit (sign-in,
 * sign-up, invite joins). Production must name its hop count instead, and a value that is neither
 * is refused rather than ignored (security-hardening D5).
 */
export function trustProxyFromEnv(env: NodeJS.ProcessEnv = process.env): number | boolean | undefined {
  const value = env.TRUST_PROXY;
  if (!value) return undefined;
  const production = env.NODE_ENV === "production";
  if (value === "true") {
    if (production) {
      throw new Error("TRUST_PROXY=true lets clients forge their address; set it to the number of proxies in front of the server, e.g. TRUST_PROXY=1");
    }
    console.warn("[vtt] TRUST_PROXY=true trusts X-Forwarded-For from anyone, so per-address rate limits can be bypassed. Use a hop count outside local testing.");
    return true;
  }
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  if (production) throw new Error(`TRUST_PROXY must be a hop count such as 1, not "${value}"`);
  console.warn(`[vtt] ignoring TRUST_PROXY="${value}": expected a hop count such as 1`);
  return undefined;
}
