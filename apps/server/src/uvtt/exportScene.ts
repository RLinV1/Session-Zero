import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MAX_UVTT_EDGE, MAX_UVTT_IMAGE_BYTES, MAX_UVTT_PIXELS, serializeUvtt, shippedMapByUrl, uvttError, type GridSpec, type MapImage, type Wall } from "@vtt/shared";
import { builtinImageName, uploadKey } from "../domain/wallDetection";
import type { AssetStore } from "../store/assetStore";
import type { RoomStore } from "../store/roomStore";
import { bitmapFormat, hasPngAnimation } from "./imageValidation";

export interface CapturedScene { map: MapImage | null; grid: GridSpec; walls: Record<string, Wall>; seq: number }
/** The bytes behind a map image, or a thrown UvttError explaining why they can't be read. */
export type MapImageReader = (map: MapImage) => Promise<Uint8Array>;

/**
 * Reads a map image the caller may use (ADR 0070): a shipped map from the web app's files, the
 * owner's own library object, or (with `roomId`) an upload recorded for that room. Anything else,
 * such as another owner's object or an external URL, is refused.
 */
export function mapImageReader(scope: { ownerId: string | null; roomId?: string }, store: RoomStore, assets: AssetStore, builtinDir: string | null): MapImageReader {
  const readObject = async (key: string) => {
    try { return await assets.readPrivate(key, MAX_UVTT_IMAGE_BYTES); }
    catch { uvttError("image_read_failed", "image", "The map image could not be read within the 25 MiB limit. Retry, or upload a smaller image."); }
  };
  return async (map) => {
    const shipped = shippedMapByUrl(map.url) ? builtinImageName(map.url) : null;
    if (shipped) {
      if (!builtinDir) uvttError("missing_image", "image", "The shipped map image is unavailable on this server. Upload the image before exporting.");
      const filename = path.join(builtinDir, shipped);
      try {
        if ((await stat(filename)).size > MAX_UVTT_IMAGE_BYTES) uvttError("image_limit", "image", "Map image is too large to export.");
        return await readFile(filename);
      } catch (error) {
        if (error instanceof Error && "issues" in error) throw error;
        uvttError("missing_image", "image", "The shipped map image is unavailable on this server. Upload the image before exporting.");
      }
    }
    const owner = scope.ownerId;
    const library = owner ? (map.assetId ? await store.findAsset(map.assetId, owner) : (await store.listAssets(owner)).find((a) => a.url === map.url && a.kind === "map")) : null;
    const libraryKey = library?.kind === "map" && library.url === map.url ? library.objectKey : null;
    const key = uploadKey(map.url);
    let bytes: Uint8Array | null = null;
    if (libraryKey) bytes = await readObject(libraryKey);
    else if (key && scope.roomId && await store.hasRoomUpload(scope.roomId, key)) bytes = await readObject(key);
    else uvttError("unreadable_map", "map", "Upload this map image to the room or your library before exporting. External image URLs cannot be exported.");
    if (!bytes) uvttError("missing_image", "image", "The map image is unavailable. Upload it again before exporting.");
    return bytes;
  };
}

export async function exportUvttScene(snapshot: CapturedScene, readImage: MapImageReader) {
  const map = snapshot.map;
  if (!map) uvttError("no_map", "map", "Apply a map before exporting.");
  // Reject fractional grids before any image I/O.
  serializeUvtt(map, snapshot.grid, Object.values(snapshot.walls), "");
  const bytes = await readImage(map);
  if (!bitmapFormat(bytes)) uvttError("image_type", "image", "Upload a PNG, WebP or JPEG map before exporting.");
  if (hasPngAnimation(bytes)) uvttError("animated_image", "image", "Upload a single-frame map before exporting.");
  let image: Buffer;
  try {
    const decoder = sharp(bytes, { animated: true, limitInputPixels: MAX_UVTT_PIXELS, failOn: "warning" });
    const meta = await decoder.metadata();
    if ((meta.pages ?? 1) !== 1 || meta.width !== map.width || meta.height !== map.height || meta.width > MAX_UVTT_EDGE || meta.height > MAX_UVTT_EDGE) {
      uvttError("image_mismatch", "image", "Map image dimensions changed or it is animated. Upload a matching single-frame image.");
    }
    if (meta.format === "jpeg") image = await decoder.png().toBuffer();
    else if (meta.format === "png" || meta.format === "webp") { await decoder.raw().toBuffer(); image = Buffer.from(bytes); }
    else uvttError("image_type", "image", "Upload a PNG, WebP or JPEG map before exporting.");
  } catch (error) {
    if (error instanceof Error && "issues" in error) throw error;
    uvttError("corrupt_image", "image", "The applied image cannot be decoded. Upload it again.");
  }
  if (image.length > MAX_UVTT_IMAGE_BYTES) uvttError("image_limit", "image", "Converted image exceeds 25 MiB. Upload a smaller PNG or WebP.");
  return serializeUvtt(map, snapshot.grid, Object.values(snapshot.walls), image.toString("base64"));
}
