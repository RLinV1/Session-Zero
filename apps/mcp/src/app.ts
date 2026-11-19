import { AsyncLocalStorage } from "node:async_hooks";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { NodeStreamableHTTPServerTransport, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, isLegacyRequest, type McpHttpHandler, type McpServer } from "@modelcontextprotocol/server";
import { createBuildMcpServer, createStudioBuildMcpServer } from "./buildTools";
import { STUDIO_ACCESS_PATH, StudioAccess, type StudioAccessOptions } from "./studioAccess";
import type { Principal } from "./studioM0/auth";
import { createStudioM0, STUDIO_PATH, type StudioM0, type StudioM0Options } from "./studioM0";
import { scrubbed } from "./errors";
import { Limits } from "./limits";
import { SeatPool } from "./seatPool";
import { createMcpServer } from "./tools";
import { WAIT_LIMIT_MS } from "./waitForTurn";

const SWEEP_EVERY_MS = 60_000;
const SMALL_BUILD_BODY_BYTES = 256 * 1024;
const MAX_LARGE_BUILD_BODIES = 3;

export interface McpAppOptions {
  /** The room server, as this process reaches it. Never taken from a request. */
  roomServerUrl: string;
  /** Browser origins allowed to call the endpoint. A request with no `Origin` is an AI app's server (design D13). */
  allowedOrigins: readonly string[];
  /** Where an AI's upload command should send files. Defaults to the first allowed origin. */
  publicOrigin?: string;
  /** Proxy hops in front of this server, as the room server's TRUST_PROXY. */
  trustProxy?: number;
  /** Where built-in maps are read from, by file name. */
  builtinMapDir?: string;
  now?: () => number;
  maxSockets?: number;
  waitLimitMs?: number;
  /** M0 ONLY (interactive-ai-scene-studio): the fixture Studio proof endpoint, already initialized. */
  studio?: StudioM0;
  /** M0 ONLY: serve the Studio proof endpoint alone, without the player and build tools. */
  studioOnly?: boolean;
  /**
   * Delegated Studio access at `/mcp/studio` (ADR 0073, design D7), checked with the room server.
   * Off unless STUDIO_PUBLIC_ORIGIN names the website's origin, as it must on the room server too.
   */
  studioAccess?: StudioAccessOptions;
}

const rpcError = (res: Response, status: number, code: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });

/**
 * What isLegacyRequest reads when it's handed the parsed body: the method, URL and headers. It
 * classifies from the parsed value directly, so the body isn't serialized again just to route it.
 */
function classifyingRequest(req: Request): globalThis.Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
  }
  return new globalThis.Request(new URL(req.originalUrl, "http://mcp.invalid"), { method: req.method, headers });
}

export function buildMcpApp(options: McpAppOptions) {
  const pool = new SeatPool({ roomServerUrl: options.roomServerUrl, maxSockets: options.maxSockets, now: options.now });
  const limits = new Limits(options.now);
  const builtinMapDir = options.builtinMapDir ?? fileURLToPath(new URL("../../web/public/img/", import.meta.url));
  const allowedOrigins = new Set(options.allowedOrigins);

  const app = express();
  app.disable("x-powered-by");
  if (options.trustProxy !== undefined) app.set("trust proxy", options.trustProxy);

  app.get("/mcp/health", (_req, res) => void res.json({ ok: true }));
  // OAuth metadata and the stub authorization server for the M0 fixture Studio; none of it is under /mcp.
  if (options.studio) app.use(options.studio.auth.router());

  app.use(STUDIO_ACCESS_PATH, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

  app.use("/mcp", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return void rpcError(res, 403, -32000, "This origin isn't allowed.");
    next();
  });

  // Every type, so no Content-Type can carry a body past this limit to the transport's own parser.
  const jsonBody = express.json({ limit: "64kb", type: () => true });
  const smallBuildBody = express.json({ limit: "256kb", type: () => true });
  const largeBuildBody = express.json({ limit: "12mb", type: () => true });
  let largeBuildBodies = 0;
  const buildBody = (req: Request, res: Response, next: NextFunction) => {
    const length = Number(req.headers["content-length"] ?? 0);
    if (!(length > SMALL_BUILD_BODY_BYTES)) return smallBuildBody(req, res, next);
    if (largeBuildBodies >= MAX_LARGE_BUILD_BODIES) {
      res.setHeader("Retry-After", "5");
      return void rpcError(res, 429, -32000, "Too many large uploads at once. Try again in a moment.");
    }
    largeBuildBodies += 1;
    res.once("close", () => { largeBuildBodies -= 1; });
    return largeBuildBody(req, res, next);
  };

  /**
   * Both protocol eras on one stateless endpoint. 2025-era clients (an `initialize` handshake, no
   * per-request envelope) get the same per-request JSON transport as before. 2026-07-28 clients send
   * the envelope on every request and are served by the SDK's modern handler, also as plain JSON.
   * Either way nothing is streamed, and a proxy has nothing to buffer (design D5).
   */
  const modernHandlers: McpHttpHandler[] = [];
  const serve = (makeServer: (req: Request) => McpServer) => {
    // One modern handler per route, as the SDK intends: it tracks and closes each request's server
    // itself, and toNodeHandler aborts an exchange whose client goes away. Its factory only gets the
    // web Request, so the Express request (for req.ip, or the Studio principal) rides along in
    // AsyncLocalStorage, which stays separate for concurrent requests.
    const current = new AsyncLocalStorage<Request>();
    const modern = createMcpHandler(() => {
      const req = current.getStore();
      if (!req) throw new Error("MCP server factory called outside a request");
      return makeServer(req);
    }, { legacy: "reject", responseMode: "json" });
    modernHandlers.push(modern);
    const modernNode = toNodeHandler(modern);
    return (req: Request, res: Response, next: NextFunction) => void (async () => {
      if (await isLegacyRequest(classifyingRequest(req), req.body)) {
        const server = makeServer(req);
        const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      await current.run(req, () => modernNode(req, res, req.body));
    })().catch(next);
  };

  if (!options.studioOnly) app.post("/mcp", jsonBody, serve((req) => createMcpServer({
    pool,
    limits,
    roomServerUrl: options.roomServerUrl,
    clientAddress: req.ip ?? "unknown",
    waitLimitMs: options.waitLimitMs ?? WAIT_LIMIT_MS,
    maps: { roomServerUrl: options.roomServerUrl, builtinMapDir },
  })));

  // Kept off /mcp, so an AI reading strangers' chat at a table doesn't hold the build tools (ADR 0053).
  if (!options.studioOnly) app.post("/mcp/build", buildBody, serve((req) => createBuildMcpServer({
    roomServerUrl: options.roomServerUrl,
    clientAddress: req.ip ?? "unknown",
    publicOrigin: options.publicOrigin ?? options.allowedOrigins[0] ?? options.roomServerUrl,
  })));

  // Delegated Studio access (ADR 0073, design D7): the bearer is checked with the room server on every
  // request, before any MCP message is read, and the build tools then reach only the grant's builds.
  const delegated = options.studioAccess ? new StudioAccess({ ...options.studioAccess, roomServerUrl: options.roomServerUrl }) : null;
  if (delegated && !options.studioOnly) {
    const tokens = new WeakMap<Request, string>();
    // Checked before the body is even parsed, so an unauthenticated caller costs one lookup at most.
    app.post(STUDIO_ACCESS_PATH, (req, res, next) => {
      const header = req.headers.authorization;
      void delegated.verify(header, req.ip ?? "unknown").then((token) => {
        if (token === "unavailable") return delegated.unavailable(res);
        if (!token) return delegated.challenge(res, Boolean(header?.startsWith("Bearer ")));
        tokens.set(req, token);
        next();
      }, () => delegated.unavailable(res));
    }, jsonBody, serve((req) => createStudioBuildMcpServer({
      roomServerUrl: options.roomServerUrl,
      clientAddress: req.ip ?? "unknown",
      publicOrigin: options.studioAccess!.publicOrigin,
    }, tokens.get(req)!)));
  }

  const studio = options.studio;
  if (studio) {
    const principals = new WeakMap<Request, Principal>();
    app.post(STUDIO_PATH, jsonBody, (req, res, next) => {
      const body = req.body as { method?: unknown; params?: { name?: unknown } } | undefined;
      const principal = studio.auth.verify(req.headers.authorization);
      // M0 evidence: what the host sends, never the token or arguments.
      void studio.log.write("mcp_request", {
        method: typeof body?.method === "string" ? body.method : null,
        tool: typeof body?.params?.name === "string" ? body.params.name : null,
        protocolHeader: req.get("mcp-protocol-version") ?? null, methodHeader: req.get("mcp-method") ?? null,
        authorized: principal !== null, hadBearer: Boolean(req.headers.authorization?.startsWith("Bearer ")),
        subject: principal?.subject ?? null, userAgent: req.get("user-agent")?.slice(0, 120) ?? null,
      });
      if (!principal) return void studio.auth.challenge(res);
      principals.set(req, principal);
      next();
    }, serve((req) => studio.makeServer(principals.get(req)!)));
  }

  // Stateless: there is no session to stream from or delete.
  app.all(["/mcp", "/mcp/build", STUDIO_PATH, ...(delegated ? [STUDIO_ACCESS_PATH] : [])], (_req, res) => void rpcError(res, 405, -32000, "Method not allowed."));

  // Express's default handler logs and echoes the error, and a JSON parse error quotes the body,
  // which could hold a seat.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.too.large") return void rpcError(res, 413, -32600, "That request is too large.");
    if (err.status === 400) return void rpcError(res, 400, -32700, "That request isn't valid JSON.");
    console.error("[mcp] request failed:", scrubbed(err));
    rpcError(res, 500, -32603, "Internal error.");
  });

  const sweeper = setInterval(() => {
    pool.sweep();
    limits.sweep();
  }, SWEEP_EVERY_MS);
  sweeper.unref();

  return {
    app, pool, limits,
    stopSweeping: () => clearInterval(sweeper),
    /** Aborts any modern exchange still in flight; the legacy leg holds nothing between requests. */
    closeHandlers: () => Promise.all(modernHandlers.map((handler) => handler.close())),
  };
}

/** Starts listening and returns the base URL and a way to stop, closing every seat socket. */
export async function startMcpServer(options: McpAppOptions & { port?: number; host?: string; studioM0?: StudioM0Options }) {
  const studio = options.studio ?? (options.studioM0 ? await createStudioM0(options.studioM0) : undefined);
  const built = buildMcpApp({ ...options, studio });
  const server = built.app.listen(options.port ?? 0, options.host ?? "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  return {
    ...built,
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    close: async () => {
      built.stopSweeping();
      await built.closeHandlers();
      built.pool.closeAll();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
