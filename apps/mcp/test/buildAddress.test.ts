import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMcpServer } from "../src/app";
import { AiClient, type RunningMcp } from "./helpers";

describe("the build address (FR-GM-26)", () => {
  let mcp: RunningMcp;
  let buildUrl: string;

  beforeAll(async () => {
    // These tests never reach the room server, so nothing needs to listen on this address.
    mcp = await startMcpServer({ roomServerUrl: "http://127.0.0.1:9", allowedOrigins: ["http://localhost:5173"] });
    buildUrl = `${mcp.url}/build`;
  });
  afterAll(() => mcp.close());

  it("offers build tools only at the build address", async () => {
    const build = await AiClient.connect(buildUrl);
    const player = await AiClient.connect(mcp.url);
    const buildNames = (await build.listTools()).tools.map((t) => t.name);
    const playerNames = (await player.listTools()).tools.map((t) => t.name);
    expect(buildNames).toContain("get_build");
    expect(buildNames).not.toContain("join_room");
    expect(playerNames).toContain("join_room");
    expect(playerNames).not.toContain("get_build");
    await build.close();
    await player.close();
  });

  it("has the same origin check, verb check and size limit as the player address", async () => {
    const init = (body: string, origin?: string): RequestInit => ({
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(origin ? { origin } : {}) },
      body,
    });
    expect((await fetch(buildUrl, init("{}", "https://evil.example"))).status).toBe(403);
    expect((await fetch(buildUrl)).status).toBe(405);
    expect((await fetch(buildUrl, init(JSON.stringify({ blob: "x".repeat(70_000) })))).status).toBe(413);
  });
});
