import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { GM_TOKEN_HEADER, type CreateRoomResponse } from "@vtt/shared";

test("the guest demo opens each map editing lesson inside the editor (guest-gm-hosting)", async ({ page, request }, info) => {
  const gmToken = randomUUID(), guestToken = randomUUID();
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Guest tutorial", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  expect(response.status()).toBe(200);
  const seat = await response.json() as CreateRoomResponse;
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
    localStorage.setItem(`vtt.tutorial.${seat.roomId}`, "grid");
  }, { seat, gmToken, guestToken });
  await page.goto(`/r/${seat.roomId}`);
  const tutorial = page.locator(".guest-tutorial");
  await expect(tutorial.getByRole("heading")).toHaveText("Line up the grid", { timeout: 30_000 });
  await tutorial.getByRole("button", { name: "Show me" }).click();
  const editor = page.locator("dialog.map-editor[open]");
  await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText("Grid");
  await editor.locator(".modal-close").click();
  await page.getByRole("button", { name: "Change map", exact: true }).click();
  await tutorial.getByRole("button", { name: "Show me" }).click();
  await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText("Grid");
  await tutorial.getByRole("button", { name: "Next step" }).click();
  await expect(editor).not.toBeVisible();
  await tutorial.getByRole("button", { name: "Show me" }).click();
  for (const label of ["Walls", "Fog", "Sight", "Terrain"]) {
    await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText(label);
    await expect(editor.locator(".guest-tutorial")).toBeVisible();
    await expect(tutorial.getByRole("button", { name: "Next step" })).toBeEnabled();
    if (label !== "Terrain") await tutorial.getByRole("button", { name: "Next step" }).click();
  }
  await page.screenshot({ path: info.outputPath("editor-tutorial.png") });
  const terrain = editor.getByRole("application", { name: "Terrain preparation canvas" });
  await terrain.focus();
  await terrain.press("Enter");
  await terrain.press("Enter");
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await tutorial.getByRole("button", { name: "Next step" }).click();
  const prompt = page.getByRole("dialog", { name: "Save changes?", exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Keep editing" }).click();
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await tutorial.getByRole("button", { name: "Show me" }).click();
  await prompt.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(tutorial.getByRole("heading")).toHaveText("Place a token");
});

/** Show me from the map lesson's Change map editor, which has fewer tabs: it must reopen as Edit map at the lesson. */
test("Show me selects the grid, walls, fog, sight and terrain tab and rings it, from Change map too (guest-gm-hosting)", async ({ page, request }) => {
  const gmToken = randomUUID(), guestToken = randomUUID();
  const response = await request.post("/api/rooms", {
    headers: { [GM_TOKEN_HEADER]: gmToken },
    data: { roomName: "Guest tutorial", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
  });
  const seat = await response.json() as CreateRoomResponse;
  await page.addInitScript(({ seat, gmToken, guestToken }) => {
    localStorage.setItem("vtt.gm", gmToken);
    localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
    localStorage.setItem(`vtt.tutorial.${seat.roomId}`, "map");
  }, { seat, gmToken, guestToken });
  await page.goto(`/r/${seat.roomId}`);
  const tutorial = page.locator(".guest-tutorial");
  const editor = page.locator("dialog.map-editor[open]");
  await expect(tutorial.getByRole("heading")).toHaveText("Prepare the map", { timeout: 30_000 });
  await tutorial.getByRole("button", { name: "Show me" }).click();
  await expect(editor).toBeVisible();
  const selected = editor.locator('[role="tab"][aria-selected="true"]');
  for (const [title, label] of [["Line up the grid", "Grid"], ["Draw walls, doors and windows", "Walls"], ["Hide part of the map", "Fog"], ["Test what players can see", "Sight"], ["Paint terrain", "Terrain"]] as const) {
    await tutorial.getByRole("button", { name: "Next step" }).click();
    await expect(tutorial.getByRole("heading")).toHaveText(title);
    await tutorial.getByRole("button", { name: "Show me" }).click();
    await expect(selected).toContainText(label, { timeout: 8000 });
    await expect(selected).toHaveAttribute("data-tutorial-active", "");
    await expect(page.locator("dialog.map-editor[open] .guest-tutorial")).toBeVisible();
  }
});
