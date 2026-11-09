import { startMcpServer } from "./app";

function trustProxyFromEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) throw new Error(`TRUST_PROXY must be a hop count such as 1, not "${value}"`);
  return hops;
}

const running = await startMcpServer({
  port: Number(process.env.PORT ?? 3002),
  host: process.env.HOST ?? "0.0.0.0",
  roomServerUrl: process.env.ROOM_SERVER_URL ?? "http://127.0.0.1:3001",
  allowedOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()),
  trustProxy: trustProxyFromEnv(process.env.TRUST_PROXY),
  builtinMapDir: process.env.BUILTIN_MAP_DIR,
});
console.log(`[mcp] listening on port ${running.port}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void running.close().then(() => process.exit(0)));
}
