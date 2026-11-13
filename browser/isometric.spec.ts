import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { io } from "socket.io-client";
import { expect, test, type Page } from "@playwright/test";
import { SOCKET_EVENTS, emptyRoomState, reduceReceived, type ServerMessage } from "@vtt/shared";

const serverUrl = process.env.VTT_BROWSER_SERVER_URL ?? "http://127.0.0.1:3109";

// Crossing the 720px breakpoint remounts the panel, which closes the editor: open it again from Manage.
async function reopenEditor(page: Page) {
  const manage = page.getByRole("tab", { name: "Manage", exact: true });
  await expect(manage).toBeVisible();
  if (await manage.getAttribute("aria-selected") !== "true") await manage.click();
  const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
  if (await showSidebar.isVisible()) await showSidebar.click();
  const section = page.getByRole("button", { name: "Battle map", exact: true });
  await expect(section).toBeVisible();
  if (await section.getAttribute("aria-expanded") === "false") { await section.scrollIntoViewIfNeeded(); await section.click(); }
  await page.getByRole("button", { name: "Edit map", exact: true }).click();
}

test("first map setup persists isometric view and token dragging uses map coordinates", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  expect((await page.request.post("/api/auth/signup", { data: { email: `iso-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Isometric GM" } })).status()).toBe(201);
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Isometric map", displayName: "Isometric GM", guestToken } });
  expect(created.ok()).toBe(true);
  const credentials = { ...await created.json(), guestToken, viaAccount: true } as { roomId: string; guestToken: string; participantId: string };
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  const socket = io(serverUrl, { transports: ["websocket"], auth: { roomId: credentials.roomId, guestToken }, reconnection: false });
  let state = emptyRoomState(credentials.roomId);
  socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => {
    if (message.type === "welcome") state = message.state;
    else if (message.type === "event") state = reduceReceived(state, message.committed);
  });
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    await page.goto(`/r/${credentials.roomId}`);
    await page.getByRole("tab", { name: "Manage", exact: true }).click();
    const image = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#57736a" } }).png().toBuffer();
    await page.getByLabel("Upload battle map").setInputFiles({ name: "isometric.png", mimeType: "image/png", buffer: image });
    const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
    const manual = editor.getByRole("button", { name: "Set up manually", exact: true });
    if (await manual.isVisible()) await manual.click();
    await editor.getByRole("radio", { name: "Isometric", exact: true }).click();
    await expect(editor.getByRole("radio", { name: "Isometric", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: testInfo.outputPath("isometric-first-setup.png") });
    await editor.getByRole("button", { name: "Apply map", exact: true }).click();
    await expect.poll(() => state.scene.isometric).toBe(true);
    await expect(editor.getByRole("tab", { name: "3 · Walls", exact: true })).toHaveAttribute("aria-selected", "true");
    await editor.getByLabel("Close", { exact: true }).click();
    const { cellSize: c, offsetX, offsetY } = state.scene.grid;
    const from = { x: offsetX + 3.5 * c, y: offsetY + 3.5 * c };
    socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId: "create-iso-token", command: { type: "token.create", name: "Scout", position: from } });
    await expect.poll(() => Object.values(state.tokens).length).toBe(1);
    const canvas = page.locator(".board-canvas canvas");
    await expect(canvas).toBeVisible();
    const rect = (await canvas.boundingBox())!;
    const a = Math.sqrt(3) / 2;
    const scale = Math.min(rect.width / (1400 * a), rect.height / 700) * 0.95;
    const screen = (p: { x: number; y: number }) => ({
      x: rect.x + (rect.width - 1400 * a * scale) / 2 + 600 * a * scale + (p.x - p.y) * a * scale,
      y: rect.y + (rect.height - 700 * scale) / 2 + (p.x + p.y) / 2 * scale,
    });
    const to = { x: offsetX + 5.5 * c, y: offsetY + 4.5 * c };
    const start = screen(from), end = screen(to);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => Object.values(state.tokens)[0]?.position).toEqual(to);
    await page.screenshot({ path: testInfo.outputPath("isometric-board.png") });
    await page.reload();
    const manage = page.getByRole("tab", { name: "Manage", exact: true });
    await expect(manage).toBeVisible();
    if (await manage.getAttribute("aria-selected") !== "true") await manage.click();
    const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
    if (await showSidebar.isVisible()) await showSidebar.click();
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await expect(editor.getByRole("radio", { name: "Isometric", exact: true })).toHaveAttribute("aria-checked", "true");
    await editor.getByLabel("Close", { exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await reopenEditor(page);
    await expect(editor.getByRole("radio", { name: "Isometric", exact: true })).toBeVisible();
    await expect(editor.getByRole("radio", { name: "Isometric", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: testInfo.outputPath("isometric-setup-mobile.png") });
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});

test("uploaded roof outlines gain editable height only in isometric view", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  expect((await page.request.post("/api/auth/signup", { data: { email: `buildings-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Building GM" } })).status()).toBe(201);
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Raised rooftops", displayName: "Building GM", guestToken } });
  expect(created.ok()).toBe(true);
  const credentials = { ...await created.json(), guestToken, viaAccount: true } as { roomId: string; guestToken: string; participantId: string };
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  const socket = io(serverUrl, { transports: ["websocket"], auth: { roomId: credentials.roomId, guestToken }, reconnection: false });
  let state = emptyRoomState(credentials.roomId);
  socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => {
    if (message.type === "welcome") state = message.state;
    else if (message.type === "event") state = reduceReceived(state, message.committed);
  });
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    await page.goto(`/r/${credentials.roomId}`);
    await page.getByRole("tab", { name: "Manage", exact: true }).click();
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><pattern id="tiles" width="16" height="12" patternUnits="userSpaceOnUse"><path d="M0 0H16V12H0Z" fill="#a85b40" stroke="#713d2b" stroke-width="2"/></pattern></defs><rect width="800" height="600" fill="#627664"/><path d="M0 360H800M420 0V600" stroke="#beb39c" stroke-width="90"/><rect x="120" y="140" width="220" height="180" fill="url(#tiles)" stroke="#533b2b" stroke-width="6"/><rect x="500" y="100" width="180" height="170" fill="url(#tiles)" stroke="#533b2b" stroke-width="6"/></svg>';
    const image = await sharp(Buffer.from(source)).png().toBuffer();
    await page.getByLabel("Upload battle map").setInputFiles({ name: "rooftops.png", mimeType: "image/png", buffer: image });
    const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
    const manual = editor.getByRole("button", { name: "Set up manually", exact: true });
    if (await manual.isVisible()) await manual.click();
    await editor.getByRole("radio", { name: "Isometric", exact: true }).click();
    await editor.getByRole("button", { name: "Outline buildings and add height", exact: true }).click();
    const canvas = editor.getByRole("application");
    for (const point of [{ x: 120, y: 140 }, { x: 340, y: 140 }, { x: 340, y: 320 }, { x: 120, y: 320 }]) {
      const at = await canvas.evaluate((element, p) => {
        const matrix = (element as SVGSVGElement).getScreenCTM()!;
        return { x: matrix.a * p.x + matrix.c * p.y + matrix.e, y: matrix.b * p.x + matrix.d * p.y + matrix.f };
      }, point);
      await page.mouse.click(at.x, at.y);
    }
    await editor.getByRole("button", { name: "Finish outline", exact: true }).click();
    const height = editor.getByRole("spinbutton", { name: "Building height (ft)", exact: true });
    await expect(height).toHaveValue("7.5");
    const roof = await editor.locator(".isometric-building > g").evaluate((element) => {
      const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
      return { x: matrix.a * 230 + matrix.c * 230 + matrix.e, y: matrix.b * 230 + matrix.d * 230 + matrix.f };
    });
    await page.mouse.move(roof.x, roof.y); await page.mouse.down();
    await page.mouse.move(roof.x, roof.y - 60, { steps: 10 }); await page.mouse.up();
    await expect.poll(async () => Number(await height.inputValue())).toBeGreaterThan(7.5);
    await height.fill("15"); await height.press("Tab");
    await page.screenshot({ path: testInfo.outputPath("raised-building-editor.png") });
    await editor.getByRole("button", { name: "Apply map", exact: true }).click();
    await expect.poll(() => state.scene.isometricBuildings?.items[0]?.height).toBe(3);
    await expect(editor.getByRole("tab", { name: "3 · Walls", exact: true })).toHaveAttribute("aria-selected", "true");
    await editor.getByLabel("Close", { exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("raised-building-board.png") });
    await page.reload();
    const manage = page.getByRole("tab", { name: "Manage", exact: true });
    await expect(manage).toBeVisible();
    if (await manage.getAttribute("aria-selected") !== "true") await manage.click();
    const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
    if (await showSidebar.isVisible()) await showSidebar.click();
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await editor.getByRole("tab", { name: "7 · Buildings", exact: true }).click();
    await expect(height).toHaveValue("15");
    await editor.getByLabel("Close", { exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await reopenEditor(page);
    await editor.getByRole("tab", { name: "7 · Buildings", exact: true }).click();
    await expect(height).toBeVisible();
    await expect(height).toHaveValue("15");
    await height.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("raised-building-mobile.png") });
    await editor.getByLabel("Close", { exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await reopenEditor(page);
    await editor.getByRole("tab", { name: "1 · Map", exact: true }).click();
    await editor.getByRole("radio", { name: "Flat", exact: true }).click();
    await expect(editor.getByRole("tab", { name: "7 · Buildings", exact: true })).toHaveCount(0);
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => state.scene.isometric).toBe(false);
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});
