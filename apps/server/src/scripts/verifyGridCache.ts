/** Read the acceptance cache in a fresh Node process after restarting its isolated database. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGridDetectionDispatcher } from "../domain/gridDetection";
import { LocalDiskAssetStore } from "../store/assetStore";
import { PostgresRoomStore } from "../store/postgresRoomStore";

const folder = process.env.GRID_BENCH_OUTPUT;
assert(folder && process.env.DATABASE_URL && process.env.REDIS_URL, "Set the isolated acceptance output/database/Redis environment.");
const previous = JSON.parse(await readFile(path.join(folder, "acceptance.json"), "utf8")) as {
  persistent_asset_ids: string[]; persistent_no_grid_asset_id: string;
};
const store = await PostgresRoomStore.connect(process.env.DATABASE_URL);
let invocations = 0;
const dispatcher = await createGridDetectionDispatcher(store, new LocalDiskAssetStore(path.join(folder, "uploads")), {
  redisUrl: process.env.REDIS_URL,
  detector: async () => { invocations++; throw new Error("Completed cache was reanalyzed"); },
});
try {
  for (const id of previous.persistent_asset_ids) {
    const row = await store.findDetection({ scope: "library", id });
    assert(row && ["suggested", "no_grid"].includes(row.status));
  }
  const noGrid = await store.findDetection({ scope: "library", id: previous.persistent_no_grid_asset_id });
  assert.equal(noGrid?.status, "no_grid");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal(invocations, 0);
  const result = { cached_maps: previous.persistent_asset_ids.length, cached_no_grid: 1, new_detector_invocations: invocations, fresh_node_process: true };
  await writeFile(path.join(folder, "database-restart.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await dispatcher.close(); await store.close(); }
