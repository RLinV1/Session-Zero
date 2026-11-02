import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import sharp from "sharp";
import { DETECTION_MAX_PIXELS, DETECTION_VERSION, type DetectionError } from "../store/gridDetectionStore";

/** Inspect stored bytes, never trust client dimensions. No resave or artwork conversion. */
export async function inspectMapUpload(file: string, declared: { width: number; height: number }) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sourceHash = hash.digest("hex");
  let width = declared.width;
  let height = declared.height;
  let detectionError: DetectionError | null = null;
  try {
    const metadata = await sharp(file, { limitInputPixels: false }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || !metadata.width || !metadata.height) throw new Error("Invalid image");
    const rotated = (metadata.orientation ?? 1) >= 5;
    width = rotated ? metadata.height : metadata.width;
    height = rotated ? metadata.width : metadata.height;
    if (Math.max(width, height) > 16_384 || width * height > DETECTION_MAX_PIXELS) detectionError = "oversized";
  } catch {
    detectionError = "invalid_image";
  }
  return { width, height, sourceHash, detectionSourceHash: sourceHash, detectionVersion: DETECTION_VERSION,
    detectionError, detectionStatus: detectionError ? "error" as const : "queued" as const, detectionAttempt: 1 };
}
