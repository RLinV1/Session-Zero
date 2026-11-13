import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** An existing Compose stack can replace the test-runner's ephemeral local servers. */
export default defineConfig({
  ...base,
  testMatch: "isometric.spec.ts",
  projects: base.projects?.filter((project) => project.name === "chromium-desktop"),
  use: { ...base.use, baseURL: process.env.VTT_BROWSER_BASE_URL ?? base.use?.baseURL },
  webServer: process.env.VTT_BROWSER_BASE_URL ? undefined : base.webServer,
});
