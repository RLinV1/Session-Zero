import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { io } from "socket.io-client";
import { expect, test as baseTest, type APIRequestContext, type Page } from "@playwright/test";
import { SOCKET_EVENTS, emptyRoomState, reduceReceived, type CommandInput, type RoomState, type ServerMessage } from "@vtt/shared";

// One account per browser project keeps both scenarios within the real signup budget.
const test = baseTest.extend<Record<never, never>, { terrainAccount: Awaited<ReturnType<APIRequestContext["storageState"]>> }>({
  terrainAccount: [async ({ playwright }, use) => {
    const account = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5189" });
    const signup = await account.post("/api/auth/signup", { data: { email: `terrain-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Terrain GM" } });
    expect(signup.status()).toBe(201);
    await use(await account.storageState());
    await account.dispose();
  }, { scope: "worker" }],
  storageState: async ({ terrainAccount }, use) => { await use(terrainAccount); },
});

type Credentials = { roomId: string; participantId: string; guestToken: string; inviteCode?: string };
async function wire(credentials: Credentials) {
  const socket = io("http://127.0.0.1:3109", { transports: ["websocket"], auth: { roomId: credentials.roomId, guestToken: credentials.guestToken }, reconnection: false });
  let state: RoomState = emptyRoomState(credentials.roomId), seq = 0, id = 0;
  const raw: string[] = [];
  const waiting = new Map<string, (message: ServerMessage) => void>();
  const ready = new Promise<void>((resolve, reject) => {
    socket.on("connect_error", reject);
    socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => {
      raw.push(JSON.stringify(message));
      if (message.type === "welcome") { state = message.state; seq = message.seq; resolve(); }
      if (message.type === "event") { state = reduceReceived(state, message.committed); seq = message.committed.seq; }
      if (message.type === "redacted") seq = message.seq;
      if ((message.type === "ack" || message.type === "rejected") && message.clientCommandId) { waiting.get(message.clientCommandId)?.(message); waiting.delete(message.clientCommandId); }
    });
  });
  await ready;
  return {
    get state() { return state; }, get seq() { return seq; }, raw,
    close: () => socket.disconnect(),
    command: (command: CommandInput) => new Promise<ServerMessage>((resolve, reject) => {
      const clientCommandId = `terrain-${++id}`;
      const timeout = setTimeout(() => reject(new Error("No command response")), 5000);
      waiting.set(clientCommandId, (reply) => { clearTimeout(timeout); resolve(reply); });
      socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command });
    }),
  };
}
async function enter(page: Page, credentials: Credentials) {
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  await page.goto(`/r/${credentials.roomId}`);
  await expect(page.getByRole("button", { name: "Show terrain", exact: true })).toBeVisible();
}

test("terrain preparation, synchronized layers, movement restrictions and private feedback (FR-GM-15/23, FR-PL-04)", async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000); page.setDefaultTimeout(15_000);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const gmRefusals: string[] = [], gmAcks: string[] = [], gmSent: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      if (payload.includes('"type":"rejected"')) gmRefusals.push(payload);
      if (payload.includes('"type":"ack"')) gmAcks.push(payload);
    });
    socket.on("framesent", ({ payload }) => { if (typeof payload === "string" && /"type":"(?:command|ephemeral)"/.test(payload)) gmSent.push(payload); });
  });
  await page.goto("/");
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Terrain acceptance", displayName: "Terrain GM", guestToken } }); expect(created.status()).toBe(200);
  const gmCredentials = { ...await created.json(), guestToken, viaAccount: true } as Credentials;
  const playerContext = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: testInfo.project.use.viewport ?? { width: 1440, height: 1000 }, ...(testInfo.project.use.hasTouch ? { hasTouch: true, isMobile: true } : {}) });
  const playerPage = await playerContext.newPage(); playerPage.on("pageerror", (e) => errors.push(e.message));
  expect(playerPage.viewportSize()).toEqual(page.viewportSize());
  const moverFeedback: string[] = [], playerFrames: string[] = [], playerMoves: string[] = [];
  playerPage.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      playerFrames.push(payload);
      if (payload.includes('"tokenMoveFeedback"')) moverFeedback.push(payload);
    });
    socket.on("framesent", ({ payload }) => { if (typeof payload === "string" && payload.includes('"type":"token.move"')) playerMoves.push(payload); });
  });
  const playerToken = randomBytes(32).toString("base64url");
  const joined = await playerPage.request.post(`/api/invites/${gmCredentials.inviteCode}/join`, { data: { displayName: "Terrain player", guestToken: playerToken } }); expect(joined.status()).toBe(200);
  const playerCredentials = { ...await joined.json(), guestToken: playerToken } as Credentials;
  const gm = await wire(gmCredentials), player = await wire(playerCredentials);
  try {
    const image = await sharp({ create: { width: 700, height: 500, channels: 3, background: "#3c4a45" } }).png().toBuffer();
    const upload = await page.request.post("/api/library", { multipart: { kind: "map", name: "Terrain practice", width: "700", height: "500", file: { name: "terrain.png", mimeType: "image/png", buffer: image } } }); expect(upload.status()).toBe(201);
    const asset = await upload.json() as { id: string; url: string; width: number; height: number };
    const preparation = await (await page.request.get(`/api/library/${asset.id}/preparation`)).json() as { revision: string };
    const grid = { cellSize: 50, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
    const saved = await page.request.put(`/api/library/${asset.id}/preparation`, { data: { revision: preparation.revision, grid, board: { walls: [], fog: [], terrain: [] } } }); expect(saved.status()).toBe(200);
    expect((await gm.command({ type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, includeLibraryBoard: true })).type).toBe("ack");
    expect((await gm.command({ type: "token.create", name: "Scout", color: "#4477aa", position: { x: 25, y: 25 }, ownerIds: [playerCredentials.participantId] })).type).toBe("ack");
    await enter(page, gmCredentials); await enter(playerPage, playerCredentials);
    await expect(playerPage.getByRole("button", { name: "Paint terrain", exact: true })).toHaveCount(0);
    // Walls stay private; the mover's route gets private collision feedback instead.
    expect((await gm.command({ type: "wall.add", walls: [{ a: { x: 100, y: 0 }, b: { x: 100, y: 100 } }] })).type).toBe("ack");
    await expect.poll(() => player.seq).toBe(gm.seq); expect(player.state.walls).toEqual({});
    await playerPage.getByRole("tab", { name: "Tokens", exact: true }).click();
    await playerPage.getByRole("button", { name: "Scout", exact: true }).click();
    const playerHost = playerPage.locator(".board-canvas"), playerBox = (await playerHost.boundingBox())!;
    const playerScale = Math.min(playerBox.width / 700, playerBox.height / 500) * .95;
    const playerFrom = { x: playerBox.x + playerBox.width / 2, y: playerBox.y + playerBox.height / 2 };
    await playerPage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await playerPage.mouse.move(playerFrom.x, playerFrom.y); await playerPage.mouse.down(); await playerPage.mouse.move(playerFrom.x + 150 * playerScale, playerFrom.y, { steps: 8 });
    await expect.poll(() => moverFeedback.at(-1)).toContain('"status":"blocked"');
    const redPixels = async () => {
      const screenshot = await playerHost.locator("canvas").screenshot();
      const metadata = await sharp(screenshot).metadata(), density = metadata.width! / playerBox.width;
      // Inspect only the middle of the route, away from the token and HTML tool buttons.
      const crop = { left: Math.floor((playerBox.width / 2 + 150 * playerScale * .25) * density), top: Math.floor((playerBox.height / 2 - 6) * density), width: Math.ceil(150 * playerScale * .5 * density), height: Math.ceil(12 * density) };
      const { data, info } = await sharp(screenshot).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let count = 0; for (let i = 0; i < data.length; i += info.channels) if (data[i]! > 150 && data[i]! > data[i + 1]! * 1.35 && data[i]! > data[i + 2]! * 1.35) count++;
      return count;
    };
    await expect.poll(redPixels).toBeGreaterThan(20);
    await playerPage.screenshot({ path: testInfo.outputPath("terrain-player-blocked-route.png") });
    // Removing a hidden wall refreshes a stationary drag; no wall geometry is needed by the browser.
    expect((await gm.command({ type: "wall.clear" })).type).toBe("ack");
    await expect.poll(() => moverFeedback.at(-1)).toContain('"status":"clear"');
    await expect.poll(redPixels).toBeLessThan(10);
    await playerPage.keyboard.press("Escape"); await playerPage.mouse.up();
    expect(Object.values(player.state.tokens)[0]!.position).toEqual({ x: 25, y: 25 });
    expect(player.raw.join("\n")).not.toContain("tokenMoveFeedback"); expect(gm.raw.join("\n")).not.toContain("tokenMoveFeedback");
    await page.getByRole("button", { name: "Paint terrain", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Live terrain", exact: true });
    const canvas = editor.getByRole("application", { name: "Live terrain canvas" });
    await canvas.focus(); await canvas.press("ArrowRight"); await canvas.press("Enter"); await canvas.press("ArrowRight"); await canvas.press("Enter");
    await expect.poll(() => gm.state.terrain?.base).toEqual([{ row: 0, start: 1, end: 2, kind: "difficult" }]);
    await expect.poll(() => player.state.terrainView?.runs).toEqual(gm.state.terrain!.base);
    await editor.getByRole("button", { name: "Normal / Erase layer", exact: true }).click();
    await canvas.focus(); await canvas.press("Enter");
    const erasePreview = editor.getByLabel("Erase preview", { exact: true });
    await expect(erasePreview.locator("text")).toHaveCount(0);
    await expect(erasePreview.locator("rect")).toHaveAttribute("fill", "#ffffff");
    await editor.screenshot({ path: testInfo.outputPath("terrain-erase-preview.png") });
    await canvas.press("Escape");
    await editor.getByRole("button", { name: "Difficult · ×2", exact: true }).click();
    await editor.getByLabel("New temporary effect").fill("Private spell name"); await editor.getByRole("button", { name: "Create effect", exact: true }).click();
    await expect.poll(() => gm.state.terrain?.effects.length).toBe(1);
    await editor.getByRole("combobox", { name: "Layer", exact: true }).selectOption({ label: "Private spell name" });
    await editor.getByRole("button", { name: "Blocked", exact: true }).click();
    await canvas.focus(); await canvas.press("Enter"); await canvas.press("Enter");
    await expect.poll(() => gm.state.terrain?.effects[0]?.runs.length).toBe(1);
    await expect.poll(() => player.state.terrainView?.temporary.length).toBe(1);
    await editor.getByRole("button", { name: "Remove Private spell name", exact: true }).click();
    await expect.poll(() => gm.state.terrain?.effects.length).toBe(0);
    await expect(editor.getByRole("combobox", { name: "Layer", exact: true })).toBeEnabled();
    await expect(editor.getByRole("combobox", { name: "Layer", exact: true })).toHaveValue("base");
    expect(gm.state.terrain?.base).toEqual([{ row: 0, start: 1, end: 2, kind: "difficult" }]);
    await canvas.focus(); await canvas.press("Enter");
    await expect(editor.getByRole("button", { name: "Apply preview" })).toBeVisible();
    await canvas.press("Escape");
    await expect(editor.getByRole("button", { name: "Apply preview" })).toHaveCount(0);
    await editor.screenshot({ path: testInfo.outputPath("terrain-editor.png") });
    const viewport = page.viewportSize()!; const close = editor.getByRole("button", { name: "Close", exact: true }); const closeBox = await close.boundingBox();
    expect(closeBox!.y).toBeGreaterThanOrEqual(0); expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(viewport.height);
    await close.click();
    await page.getByRole("tab", { name: "Manage", exact: true }).click();
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    const preparationEditor = page.getByRole("dialog", { name: "Edit map", exact: true });
    await preparationEditor.getByRole("tab", { name: /Terrain$/ }).click();
    const privateCanvas = preparationEditor.getByRole("application", { name: "Terrain preparation canvas" });
    const privateSeq = gm.seq;
    await privateCanvas.focus(); await privateCanvas.press("Enter"); await privateCanvas.press("Enter");
    await expect(preparationEditor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
    expect(gm.seq).toBe(privateSeq);
    const committedBase = structuredClone(gm.state.terrain?.base);
    await preparationEditor.getByRole("tab", { name: /Grid$/ }).click();
    const keepDraft = page.getByRole("dialog", { name: "Save changes?", exact: true });
    await expect(keepDraft).toBeVisible();
    await keepDraft.getByRole("button", { name: "Keep draft and edit grid", exact: true }).click();
    await preparationEditor.getByLabel("Distance per square", { exact: true }).fill("10");
    // The grid's form-associated submit must preserve the separate private terrain Save.
    await preparationEditor.locator('button[type="submit"][form]').click();
    await expect.poll(() => gm.state.scene.grid.unitsPerCell).toBe(10);
    expect(gm.state.terrain?.base).toEqual(committedBase);
    await expect(preparationEditor.getByText(/Unsaved changes/)).toBeVisible();
    // Restore the units used by the remaining movement acceptance assertions.
    await preparationEditor.getByLabel("Distance per square", { exact: true }).fill("5");
    await preparationEditor.locator('button[type="submit"][form]').click();
    await expect.poll(() => gm.state.scene.grid.unitsPerCell).toBe(5);
    await preparationEditor.getByRole("tab", { name: /Terrain$/ }).click();
    await preparationEditor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => gm.state.terrain?.base).toEqual([{ row: 0, start: 0, end: 2, kind: "difficult" }]);
    await preparationEditor.getByRole("button", { name: "Close", exact: true }).click();
    // Focus through the roster so the token is centred away from the tool rail and toolbar.
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.getByRole("tab", { name: "Tokens", exact: true }).click();
    await page.getByRole("button", { name: "Scout", exact: true }).click();
    const host = page.locator(".board-canvas"), box = (await host.boundingBox())!;
    const scale = Math.min(box.width / 700, box.height / 500) * .95;
    const point = (x: number, y: number) => ({ x: box.x + box.width / 2 + (x - 25) * scale, y: box.y + box.height / 2 + (y - 25) * scale });
    const from = point(25, 25), to = point(175, 25);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 });
    // The private Pixi ruler doesn't appear in the player's DOM or wire payloads.
    await page.keyboard.press("Escape"); await page.mouse.up();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const scout = Object.values(gm.state.tokens).find((t) => t.name === "Scout")!;
    expect(scout.position).toEqual({ x: 25, y: 25 });
    await page.mouse.click(from.x, from.y);
    const card = page.getByRole("complementary", { name: "Scout details" }); await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 75, y: 25 });
    await expect(page.getByRole("status").filter({ hasText: "Cost 10 ft" })).toBeVisible();
    // Paint over an occupied token, then ordinary movement is refused until GM resolution.
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 1, end: 1, kind: "blocked" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That move is unavailable." })).toBeVisible();
    // A refused destination consumes Reposition too; it never carries into a second attempt.
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 2, end: 2, kind: "blocked" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    const cancelSeq = gm.seq;
    await card.getByRole("button", { name: "Reposition next move" }).click();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("button", { name: "Reposition next move" })).toHaveAttribute("aria-pressed", "false");
    expect(gm.seq).toBe(cancelSeq);
    const beforeRepositionRefusal = gmRefusals.length;
    await card.getByRole("button", { name: "Reposition next move" }).click();
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gmRefusals.length).toBe(beforeRepositionRefusal + 1);
    await expect(card.getByRole("button", { name: "Reposition next move" })).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByRole("group", { name: "Move Scout", exact: true })).not.toHaveAttribute("aria-busy", "true");
    expect(gm.state.tokens[scout.id]?.position).toEqual({ x: 75, y: 25 });
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 2, end: 2, kind: "difficult" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gmRefusals.length).toBe(beforeRepositionRefusal + 2);
    await expect(page.getByRole("alert").filter({ hasText: "That move is unavailable." })).toBeVisible();
    expect(gm.state.tokens[scout.id]?.position).toEqual({ x: 75, y: 25 });
    await card.getByRole("button", { name: "Reposition next move" }).click();
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 125, y: 25 });
    await expect(card.getByRole("button", { name: "Reposition next move" })).toHaveAttribute("aria-pressed", "false");
    await card.getByRole("switch", { name: "Move with arrow keys", exact: true }).check();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 175, y: 25 });
    const cardBox = (await card.boundingBox())!, boardBox = (await host.boundingBox())!;
    expect(cardBox.y).toBeGreaterThanOrEqual(boardBox.y); expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(boardBox.y + boardBox.height);
    const cardClose = (await card.getByRole("button", { name: "Close token details" }).boundingBox())!;
    expect(cardClose.y).toBeGreaterThanOrEqual(boardBox.y);
    const readout = (await card.getByRole("status").boundingBox())!;
    expect(readout.y).toBeGreaterThanOrEqual(cardBox.y); expect(readout.y + readout.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
    // Fog alone permits ordinary GM drag, button, arrow-key and positional editing paths.
    expect((await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 200, y: 0 }, to: { x: 350, y: 100 } } })).type).toBe("ack");
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 4, end: 4, kind: "difficult" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    await expect.poll(() => player.seq).toBe(gm.seq);
    expect(await player.command({ type: "token.move", tokenId: scout.id, to: { x: 225, y: 25 }, expectedOrigin: { x: 175, y: 25 }, boardEpoch: player.state.boardEpoch ?? 0 })).toMatchObject({ type: "ack" });
    expect(await gm.command({ type: "token.move", tokenId: scout.id, to: { x: 175, y: 25 } })).toMatchObject({ type: "ack" });
    await expect(page.getByRole("status").filter({ hasText: new RegExp(`seq ${gm.seq}$`) })).toBeVisible();
    await page.getByRole("button", { name: "Scout", exact: true }).click();
    const fogBox = (await host.boundingBox())!;
    const fogPoint = (x: number, y: number) => ({ x: fogBox.x + fogBox.width / 2 + (x - 175) * scale, y: fogBox.y + fogBox.height / 2 + (y - 25) * scale });
    const fogFrom = fogPoint(175, 25), fogTo = fogPoint(225, 25);
    await card.getByRole("button", { name: "Close token details" }).click();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.move(fogFrom.x, fogFrom.y); await page.mouse.down(); await page.mouse.move(fogTo.x, fogTo.y, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 225, y: 25 });
    // The wire observer can receive the move before this page renders its new hit area.
    await expect(page.getByRole("status").filter({ hasText: new RegExp(`seq ${gm.seq}$`) })).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.click(fogTo.x, fogTo.y);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 275, y: 25 });
    await expect(card.getByRole("status")).toContainText("Cost 10 ft");
    await expect(card.getByRole("group", { name: "Move Scout", exact: true })).not.toHaveAttribute("aria-busy", "true");
    const caughtUp = () => expect(page.getByRole("status").filter({ hasText: new RegExp(`seq ${gm.seq}$`) })).toBeVisible();
    await caughtUp();
    // An owner can leave fog after the GM puts their token there.
    await expect.poll(() => player.state.tokens[scout.id]?.position).toEqual({ x: 275, y: 25 });
    expect(await player.command({ type: "token.move", tokenId: scout.id, to: { x: 375, y: 25 } })).toMatchObject({ type: "ack" });
    expect(await gm.command({ type: "token.move", tokenId: scout.id, to: { x: 275, y: 25 } })).toMatchObject({ type: "ack" });
    await caughtUp();
    const beforeArrow = gmAcks.length;
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 325, y: 25 });
    await expect.poll(() => gmAcks.length).toBe(beforeArrow + 1);
    await caughtUp();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 375, y: 25 });
    await expect(card.getByRole("button", { name: "Reposition next move" })).toHaveAttribute("aria-pressed", "false");
    await card.getByRole("button", { name: "Edit Scout", exact: true }).click();
    const tokenEditor = page.getByRole("dialog", { name: "Edit Scout", exact: true });
    await tokenEditor.locator("summary").filter({ hasText: "Advanced" }).click();
    await tokenEditor.getByLabel("Board X", { exact: true }).fill("225");
    await tokenEditor.getByRole("button", { name: "Save", exact: true }).click();
    await tokenEditor.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 225, y: 25 });
    await expect(tokenEditor).toHaveCount(0);
    // A physical edit made while the pointer is down is revalidated on release, even under fog.
    const changedFrom = fogPoint(225, 25), changedTo = fogPoint(325, 25);
    await expect(card).toHaveCount(0);
    await page.mouse.move(changedFrom.x, changedFrom.y); await page.mouse.down(); await page.mouse.move(changedTo.x, changedTo.y, { steps: 8 });
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 5, end: 5, kind: "blocked" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    await page.mouse.up();
    await expect(page.getByRole("alert").filter({ hasText: "That move is unavailable." })).toBeVisible();
    expect(gm.state.tokens[scout.id]?.position).toEqual({ x: 225, y: 25 });
    // An unowned monster's real drag inside fog sends no position, name, token or ghost to players.
    const playerStart = player.raw.length;
    expect((await gm.command({ type: "token.create", name: "Fog Stalker", position: { x: 225, y: 75 } })).type).toBe("ack");
    const monster = Object.values(gm.state.tokens).find((t) => t.name === "Fog Stalker")!;
    await page.getByRole("button", { name: "Fog Stalker", exact: true }).click();
    const monsterFrom = { x: fogBox.x + fogBox.width / 2, y: fogBox.y + fogBox.height / 2 };
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.move(monsterFrom.x, monsterFrom.y); await page.mouse.down(); await page.mouse.move(monsterFrom.x + 50 * scale, monsterFrom.y, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => gm.state.tokens[monster.id]?.position).toEqual({ x: 275, y: 75 });
    await expect.poll(() => player.seq).toBe(gm.seq);
    const monsterLog = player.raw.slice(playerStart).join("\n");
    expect(monsterLog).not.toContain(monster.id); expect(monsterLog).not.toContain("Fog Stalker"); expect(monsterLog).not.toContain("tokenDragPreview");
    await expect(playerPage.getByRole("button", { name: "Fog Stalker", exact: true })).toHaveCount(0);
    // The GM left Scout under fog. Its real owner can drag it without a rescue or Reposition.
    const playerCard = playerPage.getByRole("complementary", { name: "Scout details" });
    const playerCaughtUp = () => expect(playerPage.getByRole("status").filter({ hasText: new RegExp(`seq ${gm.seq}$`) })).toBeVisible();
    const centreOwner = async () => {
      await playerCaughtUp();
      await playerPage.getByRole("button", { name: "Scout", exact: true }).click();
      if (await playerCard.isVisible()) await playerCard.getByRole("button", { name: "Close token details" }).click();
      await playerPage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const bounds = (await playerHost.boundingBox())!;
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, scale: Math.min(bounds.width / 700, bounds.height / 500) * .95 };
    };
    const dragOwner = async (from: { x: number; y: number }, to: { x: number; y: number }, during?: () => Promise<void>) => {
      const centre = await centreOwner();
      const sightBefore = JSON.stringify(player.state.sight);
      await playerPage.mouse.move(centre.x, centre.y); await playerPage.mouse.down();
      await playerPage.mouse.move(centre.x + (to.x - from.x) * centre.scale, centre.y + (to.y - from.y) * centre.scale, { steps: 8 });
      expect(JSON.stringify(player.state.sight)).toBe(sightBefore);
      expect(player.state.tokens[scout.id]?.position).toEqual(from);
      await during?.();
      await playerPage.mouse.up();
    };
    expect((await gm.command({ type: "scene.setLineOfSight", enabled: true })).type).toBe("ack");
    expect((await gm.command({ type: "scene.setSightRange", range: 30 })).type).toBe("ack");
    await expect.poll(() => player.seq).toBe(gm.seq);
    expect(player.state.sight).not.toBeNull();
    const committedSight = JSON.stringify(player.state.sight);
    const fogBeforeOwner = structuredClone(gm.state.fog);
    await dragOwner({ x: 225, y: 25 }, { x: 225, y: 75 });
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 225, y: 75 });
    await expect.poll(() => player.seq).toBe(gm.seq);
    expect(JSON.stringify(player.state.sight)).not.toBe(committedSight);
    expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 1, start: 5, end: 5, kind: "difficult" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
    const ownerCentre = await centreOwner(); await playerPage.mouse.click(ownerCentre.x, ownerCentre.y);
    await expect(playerCard).toBeVisible();
    await expect(playerCard.getByRole("button", { name: "Reposition next move" })).toHaveCount(0);
    await playerCard.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 275, y: 75 });
    await expect(playerCard.getByRole("status")).toContainText("Cost unknown");
    await expect(playerCard.getByRole("group", { name: "Move Scout", exact: true })).not.toHaveAttribute("aria-busy", "true");
    await playerCard.getByRole("switch", { name: "Move with arrow keys", exact: true }).check();
    for (const x of [325, 375]) {
      await playerCaughtUp();
      await playerPage.keyboard.press("ArrowRight");
      await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x, y: 75 });
    }
    await playerCaughtUp();
    await playerCard.getByRole("button", { name: "Move Scout left one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 325, y: 75 });
    await expect(playerCard.getByRole("group", { name: "Move Scout", exact: true })).not.toHaveAttribute("aria-busy", "true");
    await playerCard.getByRole("button", { name: "Move Scout right one square", exact: true }).click();
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 375, y: 75 });
    expect(gm.state.fog).toEqual(fogBeforeOwner);
    // Clear endpoints on either side of a thin fog strip remain traversable.
    expect((await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 399, y: 50 }, to: { x: 399.1, y: 100 } } })).type).toBe("ack");
    const thinFog = structuredClone(gm.state.fog);
    await dragOwner({ x: 375, y: 75 }, { x: 475, y: 75 });
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 475, y: 75 });
    expect(gm.state.fog).toEqual(thinFog);
    // Adding fog over the committed origin during a drag refreshes uncertainty without immobilizing it.
    let coveredFog = structuredClone(gm.state.fog);
    await dragOwner({ x: 475, y: 75 }, { x: 525, y: 75 }, async () => {
      expect((await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 450, y: 50 }, to: { x: 650, y: 100 } } })).type).toBe("ack");
      await playerCaughtUp(); coveredFog = structuredClone(gm.state.fog);
      await playerPage.screenshot({ path: testInfo.outputPath("terrain-owner-fog-route.png") });
    });
    await expect.poll(() => gm.state.tokens[scout.id]?.position).toEqual({ x: 525, y: 75 });
    expect(gm.state.fog).toEqual(coveredFog);
    // A new concealed physical restriction still refuses the owner's actual drop.
    await dragOwner({ x: 525, y: 75 }, { x: 575, y: 75 }, async () => {
      expect((await gm.command({ type: "terrain.paint", layerId: "base", paint: [{ row: 1, start: 11, end: 11, kind: "blocked" }], context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 } })).type).toBe("ack");
      await playerCaughtUp();
    });
    await expect(playerPage.getByRole("alert").filter({ hasText: "That move is unavailable." })).toBeVisible();
    expect(gm.state.tokens[scout.id]?.position).toEqual({ x: 525, y: 75 });
    expect(gm.state.fog).toEqual(coveredFog);
    expect((await gm.command({ type: "token.configure", tokenId: monster.id, changes: { name: "Private Shade", position: { x: 325, y: 75 } } })).type).toBe("ack");
    await playerCaughtUp(); await expect.poll(() => player.seq).toBe(gm.seq);
    for (const secret of [monster.id, "Fog Stalker", "Private Shade"]) {
      expect(playerFrames.join("\n")).not.toContain(secret); expect(player.raw.join("\n")).not.toContain(secret);
    }
    expect(playerMoves.length).toBeGreaterThanOrEqual(9);
    expect(playerMoves.join("\n")).not.toContain('"reposition":true');
    await page.getByRole("button", { name: "Scout", exact: true }).click();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.click(monsterFrom.x, monsterFrom.y);
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: /^Participants,/ }).click();
    await page.getByRole("button", { name: "View the room as Terrain player", exact: true }).click();
    await expect(page.getByRole("button", { name: "Back to GM view", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reposition next move" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Move Scout right one square", exact: true })).toHaveCount(0);
    const previewSeq = gm.seq, sentBeforePreview = gmSent.length;
    await page.keyboard.press("ArrowRight");
    const previewBox = (await host.boundingBox())!;
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2); await page.mouse.down();
    await page.mouse.move(previewBox.x + previewBox.width / 2 + 50 * scale, previewBox.y + previewBox.height / 2, { steps: 8 }); await page.mouse.up();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(gm.seq).toBe(previewSeq); expect(gmSent).toHaveLength(sentBeforePreview);
    await page.getByRole("button", { name: "Back to GM view", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("terrain-board.png") });
    await playerPage.screenshot({ path: testInfo.outputPath("terrain-player.png") });
    expect(player.raw.join("\n")).not.toContain("Private spell name"); expect(player.raw.join("\n")).not.toContain('"terrainRevision"');
    expect(errors).toEqual([]);
  } finally { gm.close(); player.close(); await playerContext.close(); }
});

test("library placement refuses shifted terrain until an explicit reset (FR-GM-15, FR-REC-02)", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const guestToken = randomBytes(32).toString("hex");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Placement regression", displayName: "Terrain GM", guestToken } });
  expect(created.status()).toBe(200);
  const credentials = { ...await created.json(), guestToken } as Credentials;
  const gm = await wire(credentials);
  try {
    const image = await sharp({ create: { width: 700, height: 500, channels: 3, background: "#3c4a45" } }).png().toBuffer();
    const uploaded = await page.request.post("/api/library", { multipart: { kind: "map", name: "Prepared geometry", width: "700", height: "500", file: { name: "terrain.png", mimeType: "image/png", buffer: image } } });
    expect(uploaded.status()).toBe(201);
    const asset = await uploaded.json() as { id: string; url: string; width: number; height: number };
    const endpoint = `/api/library/${asset.id}/preparation`, preparation = await (await page.request.get(endpoint)).json() as { revision: string };
    const grid = { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
    const base = [{ row: 2, start: 2, end: 2, kind: "blocked" }];
    expect((await page.request.put(endpoint, { data: { revision: preparation.revision, grid, board: { walls: [], fog: [], terrain: base } } })).status()).toBe(200);
    expect((await gm.command({ type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, includeLibraryBoard: true })).type).toBe("ack");
    await enter(page, credentials); await page.getByRole("tab", { name: "Manage", exact: true }).click();
    const choose = async () => {
      await page.getByRole("button", { name: "Edit map", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
      await editor.getByRole("button", { name: "From library", exact: true }).click();
      await page.getByRole("dialog", { name: "Choose a map", exact: true }).getByRole("button", { name: "Prepared geometry", exact: true }).click();
      return editor;
    };
    let editor = await choose();
    await editor.getByLabel("Distance per square", { exact: true }).fill("10");
    await editor.getByRole("button", { name: "Apply map", exact: true }).click();
    await expect.poll(() => gm.state.scene.grid.unitsPerCell).toBe(10);
    expect(gm.state.terrain?.base).toEqual(base);
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    editor = await choose();
    await editor.getByLabel("Cell size", { exact: true }).fill("20");
    const beforeSeq = gm.seq;
    await editor.getByRole("button", { name: "Apply map", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("requires resetting terrain");
    expect(gm.seq).toBe(beforeSeq); expect(gm.state.scene.grid.cellSize).toBe(10); expect(gm.state.terrain?.base).toEqual(base);
    await page.screenshot({ path: testInfo.outputPath("library-terrain-reset.png") });
    await editor.getByRole("checkbox", { name: "Reset prepared terrain when applying", exact: true }).check();
    await editor.getByRole("button", { name: "Apply map", exact: true }).click();
    await expect.poll(() => gm.state.scene.grid.cellSize).toBe(20);
    expect(gm.state.terrain?.base ?? []).toEqual([]);
    expect((await gm.command({ type: "history.undo", commandId: gm.state.undo.at(-1)!.commandId })).type).toBe("ack");
    expect(gm.state.terrain?.base).toEqual(base); expect(gm.state.scene.grid.cellSize).toBe(10);
    const library = await (await page.request.get(endpoint)).json() as { grid: unknown; board: { terrain: unknown } };
    expect(library.grid).toEqual(grid); expect(library.board.terrain).toEqual(base);
    expect(errors).toEqual([]);
  } finally { gm.close(); }
});
