import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, test, type Locator } from "@playwright/test";

/** Controlled complete synthetic export; real exporter qualification lives in server fixtures. */
async function fixture() {
  const image = await sharp({ create: { width: 800, height: 600, channels: 4, background: "#334a56" } }).png().toBuffer();
  return Buffer.from(JSON.stringify({ format: 0.3, image: image.toString("base64"), resolution: { map_origin: { x: -0.25, y: 0.5 }, map_size: { x: 16, y: 12 }, pixels_per_grid: 50 },
    line_of_sight: [[{ x: -0.25, y: 2.5 }, { x: 15.75, y: 2.5 }]], objects_line_of_sight: [[{ x: 1, y: 5 }, { x: 2, y: 5 }]],
    portals: [{ bounds: [{ x: 2, y: 2.5 }, { x: 3, y: 2.5 }], position: { x: 1, y: 0 }, rotation: 0.8, closed: false, freestanding: true }],
  }));
}

test("UVTT preview, alignment, portal edits, cancellation, errors, Apply, Undo and download (FR-GM-06/07/12)", async ({ page, browser, browserName }, testInfo) => {
  await testInfo.attach("browser-version", { body: browser.version(), contentType: "text/plain" });
  const activate = (control: Locator) => testInfo.project.use.hasTouch ? control.tap() : control.click();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  expect((await page.request.get("/api/health")).ok()).toBe(true);
  const signup = await page.request.post("/api/auth/signup", { data: { email: `uvtt-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "UVTT GM" } });
  expect(signup.status()).toBe(201);
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "UVTT browser check", displayName: "UVTT GM", guestToken } });
  expect(created.status()).toBe(200);
  const credentials = { ...(await created.json()), guestToken, viaAccount: true } as { roomId: string; participantId: string; guestToken: string };
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  await page.goto(`/r/${credentials.roomId}`);
  const manage = page.getByRole("tab", { name: "Manage", exact: true });
  await activate(manage);
  const opener = page.getByLabel("Upload battle map").first();
  await opener.setInputFiles({ name: "map.dd2vtt", mimeType: "application/json", buffer: await fixture() });
  const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
  const input = editor.getByLabel("Upload battle map");

  await expect(editor.getByText(/Draft map: only you see it|Unsaved changes: only you see them/)).toBeVisible();
  await activate(editor.getByRole("tab", { name: /· Walls$/ }));
  await editor.getByLabel("Selected geometry").selectOption("draft:3");
  // One wall splits around the portal, one object line, then the portal.
  await expect(editor.getByLabel("Door position X")).toHaveValue("62.5");
  await expect(editor.getByLabel("Door position Y")).toHaveValue("-25");
  const canvas = editor.getByRole("application");
  await expect(canvas).toBeVisible();
  // The first point equals map_origin: it maps to pixel zero before the portal split.
  await expect(canvas.locator('line[x1="0"][y1="100"][x2="112.5"][y2="100"]')).toHaveCount(2);
  await expect(canvas.locator('line[x1="112.5"][y1="100"][x2="162.5"][y2="100"]')).toHaveCount(2);
  await canvas.screenshot({ path: testInfo.outputPath(`${browserName}-uvtt-preview.png`) });
  const box = await canvas.boundingBox(); expect(box && box.width > 100 && box.height > 100).toBeTruthy();
  if (testInfo.project.use.hasTouch && box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await editor.getByLabel("Closed (blocks movement)").check();
  await editor.getByLabel("End B X").fill("190");
  await activate(editor.getByRole("button", { name: "Save geometry" }));
  await expect(canvas.locator('line[x1="190"][y1="100"][x2="800"][y2="100"]')).toHaveCount(2);
  await editor.screenshot({ path: testInfo.outputPath(`${browserName}-uvtt-portal-editor.png`) });
  await activate(editor.getByLabel("Close", { exact: true }));
  await activate(page.getByRole("button", { name: "Keep editing", exact: true }));
  await expect(editor).toBeVisible();
  await activate(editor.getByLabel("Close", { exact: true }));
  await activate(page.getByRole("button", { name: "Discard", exact: true }));
  await expect(opener).toBeFocused();
  await opener.setInputFiles({ name: "bad.uvtt", mimeType: "application/json", buffer: Buffer.from('{"format":2}') });
  await expect(editor.getByRole("alert")).toContainText(/Supported UVTT|invalid/);
  await input.setInputFiles({ name: "map.uvtt", mimeType: "application/json", buffer: await fixture() });
  await expect(editor.getByRole("button", { name: "Apply map", exact: true })).toBeEnabled();
  await editor.getByRole("tab", { name: /· Walls$/ }).click();
  await editor.getByLabel("Selected geometry").selectOption("draft:3");
  await editor.getByLabel("Closed (blocks movement)").check();
  await editor.getByRole("button", { name: "Save geometry" }).click();
  await editor.getByRole("button", { name: "Apply map", exact: true }).click();
  await expect(editor.getByText(/Draft map: only you see it|Unsaved changes: only you see them/)).toHaveCount(0);
  // Use main's ordinary private Save flow to designate the imported portal; retain its UVTT fields.
  await editor.getByLabel("Selected geometry").selectOption({ label: "Door 4" });
  await editor.getByLabel("Use as").selectOption("window");
  await editor.getByLabel("Window state").selectOption("locked");
  await editor.getByRole("button", { name: "Save geometry", exact: true }).click();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
  await expect(editor.getByLabel("Door position X")).toHaveValue("62.5");
  await editor.getByRole("tab", { name: /· Map$/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Export applied map (UVTT)", exact: true }).click();
  const download = await downloadPromise;
  const output = JSON.parse(await readFile((await download.path())!, "utf8")) as { format: number; portals: { closed: boolean }[]; resolution: { map_origin: { x: number; y: number } } };
  expect(output.format).toBe(0.3); expect(output.portals[0]?.closed).toBe(true);
  expect(output.resolution.map_origin).toEqual({ x: 0.75, y: 0.5 });
  await input.setInputFiles({ name: "roundtrip.uvtt", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(output)) });
  await expect(editor.getByText(/Draft map: only you see it|Unsaved changes: only you see them/)).toBeVisible();
  await editor.getByLabel("Close", { exact: true }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Activity log", exact: true });
  await history.getByRole("button", { name: /Undo.*locked window/ }).click();
  await history.getByRole("button", { name: /Undo map placement/ }).click();
  await expect(history.getByText(/undid/i).first()).toBeVisible();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await opener.setInputFiles({ name: "preview-only.uvtt", mimeType: "application/json", buffer: await fixture() });
  await expect(editor.getByText(/Draft map: only you see it|Unsaved changes: only you see them/)).toBeVisible();
  await editor.getByRole("tab", { name: /· Map$/ }).click();
  await expect(editor.getByRole("button", { name: "Export applied map (UVTT)" })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`${browserName}-uvtt-verified.png`), fullPage: true });
  expect(errors).toEqual([]);
});
