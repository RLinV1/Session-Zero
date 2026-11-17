import { fileURLToPath } from "node:url";
import { startMcpServer } from "./app";

function trustProxyFromEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) throw new Error(`TRUST_PROXY must be a hop count such as 1, not "${value}"`);
  return hops;
}

function accessTtlFromEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86_400) throw new Error(`STUDIO_M0_ACCESS_TTL must be whole seconds from 10 to 86400, such as 3600, not "${value}"`);
  return seconds;
}

function requiredOrigin(value: string | undefined): string {
  const url = value ? new URL(value) : null;
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("STUDIO_M0_PUBLIC_ORIGIN must be an https origin such as https://example.trycloudflare.com");
  return url.origin;
}

/** STUDIO_PUBLIC_ORIGIN, as on the room server: an https origin, or http on a loopback host for local development. */
function studioOriginFromEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = URL.canParse(value) ? new URL(value) : null;
  const loopback = url !== null && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!url || !(url.protocol === "https:" || (url.protocol === "http:" && loopback)) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("STUDIO_PUBLIC_ORIGIN must be an https origin such as https://example.com (http only for localhost)");
  }
  return url.origin;
}

const studioOrigin = studioOriginFromEnv(process.env.STUDIO_PUBLIC_ORIGIN);

const running = await startMcpServer({
  // Delegated Studio access (ADR 0073, design D7), off unless STUDIO_PUBLIC_ORIGIN is set.
  ...(studioOrigin && { studioAccess: { publicOrigin: studioOrigin } }),
  port: Number(process.env.PORT ?? 3002),
  host: process.env.HOST ?? "0.0.0.0",
  roomServerUrl: process.env.ROOM_SERVER_URL ?? "http://127.0.0.1:3001",
  allowedOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()),
  trustProxy: trustProxyFromEnv(process.env.TRUST_PROXY),
  builtinMapDir: process.env.BUILTIN_MAP_DIR,
  // M0 ONLY (interactive-ai-scene-studio): a fixture-only Studio proof, off unless STUDIO_M0=1.
  ...(process.env.STUDIO_M0 === "1" && {
    studioM0: {
      publicOrigin: requiredOrigin(process.env.STUDIO_M0_PUBLIC_ORIGIN),
      dataDir: process.env.STUDIO_M0_DATA_DIR ?? fileURLToPath(new URL("../.local/studio-m0/", import.meta.url)),
      accessTtlSeconds: accessTtlFromEnv(process.env.STUDIO_M0_ACCESS_TTL),
    },
    studioOnly: process.env.STUDIO_M0_ONLY === "1",
  }),
});
console.log(`[mcp] listening on port ${running.port}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void running.close().then(() => process.exit(0)));
}
