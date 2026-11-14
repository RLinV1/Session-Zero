import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import { Command, LibraryMapBoard, SaveMapToLibraryRequest, SaveMapToLibraryResult, UvttError, shippedMapByUrl, type MapImage, type Wall } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import { requestLocale } from "../i18n/locale";
import { sharedText } from "../i18n/localize";
import type { RateLimiter } from "../identity/rateLimit";
import { refused } from "../identity/routes";
import type { Sessions } from "../identity/sessions";
import { requireAccountOwner, resolveOwner } from "../ownership/resolveOwner";
import type { AssetStore } from "../store/assetStore";
import { PreparationConflictError } from "../store/libraryPreparation";
import { UPLOAD_ALLOWANCE, UploadAllowanceError, type LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { exportUvttScene, mapImageReader } from "../uvtt/exportScene";
import { bitmapFormat } from "../uvtt/imageValidation";

interface Deps { store: RoomStore; registry: RoomRegistry; sessions: Sessions; assets: AssetStore; uploadDir: string; builtinImageDir: string | null; uploads: RateLimiter }
interface Auth { room: LiveRoom; actorId: string; roomId: string }

const CONTENT_TYPES = { png: "image/png", webp: "image/webp", jpeg: "image/jpeg" } as const;
const EXTENSIONS = { png: "png", webp: "webp", jpeg: "jpg" } as const;

/**
 * Stores a copy of a map image under a fresh key (ADR 0070): the library row never shares the room's
 * object, and a built-in's copy never carries a shipped URL. Throws when the bytes are not a bitmap.
 */
export async function storeMapCopy(assets: AssetStore, uploadDir: string, bytes: Uint8Array) {
  const format = bitmapFormat(bytes);
  if (!format) throw new Error("The map image isn't a PNG, WebP or JPEG.");
  const key = `${randomUUID()}.${EXTENSIONS[format]}`;
  const imagePath = path.join(uploadDir, key);
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(imagePath, bytes, { flag: "wx" });
    const url = await assets.put(imagePath, key, CONTENT_TYPES[format]);
    return { key, url, imagePath };
  } catch (error) {
    await assets.delete(key).catch(() => {});
    await rm(imagePath, { force: true });
    throw error;
  }
}

/**
 * The library map this room's map is linked to, when the owner may overwrite it: their own map of the
 * same size, not a built-in. A linked copy has its own image URL, so the URL is not compared.
 */
async function ownedTarget(store: RoomStore, map: MapImage, ownerId: string): Promise<LibraryAssetRecord | null> {
  if (!map.assetId) return null;
  const asset = await store.findAsset(map.assetId, ownerId).catch(() => null);
  return asset?.kind === "map" && asset.width === map.width && asset.height === map.height && !shippedMapByUrl(asset.url) ? asset : null;
}

export function registerMapLibraryRoutes(app: Express, deps: Deps) {
  const auths = new WeakMap<Request, Auth>();
  const guard = (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const header = req.headers.authorization;
      const credential = header?.startsWith("Bearer ") ? await deps.store.findCredential(hashToken(header.slice(7))) : null;
      const roomId = req.params.roomId;
      if (!credential || credential.roomId !== roomId || (credential.sessionHash && !await deps.sessions.isLive(credential.sessionHash))) {
        res.status(403).json({ error: "An active GM credential for this room is required." }); return;
      }
      const room = await deps.registry.get(credential.roomId);
      if (!room || room.closed || room.activeParticipant(credential.participantId)?.role !== "gm") {
        res.status(403).json({ error: "An active GM credential for this room is required." }); return;
      }
      auths.set(req, { room, actorId: credential.participantId, roomId: credential.roomId });
      next();
    })().catch(next);
  };

  // Save to library (asset-library, ADR 0070): the server reads the board; the browser sends none of it.
  app.post("/api/rooms/:roomId/map/library", guard, (req: Request, res: Response) => {
    void (async () => {
      const auth = auths.get(req)!;
      const body = SaveMapToLibraryRequest.safeParse(req.body ?? {});
      if (!body.success) return void res.status(400).json({ error: "Invalid request" });
      const owner = await resolveOwner(req, res, deps.store);
      if (!owner) return void res.status(401).json({ error: "Sign in to do that" });
      if (!requireAccountOwner(owner, res)) return;
      if ((await deps.store.findRoomOwner(auth.roomId)) !== owner.ownerId) return void res.status(404).json({ error: "Room not found" });
      if (await deps.store.isTemporaryRoom(auth.roomId)) return void res.status(403).json({ error: "Save the template instead; a template-editing room has no library map." });

      const captured = await auth.room.captureScene(auth.actorId, body.data.sceneId);
      if (!captured) return void res.status(body.data.sceneId ? 404 : 403).json({ error: "Your GM seat ended or that scene no longer exists." });
      const map = captured.map;
      if (!map) return void res.status(400).json({ error: "Apply a map before saving it to the library." });
      const board = LibraryMapBoard.safeParse({
        walls: Object.values(captured.walls).map(({ id: _id, ...wall }: Wall) => wall),
        fog: Object.values(captured.fog).map(({ shape, points }) => ({ shape, points })),
        terrain: captured.terrain,
      });
      if (!board.success) return void res.status(400).json({ error: "This board is too large to save to the library." });
      const change = { grid: captured.grid, board: board.data };

      const target = await ownedTarget(deps.store, map, owner.ownerId);
      if (target) {
        const saved = await deps.store.replaceAssetPreparation(target.id, owner.ownerId, change);
        if (!saved) return void res.status(404).json({ error: "That library map is gone." });
        return void res.json(SaveMapToLibraryResult.parse({ assetId: target.id, name: target.name, created: false }));
      }

      // No library map to overwrite: copy the image into the owner's library, then link the room to it.
      if (refused(res, deps.uploads.hit(`upload:${owner.ownerId}`), "Too many uploads. Try again later.")) return;
      const bytes = await mapImageReader({ ownerId: owner.ownerId, roomId: auth.roomId }, deps.store, deps.assets, deps.builtinImageDir)(map);
      const stored = await storeMapCopy(deps.assets, deps.uploadDir, bytes);
      const name = (shippedMapByUrl(map.url)?.name ?? captured.sceneName ?? captured.roomName ?? "Map").trim().slice(0, 80) || "Map";
      const record: LibraryAssetRecord = {
        id: randomUUID(), ownerGmId: owner.ownerId, kind: "map", objectKey: stored.key, url: stored.url, name,
        width: map.width, height: map.height, byteSize: bytes.length, grid: change.grid, board: change.board,
        // The room's grid is explicit, so nothing is detected.
        detectionStatus: null, detectionAttempt: 0, createdAt: new Date().toISOString(),
      };
      const discard = async () => {
        await deps.assets.delete(stored.key).catch(() => {});
        await rm(stored.imagePath, { force: true });
      };
      try {
        await deps.store.createAsset(record, UPLOAD_ALLOWANCE);
      } catch (error) {
        await discard();
        throw error;
      }
      // Refused unless the board is still the scene, map and link that were read: a scene switch or a
      // second save in between must not link the wrong board, or a second copy.
      const link = { type: "scene.linkMap" as const, expectedSceneId: captured.sceneId, expectedMapUrl: map.url, expectedAssetId: map.assetId ?? null, assetId: record.id };
      const command = Command.parse(captured.live ? link : { type: "scene.prepare", sceneId: captured.sceneId, command: link });
      const unlink = async () => { await deps.store.deleteAsset(record.id, owner.ownerId).catch(() => null); await discard(); };
      let linked;
      try {
        linked = await auth.room.submit(auth.actorId, command);
      } catch (error) {
        await unlink();
        throw error;
      }
      if (!linked.ok) {
        await unlink();
        return void res.status(409).json({ error: sharedText(requestLocale(res), linked.text), code: linked.code });
      }
      res.status(201).json(SaveMapToLibraryResult.parse({ assetId: record.id, name, created: true }));
    })().catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof UploadAllowanceError || error instanceof PreparationConflictError) return void res.status(409).json({ error: error.message });
      if (error instanceof UvttError) return void res.status(409).json({ error: error.message });
      console.error("[vtt] save map to library failed", error);
      res.status(500).json({ error: "Couldn't save the map to the library. Try again." });
    });
  });

  // Export .uvtt lives in the library (asset-library, ADR 0070): the map as last saved there.
  app.get("/api/library/:id/export", (req: Request, res: Response) => {
    void (async () => {
      const owner = await resolveOwner(req, res, deps.store);
      if (!owner) return void res.status(401).json({ error: "Sign in to do that" });
      const asset = await deps.store.findAsset(String(req.params.id), owner.ownerId).catch(() => null);
      if (!asset || asset.kind !== "map") return void res.status(404).json({ error: "Asset not found" });
      if (!asset.grid) return void res.status(409).json({ error: "Save this map's grid before exporting it." });
      const board = (await deps.store.findAssetBoard(asset.id, owner.ownerId)) ?? { walls: [], fog: [] };
      const walls = Object.fromEntries(board.walls.map((wall, i) => [`w${i}`, { ...wall, id: `w${i}` }]));
      const map = { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id };
      const result = await exportUvttScene({ map, grid: asset.grid, walls, seq: 0 }, mapImageReader({ ownerId: owner.ownerId }, deps.store, deps.assets, deps.builtinImageDir));
      if (board.walls.some((w) => w.portal)) res.setHeader("X-UVTT-Warnings", "portal_identity_omitted,portal_lock_omitted");
      const filename = asset.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "map";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.uvtt"`);
      res.setHeader("Cache-Control", "no-store");
      res.type("application/json").send(JSON.stringify(result));
    })().catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof UvttError) return void res.status(422).json({ error: error.message, issues: error.issues });
      console.error("[vtt] library export failed", error);
      res.status(500).json({ error: "Couldn't export this map. Try again." });
    });
  });
}
