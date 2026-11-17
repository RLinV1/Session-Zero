import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
import path from "node:path";

// M1 bridge/consent regressions keep their intentional memory/disk fixture, while their
// detector traffic goes exclusively to this session's real isolated M2 service.
if (process.env.VISION_URL !== "http://127.0.0.1:18890") throw new Error("Expected isolated M2 vision configuration");
const servers = Array.isArray(baseline.webServer) ? baseline.webServer : [];
export default defineConfig({ ...baseline, testMatch: /studio-(intake|connect)\.spec\.ts/,
  outputDir: "test-results/studio-m2-legacy",
  use: { ...baseline.use, trace: "off" },
  webServer: servers.map((server) => server.url === "http://127.0.0.1:3109/health"
    ? { ...server, command: "npm exec --workspace=@vtt/server -- tsx test/studioBrowserServer.ts", env: { ...server.env, STUDIO_BROWSER_TEST: "1", VISION_URL: "http://127.0.0.1:18890", STUDIO_PRIVATE_DIR: path.join(process.env.STUDIO_PRIVATE_DIR!, "legacy-browser"), UPLOAD_DIR: path.join(process.env.UPLOAD_DIR!, "legacy-browser") } }
    : server),
});
