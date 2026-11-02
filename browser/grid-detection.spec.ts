import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { LibraryAsset } from "@vtt/shared";

const estimate = { status: "suggested", attempt: 1, candidate: { cellSize: 64.125, offsetX: 7.25, offsetY: 13.5 } };
let accountCookies: Parameters<BrowserContext["addCookies"]>[0] | null = null;
async function account(page: Page) {
  await page.goto("/");
  if (accountCookies) { await page.context().addCookies(accountCookies); return; }
  const signedUp = await page.request.post("/api/auth/signup", { data: { email: `grid-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Grid GM" } });
  expect(signedUp.status()).toBe(201);
  accountCookies = await page.context().cookies();
}
async function upload(page: Page, name: string) {
  const image = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#354b52" } }).png().toBuffer();
  const response = await page.request.post("/api/library", { multipart: { kind: "map", name, width: "800", height: "600",
    file: { name: "map.png", mimeType: "image/png", buffer: image } } });
  expect(response.status()).toBe(201);
  return await response.json() as LibraryAsset;
}
async function openAsset(page: Page, name: string) {
  await page.getByLabel("Search by name").fill(name);
  await page.getByRole("button", { name: "Edit grid", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Set up map", exact: true });
  await expect(editor).toBeVisible();
  return editor;
}
async function discard(page: Page) {
  const editor = page.getByRole("dialog", { name: /^(Set up map|Edit map)$/ });
  if (await editor.locator(".modal-close").getAttribute("aria-label") === "Set up manually") {
    await editor.locator(".modal-close").click();
  }
  await editor.getByLabel("Close", { exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Save changes?", exact: true });
  if (await prompt.isVisible()) await prompt.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(editor).toHaveCount(0);
}

test("grid estimates prefill once, protect typed/anchor drafts, saved grids and switched maps (FR-GM-03)", async ({ page }, testInfo) => {
  await account(page);
  const first = await upload(page, "Grid one");
  const second = await upload(page, "Grid two");
  let mode: "candidate" | "pending" | "denied" = "candidate";
  let polls = 0;
  await page.route(/\/api\/library\/[^/]+\/grid-detection$/, async (route) => {
    polls++;
    await route.fulfill({ status: mode === "denied" ? 403 : 200, contentType: "application/json", body: JSON.stringify(mode === "pending" ? { status: "running", attempt: 1 } : estimate) });
  });
  let saves = 0;
  page.on("request", (request) => { if (request.method() === "PATCH" && request.url().endsWith(`/api/library/${first.id}`)) saves++; });
  await page.goto("/library");
  let editor = await openAsset(page, "Grid one");
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  await expect(editor.getByText(/Grid estimate:/)).toBeVisible();
  expect(saves).toBe(0);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  expect(saves).toBe(1);
  editor = page.getByRole("dialog", { name: "Edit map", exact: true });
  await editor.getByLabel("Close", { exact: true }).click();
  // A saved grid remains authoritative when a different estimate is returned.
  await page.route(`**/api/library/${first.id}/grid-detection`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...estimate, candidate: { ...estimate.candidate, cellSize: 90 } }) }));
  await page.getByRole("button", { name: "Edit grid", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Edit map", exact: true });
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  await editor.getByLabel("Close", { exact: true }).click();

  // Typing before a delayed result, even returning to the initial value, blocks prefilling.
  mode = "pending";
  editor = await openAsset(page, "Grid two");
  await editor.getByText("Set up manually", { exact: true }).click();
  const initial = await editor.getByLabel("Cell size", { exact: true }).inputValue();
  await editor.getByLabel("Cell size", { exact: true }).fill("71");
  await editor.getByLabel("Cell size", { exact: true }).fill(initial);
  mode = "candidate";
  await expect(editor.getByRole("button", { name: "Use suggestion" })).toBeVisible();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue(initial);
  await editor.getByRole("button", { name: "Use suggestion" }).click();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  await discard(page);
  expect((await (await page.request.get("/api/library")).json() as LibraryAsset[]).find((a) => a.id === second.id)?.grid).toBeNull();

  // Placing the first anchor is intent even though no draft geometry has changed.
  mode = "pending";
  editor = await openAsset(page, "Grid two");
  await editor.getByLabel("Set up manually", { exact: true }).click();
  const canvas = editor.getByRole("group", { name: "Place grid anchors on the map" });
  await canvas.focus();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await expect(editor.getByRole("status").filter({ hasText: /^Step 2:/ })).toBeVisible();
  mode = "candidate";
  await expect(editor.getByRole("button", { name: "Use suggestion" })).toBeVisible();
  // Focusing the field clears provisional readouts, exposing the unchanged confirmed draft.
  await editor.getByLabel("Cell size", { exact: true }).focus();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue(initial);
  await editor.screenshot({ path: testInfo.outputPath("grid-anchor-protected.png") });
  await discard(page);

  // Discard blocks a late result across tab remounts within the same editor session.
  mode = "pending";
  editor = await openAsset(page, "Grid two");
  await editor.press("Escape");
  await editor.getByRole("button", { name: "Discard", exact: true }).click();
  await editor.getByRole("tab", { name: /Walls/ }).click();
  mode = "candidate";
  await editor.getByRole("tab", { name: /Grid/ }).click();
  await expect(editor.getByRole("button", { name: "Use suggestion" })).toBeVisible();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue(initial);
  await discard(page);

  // A cancelled map's delayed response cannot replace the saved grid of the next map.
  let releaseOld!: () => void;
  let oldRequested!: () => void;
  const oldArrived = new Promise<void>((resolve) => { oldRequested = resolve; });
  const oldWait = new Promise<void>((resolve) => { releaseOld = resolve; });
  const oldPattern = `**/api/library/${second.id}/grid-detection`;
  const oldHandler = async (route: import("@playwright/test").Route) => {
    oldRequested(); await oldWait;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...estimate, candidate: { ...estimate.candidate, cellSize: 120 } }) }).catch(() => {});
  };
  await page.route(oldPattern, oldHandler);
  editor = await openAsset(page, "Grid two"); await oldArrived;
  await discard(page);
  await page.getByLabel("Search by name").fill("Grid one");
  await page.getByRole("button", { name: "Edit grid", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Edit map", exact: true });
  releaseOld();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  await editor.getByLabel("Close", { exact: true }).click();
  await page.unroute(oldPattern, oldHandler);

  // Absent/denied results end polling, preserving quiet manual setup.
  mode = "denied";
  const before = polls;
  editor = await openAsset(page, "Grid two");
  await expect.poll(() => polls).toBeGreaterThan(before);
  // StrictMode may issue and abort an initial request before its second mount.
  await page.waitForTimeout(150);
  const stoppedAt = polls;
  await page.waitForTimeout(1800);
  expect(polls).toBe(stoppedAt);
  await discard(page);
});

test("an unconfigured library selection opens private setup before placement and cancellation preserves the room (FR-GM-03)", async ({ page }) => {
  await account(page);
  const map = await upload(page, "Unconfigured choice");
  await page.route(`**/api/library/${map.id}/grid-detection`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(estimate) }));
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Grid selection", displayName: "Grid GM", guestToken } });
  expect(created.status()).toBe(200);
  const credentials = { ...await created.json(), guestToken, viaAccount: true } as { roomId: string; guestToken: string };
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  let placements = 0;
  page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => { if (String(payload).includes('"type":"scene.setMap"')) placements++; }));
  await page.goto(`/r/${credentials.roomId}`);
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "From library", exact: true }).click();
  await page.getByLabel("Search library").fill(map.name);
  await page.getByRole("button", { name: map.name, exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  expect(placements).toBe(0);
  await editor.getByLabel("Close", { exact: true }).click();
  await page.getByRole("dialog", { name: /Discard|Save|Apply/ }).getByRole("button", { name: "Discard", exact: true }).click();
  expect(placements).toBe(0);
});

test("setup waits through checking, queue and fitting and first reveals the fitted grid (FR-GM-03)", async ({ page }, testInfo) => {
  await account(page);
  const map = await upload(page, "Waiting for grid");
  let release!: () => void;
  const lookup = new Promise<void>((resolve) => { release = resolve; });
  let phase: "checking" | "queued" | "running" | "suggested" = "checking";
  await page.route(`**/api/library/${map.id}/grid-detection`, async (route) => {
    if (phase === "checking") await lookup;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(phase === "suggested" ? estimate : { status: phase, attempt: 1 }) });
  });
  await page.goto("/library");
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { firstVisibleGridCells: seen });
    new MutationObserver(() => {
      const field = document.querySelector<HTMLInputElement>(".map-editor input[max='2000']");
      if (field) seen.push(field.value);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  const editor = await openAsset(page, map.name);
  await expect(editor.getByText("Checking grid…")).toBeVisible();
  await expect(editor.getByRole("tab")).toHaveCount(0);
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(editor.getByLabel("Set up manually", { exact: true })).toBeVisible();
  phase = "queued"; release();
  await expect(editor.getByText("Waiting to fit grid…")).toBeVisible();
  phase = "running";
  await expect(editor.getByText("Fitting grid…")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await editor.locator(".map-grid-spinner").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await editor.screenshot({ path: testInfo.outputPath("grid-fitting.png") });
  phase = "suggested";
  await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("64.125");
  await expect(editor.getByRole("group", { name: "Place grid anchors on the map" })).toBeFocused();
  const seen = await page.evaluate(() => (window as unknown as { firstVisibleGridCells: string[] }).firstVisibleGridCells);
  expect(seen.length).toBeGreaterThan(0);
  expect([...new Set(seen)]).toEqual(["64.125"]);
  const saved = (await (await page.request.get("/api/library")).json() as LibraryAsset[]).find((value) => value.id === map.id);
  expect(saved?.grid).toBeNull();
  await editor.screenshot({ path: testInfo.outputPath("grid-ready.png") });
  await discard(page);
});

test("X, manual action, Escape and backdrop skip fitting and preserve manual setup after completion (FR-GM-03)", async ({ page }) => {
  await account(page);
  const map = await upload(page, "Manual grid setup");
  let complete = false;
  await page.route(`**/api/library/${map.id}/grid-detection`, (route) => route.fulfill({ contentType: "application/json",
    body: JSON.stringify(complete ? estimate : { status: "running", attempt: 1 }) }));
  await page.goto("/library");
  for (const action of ["X", "button", "Escape", "backdrop"]) {
    complete = false;
    const editor = await openAsset(page, map.name);
    await expect(editor.getByText("Fitting grid…")).toBeVisible();
    if (action === "X") await editor.getByLabel("Set up manually", { exact: true }).click();
    else if (action === "button") await editor.getByText("Set up manually", { exact: true }).click();
    else if (action === "Escape") await editor.press("Escape");
    else await page.mouse.click(2, 2);
    await expect(editor.getByLabel("Cell size", { exact: true })).toBeVisible();
    await expect(editor.getByRole("group", { name: "Place grid anchors on the map" })).toBeFocused();
    await editor.getByLabel("Cell size", { exact: true }).fill("71");
    complete = true;
    await expect(editor.getByRole("button", { name: "Use suggestion" })).toBeVisible();
    await expect(editor.getByLabel("Cell size", { exact: true })).toHaveValue("71");
    await discard(page);
  }
  expect((await (await page.request.get("/api/library")).json() as LibraryAsset[]).find((value) => value.id === map.id)?.grid).toBeNull();
});
