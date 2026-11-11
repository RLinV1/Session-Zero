import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";
import { createLogger, defineConfig, searchForWorkspaceRoot } from "vite";

// 127.0.0.1, not localhost: Node resolves localhost to ::1 first, and the server listens on
// IPv4 only (0.0.0.0), so the proxy would get ECONNREFUSED.
const server = process.env.VTT_SERVER ?? "http://127.0.0.1:3001";

/** A browser tab reloading or closing mid-write; the client reconnects on its own. */
const EXPECTED_DISCONNECTS = new Set(["ECONNABORTED", "ECONNRESET", "EPIPE"]);

/**
 * True for the Vite proxy's WebSocket error reports that only mean a socket was cut
 * (quiet-dev-proxy-disconnects). HTTP proxy errors and any other code still print.
 */
export function isExpectedProxyDisconnect(message: string, error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return message.includes("ws proxy") && code !== undefined && EXPECTED_DISCONNECTS.has(code);
}

// Vite adds its own proxy error listeners after any `configure` hook, so filtering has to
// happen at the logger.
const logger = createLogger();
const logError = logger.error.bind(logger);
logger.error = (message, options) => {
  if (isExpectedProxyDisconnect(message, options?.error)) return;
  logError(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    // Worktrees may reuse an installation through a directory junction. Serve its font assets too.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(new URL("../../node_modules", import.meta.url))] },
    port: 5173,
    host: true, // reachable from phones on the same Wi-Fi for Player Board testing
    // Host is kept as the browser sent it (no `changeOrigin`): the server only honours the session
    // cookie on writes whose Origin names the host they were sent to (ADR 0016 I3), and the
    // string shorthand would rewrite Host to the server's, refusing every phone on the LAN.
    proxy: {
      "/api": { target: server, changeOrigin: false },
      "/uploads": { target: server, changeOrigin: false },
      "/socket.io": { target: server, ws: true },
      // `npm run dev:mcp`, so the address the Share dialog shows also works in dev.
      "/mcp": { target: process.env.VTT_MCP ?? "http://127.0.0.1:3002" },
    },
  },
});
