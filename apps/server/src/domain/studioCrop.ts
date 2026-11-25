import { createHash } from "node:crypto";
import sharp from "sharp";
import { listOpenings, MAX_ASSET_EDGE, studioTerrainCoverage, type StudioSelection } from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";
import type { BuildFileRecord } from "../store/buildStore";
import { MAX_IMAGE_BYTES } from "../http/imageUpload";
import { mapOverlay } from "./mapOverlay";
import { STUDIO_FILE_BYTES } from "./studioDownload";
import { STUDIO_DECODE_PIXELS } from "./studioMedia";
import { selectionObjects, StudioAuthoringError, type RevisionScene } from "./studioSceneRevision";
import { studioRevisionScene } from "./studioPreparation";

export function studioCropLayout(scene: RevisionScene, scope: StudioSelection) {
  const { grid, source } = scene;
  const objects = selectionObjects(scene);
  const region = { ...scope.region };
  const crossing = new Set(scope.wholeObjectIds);
  for (const object of objects) {
    if (!object.bounds || !crossing.has(object.id)) continue;
    region.minX = Math.min(region.minX, object.bounds.minX);
    region.minY = Math.min(region.minY, object.bounds.minY);
    region.maxX = Math.max(region.maxX, object.bounds.maxX);
    region.maxY = Math.max(region.maxY, object.bounds.maxY);
  }
  const padding = grid.cellSize * 2;
  const { walls, terrain, marks } = studioRevisionScene(scene);
  return mapOverlay({ width: source.width, height: source.height, grid, maxEdge: 1500, walls, terrain, marks,
    openings: listOpenings(scene.sourceBoard, scene.map.setup, grid), selection: scope.region,
    region: studioTerrainCoverage({
      minX: Math.max(0, region.minX - padding), minY: Math.max(0, region.minY - padding),
      maxX: Math.min(source.width, region.maxX + padding), maxY: Math.min(source.height, region.maxY + padding),
    }, grid),
    placements: objects.filter((object) => object.layer === "placements").flatMap((object, index) =>
      object.bounds ? [{ bounds: object.bounds, index, hidden: object.hidden ?? false }] : []),
  });
}

export async function renderStudioCrop(assets: AssetStore, file: BuildFileRecord | null, scene: RevisionScene, scope: StudioSelection) {
  const { source } = scene;
  const missing = () => new StudioAuthoringError("missing", "The artwork for this saved selection is unavailable.");
  if (!file || file.kind !== "map" || file.id !== source.id || file.width !== source.width || file.height !== source.height ||
      (file.studio?.canonicalId ?? null) !== source.canonicalId) throw missing();
  const bytes = await assets.readPrivate(file.objectKey, file.studio ? STUDIO_FILE_BYTES : MAX_IMAGE_BYTES * 2);
  // M3 legacy revisions did not store the digest separately from the immutable file record.
  const expectedHash = source.originalSha256 ?? scene.sourceContentHash ?? file.sourceHash;
  if (!bytes || (expectedHash && createHash("sha256").update(bytes).digest("hex") !== expectedHash)) throw missing();
  const image = sharp(bytes, { sequentialRead: true, limitInputPixels: file.studio ? STUDIO_DECODE_PIXELS : MAX_ASSET_EDGE ** 2 });
  const metadata = await image.metadata().catch(() => null);
  if (!metadata || metadata.autoOrient.width !== source.width || metadata.autoOrient.height !== source.height) throw missing();
  const layout = studioCropLayout(scene, scope);
  const webp = await image.autoOrient().extract(layout.crop).resize(layout.out.width, layout.out.height, { fit: "fill" })
    .composite([{ input: Buffer.from(layout.svg), top: 0, left: 0 }]).webp({ quality: 85 }).timeout({ seconds: 15 }).toBuffer();
  return { webp, crop: layout.crop };
}
