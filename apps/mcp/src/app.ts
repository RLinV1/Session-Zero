import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { NodeStreamableHTTPServerTransport, toNodeHandler, toWebRequest } from "@modelcontextprotocol/node";
import { createMcpHandler, isLegacyRequest, type McpServer } from "@modelcontextprotocol/server";
import { createBuildMcpServer } from "./buildTools";
import { scrubbed } from "./errors";
import { Limits } from "./limits";
import { SeatPool } from "./seatPool";
import { createMcpServer } from "./tools";
import { WAIT_LIMIT_MS } from "./waitForTurn";

const SWEEP_EVERY_MS = 60_000;

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
}

const rpcError = (res: Response, status: number, code: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });

export function buildMcpApp(options: McpAppOptions) {
  const pool = new SeatPool({ roomServerUrl: options.roomServerUrl, maxSockets: options.maxSockets, now: options.now });
  const limits = new Limits(options.now);
  const builtinMapDir = options.builtinMapDir ?? fileURLToPath(new URL("../../web/public/img/", import.meta.url));
  const allowedOrigins = new Set(options.allowedOrigins);

  const app = express();
  app.disable("x-powered-by");
  if (options.trustProxy !== undefined) app.set("trust proxy", options.trustProxy);

  app.get("/mcp/health", (_req, res) => void res.json({ ok: true }));

  app.use("/mcp", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return void rpcError(res, 403, -32000, "This origin isn't allowed.");
    next();
  });

  // Every type, so no Content-Type can carry a body past this limit to the transport's own parser.
  const jsonBody = express.json({ limit: "64kb", type: () => true });

  /**
   * Both protocol eras on one stateless endpoint. 2025-era clients (an `initialize` handshake, no
   * per-request envelope) get the same per-request JSON transport as before. 2026-07-28 clients send
   * the envelope on every request and are served by the SDK's modern handler, also as plain JSON.
   * Either way nothing is streamed, and a proxy has nothing to buffer (design D5).
   */
  const serve = (makeServer: (req: Request) => McpServer) => (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const webRequest = await toWebRequest(req, req.body);
      if (await isLegacyRequest(webRequest, req.body)) {
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
      const modern = createMcpHandler(() => makeServer(req), { legacy: "reject", responseMode: "json" });
      res.on("close", () => void modern.close());
      await toNodeHandler(modern)(req, res, req.body);
    })().catch(next);
  };

  app.post("/mcp", jsonBody, serve((req) => createMcpServer({
    pool,
    limits,
    roomServerUrl: options.roomServerUrl,
    clientAddress: req.ip ?? "unknown",
    waitLimitMs: options.waitLimitMs ?? WAIT_LIMIT_MS,
    maps: { roomServerUrl: options.roomServerUrl, builtinMapDir },
  })));

  // Kept off /mcp, so an AI reading strangers' chat at a table doesn't hold the build tools (ADR 0053).
  app.post("/mcp/build", jsonBody, serve((req) => createBuildMcpServer({
    roomServerUrl: options.roomServerUrl,
    clientAddress: req.ip ?? "unknown",
    publicOrigin: options.publicOrigin ?? options.allowedOrigins[0] ?? options.roomServerUrl,
  })));

  // Stateless: there is no session to stream from or delete.
  app.all(["/mcp", "/mcp/build"], (_req, res) => void rpcError(res, 405, -32000, "Method not allowed."));

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

  return { app, pool, limits, stopSweeping: () => clearInterval(sweeper) };
}

/** Starts listening and returns the base URL and a way to stop, closing every seat socket. */
export async function startMcpServer(options: McpAppOptions & { port?: number; host?: string }) {
  const built = buildMcpApp(options);
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
      built.pool.closeAll();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
