import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
if (process.versions.node.split(".")[0] !== "22") throw new Error("M2 requires Node 22");
const [environment, command, ...args] = process.argv.slice(2);
if (!environment || !command) throw new Error("Usage: with-env.mjs <run.env> <command> [args...]");
// dotenv-style loading preserves inherited values. Override them explicitly so a developer's
// existing DATABASE_URL/storage/detector cannot silently win over this isolated configuration.
const configuration = parseEnv(readFileSync(environment, "utf8"));
const db = new URL(configuration.DATABASE_URL ?? "invalid:");
if (!/^sz-studio-m2-[a-f0-9]{8}$/.test(configuration.STUDIO_TEST_COMPOSE_PROJECT ?? "") || configuration.S3_AUTODETECT !== "0"
  || db.hostname !== "127.0.0.1" || db.port !== "55435" || db.pathname !== "/studio_m2"
  || configuration.VISION_URL !== "http://127.0.0.1:18890"
  || ["S3_ENDPOINT", "STUDIO_S3_ENDPOINT", "STUDIO_TEST_S3_ENDPOINT"].some((key) => configuration[key] !== "http://127.0.0.1:18335")
  || ["S3_BUCKET", "STUDIO_S3_BUCKET", "STUDIO_TEST_S3_BUCKET"].some((key) => !configuration[key]?.startsWith("studio-m2-"))) throw new Error("Expected isolated M2 database/storage/detector configuration");
const childEnvironment = { ...process.env, ...configuration };
const executable = command === "compose" ? "docker" : command;
const parameters = command === "compose"
  ? ["compose", "--project-name", configuration.STUDIO_TEST_COMPOSE_PROJECT, "--env-file", environment, "-f", "scripts/studio-m2/compose.yml", ...args]
  : args;
const child = spawn(executable, parameters, { stdio: "inherit", env: childEnvironment });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Unable to launch M2 command"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
