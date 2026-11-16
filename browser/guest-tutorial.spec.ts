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
  await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
  const editor = page.locator("dialog.map-editor[open]");
  await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText("Grid");
  await editor.locator(".modal-close").click();
  await page.getByRole("button", { name: "Change map", exact: true }).click();
  await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
  await expect(editor.locator('[role="tab"][aria-selected="true"]')).toContainText("Grid");
  await tutorial.getByRole("button", { name: "Next step" }).click();
  await expect(editor).not.toBeVisible();
  await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
  // Walls animates a sample into the draft; moving on stops it and takes it out again without asking to save it.
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible({ timeout: 20_000 });
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
  await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
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
  // The map lesson's Show me points at Edit map and Change map without opening either.
  await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
  await expect(tutorial.locator('.tutorial-ex li[data-state="done"]')).toHaveCount(2, { timeout: 15_000 });
  await expect(editor).toHaveCount(0);
  const selected = editor.locator('[role="tab"][aria-selected="true"]');
  for (const [title, label] of [["Line up the grid", "Grid"], ["Draw walls, doors and windows", "Walls"], ["Hide part of the map", "Fog"], ["Test what players can see", "Sight"], ["Paint terrain", "Terrain"]] as const) {
    await tutorial.getByRole("button", { name: "Next step" }).click();
    await expect(tutorial.getByRole("heading")).toHaveText(title);
    // Next step already opened the lesson's tab; Show me is offered where it draws an example.
    await expect(selected).toContainText(label, { timeout: 8000 });
    if (["Walls", "Fog", "Terrain"].includes(label)) {
      await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
      await expect(page.locator("dialog.map-editor[open]").getByRole("button", { name: "Save changes", exact: true })).toBeVisible({ timeout: 20_000 });
    }
    await expect(selected).toContainText(label, { timeout: 8000 });
    await expect(selected).toHaveAttribute("data-tutorial-active", "");
    await expect(page.locator("dialog.map-editor[open] .guest-tutorial")).toBeVisible();
  }
});

const SHOTS = "C:/Users/rlin7/AppData/Local/Temp/claude/4b1c7420942e1b01/a0839159-3e14-45d4-af01-900ab9d0c624/scratchpad/shots2";
const EDITOR_LESSONS = [
  ["grid", "Grid", "Line up the grid"],
  ["walls", "Walls", "Draw walls, doors and windows"],
  ["fog", "Fog", "Hide part of the map"],
  ["sight", "Sight", "Test what players can see"],
  ["terrain", "Terrain", "Paint terrain"],
] as const;

type Start = "closed" | "change" | "other";

/** The real user path, with real clicks: Show me must change the editor from every starting state (guest-gm-hosting). */
for (const [name, width, height] of [["desktop", 1440, 1000], ["laptop", 1024, 768], ["phone", 390, 844]] as const) {
  for (const [step, label, title] of EDITOR_LESSONS) {
    for (const start of (name === "laptop" ? ["other"] : ["closed", "change", "other"]) as Start[]) {
      test(`Show me on ${step} from ${start} at ${width}x${height} (guest-gm-hosting)`, async ({ page, request }, info) => {
        test.skip((info.project.name === "chromium-touch") !== (name === "phone"), "each size runs on its own project");
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height });
        page.setDefaultTimeout(15_000);
        const gmToken = randomUUID(), guestToken = randomUUID();
        const response = await request.post("/api/rooms", {
          headers: { [GM_TOKEN_HEADER]: gmToken },
          data: { roomName: "Guest tutorial", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
        });
        const seat = await response.json() as CreateRoomResponse;
        await page.addInitScript(({ seat, gmToken, guestToken, step }) => {
          localStorage.setItem("vtt.gm", gmToken);
          localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
          localStorage.setItem(`vtt.tutorial.${seat.roomId}`, step);
        }, { seat, gmToken, guestToken, step });
        const tutorial = page.locator(".guest-tutorial");
        const editor = page.locator("dialog.map-editor[open]");
        const selected = editor.locator('[role="tab"][aria-selected="true"]');
        const showMe = tutorial.getByRole("button", { name: /^(Show me|Replay)$/ });
        const shot = (file: string) => page.screenshot({ path: `${SHOTS}/${name}-${file}.png` });
        /** The map section's buttons, opening the Manage tab the way a GM would. */
        const gmButton = async (text: string) => {
          const button = page.getByRole("button", { name: text, exact: true });
          if (!(await button.isVisible())) {
            await page.locator("button, [role=tab]").filter({ hasText: /^Manage$/ }).first().click();
            const folded = page.locator('[data-tour="gm-map"] .section-toggle[aria-expanded="false"]');
            if (await folded.count()) await folded.evaluate((el) => (el as HTMLElement).click());
          }
          await button.click();
        };
        await page.goto(`/r/${seat.roomId}`);
        await expect(tutorial.getByRole("heading")).toHaveText(title, { timeout: 30_000 });
        if (start === "change") await gmButton("Change map");
        if (start === "other") {
          await gmButton("Edit map");
          const other = step === "fog" ? "Terrain" : "Fog";
          await editor.getByRole("tab", { name: new RegExp(other) }).click();
          await expect(selected).toContainText(other);
        }
        await shot(`${step}-${start}-before`);
        await expect(showMe).toBeVisible();
        await showMe.click();
        await expect(selected).toContainText(label, { timeout: 8000 });
        await expect(selected).toHaveAttribute("data-tutorial-active", "");
        await expect(editor.locator(".guest-tutorial")).toBeVisible();
        // The captions advance one sub-step at a time and all end up done; the final sample is in the draft.
        const items = tutorial.locator(".tutorial-ex li");
        const done = tutorial.locator('.tutorial-ex li[data-state="done"]');
        await expect(items.first()).toBeVisible();
        const total = await items.count();
        expect(total).toBeGreaterThan(1);
        await expect(items.nth(1)).toHaveAttribute("data-state", /current|done/, { timeout: 10_000 });
        await expect(done).toHaveCount(total, { timeout: 40_000 });
        if (["walls", "fog", "terrain", "sight"].includes(step)) await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
        await shot(`${step}-${start}-example`);
        if (start === "other") {
          // Replay clears the earlier sample first and runs again, never stacking a second one.
          await tutorial.getByRole("button", { name: "Replay" }).click();
          await expect(selected).toContainText(label);
          await expect(done).not.toHaveCount(total, { timeout: 10_000 });
          await expect(done).toHaveCount(total, { timeout: 40_000 });
          await shot(`${step}-example`);
        }
        await shot(`${step}-${start}-after`);
      });
    }
  }
}

const ANIM = "C:/Users/rlin7/AppData/Local/Temp/claude/4b1c7420942e1b01/a0839159-3e14-45d4-af01-900ab9d0c624/scratchpad/anim";
/** Which sub-step (0-based) each process frame waits for; the pointer needs a moment after the caption moves on. */
const FRAMES = { walls: [1, 2, 3, 5], terrain: [1, 4, 7], fog: [1, 2], sight: [1, 2, 3] } as const;
for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844]] as const) {
  for (const step of ["walls", "terrain", "fog", "sight"] as const) {
    test(`Show me animates ${step} step by step on ${name} (guest-gm-hosting)`, async ({ page, request }, info) => {
      test.skip((info.project.name === "chromium-touch") !== (name === "phone"), "each size runs on its own project");
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      page.setDefaultTimeout(15_000);
      const gmToken = randomUUID(), guestToken = randomUUID();
      const response = await request.post("/api/rooms", {
        headers: { [GM_TOKEN_HEADER]: gmToken },
        data: { roomName: "Guest tutorial", displayName: "Guide GM", guestToken, shippedMap: "broken-span" },
      });
      const seat = await response.json() as CreateRoomResponse;
      await page.addInitScript(({ seat, gmToken, guestToken, step }) => {
        localStorage.setItem("vtt.gm", gmToken);
        localStorage.setItem(`vtt.credentials.${seat.roomId}`, JSON.stringify({ ...seat, guestToken }));
        localStorage.setItem(`vtt.tutorial.${seat.roomId}`, step);
      }, { seat, gmToken, guestToken, step });
      await page.addInitScript(() => { (window as { __tutorialPace?: number }).__tutorialPace = 3; });
      const tutorial = page.locator(".guest-tutorial");
      const editor = page.locator("dialog.map-editor[open]");
      await page.goto(`/r/${seat.roomId}`, { timeout: 60_000 });
      await expect(tutorial.getByRole("heading")).toBeVisible({ timeout: 30_000 });
      await tutorial.getByRole("button", { name: /^(Show me|Replay)$/ }).click();
      const items = tutorial.locator(".tutorial-ex li");
      await expect(items.first()).toBeVisible({ timeout: 15_000 });
      const total = await items.count();
      let frame = 0;
      for (const index of FRAMES[step]) {
        await expect(items.nth(index)).toHaveAttribute("data-state", "current", { timeout: 30_000 });
        // The pace is 3x here: the pointer lands after about 1.4 s and the click pulse and change follow.
        await page.waitForTimeout(step === "fog" && index === 1 ? 1900 : 1600);
        await page.screenshot({ path: `${ANIM}/${name}-${step}-process-${++frame}.png` });
        // The animated area and the card never overlap.
        const card = await tutorial.boundingBox();
        expect(card).toBeTruthy();
        for (const area of [".example-cursor", "[data-tutorial-ring]", ".tutorial-pulse"]) {
          if ((await page.locator(area).count()) === 0) continue;
          const box = await page.locator(area).first().boundingBox({ timeout: 1000 }).catch(() => null);
          if (!box) continue;
          const overlap = !(card!.x + card!.width <= box.x || box.x + box.width <= card!.x || card!.y + card!.height <= box.y || box.y + box.height <= card!.y);
          expect(overlap, `card overlaps ${area} at sub-step ${index}`).toBe(false);
        }
      }
      await expect(tutorial.locator('.tutorial-ex li[data-state="done"]')).toHaveCount(total, { timeout: 40_000 });
      await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
      // A real click stops a run in the middle and leaves a draft that is still valid and unsaved.
      await tutorial.getByRole("button", { name: "Replay" }).click();
      await expect(items.nth(1)).toHaveAttribute("data-state", "current", { timeout: 20_000 });
      await editor.getByRole("heading").first().click();
      await page.waitForTimeout(1500);
      await expect(tutorial.locator('.tutorial-ex li[data-state="current"]')).toHaveCount(1);
      await expect(tutorial.locator('.tutorial-ex li[data-state="done"]')).not.toHaveCount(total);
    });
  }
}
