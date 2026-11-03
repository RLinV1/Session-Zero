import { PreparationConflictError } from "../store/libraryPreparation";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import {
  canRenderGrid,
  SaveLibraryPreparation,
  LibraryMapBoard,
  libraryBoardProblem,
  LibraryPatchRequest,
  LibraryUploadFields,
  GridDetectionStatus,
  type GmRoomSummary,
  type LibraryAsset,
  type LibraryUsageResponse,
} from "@vtt/shared";
import { registerAnimationRoutes } from "./animations";
import { registerCreatureRoutes } from "./creatures";
import type { AssetStore } from "../store/assetStore";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { ensureShippedMaps, isShippedKey } from "../domain/shippedMaps";
import { enqueueDetection, type GridDetectionDispatcher } from "../domain/gridDetection";
import type { DetectionRecord } from "../store/gridDetectionStore";
import { requireAccountOwner, resolveOwner, type Owner } from "../ownership/resolveOwner";
import { imageUploader } from "./imageUpload";
import { inspectMapUpload } from "../domain/uploadAnalysis";
import { refused } from "../identity/routes";
import type { RateLimiter } from "../identity/rateLimit";

const AssetIdParam = z.uuid();

/**
 * The dashboard's room list and the asset library (ADR 0004, ADR 0017). Every route resolves the
 * owner first: the signed-in account, or a legacy device identity that may read, edit and delete
 * what it has but create nothing. An asset the caller does not own answers 404, the same as one
 * that does not exist.
 */
export function registerLibraryRoutes(
  app: Express,
  deps: { store: RoomStore; uploadDir: string; assets: AssetStore; detection: GridDetectionDispatcher; uploads: RateLimiter },
) {
  const { store, uploadDir, assets, detection, uploads } = deps;
  const receiveImage = imageUploader(uploadDir);

  /**
   * Retired (ADR 0017): new GM device identities are no longer created; accounts own what a GM
   * makes. Existing device tokens still work for what they already own.
   */
  app.post("/api/gm/identify", (_req, res) => {
    res.status(410).json({ error: "Sign in to save rooms and library art" });
  });

  app.get("/api/gm/rooms", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const rooms: GmRoomSummary[] = await store.listOwnedRooms(gmId);
      res.json(rooms);
    });
  });

  app.get("/api/library", (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (owner.via === "account") await ensureShippedMaps(store, gmId);
      res.json((await store.listAssets(gmId)).map(toWire));
    });
  });

  app.post("/api/library", (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      // One budget with room uploads, keyed by the same owner id (FR-GM-02).
      if (refused(res, uploads.hit(`upload:${gmId}`), "Too many uploads. Try again later.")) return;
      const upload = await receiveImage(req, res);
      if (!upload.ok) return void res.status(upload.status).json({ error: upload.error });
      const fields = LibraryUploadFields.safeParse(req.body);
      if (!fields.success) {
        await unlink(upload.file.path).catch(() => {});
        return void res.status(400).json({ error: fields.error.issues });
      }
      const key = path.basename(upload.file.path);
      const analysis = fields.data.kind === "map" ? await inspectMapUpload(upload.file.path, fields.data) : null;
      const url = await assets.put(upload.file.path, key, upload.file.mimetype);
      const record: LibraryAssetRecord = {
        id: randomUUID(),
        ownerGmId: gmId,
        kind: fields.data.kind,
        objectKey: key,
        url,
        name: fields.data.name,
        width: fields.data.width,
        height: fields.data.height,
        // Uploading an image does not establish its spacing. The setup editor saves
        // an explicit grid, including when the GM accepts the default values (KAN-09).
        // Analysis only suggests one (grid-detection).
        grid: null,
        detectionStatus: fields.data.kind === "map" ? "queued" : null,
        detectionAttempt: fields.data.kind === "map" ? 1 : 0,
        detectionResult: null,
        ...analysis,
        createdAt: new Date().toISOString(),
      };
      await store.createAsset(record);
      if (record.detectionStatus === "queued") await enqueueDetection(store, detection, { scope: "library", id: record.id }, 1);
      res.status(201).json(toWire(record));
    });
  });

  app.patch("/api/library/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const patch = LibraryPatchRequest.safeParse(req.body);
      if (!patch.success) return void res.status(400).json({ error: patch.error.issues });
      const existing = await store.findAsset(id.data, gmId);
      if (!existing) return void notFound(res);
      if (patch.data.grid && existing.kind !== "map") {
        return void res.status(400).json({ error: "Only maps have a grid" });
      }
      // The same drawable-grid limit `decide` applies to a room's grid, against this map's size.
      if (patch.data.grid && !canRenderGrid(patch.data.grid.cellSize, existing)) {
        return void res.status(400).json({ error: "Grid cell size is too small for this map" });
      }
      const updated = await store.updateAsset(id.data, gmId, patch.data);
      if (!updated) return void notFound(res);
      res.json(toWire(updated));
    });
  });

  app.get("/api/library/:id/preparation", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      const preparation = id.success ? await store.findAssetPreparation(id.data, gmId) : null;
      if (!preparation) return void notFound(res);
      res.json(preparation);
    });
  });
  app.put("/api/library/:id/preparation", signedInOnly, express.json({ limit: "1mb" }), (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const id = AssetIdParam.safeParse(req.params.id), change = SaveLibraryPreparation.safeParse(req.body);
      if (!id.success) return void notFound(res);
      if (!change.success) return void res.status(400).json({ error: "Invalid map preparation" });
      const preparation = await store.saveAssetPreparation(id.data, gmId, change.data);
      if (!preparation) return void notFound(res);
      res.json(preparation);
    });
  });

  app.get("/api/library/:id/board", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      const board = id.success ? await store.findAssetBoard(id.data, gmId) : null;
      if (!board) return void notFound(res);
      res.json(board);
    });
  });

  // Walls and fog prepared on a library map (ADR 0037). Accounts only, like every library write.
  app.put("/api/library/:id/board", signedInOnly, express.json({ limit: "1mb" }), (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const board = LibraryMapBoard.safeParse(req.body);
      if (!board.success) return void res.status(400).json({ error: board.error.issues });
      const asset = await store.findAsset(id.data, gmId);
      if (!asset || asset.kind !== "map") return void notFound(res);
      const problem = libraryBoardProblem(board.data, asset);
      if (problem) return void res.status(400).json({ error: problem });
      if (!(await store.setAssetBoard(id.data, gmId, board.data))) return void notFound(res);
      res.json(board.data);
    });
  });

  app.get("/api/library/:id/grid-detection", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const row = await store.findDetection({ scope: "library", id: id.data });
      if (!row) return void notFound(res);
      res.json(detectionWire(row));
    });
  });

  app.post("/api/library/:id/grid-detection/retry", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const target = { scope: "library" as const, id: id.data };
      const attempt = await store.retryDetection(target);
      if (!attempt) return void res.status(409).json({ error: "Analysis is not in error" });
      await enqueueDetection(store, detection, target, attempt);
      res.status(202).json(detectionWire((await store.findDetection(target))!));
    });
  });

  app.get("/api/library/:id/usage", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const response: LibraryUsageResponse = {
        rooms: await store.assetUsage(id.data, gmId),
        creatures: await store.creaturesUsingImage(id.data, gmId),
        encounters: await store.encountersUsingMap(id.data, gmId),
      };
      res.json(response);
    });
  });

  app.delete("/api/library/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const removed = await store.deleteAsset(id.data, gmId);
      if (!removed) return void notFound(res);
      // Rooms still naming this URL in their log now get a 404 and draw a generic stand-in.
      // A seeded map's image is a shipped file, not a stored object (ADR 0036).
      if (!isShippedKey(removed.objectKey)) await assets.delete(removed.objectKey);
      res.status(204).end();
    });
  });

  registerCreatureRoutes(app, { store, withGm });
  registerAnimationRoutes(app, { store, withGm });

  /** Answers 401 before a large body is read: only a signed-in caller may make the server buffer 1 MB. */
  function signedInOnly(req: Request, res: Response, next: () => void) {
    resolveOwner(req, res, store).then(
      (owner) => (owner ? next() : void res.status(401).json({ error: "Sign in to do that" })),
      () => void res.status(500).json({ error: "Internal error" }),
    );
  }

  async function withGm(req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) {
    try {
      const owner = await resolveOwner(req, res, store);
      if (!owner) return void res.status(401).json({ error: "Sign in to do that" });
      await handler(owner.ownerId, owner);
    } catch (err) {
      if (err instanceof PreparationConflictError) return void res.status(409).json({ error: err.message });
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

export function detectionWire(row: DetectionRecord): GridDetectionStatus {
  return GridDetectionStatus.parse(row.status === "suggested" && row.candidate
    ? { status: "suggested", attempt: row.attempt, candidate: row.candidate }
    : { status: row.status, attempt: row.attempt });
}

function notFound(res: Response) {
  res.status(404).json({ error: "Asset not found" });
}

/** The server-only object key stays behind. */
export function toWire(record: LibraryAssetRecord): LibraryAsset {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    url: record.url,
    width: record.width,
    height: record.height,
    grid: record.grid,
    createdAt: record.createdAt,
  };
}
