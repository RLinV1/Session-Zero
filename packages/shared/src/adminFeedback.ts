import { z } from "zod";
import { FeedbackKind, FeedbackReference, FeedbackTechnical } from "./feedback";

export const FeedbackCursor = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export type FeedbackCursor = z.infer<typeof FeedbackCursor>;

export const AdminFeedbackReport = z.object({
  reference: FeedbackReference,
  kind: FeedbackKind,
  summary: z.string(),
  details: z.string(),
  technical: FeedbackTechnical.nullable(),
  createdAt: z.iso.datetime(),
  reporter: z.object({ displayName: z.string(), email: z.string() }).nullable(),
  screenshots: z.array(z.object({ position: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() })),
});
export type AdminFeedbackReport = z.infer<typeof AdminFeedbackReport>;

export const AdminFeedbackResponse = z.object({ reports: z.array(AdminFeedbackReport), next: FeedbackCursor.nullable() });
export type AdminFeedbackResponse = z.infer<typeof AdminFeedbackResponse>;
