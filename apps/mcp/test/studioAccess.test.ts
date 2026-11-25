import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { unlink, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRoomStore } from "../../server/src/store/memoryRoomStore";
import { startServer, type HttpAccount } from "../../server/test/helpers";
import { TEST_ORIGIN, TEST_RESOURCE, connectStudio } from "../../server/test/studioFlow";
import { STUDIO_TOOLS } from "../src/buildTools";
import { startMcpServer } from "../src/app";
import { AiClient, type RoomServer, type RunningMcp } from "./helpers";

/**
 * `/mcp/studio`: the delegated Studio tools (FR-GM-26, ADR 0073, design D7). The bearer is checked
 * with the room server by introspection on every request; the tools reach only the grant's builds.
 * Synthetic accounts and fixtures only.
 */

let room: RoomServer;
let mcp: RunningMcp;
const clients: AiClient[] = [];

beforeEach(async () => {
  room = await startServer(new MemoryRoomStore(), { studio: { publicOrigin: TEST_ORIGIN } });
  mcp = await startMcpServer({ roomServerUrl: room.base, allowedOrigins: ["http://localhost:5173"], studioAccess: { publicOrigin: TEST_ORIGIN } });
});
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close().catch(() => {});
  await mcp.close();
  await room.close();
});

const studioUrl = () => `${mcp.url}/studio`;

async function connectAi(token: string) {
  const ai = await AiClient.connect(studioUrl(), { authorization: `Bearer ${token}` });
  clients.push(ai);
  return ai;
}

async function startBuild(account?: HttpAccount, name = "Hollow Coast") {
  const owner = account ?? await room.signUp({ displayName: "Vincent" });
  const { build, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name });
  return { account: owner, id: build.id, pass };
}

const rawPost = (headers: Record<string, string>, body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) =>
  fetch(studioUrl(), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });

describe("the delegated Studio MCP route (FR-GM-26, ADR 0073)", () => {
  it("asks an unauthenticated caller to connect, pointing at the protected-resource metadata", async () => {
    const res = await rawPost({});
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate")!;
    expect(challenge).toContain(`resource_metadata="${TEST_ORIGIN}/.well-known/oauth-protected-resource/mcp/studio"`);
    expect(challenge).toContain('scope="studio:build"');
    expect(challenge).not.toContain("invalid_token");
    // That metadata is the room server's, and names this resource.
    const metadata = await (await fetch(`${room.base}/.well-known/oauth-protected-resource/mcp/studio`)).json() as { resource: string };
    expect(metadata.resource).toBe(TEST_RESOURCE);
  });

  it("refuses a build pass, a room credential and a made-up token as a delegated token", async () => {
    const { account, pass } = await startBuild();
    const created = await room.createRoom("GM", { cookie: account.cookie });
    for (const token of [pass, created.guestToken, `szs_at_${"A".repeat(43)}`, "anything"]) {
      const res = await rawPost({ authorization: `Bearer ${token}` });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("offers only reads and draft writes: no upload, removal, owner choice, pass or publication tool", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(room.base, account, [id]);
    const ai = await connectAi(tokens.access_token);
    const { tools } = await ai.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...STUDIO_TOOLS].sort());
    expect(tools.map((t) => t.name)).not.toEqual(expect.arrayContaining(["remove_draft_item"]));
    for (const tool of tools) {
      expect(tool.name).not.toMatch(/publish|choice|pass|upload|remove|delete|library|room/);
      const properties = Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
      expect(properties).not.toContain("pass");
      if (tool.name !== "list_builds") expect(properties).toContain("buildId");
    }
  });

  it("reads and writes only the builds in the grant; another owner's build reads as unknown", async () => {
    const mine = await startBuild();
    const notTicked = await startBuild(mine.account, "Lanternfall");
    const theirs = await startBuild(await room.signUp({ displayName: "Mallory" }), "Their build");
    const { tokens } = await connectStudio(room.base, mine.account, [mine.id]);
    const ai = await connectAi(tokens.access_token);

    const listed = await ai.call("list_builds", {});
    expect(listed.json).toEqual({ ownerName: "Vincent", builds: [{ id: mine.id, name: "Hollow Coast" }] });
    const read = await ai.call("get_build", { buildId: mine.id });
    expect(read.isError).toBe(false);
    expect(read.json).toMatchObject({ build: { id: mine.id, name: "Hollow Coast" }, ownerName: "Vincent" });
    expect(read.json.build).not.toHaveProperty("passExpiresAt");
    const saved = await ai.call("save_creatures", { buildId: mine.id, creatures: [{ key: "goblin", name: "Goblin", isPlayerCharacter: false }] });
    expect((saved.json.results as { saved: boolean }[])[0]!.saved).toBe(true);

    for (const buildId of [notTicked.id, theirs.id]) {
      const refused = await ai.call("save_creatures", { buildId, creatures: [{ key: "goblin", name: "Goblin", isPlayerCharacter: false }] });
      expect(refused).toMatchObject({ isError: true, text: "No such build." });
      expect((await ai.call("get_build", { buildId })).text).toBe("No such build.");
    }
    expect(await room.store.listBuildItems(theirs.id)).toEqual([]);
    expect(await room.store.listBuildItems(notTicked.id)).toEqual([]);
  });

  it("submits a scoped correction and returns a saved stale revision through the actual MCP route", async () => {
    const { account, id } = await startBuild();
    const fileId = randomUUID();
    await writeFile(join(room.uploadDir, "fixture"), await sharp({ create: { width: 500, height: 500, channels: 3, background: "#5b785e" } }).png().toBuffer());
    await room.store.addBuildFile({
      id: fileId, buildId: id, kind: "map", objectKey: "fixture", url: "/uploads/fixture", originalName: "Synthetic map",
      width: 500, height: 500, sizeBytes: 1, grid: null, board: null, sourceHash: null, detectionSourceHash: null,
      detectionVersion: null, detectionError: null, detectionStatus: null, detectionAttempt: 0, detectionResult: null,
      detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date().toISOString(),
    }, { maps: 20, files: 100, bytes: 100000 });
    await account.json("PUT", `/api/builds/${id}/choices`, { aiGrid: false, aiWalls: true, aiTerrain: true });
    const { tokens } = await connectStudio(room.base, account, [id]);
    const ai = await connectAi(tokens.access_token);
    const saved = await ai.call("save_map", { buildId: id, key: "chapel", name: "Chapel", fileId, proposedGrid: { cellSize: 50, offsetX: 0, offsetY: 0 } });
    expect(saved.isError, saved.text).toBe(false);
    const path = `/api/builds/${id}/studio/authoring/maps/chapel`;
    const { inspectedVersion } = await account.json<{ inspectedVersion: string }>("GET", path);
    const { requestId, baseRevisionId } = await account.json<{ requestId: string; baseRevisionId: string }>("POST", path + "/requests", {
      encounterKey: null, inspectedVersion, operationId: randomUUID(), instruction: "Mark the entry as Difficult.",
      selection: { region: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, layers: ["terrain"], objectIds: [], wholeObjectIds: [] },
    });
    const request = await ai.call("studio_get_correction_request", { buildId: id, requestId });
    expect(request.json).toMatchObject({ requestId, baseRevisionId, currentRevisionId: baseRevisionId, scene: { source: { id: fileId } } });
    expect(request.images).toHaveLength(1);
    expect(request.images[0]!.mimeType).toBe("image/webp");
    expect(request.json.inspectionCrop).toEqual({ left: 0, top: 0, width: 200, height: 200 });
    const args = { buildId: id, requestId, baseRevisionId, operations: [{ op: "terrain.paint", runs: [{ row: 0, start: 0, end: 0, kind: "difficult" }] }] };
    const applied = await ai.call("studio_submit_correction", { ...args, operationId: randomUUID() });
    expect(applied.json).toMatchObject({ status: "advanced", revisionId: expect.any(String) });
    const stale = await ai.call("studio_submit_correction", { ...args, operationId: randomUUID() });
    expect(stale).toMatchObject({ isError: true, json: { status: "stale", currentRevisionId: applied.json.revisionId, revisionId: expect.any(String) } });
    const reopened = await connectAi(tokens.access_token);
    const read = await reopened.call("studio_get_revision", { buildId: id, mapKey: "chapel", revisionId: stale.json.revisionId });
    expect(read.json).toMatchObject({ revision: { id: stale.json.revisionId, parentId: baseRevisionId } });

    await unlink(join(room.uploadDir, "fixture"));
    const recovered = await reopened.call("studio_get_correction_request", { buildId: id, requestId });
    expect(recovered.isError, recovered.text).toBe(false);
    expect(recovered.images).toHaveLength(0);
    expect(recovered.json).toMatchObject({ requestId, baseRevisionId, instruction: "Mark the entry as Difficult.",
      scope: { layers: ["terrain"] }, inspectionCrop: null });
  });

  it("ignores host request metadata naming another user", async () => {
    const mine = await startBuild();
    const theirs = await startBuild(await room.signUp({ displayName: "Mallory" }), "Their build");
    const { tokens } = await connectStudio(room.base, mine.account, [mine.id]);
    const theirOwner = (await room.store.findUserById(theirs.account.view!.id))!.ownerId;
    const res = await rawPost({ authorization: `Bearer ${tokens.access_token}`, "mcp-protocol-version": "2025-06-18" }, {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "list_builds", arguments: {}, _meta: { "openai/subject": theirOwner, "openai/userLocation": { city: "Nowhere" }, "openai/session": "s", "openai/organization": "o" } },
    });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain(mine.id);
    expect(text).not.toContain(theirs.id);
  });

  it("stops at the next request once the owner disconnects, and after the token expires", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(room.base, account, [id]);
    expect((await rawPost({ authorization: `Bearer ${tokens.access_token}` })).status).not.toBe(401);
    const grantId = (await account.json<{ grants: { id: string }[] }>("GET", `/api/builds/${id}/grants`)).grants[0]!.id;
    expect((await account.request("DELETE", `/api/builds/${id}/grants/${grantId}`)).status).toBe(204);
    const after = await rawPost({ authorization: `Bearer ${tokens.access_token}` });
    expect(after.status).toBe(401);
    expect(after.headers.get("www-authenticate")).toContain('error="invalid_token"');
    // Tagged like a tool error, so an open Studio view can tell access ended and clear what it shows (FR-GM-27).
    expect((await after.json() as { error: { data?: unknown } }).error.data).toEqual({ "sessionzero/error": { status: 401, code: "access" } });
  });

  it("refuses a token the room server says is for a different resource", async () => {
    // An introspection answer for another audience: only this check stands between it and the tools.
    let aud = "https://other.test.invalid/mcp/studio";
    let failWith = 0;
    const fake = createServer((_req, res) => {
      if (failWith) return void res.writeHead(failWith).end();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ active: true, aud, scope: "studio:build", exp: 9_999_999_999, builds: [] }));
    });
    await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
    const other = await startMcpServer({ roomServerUrl: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, allowedOrigins: [], studioAccess: { publicOrigin: TEST_ORIGIN } });
    const send = () => fetch(`${other.url}/studio`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer szs_at_${"A".repeat(43)}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    try {
      expect((await send()).status).toBe(401);
      // The control: the same answer naming this resource gets past the check.
      aud = TEST_RESOURCE;
      expect((await send()).status).not.toBe(401);
      // A room server that can't answer (limited, busy, down) is no reason to discard a token: 503, not 401.
      failWith = 429;
      const busy = await send();
      expect(busy.status).toBe(503);
      expect(busy.headers.get("www-authenticate")).toBeNull();
    } finally {
      await other.close();
      await new Promise<void>((resolve) => fake.close(() => resolve()));
    }
  });

  it("isn't served unless configured, and leaves /mcp/build as it was", async () => {
    const plain = await startMcpServer({ roomServerUrl: room.base, allowedOrigins: [] });
    try {
      expect((await fetch(`${plain.url}/studio`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(404);
    } finally {
      await plain.close();
    }
    const { pass } = await startBuild();
    const build = await AiClient.connect(`${mcp.url}/build`);
    clients.push(build);
    expect((await build.listTools()).tools.map((t) => t.name)).toContain("remove_draft_item");
    expect((await build.call("get_build", { pass })).isError).toBe(false);
  });
});
