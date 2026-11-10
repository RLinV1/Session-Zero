import { afterEach, describe, expect, it } from "vitest";
import { httpLogFromEnv } from "../src/app";
import { startServer } from "./helpers";

describe("API responses are hardened (security-hardening F-02)", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("sends nosniff, no-referrer and no-store on an /api response, and no X-Powered-By", async () => {
    const server = await startServer();
    close = server.close;

    const res = await fetch(`${server.base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Express sets X-Powered-By by default; it's disabled so we don't advertise the framework.
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("sets the headers before routing, so even a 404 under /api carries them", async () => {
    const server = await startServer();
    close = server.close;

    const res = await fetch(`${server.base}/api/not-a-real-endpoint`);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("drops X-Powered-By everywhere, not only under /api", async () => {
    const server = await startServer();
    close = server.close;

    const res = await fetch(`${server.base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("request logging is off in production unless asked for (security-hardening F-02)", () => {
  it("defaults on outside production and off in production", () => {
    expect(httpLogFromEnv({})).toBe(true);
    expect(httpLogFromEnv({ NODE_ENV: "development" })).toBe(true);
    expect(httpLogFromEnv({ NODE_ENV: "production" })).toBe(false);
  });

  it("obeys HTTP_LOG either way", () => {
    expect(httpLogFromEnv({ NODE_ENV: "production", HTTP_LOG: "1" })).toBe(true);
    expect(httpLogFromEnv({ NODE_ENV: "production", HTTP_LOG: "true" })).toBe(true);
    expect(httpLogFromEnv({ HTTP_LOG: "0" })).toBe(false);
    expect(httpLogFromEnv({ HTTP_LOG: "false" })).toBe(false);
  });
});
