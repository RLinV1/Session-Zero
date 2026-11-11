import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { DETECTION_MAX_PIXELS, DETECTION_VERSION, type DetectionError } from "../store/gridDetectionStore";

/** Prepares a map whose real size `imageUploader` already read. No resave or artwork conversion. */
export async function inspectMapUpload(file: string, real: { width: number; height: number }) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sourceHash = hash.digest("hex");
  const { width, height } = real;
  const detectionError: DetectionError | null = width * height > DETECTION_MAX_PIXELS ? "oversized" : null;
  return { width, height, sourceHash, detectionSourceHash: sourceHash, detectionVersion: DETECTION_VERSION,
    detectionError, detectionStatus: detectionError ? "error" as const : "queued" as const, detectionAttempt: 1 };
}
