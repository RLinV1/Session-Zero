import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.versions.node.split(".")[0] !== "22") throw new Error("M2 requires Node 22");
const ports = { server: 3120, mcp: 3130, web: 5190, pg: 55435, s3: 18335, vision: 18890 };
for (const port of Object.values(ports)) {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
const directory = await mkdtemp(path.join(tmpdir(), "studio-m2-"));
await chmod(directory, 0o700);
const access = randomBytes(12).toString("hex"), secret = randomBytes(24).toString("hex"), password = randomBytes(24).toString("hex");
const project = "sz-studio-m2-" + randomBytes(4).toString("hex");
const config = path.join(directory, "s3.json"), environment = path.join(directory, "run.env");
await writeFile(config, JSON.stringify({ identities: [{ name: "studio-m2-fixture", credentials: [{ accessKey: access, secretKey: secret }], actions: ["Admin", "Read", "Write", "List", "Tagging"] }] }), { mode: 0o600 });
const endpoint = `http://127.0.0.1:${ports.s3}`, origin = `http://127.0.0.1:${ports.web}`;
const values = {
  STUDIO_TEST_COMPOSE_PROJECT: project, STUDIO_TEST_ENV_FILE: environment, STUDIO_TEST_COMPOSE_FILE: "scripts/studio-m2/compose.yml",
  STUDIO_TEST_PG_PASSWORD: password, STUDIO_TEST_S3_CONFIG: config,
  STUDIO_TEST_PG_PORT: ports.pg, STUDIO_TEST_S3_PORT: ports.s3, STUDIO_TEST_VISION_PORT: ports.vision,
  STUDIO_TEST_S3_ENDPOINT: endpoint, STUDIO_TEST_S3_ACCESS_KEY: access, STUDIO_TEST_S3_SECRET_KEY: secret, STUDIO_TEST_S3_BUCKET: "studio-m2-test",
  DATABASE_URL: `postgres://studio:${password}@127.0.0.1:${ports.pg}/studio_m2`, REDIS_URL: "", S3_AUTODETECT: "0",
  S3_ENDPOINT: endpoint, S3_ACCESS_KEY: access, S3_SECRET_KEY: secret, S3_BUCKET: "studio-m2-public",
  STUDIO_MEDIA_MODE: "s3", STUDIO_S3_ENDPOINT: endpoint, STUDIO_S3_ACCESS_KEY: access, STUDIO_S3_SECRET_KEY: secret, STUDIO_S3_BUCKET: "studio-m2-private", STUDIO_S3_REGION: "us-east-1",
  VISION_URL: `http://127.0.0.1:${ports.vision}`, GRID_MAX_PIXELS: "16000000", COOKIE_SECURE: "0", HTTP_LOG: "0",
  UPLOAD_DIR: path.join(directory, "public"), STUDIO_PRIVATE_DIR: path.join(directory, "private"),
  STUDIO_PUBLIC_ORIGIN: origin, CLIENT_ORIGIN: origin, VTT_SERVER: `http://127.0.0.1:${ports.server}`, VTT_MCP: `http://127.0.0.1:${ports.mcp}`, ROOM_SERVER_URL: `http://127.0.0.1:${ports.server}`,
  STUDIO_TEST_SERVER_PORT: ports.server, STUDIO_TEST_MCP_PORT: ports.mcp, STUDIO_TEST_WEB_PORT: ports.web,
};
await writeFile(environment, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
console.log(`Isolated M2 environment: ${environment}`);
console.log(`Docker project: ${project}`);
console.log("Credentials remain in the private environment file. Use with-env.mjs; do not print or commit it.");
