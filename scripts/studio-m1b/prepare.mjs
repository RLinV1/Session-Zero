import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = await mkdtemp(path.join(tmpdir(), "studio-m1b-"));
const access = randomBytes(12).toString("hex"), secret = randomBytes(24).toString("hex"), password = randomBytes(24).toString("hex");
const project = "sz-studio-m1b-" + randomBytes(4).toString("hex");
const config = path.join(directory, "s3.json"), environment = path.join(directory, "run.env");
await writeFile(config, JSON.stringify({ identities: [{ name: "studio-fixture", credentials: [{ accessKey: access, secretKey: secret }], actions: ["Admin", "Read", "Write", "List", "Tagging"] }] }), { mode: 0o600 });
const values = { STUDIO_TEST_COMPOSE_PROJECT: project, STUDIO_TEST_ENV_FILE: environment, STUDIO_TEST_PG_PASSWORD: password, STUDIO_TEST_S3_CONFIG: config,
  STUDIO_TEST_S3_ENDPOINT: "http://127.0.0.1:18334", STUDIO_TEST_S3_ACCESS_KEY: access, STUDIO_TEST_S3_SECRET_KEY: secret,
  STUDIO_TEST_S3_BUCKET: "studio-m1b-private", DATABASE_URL: `postgres://studio:${password}@127.0.0.1:55434/studio_m1b`, S3_AUTODETECT: "0", REDIS_URL: "", VISION_URL: "http://127.0.0.1:18889" };
await writeFile(environment, Object.entries(values).map(([k,v]) => k + "=" + v).join("\n") + "\n", { mode: 0o600 });
console.log("Isolated test environment: " + environment);
console.log("Docker project: " + project);
console.log("No credentials were printed. Source the environment file, then use its project with scripts/studio-m1b/compose.yml.");
