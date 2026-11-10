import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, httpLogFromEnv } from "./app";
import { seedDevAccount } from "./identity/devAccount";
import { createAssetStore } from "./store/assetStore";
import { MemoryRoomStore } from "./store/memoryRoomStore";
import { PostgresRoomStore } from "./store/postgresRoomStore";
import { RedisSeqSource } from "./store/redisSeq";
import type { RoomStore } from "./store/roomStore";

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR ?? path.join(here, "..", "uploads");
const port = Number(process.env.PORT ?? 3001);

/**
 * Postgres + Redis when configured, in-memory otherwise (DESIGN.md §2).
 * `pnpm dev` with no env vars still boots standalone, which is what CI's smoke test uses.
 */
async function createStore(): Promise<RoomStore> {
  if (!process.env.DATABASE_URL) {
    console.log("[vtt] DATABASE_URL unset — using in-memory store (state is lost on restart)");
    return new MemoryRoomStore();
  }
  const seq = process.env.REDIS_URL ? await RedisSeqSource.connect(process.env.REDIS_URL) : null;
  if (!seq) console.log("[vtt] REDIS_URL unset — sequencing from Postgres alone (single instance only)");
  const store = await PostgresRoomStore.connect(process.env.DATABASE_URL, seq);
  console.log("[vtt] using Postgres event store");
  return store;
}

// A rejection nobody handled is a bug, but it should cost one request, not the whole server:
// log it and keep serving (room-load-isolation). Synchronous throws still end the process.
process.on("unhandledRejection", (reason) => {
  console.error("[vtt] unhandled rejection:", reason);
});

await mkdir(uploadDir, { recursive: true });
const store = await createStore();
await seedDevAccount(store);
const app = await buildApp({
  store,
  assets: await createAssetStore(uploadDir),
  uploadDir,
  logger: httpLogFromEnv(),
});
await app.listen({ port, host: "0.0.0.0" });
console.log(`[vtt] server on http://localhost:${port} (health: /health)`);
