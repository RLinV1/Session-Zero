import { expect, test } from "@playwright/test";

test("the landing page explains the first session and account choices without overflow", async ({ page }, info) => {
  await page.goto("/");
  if (page.viewportSize()!.width <= 640) {
    const header = page.locator(".site-header");
    const controls = [
      header.getByRole("link", { name: "Session Zero" }),
      header.getByRole("link", { name: "What's new" }),
      header.getByRole("link", { name: "Sign up", exact: true }),
      header.getByRole("button", { name: "Language: English" }),
      header.locator(".theme-toggle"),
    ];
    await expect(controls[2]!).toBeVisible();
    const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
    const top = boxes[0]!.y;
    for (const box of boxes) {
      expect(box!.height).toBe(44);
      expect(box!.y).toBeCloseTo(top, 0);
    }
  }
  const guide = page.getByRole("region", { name: "From map to first move." });
  await guide.scrollIntoViewIfNeeded();
  await expect(guide.getByRole("listitem")).toHaveCount(3);
  await expect(guide.getByRole("link", { name: "Try without signing in", exact: true })).toHaveAttribute("href", "/start");
  await expect(guide.getByRole("link", { name: "Create a free account", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await guide.locator("p").evaluateAll((paragraphs) => paragraphs.filter((p) => p.scrollWidth > p.clientWidth + 1).map((p) => p.textContent))).toEqual([]);
  await guide.screenshot({ path: info.outputPath("landing-session-guide.png") });
});

test("a first-time GM reaches guest setup directly and sees one onboarding prompt (M5/M6)", async ({ page }, info) => {
  await page.goto("/");
  const feedback = page.getByRole("button", { name: "Feedback", exact: true });
  await expect(feedback).toBeVisible();
  await page.getByRole("link", { name: "Try without signing in", exact: true }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(feedback).toHaveCount(0);
  await page.getByRole("textbox", { name: "Room name", exact: true }).fill("Onboarding QA");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("First-time GM");
  await page.getByRole("button", { name: "Start the room", exact: true }).click();
  await expect(page.locator(".room-title")).toHaveText("Onboarding QA", { timeout: 30_000 });
  await expect(feedback).toHaveCount(0);
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
