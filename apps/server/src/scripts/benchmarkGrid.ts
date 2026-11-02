/** Local acceptance runner. Inputs/results stay outside git; see docs/QA-classical-grid.md. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "@playwright/test";
import { type LibraryAsset, type GridDetectionCandidate } from "@vtt/shared";
import { buildApp, type App } from "../app";
import { visionDetector } from "../domain/gridDetection";
import { WallDetections, bullmqWallQueue } from "../domain/wallDetection";
import { LocalDiskAssetStore } from "../store/assetStore";
import { PostgresRoomStore } from "../store/postgresRoomStore";

type Case = { image: { path: string; sha256: string; dimensions_px: [number, number] }; suggestion: GridDetectionCandidate | null };
const study = process.env.GRID_STUDY_RUN;
const output = process.env.GRID_BENCH_OUTPUT;
const webUrl = process.env.GRID_BENCH_WEB_URL ?? "http://127.0.0.1:58189";
assert(study && output && process.env.DATABASE_URL && process.env.REDIS_URL && process.env.VISION_URL,
  "Set GRID_STUDY_RUN, GRID_BENCH_OUTPUT, DATABASE_URL, REDIS_URL and VISION_URL; run only against isolated local services.");
await mkdir(output, { recursive: false });
const cases = JSON.parse(await readFile(path.join(study, "cases.json"), "utf8")) as Case[];
assert.equal(cases.length, 27);
const uploadDir = path.join(output, "uploads"); await mkdir(uploadDir);
const store = await PostgresRoomStore.connect(process.env.DATABASE_URL);
const calls: { source: string; start: number; end?: number }[] = [];
const realDetector = visionDetector(process.env.VISION_URL);
const detector: typeof realDetector = async (bytes, dimensions) => {
  const call = { source: createHash("sha256").update(bytes).digest("hex"), start: performance.now(), end: undefined as number | undefined };
  calls.push(call);
  try { return await realDetector(bytes, dimensions); }
  finally { call.end = performance.now(); }
};
const options = { uploadDir, clientOrigin: webUrl, cookieSecure: false, redisUrl: process.env.REDIS_URL, detector };
let app: App = await buildApp({ store, ...options });
await app.listen({ port: 58109, host: "127.0.0.1" });
const base = "http://127.0.0.1:58109";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const wallJobs = new WallDetections(new LocalDiskAssetStore(uploadDir), bullmqWallQueue(process.env.REDIS_URL), () => {});
const wallRun: { start: number; end?: number; state?: string }[] = [];
let runWalls = true;
let wallTask: Promise<void> | null = null;
const report: Record<string, unknown> = { local_only: true, node: process.version, cases: 27, component_timings: "See fresh-process Python benchmark; HTTP timing includes process startup.", container_memory: "unavailable without Docker" };
const maps: { asset: LibraryAsset; input: Case; accepted: number; uploadMs: number; available?: number }[] = [];
const json = async (url: string, init: RequestInit = {}) => {
  const response = await fetch(base + url, init);
  assert(response.ok, `${url}: ${response.status}`);
  return response;
};
try {
  const signedUp = await json("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `grid-benchmark-${randomUUID()}@example.com`, password: "correct horse battery", displayName: "Grid benchmark" }) });
  const cookieParts = signedUp.headers.getSetCookie().map((value) => value.split(";")[0]!);
  const cookie = cookieParts.join("; ");
  await context.addCookies(cookieParts.map((part) => {
    const index = part.indexOf("="); return { name: part.slice(0,index), value: part.slice(index+1), url: webUrl };
  }));
  const upload = async (input: Case, index: number) => {
    const bytes = await readFile(input.image.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), input.image.sha256);
    const extension = path.extname(input.image.path).toLowerCase();
    const mime = extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png" : "image/jpeg";
    const form = new FormData();
    for (const [key, value] of Object.entries({ kind: "map", name: `Grid benchmark ${index}`, width: String(input.image.dimensions_px[0]), height: String(input.image.dimensions_px[1]) })) form.append(key, value);
    form.append("file", new Blob([bytes], { type: mime }), `map${extension}`);
    const start = performance.now();
    const response = await json("/api/library", { method: "POST", headers: { cookie }, body: form });
    const asset = await response.json() as LibraryAsset;
    return { asset, input, accepted: performance.now(), uploadMs: performance.now()-start };
  };
  const start = performance.now();
  for (let i = 0; i < cases.length; i++) {
    maps.push(await upload(cases[i]!, i));
    if (i === 0) {
      const first = maps[0]!;
      const roomId = randomUUID();
      wallTask = (async () => {
        while (runWalls) {
          const entry: typeof wallRun[number] = { start: performance.now() }; wallRun.push(entry);
          const queued = await wallJobs.start(roomId, first.asset, 70);
          assert.equal(queued, "queued");
          while (["queued", "running"].includes(wallJobs.status(roomId, first.asset.url)?.status ?? "")) await new Promise((resolve) => setTimeout(resolve, 100));
          entry.end = performance.now(); entry.state = wallJobs.status(roomId, first.asset.url)?.status;
        }
      })();
    }
  }
  const page = await context.newPage();
  const uiStart = performance.now();
  await page.goto(`${webUrl}/library`);
  await page.getByLabel("Search by name").fill("Grid benchmark 0");
  await page.getByRole("button", { name: "Edit grid", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "Set up map", exact: true });
  await editor.waitFor();
  const manual = editor.getByText("Set up manually", { exact: true });
  report.browser_wait_skipped = await manual.isVisible();
  if (report.browser_wait_skipped) await manual.click();
  const cell = editor.getByLabel("Cell size", { exact: true });
  await cell.waitFor();
  assert(await cell.isEnabled());
  await cell.fill("71.5");
  assert.equal(await cell.inputValue(), "71.5");
  report.browser_editor_available_ms = performance.now()-uiStart;
  const closeEditor = async () => {
    await editor.getByLabel("Close", { exact: true }).click();
    const prompt = page.getByRole("dialog", { name: "Save changes?", exact: true });
    if (await prompt.isVisible()) await prompt.getByRole("button", { name: "Discard", exact: true }).click();
  };
  await closeEditor();
  const deadline = performance.now() + 300_000;
  while (maps.some((map) => map.available === undefined)) {
    assert(performance.now() < deadline, "Acceptance queue deadline exceeded");
    for (const map of maps.filter((m) => m.available === undefined)) {
      const response = await json(`/api/library/${map.asset.id}/grid-detection`, { headers: { cookie } });
      const result = await response.json() as { status: string; candidate?: GridDetectionCandidate };
      assert.notEqual(result.status, "error");
      if (result.status === "suggested" || result.status === "no_grid") {
        map.available = performance.now();
        if (map.input.suggestion) {
          assert(result.candidate);
          for (const key of ["cellSize", "offsetX", "offsetY"] as const) assert(Math.abs(result.candidate[key]-map.input.suggestion[key]) <= 1e-6);
        } else assert.equal(result.status, "no_grid");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  runWalls = false; await wallTask;
  const allAvailable = performance.now();
  assert.equal(calls.length, 27);
  report.requests = maps.map((map) => {
    const call = calls.find((c) => c.source === map.input.image.sha256)!;
    return { image: path.basename(map.input.image.path), upload_ms: map.uploadMs,
      queue_wait_ms: Math.max(0, call.start-map.accepted), vision_http_ms: call.end!-call.start,
      available_ms: map.available!-map.accepted };
  });
  report.throughput_maps_per_second = 27 / ((allAvailable-start)/1000);
  report.wall_jobs = wallRun;
  const before = calls.length;
  for (let i=0; i<10; i++) for (const map of maps) await json(`/api/library/${map.asset.id}/grid-detection`, { headers: { cookie } });
  for (let i=0; i<3; i++) {
    await page.getByRole("button", { name: "Edit grid", exact: true }).click();
    editor = page.getByRole("dialog", { name: "Set up map", exact: true });
    await editor.getByRole("button", { name: "Use suggestion" }).waitFor();
    await closeEditor();
  }
  assert.equal(calls.length, before);
  report.invocations_after_polling_and_reopening = calls.length;
  const guestToken = randomBytes(32).toString("base64url");
  const created = await json("/api/rooms", { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ roomName: "Grid cache placement", displayName: "Grid benchmark", guestToken }) });
  const createdRoom = await created.json() as { roomId: string; participantId: string };
  const credentials = { ...createdRoom, guestToken, viaAccount: true };
  await page.evaluate((creds) => localStorage.setItem(`vtt.credentials.${creds.roomId}`, JSON.stringify(creds)), credentials);
  await page.goto(`${webUrl}/r/${credentials.roomId}`);
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "From library", exact: true }).click();
  await page.getByLabel("Search library").fill("Grid benchmark 0");
  await page.getByRole("button", { name: "Grid benchmark 0", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Edit map", exact: true });
  await setup.getByRole("button", { name: "Use suggestion" }).waitFor();
  assert(Math.abs(Number(await setup.getByLabel("Cell size", { exact: true }).inputValue())-cases[0]!.suggestion!.cellSize) <= 1e-6);
  await setup.getByRole("button", { name: "Apply map", exact: true }).click();
  await setup.getByRole("tab", { name: /Walls/ }).waitFor();
  assert.equal(calls.length, before);
  report.invocations_after_selection_and_placement = calls.length;
  const duplicate = await upload(cases[0]!, 27);
  while (!["suggested", "no_grid"].includes((await store.findDetection({ scope: "library", id: duplicate.asset.id }))!.status)) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(calls.length, 28);
  report.invocations_after_independent_duplicate_upload = calls.length;
  const blankPath = path.join(output, "blank.png");
  await sharp({ create: { width: 320, height: 240, channels: 3, background: "#334455" } }).png().toFile(blankPath);
  const blankCase: Case = { image: { path: blankPath, sha256: createHash("sha256").update(await readFile(blankPath)).digest("hex"), dimensions_px: [320, 240] }, suggestion: null };
  const blank = await upload(blankCase, 28);
  while (["queued", "running"].includes((await store.findDetection({ scope: "library", id: blank.asset.id }))!.status)) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await store.findDetection({ scope: "library", id: blank.asset.id }))!.status, "no_grid");
  assert.equal(calls.length, 29);
  report.invocations_after_blank_upload = calls.length;
  await context.close();
  await app.close(); await store.close();
  const reopened = await PostgresRoomStore.connect(process.env.DATABASE_URL);
  app = await buildApp({ store: reopened, ...options });
  await app.listen({ port: 58109, host: "127.0.0.1" });
  try {
    for (const map of maps) assert(["suggested", "no_grid"].includes((await reopened.findDetection({ scope: "library", id: map.asset.id }))!.status));
    await new Promise((resolve) => setTimeout(resolve, 2100));
    assert.equal((await reopened.findDetection({ scope: "library", id: blank.asset.id }))!.status, "no_grid");
    assert.equal(calls.length, 29);
    report.invocations_after_app_and_store_restart = calls.length;
    report.persistent_asset_ids = maps.map((m) => m.asset.id);
    report.persistent_no_grid_asset_id = blank.asset.id;
    await writeFile(path.join(output, "acceptance.json"), JSON.stringify(report, null, 2));
  } finally { await app.close(); await reopened.close(); }
  console.log(JSON.stringify({ cases: maps.length, invocations: calls.length, browser_editor_available_ms: report.browser_editor_available_ms, output }));
} finally {
  runWalls = false;
  await wallTask?.catch(() => {});
  await browser.close();
  await wallJobs.close();
  await app.close().catch(() => {});
  await store.close();
}
