import { fileURLToPath } from "node:url";
import { startMcpServer } from "./app";

function trustProxyFromEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) throw new Error(`TRUST_PROXY must be a hop count such as 1, not "${value}"`);
  return hops;
}

function requiredOrigin(value: string | undefined): string {
  const url = value ? new URL(value) : null;
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("STUDIO_M0_PUBLIC_ORIGIN must be an https origin such as https://example.trycloudflare.com");
  return url.origin;
}

const running = await startMcpServer({
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
      accessTtlSeconds: process.env.STUDIO_M0_ACCESS_TTL ? Number(process.env.STUDIO_M0_ACCESS_TTL) : undefined,
    },
    studioOnly: process.env.STUDIO_M0_ONLY === "1",
  }),
});
console.log(`[mcp] listening on port ${running.port}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void running.close().then(() => process.exit(0)));
}
