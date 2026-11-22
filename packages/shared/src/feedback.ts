import { z } from "zod";
import { LOCALES } from "./i18n/core";

/**
 * A bug report or idea someone sends the team (FR-PL-11, ADR 0079). Not room state: it is a plain
 * REST request, stored privately and read only by the team through `feedback:export`.
 */
export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export const FeedbackKind = z.enum(FEEDBACK_KINDS);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

export const FEEDBACK_LIMITS = {
  summary: 120,
  details: 4000,
  screenshots: 3,
  /** Per attached file, before the server re-encodes it. */
  screenshotBytes: 5 * 1024 * 1024,
  /** The JSON form field that carries everything but the files. */
  fieldBytes: 16 * 1024,
} as const;

const Size = z.object({ width: z.number().int().min(0).max(20000), height: z.number().int().min(0).max(20000) }).strict();

/**
 * Technical details, an allow-list (design D4). The page path never carries a query or fragment,
 * so an invite token in the address can't be sent. Nothing here describes the room's contents.
 */
export const FeedbackTechnical = z.object({
  pagePath: z.string().max(200).regex(/^\/[^?#\s]*$/, "Page path must be a path without a query or fragment"),
  appVersion: z.string().max(40).optional(),
  userAgent: z.string().max(400).optional(),
  screen: Size.optional(),
  viewport: Size.optional(),
  pixelRatio: z.number().min(0.25).max(8).optional(),
  locale: z.enum(LOCALES).optional(),
  roomId: z.string().max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  role: z.enum(["gm", "player"]).optional(),
}).strict();
export type FeedbackTechnical = z.infer<typeof FeedbackTechnical>;

/** The form's fields, sent as one JSON part beside the image files. */
export const FeedbackReport = z.object({
  kind: FeedbackKind,
  summary: z.string().trim().min(1).max(FEEDBACK_LIMITS.summary),
  details: z.string().trim().max(FEEDBACK_LIMITS.details).default(""),
  technical: FeedbackTechnical.optional(),
}).strict();
export type FeedbackReport = z.infer<typeof FeedbackReport>;

/** Crockford base32 without I, L, O and U, so a reference read aloud can't be misheard. */
export const FEEDBACK_REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const FeedbackReference = z.string().regex(/^FB-[0-9A-HJKMNP-TV-Z]{4}$/);

/** What the reporter gets back: the one id they ever see, and how many images were kept. */
export const FeedbackReceipt = z.object({ reference: FeedbackReference, screenshots: z.number().int().min(0).max(FEEDBACK_LIMITS.screenshots) }).strict();
export type FeedbackReceipt = z.infer<typeof FeedbackReceipt>;

/** `FB-` and four random characters of the alphabet; `random` returns [0, 1). */
export function feedbackReference(random: () => number): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += FEEDBACK_REFERENCE_ALPHABET[Math.floor(random() * FEEDBACK_REFERENCE_ALPHABET.length)];
  return `FB-${code}`;
}

/** The page path technical details may carry: the pathname only, capped. */
export function feedbackPagePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0]!.replace(/\s/g, "");
  return (path.startsWith("/") ? path : `/${path}`).slice(0, 200);
}
