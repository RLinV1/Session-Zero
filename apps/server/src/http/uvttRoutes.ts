import { rm } from "node:fs/promises";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { DEFAULT_GRID, UvttDraftEdit, UvttError } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import { RateLimiter } from "../identity/rateLimit";
import type { Sessions } from "../identity/sessions";
import { requireAccount } from "../identity/middleware";
import { refused } from "../identity/routes";
import type { AssetStore } from "../store/assetStore";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { exportUvttScene } from "../uvtt/exportScene";
import type { UvttPreparations } from "../uvtt/preparations";
import type { UvttValidationPool } from "../uvtt/validationPool";
import { createUvttLibraryMap, receiveUvtt, writeUvttImage } from "../uvtt/uploads";
import { toWire } from "./library";

interface Deps { store: RoomStore; registry: RoomRegistry; sessions: Sessions; assets: AssetStore; preparations: UvttPreparations; pool: UvttValidationPool; uploadDir: string; builtinImageDir: string | null; uploads: RateLimiter; now: () => number }
interface Auth { room: LiveRoom; actorId: string; roomId: string }
const expired = "This preparation expired or the server restarted. Re-import the file.";

/** Mount BEFORE the general JSON parser so only authorized draft edits have the larger limit. */
export function registerUvttRoutes(app: Express, deps: Deps) {
  const auths = new WeakMap<Request, Auth>();
  const attempts = new RateLimiter(5, 60_000, deps.now);
  const base = "/api/rooms/:roomId/uvtt";
  const failure = (res: Response, error: unknown) => {
    if (error instanceof multer.MulterError) res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Use one UVTT file, at most 40 MiB, without additional fields." });
    else if (error instanceof UvttError) res.status(error.issues[0]?.code === "unsupported_file" ? 415 : error.issues[0]?.code === "revision_conflict" ? 409 : error.issues[0]?.code === "validation_busy" ? 503 : 422).json({ error: error.message, issues: error.issues });
    else res.status(500).json({ error: "Could not process this map. Try again." });
  };
  // The library saves immediately, like image uploads. There is no room or transient draft to publish.
  app.post("/api/library/uvtt/imports", (req, res) => {
    void (async () => {
      const account = requireAccount(res);
      if (!account) return;
      res.setHeader("Cache-Control", "no-store");
      attempts.sweep();
      const limit = attempts.hit(`library:${account.user.ownerId}`);
      if (!limit.ok) { res.setHeader("Retry-After", limit.retryAfterSec); res.status(429).json({ error: "Too many import attempts. Try again in a minute." }); return; }
      // Imports store an image too, so they share the account's upload budget (FR-GM-02).
      if (refused(res, deps.uploads.hit(`upload:${account.user.ownerId}`), "Too many uploads. Try again later.")) return;
      const started = deps.now();
      let code = "rejected";
      try {
        const { validated, filename } = await receiveUvtt(req, res, deps.pool, DEFAULT_GRID);
        if (!await deps.sessions.isLive(account.session.tokenHash)) { res.status(401).json({ error: "Your sign-in ended during validation. Sign in and upload again." }); return; }
        const asset = await createUvttLibraryMap(deps.store, deps.assets, deps.uploadDir, account.user.ownerId, filename, validated);
        code = "saved";
        res.status(201).json({ asset: toWire(asset), diagnostics: validated.diagnostics });
      } catch (error) {
        code = error instanceof UvttError ? error.issues[0]?.code ?? "validation_failed" : error instanceof multer.MulterError ? error.code : "storage_failed";
        failure(res, error);
      } finally {
        console.info("[vtt] library uvtt validation", { code, durationMs: Math.max(0, deps.now() - started) });
      }
    })().catch((error: unknown) => { if (!res.headersSent) failure(res, error); });
  });
  const authorize = async (req: Request): Promise<Auth | null> => {
    const roomId = req.params.roomId;
    const header = req.headers.authorization;
    if (typeof roomId !== "string" || !header?.startsWith("Bearer ")) return null;
    const credential = await deps.store.findCredential(hashToken(header.slice(7)));
    if (!credential || credential.roomId !== roomId || (credential.sessionHash && !await deps.sessions.isLive(credential.sessionHash))) return null;
    const room = await deps.registry.get(roomId);
    if (!room || room.closed || room.activeParticipant(credential.participantId)?.role !== "gm") return null;
    return { room, roomId, actorId: credential.participantId };
  };
  const guard = (req: Request, res: Response, next: NextFunction) => {
    void authorize(req).then((auth) => {
      if (!auth) { res.status(403).json({ error: "An active GM credential for this room is required." }); return; }
      auths.set(req, auth); res.setHeader("Cache-Control", "no-store"); next();
    }).catch((error: unknown) => failure(res, error));
  };
  app.post(`${base}/imports`, guard, (req, res) => {
    void (async () => {
      const auth = auths.get(req)!;
      const account = req.query.saveToLibrary === "1" ? requireAccount(res) : null;
      if (req.query.saveToLibrary === "1") {
        if (!account) return;
        const member = await deps.store.findMemberByParticipant(auth.roomId, auth.actorId);
        if (member?.userId !== account.user.id) { res.status(403).json({ error: "Sign in as this room's GM to save uploads to your library." }); return; }
      }
      attempts.sweep();
      const limit = attempts.hit(`${auth.roomId}:${auth.actorId}`);
      if (!limit.ok) { res.setHeader("Retry-After", limit.retryAfterSec); res.status(429).json({ error: "Too many import attempts. Try again in a minute." }); return; }
      const owner = await deps.store.findRoomOwner(auth.roomId);
      if (refused(res, deps.uploads.hit(`upload:${owner ?? auth.roomId}`), "Too many uploads. Try again later.")) return;
      const ownerId = owner ?? `participant:${auth.actorId}`;
      deps.preparations.assertCanCreate(auth.roomId, auth.actorId, ownerId);
      const baseline = await auth.room.captureScene(auth.actorId);
      if (!baseline) { res.status(403).json({ error: "Your GM seat ended." }); return; }
      let imagePath: string | undefined;
      let key: string | undefined;
      let libraryAsset: LibraryAssetRecord | undefined;
      let retained = false;
      let validationCode = "rejected";
      const started = deps.now();
      try {
        const { validated, filename } = await receiveUvtt(req, res, deps.pool, baseline.grid);
        // Authorization can end while the worker runs; do not retain an orphaned upload.
        if (!await authorize(req)) { validationCode = "credential_ended"; res.status(403).json({ error: "Your GM credential ended during validation." }); return; }
        if (account && !await deps.sessions.isLive(account.session.tokenHash)) { validationCode = "credential_ended"; res.status(401).json({ error: "Your sign-in ended during validation." }); return; }
        let url: string;
        if (account) {
          libraryAsset = await createUvttLibraryMap(deps.store, deps.assets, deps.uploadDir, account.user.ownerId, filename, validated);
          key = libraryAsset.objectKey; imagePath = path.join(deps.uploadDir, key); url = libraryAsset.url;
        } else {
          const image = await writeUvttImage(deps.assets, deps.uploadDir, validated);
          key = image.key; imagePath = image.imagePath; url = image.url;
          await deps.store.recordRoomUpload(auth.roomId, key, "map", validated.width, validated.height);
          // No analysis identity is recorded: the supplied UVTT grid is authoritative.
        }
        const preparation = deps.preparations.create(auth.roomId, auth.actorId, {
          map: { url, width: validated.width, height: validated.height, ...(libraryAsset && { assetId: libraryAsset.id }) }, grid: validated.grid,
          walls: validated.walls, diagnostics: validated.diagnostics,
        }, baseline, ownerId);
        retained = true;
        res.status(201).json(preparation);
      } catch (error) {
        validationCode = error instanceof UvttError ? error.issues[0]?.code ?? "validation_failed" : error instanceof multer.MulterError ? error.code : "storage_failed";
        failure(res, error);
      } finally {
        if (!retained && libraryAsset) await deps.store.deleteAsset(libraryAsset.id, libraryAsset.ownerGmId).catch(() => {});
        if (!retained && key) await deps.assets.delete(key).catch(() => {});
        if (!retained && imagePath) await rm(imagePath, { force: true });
        // Bounded operational metadata only; no names, paths, JSON or image data.
        console.info("[vtt] uvtt validation", { code: retained ? "prepared" : validationCode, durationMs: Math.max(0, deps.now() - started) });
      }
    })().catch((error: unknown) => { if (!res.headersSent) failure(res, error); });
  });
  app.put(`${base}/imports/:id`, guard, express.json({ limit: "1mb" }), (req, res) => {
    try {
      const auth = auths.get(req)!;
      const edit = UvttDraftEdit.safeParse(req.body);
      if (!edit.success) { res.status(422).json({ error: "Use a valid revision, grid and geometry (at most 1500 walls)." }); return; }
      const result = deps.preparations.edit(auth.roomId, auth.actorId, String(req.params.id), edit.data);
      if (!result) res.status(404).json({ error: expired }); else res.json(result);
    } catch (error) { failure(res, error); }
  });
  app.delete(`${base}/imports/:id`, guard, (req, res) => {
    const auth = auths.get(req)!;
    if (!deps.preparations.discard(auth.roomId, auth.actorId, String(req.params.id))) res.status(404).json({ error: expired });
    else res.status(204).end();
  });
  app.get(`${base}/export`, guard, (req, res) => {
    void (async () => {
      const auth = auths.get(req)!;
      const snapshot = await auth.room.captureScene(auth.actorId);
      if (!snapshot) { res.status(403).json({ error: "Your GM seat ended." }); return; }
      const result = await exportUvttScene(snapshot, auth.roomId, deps.store, deps.assets, deps.builtinImageDir);
      if (Object.values(snapshot.walls).some((w) => w.portal)) res.setHeader("X-UVTT-Warnings", "portal_identity_omitted,portal_lock_omitted");
      res.setHeader("Content-Disposition", 'attachment; filename="map.uvtt"');
      res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-UVTT-Scene-Sequence", String(snapshot.seq));
      res.type("application/json").send(JSON.stringify(result));
    })().catch((error: unknown) => failure(res, error));
  });
  app.use(base, (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = error && typeof error === "object" && "type" in error ? error.type : null;
    res.status(type === "entity.too.large" ? 413 : 400).json({ error: type === "entity.too.large" ? "Draft edits must be 1 MiB or smaller." : "Use valid JSON for draft edits." });
  });
}
