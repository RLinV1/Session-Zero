import type { Response } from "express";
import {
  UPLOAD_ALLOWANCE,
  UploadAllowanceError,
  assertFitsAllowance,
  type LibraryStore,
  type UploadScope,
  type UploadUsage,
} from "../store/libraryStore";

/** One more library item and at least one more byte. */
export const LIBRARY_UPLOAD_NEEDS: UploadUsage = { items: 1, bytes: 1 };
/** A room upload is not a library item, so it only needs storage. */
export const ROOM_UPLOAD_NEEDS: UploadUsage = { items: 0, bytes: 1 };

/**
 * Answers 409 before the body is read when nothing could fit, so a full account cannot make the
 * server take in another 25 MB. The store still makes the final decision once the size is known.
 */
export async function refuseIfFull(res: Response, store: Pick<LibraryStore, "uploadUsage">, scope: UploadScope, needs: UploadUsage) {
  try {
    assertFitsAllowance(await store.uploadUsage(scope), needs, UPLOAD_ALLOWANCE);
    return false;
  } catch (err) {
    if (!(err instanceof UploadAllowanceError)) throw err;
    res.status(409).json({ error: err.message });
    return true;
  }
}
