import { randomInt, randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { FEEDBACK_LIMITS, FeedbackReport, feedbackReference, type FeedbackReceipt } from "@vtt/shared";
import type { Mailer } from "../identity/mailer";
import { signedIn } from "../identity/middleware";
import type { RateLimiter } from "../identity/rateLimit";
import { addressKey, refused } from "../identity/routes";
import { feedbackEmail } from "./feedbackEmail";
import { FeedbackReferenceTakenError, type FeedbackScreenshotRecord, type FeedbackStore } from "../store/feedbackStore";

/** The formats a screenshot may really be, whatever its name or declared type says. */
const SCREENSHOT_FORMATS = new Set(["png", "jpeg", "webp"]);
/** Larger than any real screen capture; refuses decompression bombs before decoding. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Stored screenshots fit inside this edge, which keeps a 5K capture readable and the row small. */
const MAX_STORED_EDGE = 2560;

const TEXT = {
  invalid: "This report isn't valid. Check the summary and try again.",
  tooLarge: "Each screenshot can be up to 5 MB.",
  tooMany: "Attach up to 3 screenshots.",
  image: "Screenshots must be PNG, JPEG or WebP images.",
  tooManyReports: "Too many reports from here. Try again in an hour.",
  notFromApp: "This request didn't come from the app",
  internal: "Internal error",
} as const;

class NotAnImage extends Error {}

/**
 * Re-encodes one attached file to WebP (ADR 0079 D2). `sharp` writes no metadata unless asked, so
 * EXIF location and camera data are gone; `rotate()` first applies the orientation they carried.
 */
export async function cleanScreenshot(bytes: Uint8Array): Promise<FeedbackScreenshotRecord> {
  const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata().catch(() => null);
  if (!metadata?.format || !SCREENSHOT_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) throw new NotAnImage();
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_STORED_EDGE, height: MAX_STORED_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => { throw new NotAnImage(); });
  return { contentType: "image/webp", width: info.width, height: info.height, bytes: new Uint8Array(data) };
}

/**
 * `POST /api/feedback` (FR-PL-11, ADR 0079): a bug report or idea from anyone, signed in or not.
 * Multipart: one `report` field holding `FeedbackReport` as JSON, and up to three `screenshots`.
 * Nothing is ever read back over HTTP; the team reads reports through `feedback:export`.
 */
export function registerFeedbackRoutes(app: Express, deps: { store: FeedbackStore; limiter: RateLimiter; mailLimiter: RateLimiter; mailer: Mailer | null; adminEmail: string; allowedOrigins: readonly string[]; now: () => number }) {
  const { store, limiter, mailLimiter, mailer, adminEmail, allowedOrigins, now } = deps;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: FEEDBACK_LIMITS.screenshotBytes,
      files: FEEDBACK_LIMITS.screenshots,
      fields: 2,
      fieldSize: FEEDBACK_LIMITS.fieldBytes,
      parts: FEEDBACK_LIMITS.screenshots + 2,
    },
  }).fields([{ name: "screenshots", maxCount: FEEDBACK_LIMITS.screenshots }]);

  /**
   * The app's own pages only. `requireSameOrigin` checks only requests that carry a session, and
   * reports come from signed-out visitors too, so this route checks every request the same way.
   */
  const fromApp = (req: Request) => {
    const origin = req.headers.origin;
    if (origin) return allowedOrigins.includes(origin) || hostOf(origin) === req.headers.host;
    return req.headers["sec-fetch-site"] !== "cross-site";
  };

  app.post(
    "/api/feedback",
    (req: Request, res: Response, next: NextFunction) => {
      if (!fromApp(req)) return void res.status(403).json({ error: TEXT.notFromApp });
      // Every attempt counts, accepted or not, before the body is read.
      if (refused(res, limiter.hit(`feedback:${addressKey(req.ip)}`), TEXT.tooManyReports)) return;
      if (!req.is("multipart/form-data")) return void res.status(400).json({ error: TEXT.invalid });
      upload(req, res, (err: unknown) => {
        if (!err) return next();
        const code = err instanceof multer.MulterError ? err.code : null;
        if (code === "LIMIT_FILE_SIZE" || code === "LIMIT_FIELD_VALUE") return void res.status(413).json({ error: TEXT.tooLarge });
        if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE" || code === "LIMIT_PART_COUNT") return void res.status(400).json({ error: TEXT.tooMany });
        res.status(400).json({ error: TEXT.invalid });
      });
    },
    (req: Request, res: Response) => {
      void (async () => {
        const body = req.body as Record<string, unknown> | undefined;
        if (typeof body?.website === "string" && body.website !== "") {
          const decoy: FeedbackReceipt = { reference: feedbackReference(() => randomInt(0, 2 ** 32) / 2 ** 32), screenshots: 0 };
          return void res.status(201).json(decoy);
        }
        const field: unknown = body?.report;
        let raw: unknown;
        try { raw = typeof field === "string" ? JSON.parse(field) : undefined; } catch { raw = undefined; }
        const report = FeedbackReport.safeParse(raw);
        if (!report.success) return void res.status(400).json({ error: TEXT.invalid });

        const files = (req.files as Record<string, Express.Multer.File[]> | undefined)?.screenshots ?? [];
        let screenshots: FeedbackScreenshotRecord[];
        try {
          screenshots = [];
          // One at a time: each decode holds a whole image in memory.
          for (const file of files) screenshots.push(await cleanScreenshot(file.buffer));
        } catch (err) {
          if (err instanceof NotAnImage) return void res.status(415).json({ error: TEXT.image });
          throw err;
        }

        const account = signedIn(res);
        const base = {
          id: randomUUID(), kind: report.data.kind, summary: report.data.summary, details: report.data.details,
          technical: report.data.technical ?? null, reporterUserId: account?.user.id ?? null,
          createdAt: new Date(now()).toISOString(), screenshots,
        };
        for (let attempt = 0; ; attempt++) {
          const reference = feedbackReference(() => randomInt(0, 2 ** 32) / 2 ** 32);
          try {
            await store.createFeedback({ ...base, reference });
            const receipt: FeedbackReceipt = { reference, screenshots: screenshots.length };
            res.status(201).json(receipt);
            if (mailer && adminEmail && mailLimiter.hit("feedback-mail").ok) {
              mailer.send(feedbackEmail(adminEmail, report.data, reference, account?.user.email ?? null, screenshots)).catch((error: unknown) => console.error("[vtt] feedback email failed:", error));
            }
            return;
          } catch (err) {
            if (!(err instanceof FeedbackReferenceTakenError) || attempt >= 4) throw err;
          }
        }
      })().catch((err: unknown) => {
        console.error("[vtt] feedback report failed:", err);
        if (!res.headersSent) res.status(500).json({ error: TEXT.internal });
      });
    },
  );
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
