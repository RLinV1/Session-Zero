import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { GM_TOKEN_HEADER, type CreateRoomResponse } from "@vtt/shared";

for (const cancel of [false, true]) test(`Show me creates a token through its form, then ${cancel ? "cancels" : "drags"} it with visible mouse feedback (guest-gm-hosting)`, async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const gmToken = randomUUID(), guestToken = randomUUID();
  const moves: string[] = [];
  page.on("websocket", (socket) => socket.on("framesent", ({ payload }) => { if (typeof payload === "string" && payload.includes('"type":"token.move"')) moves.push(payload); }));
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Mouse demo", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  expect(response.status()).toBe(200);
  const seat = await response.json() as CreateRoomResponse;
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
    localStorage.setItem(`vtt.tutorial.${seat.roomId}`, "step:token");
  }, { seat, gmToken, guestToken });
  await page.goto(`/r/${seat.roomId}`);
  const card = page.locator(".guest-tutorial");
  await expect(card.getByRole("heading")).toHaveText("Place a token", { timeout: 30_000 });
  await card.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(page.locator('[data-tutorial-tool="token-name"]')).toHaveValue("Adventurer", { timeout: 15_000 });
  await expect(page.locator(".example-click")).toBeAttached();
  await expect(card.getByRole("heading")).toHaveText("Move it", { timeout: 25_000 });
  await expect(page.locator(".placement-bar")).toHaveCount(0);
  if (cancel) await page.evaluate(() => { (window as { __tutorialPace?: number }).__tutorialPace = 3; });
  await card.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(page.locator(".example-cursor.is-pressed")).toBeVisible();
  if (cancel) {
    await page.keyboard.press("a");
    await expect(page.locator(".example-cursor")).toHaveCount(0);
    await page.mouse.move(220, 300);
    await page.mouse.up();
    await page.waitForTimeout(1800);
    expect(moves).toHaveLength(0);
    await expect(card.getByRole("heading")).toHaveText("Move it");
    return;
  }
  await page.screenshot({ path: info.outputPath("dragging-token.png") });
  await expect(card.getByRole("heading")).toHaveText("Roll dice", { timeout: 20_000 });
  expect(moves).toHaveLength(1);
});
