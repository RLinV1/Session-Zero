import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import type { StudioSnapshot } from "@vtt/shared";

test.use({ trace: "off" });
// The view keeps polling through the host bridge; a poll still in flight when a test ends is not a failure.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });
test.setTimeout(90_000);
const ORIGIN = `http://127.0.0.1:${process.env.STUDIO_TEST_WEB_PORT}`;
const MCP = `http://127.0.0.1:${process.env.STUDIO_TEST_MCP_PORT}/mcp/studio`;
const redirect = "https://ai.test.invalid/callback";
let clientId: string;
test.beforeAll(async ({ request }) => {
  // The simulated host registers once per worker, then each test grants its own fresh build.
  const registration = await request.post(`${ORIGIN}/api/oauth/register`, { data: { client_name: "M2 browser", redirect_uris: [redirect], token_endpoint_auth_method: "none" } });
  expect(registration.status()).toBe(201);
  clientId = ((await registration.json()) as { client_id: string }).client_id;
});
const descriptor = (kind: "map" | "token") => ({ file_id: randomUUID(), download_url: `https://sdmntpreastus3.oaiusercontent.com/studio-browser-${kind}`, file_name: `synthetic-${kind}.png`, mime_type: "image/png" });
type BridgeMessage = { method: string; params: { name: string; arguments?: Record<string, unknown> } };
type Rewrite = (message: BridgeMessage) => BridgeMessage;
async function mount(page: Page, request: APIRequestContext) {
  expect((await request.post(`${ORIGIN}/api/auth/signup`, { data: { email: `${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Preparation GM" } })).status()).toBe(201);
  const { build } = await (await request.post(`${ORIGIN}/api/builds`, { data: { name: "Visible preparation", aiGrid: true, aiWalls: true, aiTerrain: true } })).json() as { build: { id: string } };
  const verifier = randomBytes(32).toString("base64url");
  const consent = await request.post(`${ORIGIN}/api/oauth/authorize`, { data: { params: { response_type: "code", state: "m2-fixture", client_id: clientId, redirect_uri: redirect, scope: "studio:build", resource: `${ORIGIN}/mcp/studio`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }, decision: "allow", buildIds: [build.id] } });
  expect(consent.status()).toBe(200);
  const { redirectTo } = await consent.json() as { redirectTo: string };
  const tokens = await (await request.post(`${ORIGIN}/api/oauth/token`, { form: { grant_type: "authorization_code", client_id: clientId, redirect_uri: redirect, resource: `${ORIGIN}/mcp/studio`, code_verifier: verifier, code: new URL(redirectTo).searchParams.get("code")! } })).json() as { access_token: string };
  const calls: { name: string; at: number }[] = [];
  let bridgeFailure = false;
  let rewrite: Rewrite | null = null;
  const post = (method: string, params: unknown) => request.post(MCP, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, data: { jsonrpc: "2.0", id: randomUUID(), method, params } });
  const rpc = async (method: string, params: unknown) => {
    const response = await post(method, params);
    expect(response.status()).toBe(200);
    const body = await response.json() as { result: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text?: string }[] } };
    return body.result;
  };
  const tool = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: { buildId: build.id, ...args } });
  const snapshot = async () => (await tool("studio_snapshot")).structuredContent as unknown as StudioSnapshot;
  const opened = await tool("studio_open", { mapFiles: [descriptor("map")], tokenFiles: [descriptor("token")] });
  const listed = await rpc("tools/list", {});
  const openTool = ((listed as unknown as { tools: { name: string; _meta: { ui: { resourceUri: string } } }[] }).tools).find((entry) => entry.name === "studio_open")!;
  const resource = await rpc("resources/read", { uri: openTool._meta.ui.resourceUri });
  const html = (resource as unknown as { contents: { text: string }[] }).contents[0]!.text;
  await page.route("**/_m2_bridge", async (route) => {
    const received = route.request().postDataJSON() as BridgeMessage;
    const message = rewrite ? rewrite(received) : received;
    if (message.method === "tools/call") calls.push({ name: message.params.name, at: Date.now() });
    let answer: unknown = { error: { code: -32000, message: "Synthetic dismissed connection" } };
    if (!bridgeFailure) {
      // A host that passes the MCP server's own JSON-RPC error (such as its sign-in challenge) back to the view.
      const response = await post(message.method, message.params);
      const body = await response.json() as { result?: unknown; error?: unknown };
      answer = response.status() === 200 ? { result: body.result } : { error: body.error };
    }
    await route.fulfill({ json: answer });
  });
  await page.route("**/m2-host", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121417"><iframe title="Studio" sandbox="allow-scripts" style="width:100%;height:1500px;border:0"></iframe><script>
const opened=${JSON.stringify(opened)};
addEventListener('message',async(event)=>{const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
const respond=(result)=>event.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
if(m.method==='ui/initialize')respond({protocolVersion:'2026-01-26',hostInfo:{name:'Local M2 host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{}},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});
else if(m.method==='ui/notifications/initialized')event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:opened},'*');
else if(m.method==='tools/call'){const a=await(await fetch('/_m2_bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)})).json();event.source.postMessage({...a,jsonrpc:'2.0',id:m.id},'*');}
else if(m.method==='ui/request-display-mode'){window.m2Expanded=true;respond({mode:'fullscreen'});}else if(m.id!==undefined)respond({});});
</script></body></html>` }));
  await page.goto(`${ORIGIN}/m2-host`);
  await page.locator("iframe").evaluate((element, html) => { (element as HTMLIFrameElement).srcdoc = html; }, html);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  return { frame, build, tool, snapshot, calls, setFailure: (value: boolean) => { bridgeFailure = value; }, setRewrite: (value: Rewrite | null) => { rewrite = value; } };
}
async function prepare(session: Awaited<ReturnType<typeof mount>>) {
  await expect.poll(async () => (await session.snapshot()).scene.detection?.status, { timeout: 35_000 }).toBe("suggested");
  const first = await session.snapshot(), file = first.files.find((file) => file.kind === "map")!, art = first.files.find((file) => file.kind === "token")!;
  const grid = first.scene.detection!.suggestion!;
  expect((await session.tool("save_map", { key: "chapel", name: "Chapel", fileId: file.id, proposedGrid: grid })).isError).not.toBe(true);
  expect((await session.tool("studio_set_context", { context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: null } })).isError).not.toBe(true);
  await expect(session.frame.getByLabel("Active map", { exact: true })).toHaveValue("map:chapel");
  return { file, art, grid };
}
const lines = [
  { kind: "wall", from: { column: 2, row: 2 }, to: { column: 8, row: 2 } },
  { kind: "door", state: "closed", from: { column: 4, row: 2 }, to: { column: 5, row: 2 } },
  { kind: "window", state: "open", from: { column: 6, row: 2 }, to: { column: 7, row: 2 } },
];
test("actual saved tools update an open Studio with the native scene (FR-GM-27)", async ({ page, request }, info) => {
  const session = await mount(page, request), { file, art } = await prepare(session);
  const savedAt = Date.now();
  const geometry = await session.tool("save_map_setup", { mapKey: "chapel", lines, terrain: [{ row: 3, start: 3, end: 3, kind: "blocked" }, { row: 10, start: 11, end: 12, kind: "difficult" }] });
  expect(geometry.isError, JSON.stringify(geometry.content)).not.toBe(true);
  await expect(session.frame.locator('[data-layer="walls"] [data-kind="door"]')).toHaveCount(1, { timeout: 6500 });
  const latency = Date.now() - savedAt;
  expect(latency).toBeLessThanOrEqual(6000);
  expect((await session.tool("save_creatures", { creatures: [{ key: "sentry", name: "Sentry", isPlayerCharacter: false, size: .5, imageFileId: art.id }, { key: "guardian", name: "Guardian", isPlayerCharacter: false, size: 2, imageFileId: art.id }] })).isError).not.toBe(true);
  expect((await session.tool("save_encounter", { key: "watch", name: "Watch", mapKey: "chapel", tokens: [{ creatureKey: "sentry", square: { column: 4, row: 4 }, hidden: false }, { creatureKey: "guardian", square: { column: 12, row: 4 }, hidden: true }] })).isError).not.toBe(true);
  await session.tool("studio_set_context", { context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: "watch" } });
  await expect(session.frame.locator('[data-layer="tokens"] [data-token-index]')).toHaveCount(2);
  await expect(session.frame.locator('[data-hidden="true"]')).toHaveCount(1);
  await expect(session.frame.locator('[data-layer="terrain"]')).toBeVisible();
  const embedded = await session.snapshot();
  const native = await (await request.get(`${ORIGIN}/api/builds/${session.build.id}/studio`)).json() as StudioSnapshot;
  expect(native.scene).toEqual(embedded.scene);
  await page.screenshot({ path: info.outputPath("saved-preparation.png"), fullPage: true });
  await info.attach("local saved-write measurements", { body: JSON.stringify({ latencyMs: latency, refreshIntervalMs: embedded.refreshIntervalMs, calls: session.calls.map((call) => call.name) }), contentType: "application/json" });
});
test("refused save keeps saved overlays, camera and focus with an actionable permission result (FR-GM-27)", async ({ page, request }) => {
  const session = await mount(page, request); await prepare(session);
  const saved = await session.tool("save_map_setup", { mapKey: "chapel", lines });
  expect(saved.isError, JSON.stringify(saved.content)).not.toBe(true);
  await expect(session.frame.locator('[data-kind="door"]')).toHaveCount(1, { timeout: 6500 });
  await session.frame.getByRole("button", { name: "Zoom in", exact: true }).click();
  const canvas = session.frame.locator('[data-testid="studio-map"]');
  const camera = await canvas.getAttribute("viewBox");
  const checkbox = session.frame.getByRole("checkbox", { name: "Grid", exact: true }); await checkbox.focus();
  expect((await request.put(`${ORIGIN}/api/builds/${session.build.id}/choices`, { data: { aiGrid: true, aiWalls: false, aiTerrain: true } })).status()).toBe(200);
  expect((await session.tool("save_map_setup", { mapKey: "chapel", lines: [], terrain: [] })).isError).toBe(true);
  await expect(session.frame.locator(".studio-last-result")).toContainText(/permission|disabled|owner/i);
  await expect(session.frame.locator('[data-kind="door"]')).toHaveCount(1);
  expect(await canvas.getAttribute("viewBox")).toBe(camera);
  await expect(checkbox).toBeFocused();
});
test("explicit context switching refuses a mismatched encounter and preserves all other drafts (FR-GM-27)", async ({ page, request }) => {
  const session = await mount(page, request), { file, grid } = await prepare(session);
  const context = (await session.snapshot()).context;
  const attached = await session.tool("studio_open", { mapFiles: [descriptor("token")], context });
  expect(attached.isError).not.toBe(true);
  expect(attached.structuredContent?.outcomes).toMatchObject([{ kind: "map", status: "saved" }]);
  const otherSource = (await session.snapshot()).files.find((candidate) => candidate.kind === "map" && candidate.id !== file.id)!;
  expect(otherSource).toBeTruthy();
  expect((await session.tool("save_map", { key: "courtyard", name: "Courtyard", fileId: otherSource.id, proposedGrid: grid })).isError).not.toBe(true);
  expect((await session.tool("save_encounter", { key: "other", name: "Other", mapKey: "courtyard", tokens: [] })).isError).not.toBe(true);
  const before = await (await request.get(`${ORIGIN}/api/builds/${session.build.id}`)).json() as { items: unknown[] };
  expect((await session.tool("studio_set_context", { context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: "other" } })).isError).toBe(true);
  expect((await session.snapshot()).context.mapKey).toBe("chapel");
  await session.frame.getByLabel("Active map", { exact: true }).selectOption("map:courtyard");
  await session.frame.getByLabel("Active encounter", { exact: true }).selectOption("other");
  await expect.poll(async () => (await session.snapshot()).context.encounterKey).toBe("other");
  const after = await (await request.get(`${ORIGIN}/api/builds/${session.build.id}`)).json() as { items: unknown[] };
  expect(after.items).toEqual(before.items);
});
test("a refused selection says so in the view and keeps live refresh going (FR-GM-27)", async ({ page, request }) => {
  const session = await mount(page, request), { file } = await prepare(session);
  // Stands in for the AI changing the build between the view's last refresh and the click: the
  // room server itself refuses an encounter that isn't on the chosen map (409 "context").
  session.setRewrite((message) => message.params.name === "studio_set_context"
    ? { ...message, params: { ...message.params, arguments: { ...message.params.arguments, context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: "missing" } } } }
    : message);
  await session.frame.getByLabel("Active map", { exact: true }).selectOption(`source:${file.id}`);
  await expect(session.frame.getByText("Could not change the active context", { exact: false })).toBeVisible();
  await expect(session.frame.getByLabel("Active map", { exact: true })).toHaveValue("map:chapel");
  await expect(session.frame.locator("#status")).toHaveAttribute("data-state","ready");
  session.setRewrite(null);
  // Still live: the AI's next save appears without a retry.
  expect((await session.tool("save_map_setup", { mapKey: "chapel", lines })).isError).not.toBe(true);
  await expect(session.frame.locator('[data-kind="door"]')).toHaveCount(1, { timeout: 6500 });
});
test("one token picture that can't load leaves the rest of the scene live (FR-GM-27)", async ({ page, request }) => {
  const session = await mount(page, request), { file, art } = await prepare(session);
  // That one picture is missing on the server (404), as a legacy file whose object is gone would be.
  session.setRewrite((message) => message.params.name === "studio_get_media" && message.params.arguments?.fileId === art.id
    ? { ...message, params: { ...message.params, arguments: { ...message.params.arguments, fileId: randomUUID() } } }
    : message);
  expect((await session.tool("save_creatures", { creatures: [{ key: "sentry", name: "Sentry", isPlayerCharacter: false, size: 1, imageFileId: art.id }] })).isError).not.toBe(true);
  expect((await session.tool("save_encounter", { key: "watch", name: "Watch", mapKey: "chapel", tokens: [{ creatureKey: "sentry", square: { column: 4, row: 4 }, hidden: false }] })).isError).not.toBe(true);
  await session.tool("studio_set_context", { context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: "watch" } });
  await expect(session.frame.locator('[data-layer="tokens"] [data-token-index]')).toHaveCount(1);
  await expect(session.frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  await expect(session.frame.locator("#status")).toHaveAttribute("data-state","ready");
  expect((await session.tool("save_map_setup", { mapKey: "chapel", lines })).isError).not.toBe(true);
  await expect(session.frame.locator('[data-kind="door"]')).toHaveCount(1, { timeout: 6500 });
});
test("ending the connection clears the private scene from an open view (FR-GM-26, FR-GM-27)", async ({ page, request }) => {
  const session = await mount(page, request); await prepare(session);
  await expect(session.frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  const { grants } = await (await request.get(`${ORIGIN}/api/builds/${session.build.id}/grants`)).json() as { grants: { id: string }[] };
  expect((await request.delete(`${ORIGIN}/api/builds/${session.build.id}/grants/${grants[0]!.id}`)).status()).toBe(204);
  await expect(session.frame.locator("#status")).toContainText("unavailable to this connection");
  await expect(session.frame.locator('[data-testid="studio-scene"]')).toHaveCount(0);
  await expect(session.frame.locator("#files li")).toHaveCount(0);
  await expect(session.frame.locator("#build")).toHaveText("");
});
test("localized keyboard review fits narrow/fullscreen layouts without moving the camera (FR-GM-27, localization)", async ({ page, request }, info) => {
  const session = await mount(page, request); await prepare(session);
  const canvas = session.frame.locator('[data-testid="studio-map"]'); await canvas.focus();
  const first = await canvas.getAttribute("viewBox"); await page.keyboard.press("ArrowRight"); expect(await canvas.getAttribute("viewBox")).not.toBe(first);
  await page.keyboard.press("Home"); expect(await canvas.getAttribute("viewBox")).toBe(first);
  const website = `${ORIGIN}/builds/${session.build.id}`;
  await expect(session.frame.getByRole("link", { name: "Or upload on the Session Zero website." })).toHaveAttribute("href", website);
  await session.frame.locator("#language").selectOption("zh-TW");
  await expect(session.frame.getByLabel("目前地圖", { exact: true })).toBeVisible();
  await expect(session.frame.getByRole("link", { name: "也可以在 Session Zero 網站上傳。" })).toHaveAttribute("href", website);
  await expect.poll(() => session.frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await session.frame.locator("#fullscreen").click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { m2Expanded?: boolean }).m2Expanded))).toBe(true);
  await page.screenshot({ path: info.outputPath("preparation-zh.png"), fullPage: true });
});
test("visible polling stays bounded and hidden/teardown or dismissed recovery stops calls (FR-GM-27)", async ({ page, request }, info) => {
  const session = await mount(page, request);
  const start = session.calls.length; await page.waitForTimeout(10_300);
  const intervalCalls = session.calls.slice(start); expect(intervalCalls.filter((call) => call.name === "studio_snapshot").length).toBeLessThanOrEqual(3);
  expect(intervalCalls.filter((call) => call.name === "studio_get_media")).toHaveLength(0);
  await session.frame.locator("body").evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const hidden = session.calls.length; await page.waitForTimeout(5200); expect(session.calls).toHaveLength(hidden);
  await session.frame.locator("body").evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  session.setFailure(true); await session.frame.locator("#refresh").click();
  await expect(session.frame.locator("#status")).toContainText("Connection interrupted");
  const failed = session.calls.length; await page.waitForTimeout(5200); expect(session.calls).toHaveLength(failed);
  session.setFailure(false); await session.frame.locator("#refresh").click(); await expect(session.frame.locator("#status")).toHaveAttribute("data-state","ready");
  await session.frame.locator("body").evaluate(() => dispatchEvent(new Event("pagehide")));
  const ended = session.calls.length; await page.waitForTimeout(5200); expect(session.calls).toHaveLength(ended);
  await info.attach("local visible-only traffic", { body: JSON.stringify({ observedMs: 10_300, calls: intervalCalls.map((call) => call.name), hiddenCalls: 0, dismissedRecoveryCalls: 0, teardownCalls: 0 }), contentType: "application/json" });
});

test("a historical Studio handoff pins the website review before publishing to a native room (FR-GM-26, FR-GM-27)", async ({ page }) => {
  // Use the browser context's own cookie jar for the signed-in website.
  const request = page.request;
  const session = await mount(page, request), { file, art } = await prepare(session);
  const base = `${ORIGIN}/api/builds/${session.build.id}`;
  expect((await session.tool("save_map_setup", { mapKey: "chapel", lines })).isError).not.toBe(true);
  expect((await session.tool("save_creatures", { creatures: [
    { key: "sentry", name: "Visible sentry", isPlayerCharacter: false, imageFileId: art.id },
    { key: "lurker", name: "Hidden lurker", isPlayerCharacter: false, imageFileId: art.id },
  ] })).isError).not.toBe(true);
  expect((await session.tool("save_encounter", { key: "watch", name: "Published watch", mapKey: "chapel",
    tokens: [
      { creatureKey: "sentry", square: { column: 4, row: 4 }, hidden: false },
      { creatureKey: "lurker", square: { column: 12, row: 4 }, hidden: true },
    ],
  })).isError).not.toBe(true);
  await session.tool("studio_set_context", { context: { sourceFileId: file.id, mapKey: "chapel", encounterKey: "watch" } });
  const authoring = `${base}/studio/authoring/maps/chapel`;
  const inspected = await (await request.get(`${authoring}?encounterKey=watch`)).json() as {
    inspectedVersion: string;
    objects: { kind: string; id: string }[];
    scene: { grid: { cellSize: number; offsetX: number; offsetY: number } };
  };
  const gate = inspected.objects.find((item) => item.kind === "door")!;
  const { cellSize, offsetX, offsetY } = inspected.scene.grid;
  const saved = await request.post(`${authoring}/requests`, { data: {
    encounterKey: "watch", instruction: "Open the chapel door.", inspectedVersion: inspected.inspectedVersion, operationId: randomUUID(),
    selection: { region: { minX: offsetX + cellSize * 3.5, minY: offsetY + cellSize * 1.5,
      maxX: offsetX + cellSize * 5.5, maxY: offsetY + cellSize * 2.5 }, layers: ["geometry"], objectIds: [gate.id], wholeObjectIds: [] },
  } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const { baseRevisionId, requestId } = await saved.json() as { baseRevisionId: string; requestId: string };
  const handoff = session.frame.getByRole("link", { name: "Review for publication" });
  await expect(handoff).toHaveAttribute("href", new RegExp(baseRevisionId));
  const oldUrl = (await handoff.getAttribute("href"))!;
  const advanced = await session.tool("studio_submit_correction", {
    requestId, baseRevisionId, operationId: randomUUID(), operations: [{ op: "line.update", id: gate.id, line: { ...lines[1], state: "open" } }],
  });
  expect(advanced.isError, JSON.stringify(advanced.content)).not.toBe(true);
  const revisionId = advanced.structuredContent?.revisionId;
  expect(revisionId).toBeTruthy();
  await expect(handoff).toHaveAttribute("href", new RegExp(String(revisionId)));

  await page.goto(oldUrl);
  const dialog = page.getByRole("dialog", { name: "Publish draft" });
  await expect(dialog.getByTestId("studio-review-candidate").locator('[data-kind="door"][data-portal-state="closed"]')).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Publish 2" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Restore this candidate" })).toBeVisible();
  const canvas = dialog.getByTestId("studio-review-candidate").getByTestId("studio-map");
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("+");
  const camera = await canvas.getAttribute("viewBox");
  const latest = dialog.getByRole("button", { name: "Review latest" });
  await latest.focus();
  await latest.click();
  await expect(dialog.getByTestId("studio-review-candidate").locator('[data-kind="door"][data-portal-state="open"]')).toHaveCount(1);
  await expect(latest).toBeFocused();
  await expect(canvas).toHaveAttribute("viewBox", camera!);
  await expect(dialog.getByText(/including embedded metadata/)).toBeVisible();

  let lostReceipt: { candidates: { mapKey: string; revisionId: string }[]; assetIds: string[] } | undefined;
  await page.route("**/publish/commit", async (route) => {
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    lostReceipt = await response.json() as typeof lostReceipt;
    await route.abort();
  }, { times: 1 });
  await dialog.getByRole("button", { name: "Publish 2" }).click();
  await expect(dialog.getByRole("button", { name: "Retry publication" })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Select all" })).toBeDisabled();
  await page.reload();
  const retried = page.waitForResponse((response) => response.url().endsWith("/publish/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Retry publication" }).click();
  const receipt = await retried;
  expect(receipt.ok(), await receipt.text()).toBe(true);
  expect(await receipt.json()).toEqual(lostReceipt);
  expect(lostReceipt?.candidates).toEqual([{ mapKey: "chapel", revisionId }]);
  await expect(dialog).toBeHidden();
  const loaded = new Set<string>();
  page.on("response", (response) => {
    const asset = /\/uploads\/studio-original-([0-9a-f-]+)\.png$/.exec(response.url())?.[1];
    if (asset && response.ok()) loaded.add(asset);
  });
  const started = page.waitForResponse((response) => response.url().endsWith("/api/rooms") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Start a room", exact: true }).click();
  expect((await started).ok()).toBe(true);
  await expect(page).toHaveURL(/\/r\/[a-z0-9-]+/i);
  await expect.poll(() => [...loaded].sort()).toEqual([...lostReceipt!.assetIds].sort());
});
