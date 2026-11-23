import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { io } from "socket.io-client";
import { expect, test } from "@playwright/test";
import { SOCKET_EVENTS, emptyRoomState, reduceReceived, type CommandInput, type RoomState, type ServerMessage } from "@vtt/shared";

type Credentials = { roomId: string; participantId: string; guestToken: string; inviteCode?: string };

/** A socket for the GM's setup commands. */
async function wire(credentials: Credentials) {
  const socket = io("http://127.0.0.1:3109", { transports: ["websocket"], auth: { roomId: credentials.roomId, guestToken: credentials.guestToken }, reconnection: false });
  let state: RoomState = emptyRoomState(credentials.roomId), id = 0;
  const waiting = new Map<string, (message: ServerMessage) => void>();
  await new Promise<void>((resolve, reject) => {
    socket.on("connect_error", reject);
    socket.on(SOCKET_EVENTS.event, (message: ServerMessage) => {
      if (message.type === "welcome") { state = message.state; resolve(); }
      if (message.type === "event") state = reduceReceived(state, message.committed);
      if ((message.type === "ack" || message.type === "rejected") && message.clientCommandId) { waiting.get(message.clientCommandId)?.(message); waiting.delete(message.clientCommandId); }
    });
  });
  return {
    get state() { return state; },
    close: () => socket.disconnect(),
    command: (command: CommandInput) => new Promise<ServerMessage>((resolve, reject) => {
      const clientCommandId = `sight-zoom-${++id}`;
      const timeout = setTimeout(() => reject(new Error("No command response")), 5000);
      waiting.set(clientCommandId, (reply) => { clearTimeout(timeout); resolve(reply); });
      socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command });
    }),
  };
}

/** Share of a screenshot's pixels that are near-black. */
async function darkShare(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! < 40) dark++;
  return dark / (info.width * info.height);
}

// Masks that clip others' areas, aims and tokens once grew an offscreen texture past what the
// GPU could hold when zoomed in; WebGL lost its context and the player's board went black.
test("a player's board stays drawn when zoomed all the way in with line of sight on (FR-GM-19)", async ({ page, playwright }) => {
  const account = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5189" });
  const guest = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5189" });
  expect((await account.post("/api/auth/signup", { data: { email: `sight-zoom-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Sight GM" } })).status()).toBe(201);
  const gmToken = randomBytes(32).toString("hex");
  const created = await account.post("/api/rooms", { data: { roomName: "Sight zoom", displayName: "Sight GM", guestToken: gmToken } });
  const gmCreds = { ...await created.json(), guestToken: gmToken } as Credentials;
  const gm = await wire(gmCreds);
  try {
    const image = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: "#7a8f6a" } }).png().toBuffer();
    const uploaded = await account.post("/api/library", { multipart: { kind: "map", name: "Zoom map", width: "1400", height: "1000", file: { name: "zoom.png", mimeType: "image/png", buffer: image } } });
    expect(uploaded.status()).toBe(201);
    const asset = await uploaded.json() as { id: string; url: string; width: number; height: number };
    expect((await gm.command({ type: "scene.setMap", map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id } })).type).toBe("ack");
    expect((await gm.command({ type: "wall.add", walls: [{ a: { x: 0, y: 500 }, b: { x: 900, y: 500 } }] })).type).toBe("ack");

    const playerToken = randomBytes(32).toString("hex");
    const joined = await guest.post(`/api/invites/${gmCreds.inviteCode}/join`, { data: { displayName: "Alice", guestToken: playerToken } });
    expect(joined.status()).toBe(200);
    const playerCreds = { ...await joined.json(), guestToken: playerToken } as Credentials;
    expect((await gm.command({ type: "token.create", name: "Hero", position: { x: 665, y: 385 }, ownerIds: [playerCreds.participantId] })).type).toBe("ack");
    expect((await gm.command({ type: "scene.setLineOfSight", enabled: true })).type).toBe("ack");

    const lost: string[] = [];
    page.on("console", (m) => { if (/CONTEXT_LOST|GL_OUT_OF_MEMORY/.test(m.text())) lost.push(m.text()); });
    await page.addInitScript((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), playerCreds);
    await page.goto(`/r/${playerCreds.roomId}`);
    const canvas = page.locator(".board-canvas canvas");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1000);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Each step zooms in about 1.6x: ten reach the board's maximum zoom.
    for (let step = 1; step <= 10; step++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(250);
      expect(await darkShare(await canvas.screenshot()), `zoom step ${step}`).toBeLessThan(0.9);
    }
    expect(lost).toEqual([]);
  } finally {
    gm.close();
    await account.dispose();
    await guest.dispose();
  }
});
