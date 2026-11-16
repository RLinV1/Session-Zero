import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { GM_TOKEN_HEADER, type CreateRoomResponse } from "@vtt/shared";

test("Share demo leaves reading time and keeps its popup in the viewport on every frame", async ({ page, request }) => {
  const gmToken = randomUUID(), guestToken = randomUUID();
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Demo pacing", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  expect(response.status()).toBe(200);
  const seat = await response.json() as CreateRoomResponse;
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
    localStorage.setItem(`vtt.tutorial.${seat.roomId}`, "step:invite");
  }, { seat, gmToken, guestToken });
  await page.goto(`/r/${seat.roomId}`);
  const card = page.locator(".guest-tutorial");
  await expect(card.getByRole("heading")).toHaveText("Invite players", { timeout: 30_000 });
  await page.evaluate(() => {
    const frames: { index: string; time: number; clipped: boolean }[] = [];
    (window as unknown as { tutorialFrames: typeof frames }).tutorialFrames = frames;
    const sample = () => {
      const card = document.querySelector<HTMLElement>(".guest-tutorial");
      if (card) {
        const rect = card.getBoundingClientRect();
        const dialog = card.closest("dialog");
        frames.push({
          index: card.querySelector('[data-state="current"]')?.textContent ?? "",
          time: performance.now(),
          clipped: rect.left < 0 || rect.right > innerWidth || !!dialog && getComputedStyle(dialog).transform !== "none",
        });
      }
      if (frames.length < 2000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await card.getByRole("button", { name: "Show me", exact: true }).click();
  await expect(card.locator('.tutorial-ex li[data-state="done"]')).toHaveCount(3, { timeout: 20_000 });
  const frames = await page.evaluate(() => (window as unknown as { tutorialFrames: { index: string; time: number; clipped: boolean }[] }).tutorialFrames);
  expect(frames.filter((frame) => frame.clipped)).toEqual([]);
  for (const caption of ["Click Share", "Copy the link"]) {
    const shown = frames.filter((frame) => frame.index.includes(caption));
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.at(-1)!.time - shown[0]!.time).toBeGreaterThan(1900);
  }
});

test("grid demo calibrates the visible practice tiles without dimming or clipping", async ({ page, request }, info) => {
  const gmToken = randomUUID(), guestToken = randomUUID();
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Grid demo", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  expect(response.status()).toBe(200);
  const seat = await response.json() as CreateRoomResponse;
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
    localStorage.setItem(`vtt.tutorial.${seat.roomId}`, "step:grid");
  }, { seat, gmToken, guestToken });
  await page.goto(`/r/${seat.roomId}`);
  const card = page.locator(".guest-tutorial");
  await expect(card.getByRole("heading")).toHaveText("Line up the grid", { timeout: 30_000 });
  await card.getByRole("button", { name: "Show me", exact: true }).click();
  const editor = page.locator("dialog.map-editor[open]");
  await expect(editor.locator('.map-grid-canvas image')).toHaveAttribute("href", "/img/tutorial-practice.svg");
  const clipped = await page.evaluate(async () => {
    const failures: string[] = [];
    for (let n = 0; n < 120; n++) {
      await new Promise(requestAnimationFrame);
      const card = document.querySelector<HTMLElement>(".guest-tutorial")!;
      const rect = card.getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth) failures.push("outside viewport");
      const dialog = card.closest("dialog");
      if (dialog && getComputedStyle(dialog).transform !== "none") failures.push("transformed dialog");
      if (document.querySelector(".tutorial-spotlight") && getComputedStyle(document.querySelector(".tutorial-spotlight")!).boxShadow !== "none") failures.push("dimmed map");
      const cursor = document.querySelector(".example-cursor")?.getBoundingClientRect();
      if (cursor && rect.left < cursor.right && rect.right > cursor.left && rect.top < cursor.bottom && rect.bottom > cursor.top) failures.push("covered pointer");
      const actions = Array.from(card.querySelectorAll(".tutorial-ex li")).filter((item) => getComputedStyle(item).display !== "none");
      if (actions.length > 1) failures.push("multiple actions visible");
      for (const modal of document.querySelectorAll("dialog[open]")) if (getComputedStyle(modal, "::backdrop").backgroundColor !== "rgba(0, 0, 0, 0)") failures.push("dimmed backdrop");
    }
    return failures;
  });
  expect(clipped).toEqual([]);
  await expect(editor.locator('.grid-sample [data-anchor="A"]')).toBeVisible({ timeout: 15_000 });
  await expect(editor.locator('.grid-sample [data-anchor="B"][role="button"]')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: info.outputPath("grid-demo.png") });
  await expect(editor.locator('[data-tutorial-tool="grid-apply"]')).toBeVisible();
  await expect(card.locator('.tutorial-ex li[data-state="done"]')).toHaveCount(5, { timeout: 20_000 });
});
