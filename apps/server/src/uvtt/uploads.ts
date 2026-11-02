import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import multer from "multer";
import { MAX_UVTT_BYTES, uvttError, type GridSpec } from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import type { ValidatedUvttFile } from "./validateFile";
import type { UvttValidationPool } from "./validationPool";

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_UVTT_BYTES, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, cb) => cb(null, /\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.originalname)),
}).single("file");

/** Both entry points use the same bounded worker and always remove the raw container. Authorize first. */
export async function receiveUvtt(req: Request, res: Response, pool: UvttValidationPool, grid: GridSpec) {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, (error: unknown) => error ? reject(error) : resolve()));
    if (!req.file) uvttError("unsupported_file", "file", "Choose a .uvtt, .dd2vtt or .df2vtt file.");
    return { validated: await pool.validate(req.file.path, grid), filename: req.file.originalname };
  } finally {
    if (req.file?.path) await rm(req.file.path, { force: true });
  }
}

export async function writeUvttImage(assets: AssetStore, uploadDir: string, validated: ValidatedUvttFile) {
  const key = `${randomUUID()}.${validated.contentType === "image/png" ? "png" : "webp"}`;
  const imagePath = path.join(uploadDir, key);
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(imagePath, validated.image, { flag: "wx" });
    const url = await assets.put(imagePath, key, validated.contentType);
    return { key, imagePath, url };
  } catch (error) {
    await assets.delete(key).catch(() => {});
    await rm(imagePath, { force: true });
    throw error;
  }
}

/** One row contains the complete map. A failed insert leaves neither a partial asset nor its image. */
export async function createUvttLibraryMap(store: RoomStore, assets: AssetStore, uploadDir: string,
  ownerId: string, filename: string, validated: ValidatedUvttFile): Promise<LibraryAssetRecord> {
  const image = await writeUvttImage(assets, uploadDir, validated);
  const record: LibraryAssetRecord = {
    id: randomUUID(), ownerGmId: ownerId, kind: "map", objectKey: image.key, url: image.url,
    name: (filename.replace(/\.(?:uvtt|dd2vtt|df2vtt)$/i, "").replace(/[_-]+/g, " ").trim() || "Imported map").slice(0, 80),
    width: validated.width, height: validated.height, grid: validated.grid,
    board: { walls: validated.walls, fog: [] },
    // UVTT supplies the spacing; image-based detection must not replace it.
    detectionStatus: null, detectionAttempt: 0, createdAt: new Date().toISOString(),
  };
  try {
    await store.createAsset(record);
    return record;
  } catch (error) {
    await assets.delete(image.key).catch(() => {});
    await rm(image.imagePath, { force: true });
    throw error;
  }
}
