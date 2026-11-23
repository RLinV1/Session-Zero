import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("M2 service isolation (FR-GM-27)", () => {
  it("overrides inherited dev credentials/endpoints and rejects a non-isolated environment file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "studio-m2-env-test-"));
    const file = path.join(directory, "run.env");
    const configuration = { STUDIO_TEST_COMPOSE_PROJECT: "sz-studio-m2-12345678", S3_AUTODETECT: "0", DATABASE_URL: "postgres://studio:synthetic@127.0.0.1:55435/studio_m2", VISION_URL: "http://127.0.0.1:18890", S3_ENDPOINT: "http://127.0.0.1:18335", STUDIO_S3_ENDPOINT: "http://127.0.0.1:18335", STUDIO_TEST_S3_ENDPOINT: "http://127.0.0.1:18335", S3_BUCKET: "studio-m2-public", STUDIO_S3_BUCKET: "studio-m2-private", STUDIO_TEST_S3_BUCKET: "studio-m2-test" };
    const save = () => writeFile(file, Object.entries(configuration).map(([key, value]) => `${key}=${value}`).join("\n"), { mode: 0o600 });
    // fileURLToPath decodes the URL: `.pathname` keeps spaces as %20, so the script isn't found in such a checkout.
    const wrapper = fileURLToPath(new URL("../../../scripts/studio-m2/with-env.mjs", import.meta.url));
    try {
      await save();
      const result = spawnSync(process.execPath, [wrapper, file, process.execPath, "--input-type=module", "-e", 'import assert from "node:assert/strict"; assert.equal(new URL(process.env.DATABASE_URL).port,"55435"); assert.equal(process.env.STUDIO_S3_ENDPOINT,"http://127.0.0.1:18335"); assert.equal(process.env.VISION_URL,"http://127.0.0.1:18890"); console.log("isolated");'], { env: { ...process.env, DATABASE_URL: "postgres://dev:dev@127.0.0.1:5432/dev", STUDIO_S3_ENDPOINT: "http://127.0.0.1:8333", VISION_URL: "http://127.0.0.1:18889" }, encoding: "utf8" });
      expect(result.status).toBe(0); expect(result.stdout.trim()).toBe("isolated");
      configuration.DATABASE_URL = "postgres://dev:dev@127.0.0.1:5432/dev"; await save();
      const refused = spawnSync(process.execPath, [wrapper, file, process.execPath, "-e", 'console.log("must not run")'], { encoding: "utf8" });
      expect(refused.status).not.toBe(0); expect(refused.stdout).not.toContain("must not run");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
