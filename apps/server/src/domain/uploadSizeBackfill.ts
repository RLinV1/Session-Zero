import type { AssetStore } from "../store/assetStore";
import { UPLOAD_ALLOWANCE, type LibraryStore, type UploadAllowance, type UploadUsage } from "../store/libraryStore";

/** How many of the largest owners the report names. */
const LARGEST_SHOWN = 10;

export interface UploadSizeBackfillReport {
  recorded: number;
  /** Rows whose stored object is gone. They stay unsized and count as zero. */
  missing: number;
  overItems: number;
  overBytes: number;
  largest: (UploadUsage & { ownerGmId: string })[];
}

/**
 * Fills in the size of uploads stored before sizes were recorded (upload-limits D8), then reports
 * how accounts stand against the allowance. Only ever fills an empty size, so it is safe to re-run.
 */
export async function backfillUploadSizes(
  store: Pick<LibraryStore, "listUnsizedUploads" | "setUploadSize" | "uploadUsageByOwner">,
  assets: Pick<AssetStore, "sizeOf">,
  allowance: UploadAllowance = UPLOAD_ALLOWANCE,
): Promise<UploadSizeBackfillReport> {
  let recorded = 0;
  let missing = 0;
  for (const upload of await store.listUnsizedUploads()) {
    const bytes = await assets.sizeOf(upload.objectKey);
    if (bytes === null) {
      missing += 1;
      continue;
    }
    await store.setUploadSize(upload, bytes);
    recorded += 1;
  }
  const usage = await store.uploadUsageByOwner();
  return {
    recorded,
    missing,
    overItems: usage.filter((owner) => owner.items > allowance.maxItems).length,
    overBytes: usage.filter((owner) => owner.bytes > allowance.maxBytes).length,
    largest: [...usage].sort((a, b) => b.bytes - a.bytes).slice(0, LARGEST_SHOWN),
  };
}
