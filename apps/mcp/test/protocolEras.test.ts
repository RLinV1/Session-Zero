import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./helpers";

/**
 * MCP 2026-07-28 dropped the `initialize` handshake for a per-request `_meta` envelope; a client that
 * speaks only that revision fails against a 2025-only server. Each endpoint serves both eras, as plain
 * JSON, so whichever one an AI app speaks reaches the same tools (interactive-ai-scene-studio M0).
 */
describe("both MCP protocol eras on one stateless endpoint (FR-PL-08, FR-GM-26)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  const envelope = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "era-test", version: "0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };

  const post = (path: string, headers: Record<string, string>, body: unknown) =>
    fetch(stack.mcp.url.replace(/\/mcp$/, path), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    });

  for (const path of ["/mcp", "/mcp/build"]) {
    it(`answers a 2025 initialize at ${path} with JSON`, async () => {
      const res = await post(path, {}, {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "era-test", version: "0" } },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(await res.json()).toMatchObject({ result: { protocolVersion: "2025-11-25" } });
    });

    it(`answers a 2026-07-28 discovery and tool list at ${path} with JSON`, async () => {
      const discover = await post(path, { "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" },
        { jsonrpc: "2.0", id: 2, method: "server/discover", params: { _meta: envelope } });
      expect(discover.status).toBe(200);
      expect(discover.headers.get("content-type")).toMatch(/application\/json/);
      expect(await discover.json()).toMatchObject({ result: { supportedVersions: expect.arrayContaining(["2026-07-28"]) } });

      const list = await post(path, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: envelope } });
      expect(list.status).toBe(200);
      const tools = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
      expect(tools).toContain(path === "/mcp" ? "join_room" : "get_build");
    });
  }

  it("still refuses a browser origin it doesn't know, in either era", async () => {
    const res = await post("/mcp/build", { origin: "https://evil.example", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
      { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: envelope } });
    expect(res.status).toBe(403);
  });
});
