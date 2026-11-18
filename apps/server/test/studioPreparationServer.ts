/** Browser-only attachment fixture; persistence, private storage and grid detector are real. */
import { mkdir, readFile } from "node:fs/promises";
import { buildApp } from "../src/app";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { createAssetStore } from "../src/store/assetStore";
import { createStudioMediaStore } from "../src/store/studioMediaStore";
import { StudioIntakeError, studioDownloadUrl } from "../src/domain/studioDownload";

if (process.env.STUDIO_M2_BROWSER_TEST !== "1" || process.env.S3_AUTODETECT !== "0" || !process.env.DATABASE_URL?.includes("127.0.0.1:55435/studio_m2") || process.env.VISION_URL !== "http://127.0.0.1:18890" || process.env.STUDIO_S3_ENDPOINT !== "http://127.0.0.1:18335") throw new Error("Expected real isolated M2 services");
const uploadDir = process.env.UPLOAD_DIR!;
await mkdir(uploadDir, { recursive: true });
const fixtures = new Map([
  ["/studio-browser-map", await readFile(new URL("../../../browser/fixtures/studio-preparation.png", import.meta.url))],
  ["/studio-browser-token", await readFile(new URL("../../../browser/fixtures/studio-token.png", import.meta.url))],
]);
const app = await buildApp({ store: await PostgresRoomStore.connect(process.env.DATABASE_URL), uploadDir,
  assets: await createAssetStore(uploadDir), studioMedia: await createStudioMediaStore(uploadDir), wallQueue: null,
  studioDownloader: async (raw) => { const bytes = fixtures.get(studioDownloadUrl(raw).pathname); if (!bytes) throw new StudioIntakeError("expired"); return bytes; },
});
await app.listen({ port: Number(process.env.PORT), host: "127.0.0.1" });
console.log("[studio M2 browser] actual isolated Postgres/S3/grid detector; synthetic attachment download only");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void app.close().then(() => process.exit(0)));
