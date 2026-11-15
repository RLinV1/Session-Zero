import { expect, test } from "@playwright/test";

test("the homepage torch bearer stays centered when dragging starts", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const lead = page.locator(".sight-lead");
  await lead.scrollIntoViewIfNeeded();
  const disc = lead.locator(".token-disc");
  await disc.hover();
  // Let the map's hover lift finish before comparing the token's position.
  await page.waitForTimeout(450);
  const before = (await disc.boundingBox())!;
  await page.mouse.down();
  await page.waitForTimeout(150);
  const held = (await disc.boundingBox())!;
  expect(Math.abs(held.x - before.x)).toBeLessThan(1);
  expect(Math.abs(held.y - before.y)).toBeLessThan(1);
  await page.mouse.up();
});
