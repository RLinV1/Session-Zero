import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "./helpers";
import { TEST_ORIGIN } from "./studioFlow";

describe("Studio and OAuth malformed-body privacy (FR-GM-26)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("returns a cataloged error without echoing or logging malformed credential/descriptor bodies", async () => {
    const server = await startServer(undefined, { studio: { publicOrigin: TEST_ORIGIN } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const marker = "synthetic-secret-marker-not-a-real-token";
    try {
      for (const route of ["/api/oauth/token", "/api/studio/builds/example/intake"]) {
        const response = await fetch(server.base + route, { method: "POST", headers: { "content-type": "application/json" }, body: `{\"download_url\":\"${marker}\",` });
        expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("no-store");
        expect((await response.text()).includes(marker)).toBe(false);
      }
      expect(JSON.stringify(log.mock.calls).includes(marker)).toBe(false);
    } finally { await server.close(); }
  });
});
