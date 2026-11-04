import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { INITIAL_SCENE_ID, SOCKET_EVENTS, emptyRoomState, reduceReceived, sceneNamesOf, type CommandInput, type ServerMessage } from "@vtt/shared";

test("GM switches scenes from the header and returns to preserved tokens", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const signup = await page.request.post("/api/auth/signup", { data: { email: `scenes-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Scenes GM" } });
  expect(signup.status()).toBe(201);
  const guestToken = randomBytes(32).toString("base64url");
  const created = await page.request.post("/api/rooms", { data: { roomName: "Scenes browser check", displayName: "Scenes GM", guestToken } });
  expect(created.ok()).toBe(true);
  const credentials = { ...(await created.json()), guestToken, viaAccount: true } as { roomId: string; participantId: string; guestToken: string };
  await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  const socket = io("http://127.0.0.1:3109", { transports: ["websocket"], auth: { roomId: credentials.roomId, guestToken }, reconnection: false });
  let state = emptyRoomState(credentials.roomId);
  socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => {
    if (message.type === "welcome") state = message.state;
    else if (message.type === "event") state = reduceReceived(state, message.committed);
  });
  let counter = 0;
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    const command = (input: CommandInput) => new Promise<void>((resolve, reject) => {
      const clientCommandId = `browser-${++counter}`;
      const listener = (message: ServerMessage) => {
        if ((message.type === "ack" || message.type === "rejected") && message.clientCommandId === clientCommandId) {
          socket.off(SOCKET_EVENTS.event, listener);
          if (message.type === "ack") resolve(); else reject(new Error(message.message));
        }
      };
      socket.on(SOCKET_EVENTS.event, listener);
      socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command: input });
    });
    await command({ type: "scene.rename", sceneId: state.activeSceneId ?? INITIAL_SCENE_ID, name: "Tavern" });
    await command({ type: "scene.setMap", map: { url: "/img/map-emberwatch-archive.webp", width: 1960, height: 1400 } });
    const liveTerrain = [{ row: 3, start: 3, end: 3, kind: "blocked" as const }];
    await command({ type: "terrain.paint", layerId: "base", context: { boardEpoch: state.boardEpoch ?? 0, revision: state.terrainRevision ?? 0 }, paint: liveTerrain });
    await command({ type: "token.create", name: "Tavern guard", position: { x: 35, y: 35 }, stats: { hp: 3, maxHp: 10, ac: null } });
    await page.goto(`/r/${credentials.roomId}`);
    await page.getByRole("tab", { name: "Manage", exact: true }).click();
    await page.getByRole("button", { name: "New scene", exact: true }).click();
    await page.getByLabel("Scene name").fill("Cellar");
    await page.keyboard.press("Enter");
    const setup = page.getByRole("dialog", { name: "Prepare scene" });
    await expect(setup.getByRole("button", { name: "Encounter template", exact: true })).toBeVisible();
    await expect(setup.getByRole("button", { name: "Map", exact: true })).toBeVisible();
    await expect(setup.getByRole("button", { name: "Checkpoint", exact: true })).toHaveCount(0);
    await setup.getByRole("button", { name: "Current map", exact: true }).click();
    await expect(setup).toBeHidden();
    await expect(page.locator(".board-canvas")).toHaveCount(1);
    const selector = page.getByRole("button", { name: "Viewing scene" });
    const pick = async (name: string | RegExp) => { await selector.click(); await page.getByRole("option", { name }).click(); };
    await expect(selector).toContainText("Cellar");
    await expect(page.getByText("This is not the active scene.", { exact: true })).toBeVisible();
    const cellarId = Object.entries(sceneNamesOf(state)).find(([, n]) => n === "Cellar")?.[0] ?? "";
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit map", exact: true });
    await editor.getByRole("tab", { name: /Terrain$/ }).click();
    const canvas = editor.getByRole("application", { name: "Terrain preparation canvas" });
    await canvas.focus(); await canvas.press("Enter"); await canvas.press("Enter");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    const preparedTerrain = [{ row: 0, start: 0, end: 0, kind: "difficult" as const }, ...liveTerrain];
    await expect.poll(() => state.savedScenes?.[cellarId]?.table.terrain?.base).toEqual(preparedTerrain);
    expect(state.terrain?.base).toEqual(liveTerrain);
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    await command({ type: "scene.prepare", sceneId: cellarId, command: { type: "token.create", name: "Cellar rat", position: { x: 35, y: 35 } } });
    await page.getByRole("tab", { name: "Tokens", exact: true }).click();
    await expect(page.getByText("Cellar rat", { exact: true }).first()).toBeVisible();
    await pick(/Tavern/);
    await expect(page.getByText("Tavern guard", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Cellar rat", { exact: true })).toHaveCount(0);
    await pick(/Cellar/);
    await expect(page.getByText("Cellar rat", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Activate", exact: true }).click();
    await expect.poll(() => state.terrain?.base).toEqual(preparedTerrain);
    await expect(page.getByText("This is not the active scene.", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Viewing scene" })).toContainText("Cellar");
    await page.screenshot({ path: testInfo.outputPath("scenes.png") });
    expect(errors).toEqual([]);
  } finally { socket.disconnect(); }
});
