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
  // Walls draws a sample into the draft; moving on takes it out again without asking to save it.
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
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
    // Next step already opened the lesson's tab; Show me is offered where it draws an example.
    await expect(selected).toContainText(label, { timeout: 8000 });
    if (["Walls", "Fog", "Terrain"].includes(label)) {
      await tutorial.getByRole("button", { name: "Show me" }).click();
      await expect(page.locator("dialog.map-editor[open]").getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
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
        const showMe = tutorial.getByRole("button", { name: "Show me" });
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
        if (["walls", "fog", "terrain"].includes(step)) {
          await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
          await expect(tutorial.getByRole("status").filter({ hasText: "Here is an example" })).toBeVisible();
          await showMe.click(); // asking again replaces the sample instead of stacking another
          await expect(selected).toContainText(label);
          await shot(`${step}-${start}-example`);
          if (start === "other") await shot(`${step}-example`);
        } else {
          // Nothing to demonstrate: once the lesson's tab is open, Show me is gone.
          await expect(showMe).toHaveCount(0);
        }
        await shot(`${step}-${start}-after`);
      });
    }
  }
}
