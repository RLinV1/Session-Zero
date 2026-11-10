/**
 * Fails when a production dependency has a high or critical advisory that isn't already known
 * (security-hardening, the F-03 follow-up). The pentest fix (zod/multer, PR #164) cleared the
 * backlog; this keeps a new advisory from landing on main unnoticed. Dev-only tooling (the test
 * runner, eslint) is out of scope: it doesn't ship, and its current advisories need breaking major
 * upgrades tracked on their own — run `npm audit` for that full picture.
 *
 * Known, accepted advisories live in ALLOWLIST with why they're there and when they clear, so the
 * gate is green today and loud about anything new. An allowlisted advisory npm no longer reports
 * prints a prune notice but never fails the build.
 *
 *   npm run audit
 */
import { execFileSync } from "node:child_process";

/** GHSA ids we knowingly accept for now. Each entry must say why it's here and how it clears. */
const ALLOWLIST = [
  // prisma -> @prisma/config -> deepmerge-ts: stack exhaustion merging recursive object graphs.
  // Only the Prisma CLI/config pulls it in; clears when Prisma moves to deepmerge-ts >= 8.0.0.
  // https://github.com/advisories/GHSA-ggr8-5vv4-36mx
  "GHSA-ggr8-5vv4-36mx",
];

// npm is npm.cmd on Windows, which only a shell can run (as in scripts/dev-db.mjs).
const shell = process.platform === "win32";

/** `npm audit` exits non-zero whenever it finds anything, so read its JSON off the error path too. */
function auditJson() {
  try {
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", shell });
  } catch (err) {
    if (typeof err.stdout === "string" && err.stdout.trim()) return err.stdout;
    console.error("[audit] could not run `npm audit`:", err.message);
    process.exit(1);
  }
}

const report = JSON.parse(auditJson());

// Each advisory once, keyed by GHSA id. The real advisories are the object entries in `via`
// (string entries are just other packages in the same chain).
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    const severity = via.severity ?? vuln.severity;
    if (severity !== "high" && severity !== "critical") continue;
    const id = (via.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i) ?? [via.url])[0];
    if (!advisories.has(id)) advisories.set(id, { severity, title: via.title ?? via.name ?? id });
  }
}

const allowed = new Set(ALLOWLIST);
const unexpected = [...advisories].filter(([id]) => !allowed.has(id));

for (const id of allowed) {
  if (!advisories.has(id)) console.log(`[audit] note: allowlisted ${id} is no longer reported — drop it from ALLOWLIST.`);
}

if (unexpected.length === 0) {
  const n = advisories.size;
  console.log(`[audit] ok — no un-allowlisted high/critical advisories in production dependencies${n ? ` (${n} allowlisted)` : ""}.`);
  process.exit(0);
}

console.error(`[audit] ${unexpected.length} new high/critical advisory/advisories in production dependencies:`);
for (const [id, a] of unexpected) console.error(`  - ${a.severity.toUpperCase()} ${id}: ${a.title}`);
console.error("\nFix with `npm audit fix`, bump the dependency, or — only if genuinely unavoidable —");
console.error("add the GHSA id to ALLOWLIST in scripts/audit-ci.mjs with a reason and how it clears.");
process.exit(1);
