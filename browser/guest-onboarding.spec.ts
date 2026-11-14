import { expect, test } from "@playwright/test";

test("a first-time GM reaches guest setup directly and sees one onboarding prompt (M5/M6)", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start a room", exact: true }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await page.getByRole("textbox", { name: "Room name", exact: true }).fill("Onboarding QA");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("First-time GM");
  await page.getByRole("button", { name: "Start the room", exact: true }).click();
  await expect(page.locator(".room-title")).toHaveText("Onboarding QA", { timeout: 30_000 });
  const tutorial = page.locator(".guest-tutorial");
  await expect(tutorial).toBeVisible();
  await expect(page.locator(".guest-room-notice")).toBeHidden();
  await page.screenshot({ path: info.outputPath("first-room.png") });
  await tutorial.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.locator(".guest-room-notice")).toBeVisible();
  await page.locator(".guest-room-notice").getByRole("button", { name: "Not now", exact: true }).click();
  await page.reload();
  await expect(page.locator(".room-title")).toHaveText("Onboarding QA", { timeout: 30_000 });
  await expect(page.locator(".guest-room-notice")).toBeHidden();
});
