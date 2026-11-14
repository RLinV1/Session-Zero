import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMcpServer } from "../src/app";
import { renderFixtureMap } from "../src/studioM0/store";

/**
 * interactive-ai-scene-studio M0: the fixture-only Studio proof endpoint. These are local checks of
 * the harness itself; they are NOT evidence of ChatGPT behavior (research.md labels [L] vs [U]).
 */
describe("Studio M0 fixture endpoint (FR-GM-26, interactive-ai-scene-studio M0)", () => {
  const PUBLIC = "https://studio-m0.test";
  const REDIRECT = "https://host.test/callback";
  let mcp: Awaited<ReturnType<typeof startMcpServer>>;
  let base: string;
  let dataDir: string;
  let files: Server;
  let filesOrigin: string;
  let fixture: Buffer;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "studio-m0-"));
    mcp = await startMcpServer({
      roomServerUrl: "http://127.0.0.1:9", allowedOrigins: [], studioOnly: true,
      studioM0: { publicOrigin: PUBLIC, dataDir, allowHttpDownloads: true, accessTtlSeconds: 600 },
    });
    base = `http://127.0.0.1:${mcp.port}`;
    fixture = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).png().toBuffer();
    files = createServer((req, res) => {
      if (req.url === "/map.png") return void res.writeHead(200, { "content-type": "image/png", "content-length": fixture.length }).end(fixture);
      if (req.url === "/redirect") return void res.writeHead(302, { location: "/map.png" }).end();
      if (req.url === "/big") return void res.writeHead(200, { "content-length": String(30 * 1024 * 1024) }).end();
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => files.listen(0, "127.0.0.1", resolve));
    filesOrigin = `http://127.0.0.1:${(files.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await mcp.close();
    await new Promise<void>((resolve) => files.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });

  const operator = async (action: string, body: unknown = {}) => {
    const { operatorKey } = JSON.parse(await readFile(path.join(dataDir, "operator.json"), "utf8")) as { operatorKey: string };
    return fetch(`${base}/studio-m0-operator/${action}`, { method: "POST", headers: { "x-operator-key": operatorKey, "content-type": "application/json" }, body: JSON.stringify(body) });
  };

  /** The whole code + PKCE flow, as a host would run it. */
  async function signIn(tester = "m0-tester-a", resource = `${PUBLIC}/mcp/studio-m0`) {
    const reg = await (await fetch(`${base}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", client_name: "test host" }) })).json() as { client_id: string };
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const query = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st", resource, scope: "studio:m0" });
    const page = await (await fetch(`${base}/oauth/authorize?${query}`)).text();
    const nonce = /name="form_nonce" value="([^"]+)"/.exec(page)?.[1] ?? "";
    const form = new URLSearchParams({ ...Object.fromEntries(query), form_nonce: nonce, tester, grant_workspace: "yes", decision: "approve" });
    const approved = await fetch(`${base}/oauth/authorize`, { method: "POST", body: form, redirect: "manual" });
    const location = new URL(approved.headers.get("location") ?? "about:blank");
    const tokenRes = await fetch(`${base}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: location.searchParams.get("code") ?? "", redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource }) });
    return { location, tokenRes, token: tokenRes.ok ? ((await tokenRes.json()) as { access_token: string }).access_token : "" };
  }

  async function connect(token: string) {
    const client = new Client({ name: "test-host", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/studio-m0`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    return client;
  }

  it("refuses an unauthenticated request with a resource-metadata challenge, and publishes discovery", async () => {
    const res = await fetch(`${base}/mcp/studio-m0`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${PUBLIC}/.well-known/oauth-protected-resource/mcp/studio-m0"`);
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp/studio-m0`)).json();
    expect(prm).toMatchObject({ resource: `${PUBLIC}/mcp/studio-m0`, authorization_servers: [PUBLIC], scopes_supported: ["studio:m0"] });
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({ issuer: PUBLIC, code_challenge_methods_supported: ["S256"], registration_endpoint: `${PUBLIC}/oauth/register` });
  });

  it("issues a token only through PKCE for its own resource", async () => {
    const ok = await signIn();
    expect(ok.location.searchParams.get("iss")).toBe(PUBLIC);
    expect(ok.location.searchParams.get("state")).toBe("st");
    expect(ok.token).toMatch(/^s0m0_/);
    const wrongResource = await signIn("m0-tester-a", "https://elsewhere.test/mcp");
    expect(wrongResource.location.href).toBe("about:blank"); // The authorize step itself refused.
  });

  it("serves the view resource, and app-only tools are marked for the host", async () => {
    const client = await connect((await signIn()).token);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.studio_m0_open?._meta).toMatchObject({ ui: { resourceUri: "ui://session-zero/studio-m0.html" } });
    expect(byName.studio_m0_get_media?._meta).toMatchObject({ ui: { visibility: ["app"] } });
    expect(byName.studio_m0_import_file?._meta).toMatchObject({ "openai/fileParams": ["file"] });
    const resource = await client.readResource({ uri: "ui://session-zero/studio-m0.html" });
    const content = resource.contents[0] as { mimeType?: string; text?: string };
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toContain("globalThis.__extApps=");
    expect(content.text).not.toMatch(/s0m0_|Bearer /); // Credential-free template.
    await client.close();
  });

  it("refreshes a saved value, traces a request and delivers media bytes", async () => {
    const client = await connect((await signIn()).token);
    const opened = await client.callTool({ name: "studio_m0_open", arguments: {} });
    const workspace = opened.structuredContent as { workspaceId: string; version: number; mapFileId: string };
    await client.callTool({ name: "studio_m0_set_value", arguments: { value: "changed elsewhere" } });
    const read = (await client.callTool({ name: "studio_m0_workspace", arguments: { workspaceId: workspace.workspaceId } })).structuredContent as { value: string; version: number };
    expect(read).toMatchObject({ value: "changed elsewhere", version: workspace.version + 1 });

    const saved = (await client.callTool({ name: "studio_m0_save_request", arguments: { workspaceId: workspace.workspaceId, rect: { x: 128, y: 128, width: 320, height: 256 }, instruction: "Lock the hall door", baseVersion: read.version } })).structuredContent as { requestId: string };
    const got = await client.callTool({ name: "studio_m0_get_request", arguments: { requestId: saved.requestId } });
    expect(got.structuredContent).toMatchObject({ requestId: saved.requestId, instruction: "Lock the hall door", rect: { x: 128, width: 320 } });
    const after = (await client.callTool({ name: "studio_m0_workspace", arguments: { workspaceId: workspace.workspaceId } })).structuredContent as { requests: { status: string }[] };
    expect(after.requests[0]?.status).toBe("observed");

    const media = await client.callTool({ name: "studio_m0_get_media", arguments: { workspaceId: workspace.workspaceId } });
    const bytes = Buffer.from((media._meta?.["sessionzero/media"] as { data: string }).data, "base64");
    expect(bytes.equals(await renderFixtureMap())).toBe(true);
    expect(JSON.stringify(media.content)).not.toContain((media._meta?.["sessionzero/media"] as { data: string }).data.slice(0, 40));
    await client.close();
  });

  it("draws the crop marker only into pixels, and the control has no picture", async () => {
    const client = await connect((await signIn()).token);
    const withImage = await client.callTool({ name: "studio_m0_view_crop", arguments: { x: 100, y: 100, width: 400, height: 300 } });
    const parts = withImage.content as { type: string; text?: string }[];
    expect(parts.map((p) => p.type)).toEqual(["text", "image"]);
    expect(parts[0]?.text).not.toMatch(/circle|square|triangle|red|green|blue|magenta/i);
    const control = await client.callTool({ name: "studio_m0_view_crop", arguments: { includeImage: false } });
    expect((control.content as { type: string }[]).map((p) => p.type)).toEqual(["text"]);
    const key = (await readFile(path.join(dataDir, "answer-key.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { label: string });
    expect(key.map((k) => k.label).slice(-2)).toEqual(["image", "control"]);
    const log = await readFile(path.join(dataDir, "evidence.jsonl"), "utf8");
    expect(log).not.toMatch(/"shape"|"color"/);
    await client.close();
  });

  it("imports original bytes only from an approved origin, without redirects or oversize bodies", async () => {
    const client = await connect((await signIn()).token);
    const file = (url: string) => ({ file: { download_url: url, file_id: "file_1", mime_type: "image/png", file_name: "map.png" } });
    const refused = await client.callTool({ name: "studio_m0_import_file", arguments: file(`${filesOrigin}/map.png?sig=secret`) });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain(filesOrigin);
    expect(JSON.stringify(refused.content)).not.toContain("sig=secret");

    await writeFile(path.join(dataDir, "file-origins.json"), JSON.stringify([filesOrigin]));
    const stored = await client.callTool({ name: "studio_m0_import_file", arguments: file(`${filesOrigin}/map.png`) });
    expect(stored.structuredContent).toMatchObject({ sha256: createHash("sha256").update(fixture).digest("hex"), bytes: fixture.length, width: 300, height: 200 });
    expect((await client.callTool({ name: "studio_m0_import_file", arguments: file(`${filesOrigin}/redirect`) })).isError).toBe(true);
    expect((await client.callTool({ name: "studio_m0_import_file", arguments: file(`${filesOrigin}/big`) })).isError).toBe(true);
    await client.close();
  });

  it("keeps one tester's workspace from another, and stops working on revocation", async () => {
    const a = await connect((await signIn("m0-tester-a")).token);
    const workspaceId = ((await a.callTool({ name: "studio_m0_open", arguments: {} })).structuredContent as { workspaceId: string }).workspaceId;
    const bToken = (await signIn("m0-tester-b")).token;
    const b = await connect(bToken);
    const foreign = await b.callTool({ name: "studio_m0_workspace", arguments: { workspaceId } });
    expect(foreign.isError).toBe(true);
    expect(JSON.stringify(foreign.content)).toMatch(/No workspace/);

    expect((await operator("revoke-all")).ok).toBe(true);
    const after = await fetch(`${base}/mcp/studio-m0`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bToken}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(after.status).toBe(401);
    await a.close().catch(() => {});
    await b.close().catch(() => {});
  });

  it("refuses operator controls without the private key or through the tunnel", async () => {
    expect((await fetch(`${base}/studio-m0-operator/revoke-all`, { method: "POST" })).status).toBe(404);
    const { operatorKey } = JSON.parse(await readFile(path.join(dataDir, "operator.json"), "utf8")) as { operatorKey: string };
    expect((await fetch(`${base}/studio-m0-operator/revoke-all`, { method: "POST", headers: { "x-operator-key": operatorKey, "cf-connecting-ip": "203.0.113.9" } })).status).toBe(404);
  });

  it("serves an authenticated 2026-07-28 request", async () => {
    const token = (await signIn()).token;
    const res = await fetch(`${base}/mcp/studio-m0`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`, "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} } } }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { tools: unknown[] } }).result.tools.length).toBeGreaterThanOrEqual(9);
  });

  it("isn't mounted unless asked for", async () => {
    const plain = await startMcpServer({ roomServerUrl: "http://127.0.0.1:9", allowedOrigins: [] });
    const res = await fetch(`http://127.0.0.1:${plain.port}/mcp/studio-m0`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(405);
    expect((await fetch(`http://127.0.0.1:${plain.port}/.well-known/oauth-authorization-server`)).status).toBe(404);
    await plain.close();
  });
});
