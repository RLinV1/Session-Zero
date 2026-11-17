import { defineConfig } from "@playwright/test";

if (!process.env.DATABASE_URL?.includes("127.0.0.1:55435/studio_m2") || process.env.VISION_URL !== "http://127.0.0.1:18890" || process.env.STUDIO_S3_ENDPOINT !== "http://127.0.0.1:18335") throw new Error("Use scripts/studio-m2/with-env.mjs with the M2 run.env");
const origin = "http://127.0.0.1:5190";
export default defineConfig({
  testDir: "./browser", testMatch: "studio-preparation.spec.ts", timeout: 60_000, fullyParallel: false, workers: 1,
  expect: { timeout: 6500 },
  outputDir: "test-results/studio-m2",
  reporter: [["list"], ["json", { outputFile: "test-results/studio-m2/report.json" }]],
  use: { baseURL: origin, trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-touch", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: "firefox-narrow", use: { browserName: "firefox", viewport: { width: 390, height: 844 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    { command: "npm exec --workspace=@vtt/server -- tsx test/studioPreparationServer.ts", url: "http://127.0.0.1:3120/health", env: { PORT: "3120", STUDIO_M2_BROWSER_TEST: "1" }, reuseExistingServer: false, timeout: 60_000 },
    { command: "npm run start --workspace=@vtt/mcp", url: "http://127.0.0.1:3130/mcp/health", env: { PORT: "3130" }, reuseExistingServer: false, timeout: 60_000 },
    { command: "npm run dev --workspace=@vtt/web -- --host 127.0.0.1 --port 5190 --strictPort", url: origin, reuseExistingServer: false, timeout: 60_000 },
  ],
});
