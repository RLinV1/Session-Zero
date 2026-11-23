import { expect, test } from "@playwright/test";
import { BUILTIN_ROOM_DEFAULTS } from "@vtt/shared";

test("the landing page explains the first session and account choices without overflow", async ({ page }, info) => {
  await page.goto("/");
  if (await page.evaluate(() => matchMedia("(max-width: 640px) and (orientation: portrait)").matches)) {
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

test("the rooms header moves settings and news into the profile on portrait phones", async ({ page }, info) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    json: { account: { id: "a1", displayName: "Demo GM", email: "gm@example.com" } },
  }));
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 403 }));
  await page.route("**/api/me/rooms", (route) => route.fulfill({ json: { hosting: [], playing: [] } }));
  await page.route("**/api/library/encounters", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/gm/settings", (route) => route.fulfill({ json: BUILTIN_ROOM_DEFAULTS }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gm-dashboard");

  const header = page.locator(".site-header");
  const profile = header.getByRole("button", { name: "Demo GM", exact: true });
  const menu = header.locator(".account-menu");
  const settings = header.locator(".room-settings-trigger");
  const news = header.locator(".whats-new-link");
  await expect(profile).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(news).toBeHidden();

  const controls = header.locator(".brand, .account-trigger, .language-trigger, .theme-toggle");
  await expect(controls).toHaveCount(4);
  const bounds = await controls.evaluateAll((items) => items.map((item) => {
    const { y, height } = item.getBoundingClientRect();
    return { y, height };
  }));
  for (const box of bounds) {
    expect(box.height).toBe(44);
    expect(box.y).toBeCloseTo(bounds[0]!.y, 0);
  }
  expect((await header.getByRole("navigation", { name: "Main" }).boundingBox())!.y).toBeGreaterThan(bounds[0]!.y + 44);
  await page.screenshot({ path: info.outputPath("rooms-portrait.png") });
  await profile.press("Enter");
  await expect(menu.getByRole("link", { name: "What's new" })).toHaveAttribute("href", "/news");
  await page.screenshot({ path: info.outputPath("rooms-portrait-profile.png") });
  await menu.getByRole("button", { name: "Room settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Room settings" });
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(profile).toBeFocused();

  for (const viewport of [{ width: 640, height: 360 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(settings).toBeVisible();
    await expect(news).toBeVisible();
    await profile.press("Enter");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Room settings" })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "What's new" })).toHaveCount(0);
    await profile.press("Escape");
    await expect(menu).toBeHidden();
  }
  await settings.press("Enter");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
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
