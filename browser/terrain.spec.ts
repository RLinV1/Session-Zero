import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { io } from "socket.io-client";
import { expect, test as baseTest, type APIRequestContext, type Page } from "@playwright/test";
import { SOCKET_EVENTS, emptyRoomState, reduceReceived, type CommandInput, type RoomState, type ServerMessage } from "@vtt/shared";

// One account per browser project keeps the scenario within the real signup budget.
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
  await expect(page.locator(".board-canvas canvas")).toBeVisible();
  // Terrain shows by default; only the GM has a Show menu (board-view-filters).
  const show = page.getByRole("button", { name: "Show", exact: true });
  if (await show.count()) {
    await show.click();
    await expect(page.getByLabel("Terrain", { exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
  }
}

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
    await editor.getByRole("checkbox", { name: "Reset prepared terrain when applying", exact: true }).setChecked(true);
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
