import { readFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Connecting an AI app to builds in a real browser (FR-GM-26, ADR 0073, design D7): the consent
 * page, the redirect back to the app, and disconnecting from the build page. A synthetic account,
 * synthetic builds and a synthetic AI app whose callback is intercepted; no real host is involved.
 */

const ORIGIN = "http://127.0.0.1:5189";
const REDIRECT = "https://ai-app.test.invalid/oauth/callback";

async function setUp(page: Page) {
  const request: APIRequestContext = page.context().request;
  expect((await request.post(`${ORIGIN}/api/auth/signup`, { data: { email: `studio-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Studio GM" } })).status()).toBe(201);
  const build = async (name: string) => (await (await request.post(`${ORIGIN}/api/builds`, { data: { name } })).json() as { build: { id: string } }).build.id;
  const ids = { hollow: await build("Hollow Coast"), lantern: await build("Lanternfall") };
  const client = await (await request.post(`${ORIGIN}/api/oauth/register`, { data: { client_name: "Test AI app", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" } })).json() as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, state: "browser-state", scope: "studio:build",
    resource: `${ORIGIN}/mcp/studio`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  });
  // The AI app's callback: record where the browser was sent instead of leaving the test.
  await page.route(`${REDIRECT}*`, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "callback" }));
  return { request, ids, clientId: client.client_id, verifier, consentUrl: `/studio/connect?${params}` };
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("an owner allows chosen builds, returns to the app, then disconnects on the build page (FR-GM-26)", async ({ page }, testInfo) => {
  const { request, ids, clientId, verifier, consentUrl } = await setUp(page);
  await page.goto(consentUrl);
  await expect(page.getByRole("heading", { name: "Connect an AI app to your builds" })).toBeVisible();
  await expect(page.getByText("An app that calls itself “Test AI app” is asking to work on your builds.")).toBeVisible();
  await expect(page.getByText(/Your answer goes back to ai-app\.test\.invalid/)).toBeVisible();
  await expect(page.getByLabel("Hollow Coast")).not.toBeChecked();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("consent.png"), fullPage: true });

  await page.getByRole("button", { name: "Allow" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose at least one build." })
  ).toHaveText("Choose at least one build.");
  await page.getByLabel("Hollow Coast").check();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(`${REDIRECT}*`);
  const back = new URL(page.url());
  expect(back.searchParams.get("state")).toBe("browser-state");
  expect(back.searchParams.get("iss")).toBe(ORIGIN);
  const code = back.searchParams.get("code")!;
  expect(code).toMatch(/^szs_ac_/);

  const token = await (await request.post(`${ORIGIN}/api/oauth/token`, {
    form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${ORIGIN}/mcp/studio` },
  })).json() as { access_token: string };
  const asAi = (id: string) => request.get(`${ORIGIN}/api/studio/builds/${id}`, { headers: { authorization: `Bearer ${token.access_token}` } });
  expect((await asAi(ids.hollow)).status()).toBe(200);
  expect((await asAi(ids.lantern)).status()).toBe(404);

  await page.goto(`/builds/${ids.hollow}`);
  const section = page.getByRole("region", { name: "AI app connections" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Test AI app, returning to ai-app.test.invalid")).toBeVisible();
  await expect(section.getByText("Builds: Hollow Coast")).toBeVisible();
  await expect(page.getByTestId("studio-scene")).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toBe(true);
  await section.screenshot({ path: testInfo.outputPath("connections.png") });
  await section.getByRole("button", { name: "Disconnect Test AI app" }).click();
  await expect(section.getByRole("button", { name: "Disconnect Test AI app" })).toHaveCount(0);
  await expect(section.getByText("Continue in your connected Studio")).toBeVisible();
  expect((await asAi(ids.hollow)).status()).toBe(401);
  // The launch text is available before an owner connects the build.
  await page.goto(`/builds/${ids.lantern}`);
  await expect(page.getByRole("heading", { name: "Lanternfall" })).toBeVisible();
  await section.getByText("Continue in your connected Studio").click();
  await expect(section.getByRole("textbox", { name: "Copy Studio launch text" })).toHaveValue(new RegExp(ids.lantern));
  await expect(section.getByRole("button", { name: "Disconnect Test AI app" })).toHaveCount(0);
});

test("refusing sends access_denied back and grants nothing (FR-GM-26)", async ({ page }) => {
  const { ids, consentUrl } = await setUp(page);
  await page.goto(consentUrl);
  await page.getByLabel("Hollow Coast").check();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForURL(`${REDIRECT}*`);
  expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
  await page.goto(`/builds/${ids.hollow}`);
  await expect(page.getByRole("heading", { name: "Hollow Coast" })).toBeVisible();
  const section = page.getByRole("region", { name: "AI app connections" });
  await expect(section.getByText("Continue in your connected Studio")).toBeVisible();
  await expect(section.getByRole("button", { name: "Disconnect Test AI app" })).toHaveCount(0);
});

test("a request for an unregistered address stays on the page (FR-GM-26)", async ({ page }) => {
  const { consentUrl } = await setUp(page);
  await page.goto(consentUrl.replace(encodeURIComponent(REDIRECT), encodeURIComponent("https://evil.test.invalid/cb")));
  await expect(page.getByRole("heading", { name: "This connection request can't be used" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(ORIGIN);
});

test("reads in Traditional Chinese (FR-GM-26, localization)", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("vtt.locale", "zh-TW"));
  const { consentUrl } = await setUp(page);
  await page.goto(consentUrl);
  await expect(page.getByRole("heading", { name: "將 AI 應用程式連接到你的建置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "允許" })).toBeVisible();
  await expect(page.getByText("一個自稱「Test AI app」的應用程式要求處理你的建置。")).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("consent-zh-TW.png"), fullPage: true });
});

test("asks a signed-out visitor to sign in, then comes back to the same request (FR-GM-26)", async ({ page, browser }) => {
  const { consentUrl } = await setUp(page);
  const fresh = await browser.newPage();
  try {
    await fresh.goto(consentUrl);
    await fresh.waitForURL(/\/signin\?next=/);
    expect(decodeURIComponent(new URL(fresh.url()).searchParams.get("next")!)).toBe(decodeURIComponent(consentUrl));
  } finally {
    await fresh.close();
  }
});


test("the website grid editor saves a new working revision on an enrolled map (FR-GM-27)", async ({ page }) => {
  const { request, ids: { hollow: id } } = await setUp(page);
  const base = `${ORIGIN}/api/builds/${id}`;
  const uploaded = await request.post(base + "/files?kind=map", {
    multipart: { file: { name: "chapel.png", mimeType: "image/png", buffer: await readFile(new URL("./fixtures/studio-preparation.png", import.meta.url)) } },
  });
  expect(uploaded.ok()).toBe(true);
  const { file: { id: fileId } } = await uploaded.json() as { file: { id: string } };
  const { pass } = await (await request.post(base + "/pass")).json() as { pass: string };
  const saved = await request.post(`${ORIGIN}/api/build/current/maps`, {
    headers: { authorization: `Bearer ${pass}` },
    data: { key: "chapel", name: "Chapel", fileId, proposedGrid: { cellSize: 60, offsetX: 5, offsetY: 0 } },
  });
  expect(saved.ok()).toBe(true);
  expect((await request.post(base + "/studio/context", { data: { sourceFileId: fileId, mapKey: "chapel", encounterKey: null } })).ok()).toBe(true);
  const authoring = base + "/studio/authoring/maps/chapel";
  const { inspectedVersion } = await (await request.get(authoring)).json() as { inspectedVersion: string };
  const first = await request.post(authoring + "/requests", { data: {
    inspectedVersion, encounterKey: null, operationId: randomUUID(), instruction: "Review the entry.",
    selection: { region: { minX: 0, minY: 0, maxX: 120, maxY: 120 }, layers: ["terrain"], objectIds: [], wholeObjectIds: [] },
  } });
  expect(first.ok()).toBe(true);
  const { baseRevisionId } = await first.json() as { baseRevisionId: string };

  await page.goto(`/builds/${id}#map-chapel`);
  await page.getByLabel("Offset X").fill("12");
  const posted = page.waitForResponse((res) => res.url().endsWith("/maps/chapel/grid") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm grid" }).click();
  expect((await posted).ok()).toBe(true);
  const history = await (await request.get(authoring + "/revisions")).json();
  expect(history.revisions).toMatchObject([{ id: history.workingRevisionId, parentId: baseRevisionId, actor: "owner" }, { id: baseRevisionId, parentId: null }]);
  expect(history.workingRevisionId).not.toBe(baseRevisionId);
  expect(await (await request.get(base + "/studio")).json()).toMatchObject({
    workingRevisionId: history.workingRevisionId, scene: { grid: { offsetX: 12 } },
  });
});
