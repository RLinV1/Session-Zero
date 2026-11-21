import type { FeedbackKind, FeedbackTechnical } from "@vtt/shared";

/** A stored screenshot: already re-encoded to WebP without metadata (ADR 0079). */
export interface FeedbackScreenshotRecord {
  contentType: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

/** One report with its screenshots, in the order they were attached. */
export interface FeedbackRecord {
  id: string;
  reference: string;
  kind: FeedbackKind;
  summary: string;
  details: string;
  technical: FeedbackTechnical | null;
  /** The signed-in reporter, so the team can reply; null for anyone else. Their account's deletion deletes the report. */
  reporterUserId: string | null;
  createdAt: string;
  screenshots: FeedbackScreenshotRecord[];
}

/** Another report already has this reference; draw a new one and try again. */
export class FeedbackReferenceTakenError extends Error {
  constructor(reference: string) {
    super(`Feedback reference ${reference} is taken`);
  }
}

/**
 * Feedback reports (FR-PL-11, ADR 0079). Write-only for the web: no route reads them back. The
 * team reads them through `feedback:export`.
 */
export interface FeedbackStore {
  /** Stores the report and its screenshots together, or nothing. Throws `FeedbackReferenceTakenError` on a clash. */
  createFeedback(report: FeedbackRecord): Promise<void>;
  /** Reports created at or after `since` (all when omitted), oldest first, with their screenshots. */
  listFeedback(since?: string): Promise<FeedbackRecord[]>;
  /** Deletes one report and its screenshots; false when there is no such reference. */
  deleteFeedback(reference: string): Promise<boolean>;
}
