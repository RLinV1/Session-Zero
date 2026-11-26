import { createHash, randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { BUILD_LIMITS, MAX_ASSET_EDGE } from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import { BuildClosedError, BuildLimitError, type BuildFileKind, type BuildFileRecord } from "../store/buildStore";
import { DETECTION_MAX_PIXELS, DETECTION_VERSION } from "../store/gridDetectionStore";
import { StudioAccessEndedError, type StudioDelegation } from "../store/studioStore";
import type { StudioMediaStore } from "../store/studioMediaStore";
import { serverEn } from "../i18n/en";
import { downloadStudioOriginal, STUDIO_FILE_BYTES, StudioIntakeError, type OriginalDownloader } from "./studioDownload";

export const STUDIO_PREVIEW_BYTES = 4 * 1024 ** 2;
export const STUDIO_DECODE_PIXELS = 40_000_000;
export const PRIVATE_PUBLISH_MESSAGE = serverEn["studio.media.publish"];
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const FILE_LIMITS = { files: BUILD_LIMITS.filesPerBuild, maps: BUILD_LIMITS.mapsPerBuild, bytes: BUILD_LIMITS.storageBytesPerBuild };
export interface IntakeDescriptor { download_url: string; file_id: string; file_name?: string; mime_type?: string }
const TYPES = { png: ["image/png", "png"], jpeg: ["image/jpeg", "jpg"], webp: ["image/webp", "webp"] } as const;

export class StudioMedia {
  private running = 0;
  private decoding = Promise.resolve();
  private sweeping: Promise<void> | null = null;
  constructor(readonly store: RoomStore, readonly media: StudioMediaStore | null, private download: OriginalDownloader = downloadStudioOriginal, private now = Date.now) {}

  async intake(buildId: string, kind: BuildFileKind, descriptor: IntakeDescriptor, delegation: StudioDelegation) {
    if (!this.media) throw new StudioIntakeError("storage");
    if (this.running >= 5) throw new StudioIntakeError("busy");
    this.running++;
    let intentId: string | null = null;
    const receipt = sha(`${kind}:${descriptor.file_id}`);
    const recordOutcome = (status: "saved" | "failed", fileId?: string, code?: string) => this.store.recordStudioIntake(buildId, {
      id: receipt, kind, name: (descriptor.file_name ?? "image").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 200) || "image", status, ...(fileId && { fileId }), ...(code && { code }), at: new Date(this.now()).toISOString(),
    }, delegation);
    try {
      const existing = (await this.store.listBuildFiles(buildId)).find((f) => f.kind === kind && f.studio?.receiptKeys.includes(receipt));
      // The caller rechecks authorization even for receipts; no descriptor fetch is necessary.
      if (existing) { await recordOutcome("saved", existing.id); return { file: existing, created: false }; }
      const usage = await this.store.buildFileUsage(buildId);
      if (usage.files >= FILE_LIMITS.files || (kind === "map" && usage.maps >= FILE_LIMITS.maps) || usage.bytes >= FILE_LIMITS.bytes) throw new StudioIntakeError("limit");
      const bytes = await this.download(descriptor.download_url);
      if (!bytes.length || bytes.length > STUDIO_FILE_BYTES) throw new StudioIntakeError("size");
      const originalSha256 = sha(bytes);
      let metadata: Metadata; let preview: Buffer;
      const previousDecode = this.decoding;
      let releaseDecode!: () => void;
      this.decoding = new Promise<void>((resolve) => { releaseDecode = resolve; });
      await previousDecode;
      try {
        metadata = await sharp(bytes, { limitInputPixels: STUDIO_DECODE_PIXELS, failOn: "warning" }).metadata();
        if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > MAX_ASSET_EDGE || (metadata.pages ?? 1) > 1 || !(metadata.format! in TYPES)) throw new Error("Unsupported image");
        preview = await sharp(bytes, { sequentialRead: true, limitInputPixels: STUDIO_DECODE_PIXELS, failOn: "warning" }).autoOrient()
          .resize(1500, 1500, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).timeout({ seconds: 15 }).toBuffer();
      } catch { throw new StudioIntakeError("image"); } finally { releaseDecode(); }
      if (preview.length > STUDIO_PREVIEW_BYTES) throw new StudioIntakeError("size");
      const [contentType, extension] = TYPES[metadata.format as keyof typeof TYPES];
      const orientation = metadata.orientation ?? 1;
      const turned = orientation >= 5;
      const width = turned ? metadata.height! : metadata.width!, height = turned ? metadata.width! : metadata.height!;
      const id = randomUUID(), objectKey = `studio-private/v1/${id}/original.${extension}`, previewKey = `studio-private/v1/${id}/preview-v1.webp`;
      const canonicalId = sha(JSON.stringify({ originalSha256, transform: "exif-auto-orient-v1", orientation, width, height }));
      const file: BuildFileRecord = {
        id, buildId, kind, objectKey, url: `/api/builds/${buildId}/files/${id}/media`,
        originalName: (descriptor.file_name ?? "image").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 200) || "image",
        width, height, sizeBytes: bytes.length, grid: null, board: null, sourceHash: originalSha256,
        detectionSourceHash: kind === "map" ? originalSha256 : null, detectionVersion: kind === "map" ? DETECTION_VERSION : null,
        detectionError: kind === "map" && width * height > DETECTION_MAX_PIXELS ? "oversized" : null,
        detectionStatus: kind === "map" ? width * height > DETECTION_MAX_PIXELS ? "error" : "queued" : null,
        detectionAttempt: kind === "map" ? 1 : 0, detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date(this.now()).toISOString(),
        studio: { version: 1, originalSha256, contentType, rawWidth: metadata.width!, rawHeight: metadata.height!, orientation, canonicalId,
          previewKey, previewSha256: sha(preview), previewBytes: preview.length, totalBytes: bytes.length + preview.length, receiptKeys: [receipt] },
      };
      await this.store.startStudioMedia({ id, buildId, state: "write", keys: [objectKey, previewKey], expiresAt: new Date(this.now() + 60 * 60_000).toISOString() }, delegation);
      intentId = id;
      await this.media.put(objectKey, bytes, contentType);
      await this.media.put(previewKey, preview, "image/webp");
      const result = await this.store.commitStudioFile(file, FILE_LIMITS, delegation);
      intentId = null;
      await recordOutcome("saved", result.file.id).catch(() => {});
      await this.sweep().catch(() => {});
      return result;
    } catch (e) {
      if (intentId) await this.store.failStudioMedia(intentId).catch(() => {});
      await recordOutcome("failed", undefined, e instanceof StudioIntakeError ? e.code : e instanceof BuildLimitError ? "limit" : e instanceof StudioAccessEndedError ? "access" : "storage").catch(() => {});
      if (e instanceof BuildClosedError || e instanceof StudioAccessEndedError || e instanceof BuildLimitError || e instanceof StudioIntakeError) throw e;
      throw new StudioIntakeError("storage");
    } finally {
      this.running--;
      // An unavailable store keeps its durable jobs, not an unhandled promise or raw SDK log.
      void this.sweep().catch(() => {});
    }
  }
  async sweep() {
    if (this.sweeping) return this.sweeping;
    if (!this.media) return;
    this.sweeping = this.runSweep();
    try { await this.sweeping; } finally { this.sweeping = null; }
  }
  private async runSweep() {
    for (const id of await this.store.listStudioMediaJobs(new Date(this.now()).toISOString())) {
      const job = await this.store.claimStudioMediaDeletion(id, new Date(this.now()).toISOString());
      if (!job) continue;
      try {
        for (const key of job.keys) await this.media!.delete(key);
        await this.store.finishStudioMediaDeletion(id, new Date(this.now()).toISOString());
      } catch { /* The durable job remains for the next sweep/restart. */ }
    }
  }
}
