import path from "node:path";
import { fileURLToPath } from "node:url";
import { backfillUploadSizes } from "../domain/uploadSizeBackfill";
import { createAssetStore } from "../store/assetStore";
import { UPLOAD_ALLOWANCE } from "../store/libraryStore";
import { PostgresRoomStore } from "../store/postgresRoomStore";

/**
 * Records the size of uploads stored before sizes were kept, then prints how accounts stand
 * against the upload allowance, by owner id only. Safe to run more than once.
 *
 *   DATABASE_URL=postgres://… npm run uploads:backfill-sizes --workspace=@vtt/server
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Usage: DATABASE_URL=… npm run uploads:backfill-sizes --workspace=@vtt/server");
    process.exitCode = 2;
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(here, "..", "..", "uploads");
  const store = await PostgresRoomStore.connect(url);
  try {
    const report = await backfillUploadSizes(store, await createAssetStore(uploadDir));
    const megabytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    console.log(`Recorded ${report.recorded} size(s). ${report.missing} upload(s) had no stored object and stay unsized.`);
    console.log(`Accounts over ${UPLOAD_ALLOWANCE.maxItems} library items: ${report.overItems}`);
    console.log(`Accounts over ${UPLOAD_ALLOWANCE.maxBytes / 1024 ** 3} GB of storage: ${report.overBytes}`);
    console.log("Largest totals:");
    for (const owner of report.largest) console.log(`  ${owner.ownerGmId}  ${megabytes(owner.bytes)}  ${owner.items} library item(s)`);
  } finally {
    await store.close();
  }
}

await main();
