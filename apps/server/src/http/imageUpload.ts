import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { MAX_ASSET_EDGE } from "@vtt/shared";

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** The formats a stored image may really be, by the name `sharp` gives each one. */
const REAL_FORMATS = new Map([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
]);

const UNSUPPORTED = "Use PNG, JPEG or WebP";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** What an uploaded file's own bytes say it is. */
export interface ImageFacts {
  contentType: string;
  width: number;
  height: number;
}

/** An image that passed its checks, sitting in the upload folder under its real extension. */
export interface ReceivedImage extends ImageFacts {
  path: string;
  /** Random, and carries nothing of the uploader's filename (asset-library: object name reveals nothing). */
  key: string;
  bytes: number;
  /** What the uploader called it. Only for showing back to them. */
  originalName: string;
}

export type ImageCheck = ({ ok: true } & ImageFacts) | { ok: false; status: 413 | 415; error: string };

export type ImageUploadResult =
  | { ok: true; image: ReceivedImage }
  | { ok: false; status: 413 | 415 | 400; error: string };

/**
 * Reads a file's real format and size from its header (upload-limits). The size is the one a
 * browser draws, so a JPEG stored on its side reports its turned width and height.
 */
export async function checkImageBytes(file: string): Promise<ImageCheck> {
  const metadata = await sharp(file, { limitInputPixels: false }).metadata().catch(() => null);
  const contentType = metadata?.format ? REAL_FORMATS.get(metadata.format) : undefined;
  if (!metadata || !contentType || !metadata.width || !metadata.height) return { ok: false, status: 415, error: UNSUPPORTED };
  const turned = (metadata.orientation ?? 1) >= 5;
  const width = turned ? metadata.height : metadata.width;
  const height = turned ? metadata.width : metadata.height;
  if (Math.max(width, height) > MAX_ASSET_EDGE) {
    return { ok: false, status: 413, error: `Images must be ${MAX_ASSET_EDGE} pixels or smaller on each side` };
  }
  return { ok: true, contentType, width, height };
}

/** Removes a refused file, and renames a correct image saved under the wrong label to its real extension. */
async function checkReceivedFile(file: Express.Multer.File): Promise<ImageUploadResult> {
  const check = await checkImageBytes(file.path);
  if (!check.ok) {
    await unlink(file.path).catch(() => {});
    return check;
  }
  const { ok: _ok, ...facts } = check;
  const realPath = `${file.path.slice(0, -path.extname(file.path).length)}${IMAGE_TYPES[facts.contentType]}`;
  if (realPath !== file.path) await rename(file.path, realPath);
  return { ok: true, image: { ...facts, path: realPath, key: path.basename(realPath), bytes: file.size, originalName: file.originalname } };
}

/**
 * One multipart image, checked before it reaches object storage (DESIGN.md §6). The MIME type the
 * browser declared is only an early filter: the file's bytes decide what it is. Files get a random
 * name, so an object key never carries the uploader's filename.
 */
export function imageUploader(uploadDir: string, maxBytes: number = MAX_IMAGE_BYTES) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        void mkdir(uploadDir, { recursive: true }).then(
          () => cb(null, uploadDir),
          (err: Error) => cb(err, uploadDir),
        );
      },
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] ?? ""}`),
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
  }).single("file");

  /** Runs multer and turns its errors into a status instead of an unhandled 500. */
  return (req: Request, res: Response) =>
    new Promise<ImageUploadResult>((resolve) => {
      upload(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          return resolve(
            err.code === "LIMIT_FILE_SIZE"
              ? { ok: false, status: 413, error: `Images must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller` }
              : { ok: false, status: 400, error: err.message },
          );
        }
        if (err) return resolve({ ok: false, status: 400, error: "Upload failed" });
        if (!req.file) return resolve({ ok: false, status: 415, error: UNSUPPORTED });
        resolve(checkReceivedFile(req.file));
      });
    });
}
