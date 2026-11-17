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
      for (const route of ["/api/oauth/token", "/api/OAUTH/token", "/API/Studio/builds/example/intake", "/api/studio/builds/example/intake", "/api/STUDIO"]) {
        const response = await fetch(server.base + route, { method: "POST", headers: { "content-type": "application/json" }, body: `{"download_url":"${marker}",` });
        expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("no-store");
        const problem=await response.json();expect(problem).toMatchObject({messageId:"studio.invalidJson",code:"invalid_request"});expect(JSON.stringify(problem).includes(marker)).toBe(false);
        const scalar = await fetch(server.base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify("secret7") });
        expect(scalar.status).toBe(400);const scalarProblem=await scalar.json();expect(scalarProblem).toMatchObject({messageId:"studio.invalidJson",code:"invalid_request"});expect(JSON.stringify(scalarProblem).includes("secret7")).toBe(false);
      }
      expect(JSON.stringify(log.mock.calls).includes(marker)).toBe(false);
      expect(JSON.stringify(log.mock.calls).includes("secret7")).toBe(false);
    } finally { await server.close(); }
  });
});
