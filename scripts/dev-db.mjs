/**
 * `npm run dev` against the Postgres and Redis from docker-compose.yml (README Option C), so rooms
 * and accounts survive a restart. Applies pending migrations first, then starts the server and the
 * web client with hot reload. Set DATABASE_URL or REDIS_URL to use other ones.
 *
 *   docker compose up -d postgres redis
 *   npm run dev:db
 */
import { spawn, spawnSync } from "node:child_process";

// 127.0.0.1, not localhost, as in .claude/launch.json: a port forwarded over IPv4 only refuses ::1.
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://vtt:vtt@127.0.0.1:5432/vtt",
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
};
// npm is npm.cmd on Windows, which only a shell can run.
const shell = process.platform === "win32";

const migrate = spawnSync("npm", ["run", "prisma:migrate", "--workspace=@vtt/server"], { stdio: "inherit", env, shell });
if (migrate.status !== 0) {
  console.error("[dev:db] migrations failed. Is Postgres up? Try: docker compose up -d postgres redis");
  process.exit(migrate.status ?? 1);
}

const dev = spawn("npm", ["run", "dev"], { stdio: "inherit", env, shell });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => dev.kill(signal));
dev.on("exit", (code) => process.exit(code ?? 1));
