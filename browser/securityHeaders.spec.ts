import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { io } from "socket.io-client";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { SOCKET_EVENTS, type CommandInput, type ServerMessage } from "@vtt/shared";
import { SECURITY_HEADERS } from "../apps/web/securityHeaders";

// Build first, then VTT_TEST_CSP=1 npx playwright test browser/securityHeaders.spec.ts --project=chromium-desktop.
test.skip(process.env.VTT_TEST_CSP !== "1", "Requires the production build served by vite preview");

async function watchPolicy(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/content security policy|violates.*directive|refused to.*(?:eval|script)/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("production CSP permits sign-in, room creation, uploaded art, tokens, dice and a player join (FR-GM-01/02, FR-PL-01)", async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  const errors = await watchPolicy(page);
  const response = await page.goto("/signin");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(response!.headers()[name.toLowerCase()]).toBe(value);
  await page.getByLabel("Email", { exact: true }).fill("t@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/gm-dashboard$/);
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await page.getByLabel("Room name", { exact: true }).fill("CSP regression");
  const created = page.waitForResponse((res) => res.url().endsWith("/api/rooms") && res.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "Create room", exact: true }).click();
  const room = await (await created).json() as { roomId: string; inviteCode: string };
  await expect(page.locator(".board-canvas canvas")).toBeVisible();
  const credentials = await page.evaluate((roomId) => JSON.parse(localStorage.getItem(`vtt.credentials.${roomId}`)!) as { guestToken: string; participantId: string }, room.roomId);
  const socket = io(baseURL!, { transports: ["websocket"], auth: { roomId: room.roomId, guestToken: credentials.guestToken }, autoConnect: false, reconnection: false });
  const playerContext = await browser.newContext();
  try {
    await new Promise<void>((resolve, reject) => {
      socket.on("connect_error", reject);
      socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => { if (message.type === "welcome") resolve(); });
      socket.connect();
    });
    async function command(command: CommandInput) {
      const clientCommandId = randomUUID();
      const response = new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(SOCKET_EVENTS.event, receive); reject(new Error("No command response")); }, 5_000);
        function receive(message: ServerMessage) {
          if ((message.type === "ack" || message.type === "rejected") && message.clientCommandId === clientCommandId) {
            clearTimeout(timer); socket.off(SOCKET_EVENTS.event, receive); resolve(message);
          }
        }
        socket.on(SOCKET_EVENTS.event, receive);
      });
      socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command });
      expect((await response).type).toBe("ack");
    }
    const image = await sharp({ create: { width: 700, height: 500, channels: 3, background: "#344a45" } }).png().toBuffer();
    const uploaded = await page.request.post("/api/uploads", { headers: { authorization: `Bearer ${credentials.guestToken}` }, multipart: { purpose: "map", width: "700", height: "500", file: { name: "map.png", mimeType: "image/png", buffer: image } } });
    expect(uploaded.ok(), await uploaded.text()).toBe(true);
    const asset = await uploaded.json() as { url: string };
    await command({ type: "scene.setMap", map: { url: asset.url, width: 700, height: 500 } });
    await command({ type: "token.create", name: "CSP guard", position: { x: 105, y: 105 } });
    const conditionArt = page.waitForResponse((res) => res.url().endsWith("/img/conditions/poisoned.webp"));
    await command({ type: "token.create", name: "CSP poisoned guard", position: { x: 245, y: 245 }, conditions: ["poisoned"] });
    expect((await conditionArt).ok()).toBe(true);
    await page.getByRole("tab", { name: "Dice", exact: true }).click();
    await page.locator(".dice-form").getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator(".roll-log")).toContainText("1d20");

    const player = await playerContext.newPage();
    const playerErrors = await watchPolicy(player);
    await player.goto(`${baseURL}/join/${room.inviteCode}`);
    await player.getByLabel("Your name", { exact: true }).fill("CSP player");
    await player.getByRole("button", { name: "Join", exact: true }).click();
    await expect(player.locator(".board-canvas canvas")).toBeVisible();
    const fogArt = player.waitForResponse((res) => res.url().endsWith("/img/fog/fog-bank.webp"));
    await command({ type: "fog.add", region: { shape: "rect", from: { x: 490, y: 350 }, to: { x: 650, y: 490 } } });
    expect((await fogArt).ok()).toBe(true);
    await command({ type: "dice.roll", expression: "1d6", visibility: "public" });
    await expect(page.locator(".roll-log")).toContainText("1d6");
    expect(errors).toEqual([]);
    expect(playerErrors).toEqual([]);
  } finally {
    socket.disconnect();
    await playerContext.close();
    await page.request.delete(`/api/rooms/${room.roomId}`);
  }
});

test("production CSP refuses a frame from another origin", async ({ page, baseURL }) => {
  const frameErrors: string[] = [];
  page.on("console", (message) => { if (/frame-ancestors|X-Frame-Options/i.test(message.text())) frameErrors.push(message.text()); });
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<iframe src="${baseURL}" title="Blocked application"></iframe>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No frame server address");
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect.poll(() => frameErrors.length).toBeGreaterThan(0);
    expect(page.frames().some((frame) => frame.url() === `${baseURL}/`)).toBe(false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test("a cold board opens promptly even when label fonts stall (FR-PL-03)", async ({ page }, testInfo) => {
  const requests: Array<{ url: string; startedAt: number }> = [];
  page.on("request", (request) => requests.push({ url: request.url(), startedAt: request.timing().startTime }));
  const signin = await page.request.post("/api/auth/signin", { data: { email: "t@gmail.com", password: "password" } });
  expect(signin.ok()).toBe(true);
  const guestToken = randomUUID().replaceAll("-", "");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Load regression", displayName: "GM", guestToken } });
  expect(created.ok()).toBe(true);
  const room = await created.json() as { roomId: string; participantId: string; inviteCode: string };
  await page.addInitScript((credentials) => {
    localStorage.setItem(`vtt.credentials.${credentials.roomId}`, JSON.stringify(credentials));
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = (font, text) => {
      if (!font.includes("Geist")) return load(font, text);
      if (!performance.getEntriesByName("board-font-requested").length) performance.mark("board-font-requested");
      return new Promise<FontFace[]>(() => {});
    };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".board-canvas canvas")) return;
      performance.mark("board-canvas-ready");
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { ...room, guestToken, viaAccount: true });
  try {
    await page.goto(`/r/${room.roomId}`);
    await expect(page.locator(".board-canvas canvas")).toBeVisible();
    const { boardReadyAt, ...timings } = await page.evaluate(() => {
      const ready = performance.getEntriesByName("board-canvas-ready")[0]!.startTime;
      const font = performance.getEntriesByName("board-font-requested")[0]!.startTime;
      const resources = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((entry) => entry.startTime < ready);
      return { boardReadyAt: performance.timeOrigin + ready, boardReadyMs: Math.round(ready), fontGateMs: Math.round(ready - font), initialRequests: resources.length,
        transferredBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0) };
    });
    const metrics = { ...timings, earlyEffectRequests: requests.filter((request) =>
      request.startedAt <= boardReadyAt && /\/img\/(fx|fog|conditions)\//.test(request.url)).length };
    await testInfo.attach("board-load-metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    console.log("cold board load", metrics);
    expect(metrics.fontGateMs).toBeLessThan(1000);
    expect(metrics.earlyEffectRequests).toBe(0);
  } finally {
    await page.request.delete(`/api/rooms/${room.roomId}`);
  }
});
