import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  testDir: "./browser", timeout: 45_000, fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:5189", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-touch", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: "firefox-desktop", use: { browserName: "firefox", viewport: { width: 1440, height: 1000 } } },
    { name: "firefox-narrow", use: { browserName: "firefox", viewport: { width: 390, height: 844 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-touch", use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: [
    { command: "npm run start", url: "http://127.0.0.1:3109/health", env: { PORT: "3109", CLIENT_ORIGIN: "http://127.0.0.1:5189", S3_AUTODETECT: "0", SEED_DEV_ACCOUNT: process.env.VTT_TEST_CSP === "1" ? "1" : "0", UPLOAD_DIR: path.join(os.tmpdir(), "vtt-uvtt-browser-uploads") }, reuseExistingServer: false, timeout: 60_000 },
    { command: process.env.VTT_TEST_CSP === "1"
      ? "npm exec --workspace=@vtt/web -- vite preview --host 127.0.0.1 --port 5189 --strictPort"
      : "npm run dev --workspace=@vtt/web -- --host 127.0.0.1 --port 5189", url: "http://127.0.0.1:5189", env: { VTT_SERVER: "http://127.0.0.1:3109" }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
