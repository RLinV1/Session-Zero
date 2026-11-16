import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { GM_TOKEN_HEADER, SOCKET_EVENTS, type CommandInput, type CreateRoomResponse, type ServerMessage } from "@vtt/shared";

/** The guest demo end to end, on desktop and at 390px: Step n of total, Show me, and the combat lessons (guest-gm-hosting). */
test("the guest demo walks from the invite to a hit, damage and a roll (guest-gm-hosting)", async ({ page, request, context }, info) => {
  test.setTimeout(120_000);
  const gmToken = randomUUID(), guestToken = randomUUID();
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Combat demo", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  expect(response.status()).toBe(200);
  const seat = await response.json() as CreateRoomResponse;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
  }, { seat, gmToken, guestToken });

  const socket = io("http://127.0.0.1:3109", { transports: ["websocket"], auth: { roomId: seat.roomId, guestToken }, reconnection: false });
  let counter = 0;
  const created: string[] = [];
  const command = (input: CommandInput) => new Promise<void>((resolve, reject) => {
    const clientCommandId = `demo-${++counter}`;
    const listener = (message: ServerMessage) => {
      if ((message.type === "ack" || message.type === "rejected") && message.clientCommandId === clientCommandId) {
        socket.off(SOCKET_EVENTS.event, listener);
        if (message.type === "ack") resolve(); else reject(new Error(message.message));
      } else if (message.type === "event" && message.committed.event.type === "TokenCreated") created.push(message.committed.event.token.id);
    };
    socket.on(SOCKET_EVENTS.event, listener);
    socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command: input });
  });
  const total = 16;
  const card = page.locator(".guest-tutorial");
  const step = async (n: number, title: string) => {
    await expect(card.getByRole("heading")).toHaveText(title, { timeout: 15_000 });
    await expect(card.getByText(`Step ${n} of ${total}`)).toBeVisible();
  };
  /** Mobile: the sheet must not sit over the ringed control. */
  const clearOfRing = async () => {
    const ring = page.locator(".tutorial-spotlight");
    if (!await ring.count()) return;
    const [a, b] = await Promise.all([ring.boundingBox(), card.boundingBox()]);
    if (a && b && (page.viewportSize()?.width ?? 1000) < 640) expect(a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
  };
  /** Show me is offered when the control is out of sight (a folded section or another tab), and always for a dialog lesson. */
  const showMe = async (required = false) => {
    const button = card.getByRole("button", { name: "Show me" });
    await page.waitForTimeout(600);
    if (required) await button.click();
    else if (await button.count()) await button.click({ timeout: 3000 }).catch(() => undefined); // the control may have come into sight meanwhile
    await page.waitForTimeout(900);
  };

  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    await page.goto(`/r/${seat.roomId}`);
    await expect(card.getByRole("heading")).toHaveText("Try the interactive demo?", { timeout: 30_000 });
    await card.getByRole("button", { name: "Yes", exact: true }).click();
    await step(1, "Your table");
    await card.getByRole("button", { name: "Start", exact: true }).click();

    // Show me opens Share and rings its copy-link control, with the card still on screen.
    await step(2, "Invite players");
    await showMe(true);
    const share = page.locator("dialog.share-modal[open]");
    await expect(share).toBeVisible({ timeout: 10_000 });
    await expect(share.locator(".guest-tutorial")).toBeVisible();
    await expect(share.locator('[data-tutorial="invite"]')).toHaveAttribute("data-tutorial-active", "");
    await clearOfRing();
    await share.getByRole("button", { name: "Copy link" }).click();

    // Show me opens the map chooser/editor, and the card stays inside it.
    await step(3, "Prepare the map");
    await showMe(true);
    const editor = page.locator("dialog.map-editor[open]");
    await expect(editor).toBeVisible();
    await expect(share).toHaveCount(0);
    await expect(editor.locator(".guest-tutorial")).toBeVisible();
    await page.screenshot({ path: info.outputPath("map-dialog.png") });
    // The editor lessons, each finished with Next step; Show me brings back the one the GM is on.
    for (const [n, title] of [[4, "Line up the grid"], [5, "Draw walls, doors and windows"], [6, "Hide part of the map"], [7, "Test what players can see"], [8, "Paint terrain"]] as const) {
      await card.getByRole("button", { name: "Next step" }).click();
      await step(n, title);
      if (!await editor.count()) await showMe();
      await expect(editor.locator(".guest-tutorial")).toBeVisible();
    }
    await card.getByRole("button", { name: "Next step" }).click();
    await expect(editor).toHaveCount(0);
    await step(9, "Place a token");

    // One plain token and one move (socket); the fight itself is the demo's own buttons.
    await command({ type: "token.create", name: "Aria", position: { x: 140, y: 140 } } as CommandInput);
    await step(10, "Move it");
    await command({ type: "token.move", tokenId: created[0]!, to: { x: 140, y: 210 } });
    await step(11, "Roll dice");
    await showMe();
    await page.locator('button[data-tutorial="roll"]').click();

    // Run demo fight adds the hero and goblin and starts the encounter, with Initiative on screen.
    await step(12, "Start an encounter");
    await showMe(true);

    await step(13, "Make an attack");
    await expect(page.getByText("Demo hero").first()).toBeVisible();
    await expect(page.getByText("Demo goblin").first()).toBeVisible();
    await showMe(true);

    // Show me uses the real Hit and Apply controls; each action must advance the lesson itself.
    await step(14, "Rule on the hit");
    await showMe(true);

    await step(15, "Apply damage");
    await showMe(true);

    await step(16, "You are all set");
    await expect(card.getByRole("button", { name: "Finish" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("done.png") });
  } finally { socket.disconnect(); }
});
