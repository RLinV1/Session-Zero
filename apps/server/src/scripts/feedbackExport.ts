import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { exportFeedback } from "../domain/feedbackExport";
import { PostgresRoomStore } from "../store/postgresRoomStore";

/**
 * Writes feedback reports to disk for the team and Claude Code (FR-PL-11, ADR 0079): one folder per
 * report, `feedback/<reference>/report.md` beside its screenshots. `feedback/` is git-ignored:
 * reports are user data.
 *
 *   DATABASE_URL=postgres://… npm run feedback:export --workspace=@vtt/server -- [--since 2026-11-19] [--out ./feedback]
 */
async function main() {
  const { values } = parseArgs({ options: { since: { type: "string" }, out: { type: "string" } } });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Usage: DATABASE_URL=… npm run feedback:export --workspace=@vtt/server -- [--since <date>] [--out <dir>]");
    process.exitCode = 2;
    return;
  }
  const since = values.since === undefined ? undefined : new Date(values.since);
  if (since && Number.isNaN(since.getTime())) {
    console.error(`--since must be a date, such as 2026-11-19; got ${values.since}`);
    process.exitCode = 2;
    return;
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const outDir = path.resolve(process.env.INIT_CWD ?? process.cwd(), values.out ?? path.join(repoRoot, "feedback"));
  const store = await PostgresRoomStore.connect(url);
  try {
    const written = await exportFeedback(store, outDir, since?.toISOString());
    console.log(written.length ? `Wrote ${written.length} report(s) to ${outDir}: ${written.join(", ")}` : "No reports to export.");
  } finally {
    await store.close();
  }
}

await main();
