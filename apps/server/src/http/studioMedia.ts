import type { Express, Request, RequestHandler, Response } from "express";
import { BUILD_LIMITS, StudioContext } from "@vtt/shared";
import { z } from "zod";
import { requireAccount } from "../identity/middleware";
import type { Sessions } from "../identity/sessions";
import { BuildClosedError, BuildLimitError, type BuildFileRecord, type BuildRecord } from "../store/buildStore";
import { StudioAccessEndedError, type StudioDelegation, type StudioGrantRecord } from "../store/studioStore";
import type { RoomStore } from "../store/roomStore";
import { StudioMedia, STUDIO_PREVIEW_BYTES } from "../domain/studioMedia";
import { StudioIntakeError, STUDIO_FILE_BYTES } from "../domain/studioDownload";
import { resolveStudioAccess, studioResource, type StudioAccessConfig } from "./studioOAuth";
import type { AccountLimits } from "../identity/routes";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import { requestLocale } from "../i18n/locale";
import { studioFile, studioPreparationSnapshot } from "../domain/studioPreparation";
import { StudioContextConflictError } from "../store/studioPreparation";

const Descriptor = z.strictObject({ download_url: z.string().min(1).max(8192), file_id: z.string().min(1).max(512), mime_type: z.string().max(200).optional(), file_name: z.string().max(500).optional() });
const Intake = z.strictObject({ kind: z.enum(["map", "token"]), file: Descriptor });
const Binding = z.strictObject({ fileId: z.uuid().nullable() });
const messages = {
  origin: "studio.media.origin", expired: "studio.media.expired", download: "studio.media.download", size: "studio.media.size", image: "studio.media.image",
  busy: "studio.media.busy", storage: "studio.media.storage", limit: "studio.media.limit", access: "studio.media.access", missing: "studio.media.missing", invalid: "studio.media.invalid",
  context: "studio.context.invalid",
} as const;
export function studioMediaError(res: Response, status: number, code: keyof typeof messages, extra: Record<string, unknown> = {}) {
  const id = messages[code];
  const catalog = requestLocale(res) === "zh-TW" ? serverZhTW : serverEn;
  return res.status(status).json({ error: catalog[id], messageId: id, code, ...extra });
}
export function registerStudioMediaRoutes(app: Express, deps: { store: RoomStore; media: StudioMedia; studio: StudioAccessConfig | null; grantGuard: RequestHandler; limits: AccountLimits; sessions: Sessions; now: () => number }) {
  const { store, media, studio, grantGuard, limits, now } = deps;
  const failed = (res: Response) => (e: unknown) => {
    if (res.headersSent) return;
    if (e instanceof StudioAccessEndedError) return studioMediaError(res, 401, "access");
    if (e instanceof BuildClosedError) return studioMediaError(res, 404, "missing");
    if (e instanceof BuildLimitError) return studioMediaError(res, 409, "limit");
    if (e instanceof StudioContextConflictError) return studioMediaError(res, 409, "context");
    const code = e instanceof StudioIntakeError ? e.code : "storage";
    return studioMediaError(res, code === "busy" ? 503 : code === "storage" ? 503 : code === "size" ? 413 : 422, code);
  };
  const stillGranted = async (req: Request, res: Response, build: BuildRecord, savedFileId?: string) => {
    const access = studio && await resolveStudioAccess(store, studioResource(studio), req.headers.authorization, now());
    if (!access || typeof access === "string") { studioMediaError(res, 401, "access", savedFileId ? { savedFileId } : {}); return false; }
    if (!access.grant.buildIds.includes(build.id) || access.grant.ownerGmId !== build.ownerGmId || (await store.findBuild(build.id, build.ownerGmId))?.status !== "open") { studioMediaError(res, 404, "missing", savedFileId ? { savedFileId } : {}); return false; }
    return true;
  };
  const sendMedia = async (file: BuildFileRecord, variant: string, res: Response, authorized: () => Promise<boolean>) => {
    if (!file.studio || !media.media) return studioMediaError(res, 404, "missing");
    const bytes = await media.media.read(variant === "preview" ? file.studio.previewKey : file.objectKey, variant === "preview" ? STUDIO_PREVIEW_BYTES : STUDIO_FILE_BYTES);
    if (!await authorized()) return;
    if (!bytes) return studioMediaError(res, 404, "missing");
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.vary("Authorization"); res.vary("Cookie");
    // send() would create an ETag/304 response from a stale conditional request.
    res.type(variant === "preview" ? "image/webp" : file.studio.contentType).setHeader("Content-Length", bytes.length);
    res.end(bytes);
  };
  app.get("/api/builds/:id/files/:fileId/media", (req, res) => { void (async () => {
    const account = requireAccount(res); if (!account) return;
    const build = z.uuid().safeParse(req.params.id).success ? await store.findBuild(req.params.id as string, account.user.ownerId) : null;
    const file = build && z.uuid().safeParse(req.params.fileId).success ? await store.findBuildFile(build.id, req.params.fileId as string) : null;
    if (!build || build.status !== "open" || !file) return studioMediaError(res, 404, "missing");
    if (req.query.variant !== undefined && req.query.variant !== "preview") return studioMediaError(res, 400, "invalid");
    await sendMedia(file, req.query.variant === "preview" ? "preview" : "original", res, async () => {
      if ((await store.findBuild(build.id, account.user.ownerId))?.status !== "open") { studioMediaError(res, 404, "missing"); return false; }
      if (!await deps.sessions.isLive(account.session.tokenHash)) { studioMediaError(res, 401, "access"); return false; }
      return true;
    });
  })().catch(failed(res)); });
  const ownerStudio = async (req: Request, res: Response, write: boolean) => {
    const account = requireAccount(res); if (!account) return;
    if (!z.uuid().safeParse(req.params.id).success) return studioMediaError(res, 404, "missing");
    const buildId = String(req.params.id);
    if ((await store.findBuild(buildId, account.user.ownerId))?.status !== "open") return studioMediaError(res, 404, "missing");
    const access = { ownerGmId: account.user.ownerId };
    if (write) {
      const parsed = StudioContext.safeParse(req.body); if (!parsed.success) return studioMediaError(res, 400, "context");
      if (!await deps.sessions.isLive(account.session.tokenHash)) return studioMediaError(res, 401, "access");
      await store.setStudioContext(buildId, parsed.data, access);
    }
    const records = await store.readStudioPreparation(buildId, access);
    const ownerName = await store.findBuildOwnerName(account.user.ownerId);
    if (!await deps.sessions.isLive(account.session.tokenHash)) return studioMediaError(res, 401, "access");
    if ((await store.findBuild(buildId, account.user.ownerId))?.status !== "open") return studioMediaError(res, 404, "missing");
    res.json(studioPreparationSnapshot(records, ownerName, requestLocale(res)));
  };
  app.get("/api/builds/:id/studio", (req, res) => { void ownerStudio(req, res, false).catch(failed(res)); });
  app.post("/api/builds/:id/studio/context", (req, res) => { void ownerStudio(req, res, true).catch(failed(res)); });
  if (!studio) return;
  const base = "/api/studio/builds/:buildId";
  app.post(`${base}/intake`, grantGuard, (req, res) => { void (async () => {
    const input = Intake.safeParse(req.body); if (!input.success) return studioMediaError(res, 400, "invalid");
    const build = res.locals.build as BuildRecord;
    const budget = `upload:${build.ownerGmId}`;
    const limit = limits.uploadsPerOwner.hit(budget);
    if (!limit.ok) { res.setHeader("Retry-After", String(limit.retryAfterSec)); return studioMediaError(res, 429, "busy"); }
    let created = false;
    try {
      const result = await media.intake(build.id, input.data.kind, input.data.file, res.locals.delegation as StudioDelegation);
      if (!await stillGranted(req, res, build, result.file.id)) return;
      created = result.created;
      res.status(result.created ? 201 : 200).json({ file: studioFile(result.file), created: result.created });
    } finally {
      if (!created) limits.uploadsPerOwner.refund(budget, limit.reservation);
    }
  })().catch(failed(res)); });
  app.post(`${base}/binding`, grantGuard, (req, res) => { void (async () => {
    const input = Binding.safeParse(req.body); if (!input.success) return studioMediaError(res, 400, "invalid");
    const build = res.locals.build as BuildRecord;
    if (input.data.fileId) {
      const file = await store.findBuildFile(build.id, input.data.fileId);
      if (file?.kind !== "map") return studioMediaError(res, 404, "missing");
    }
    await store.bindStudioFile(build.id, input.data.fileId, res.locals.delegation as StudioDelegation);
    res.json({ buildId: build.id });
  })().catch(failed(res)); });
  app.get(`${base}/studio`, grantGuard, (req, res) => { void (async () => {
    const build = res.locals.build as BuildRecord;
    const records = await store.readStudioPreparation(build.id, { ownerGmId: build.ownerGmId, delegation: res.locals.delegation as StudioDelegation });
    const ownerName = await store.findBuildOwnerName(build.ownerGmId);
    if (!await stillGranted(req, res, build)) return;
    const grant = res.locals.studioGrant as StudioGrantRecord;
    res.json({ ...studioPreparationSnapshot(records, ownerName, requestLocale(res)), limits: BUILD_LIMITS, correctionsAllowed: grant.correctionBuildIds?.includes(build.id) ?? false });
  })().catch(failed(res)); });
  app.post(`${base}/studio/context`, grantGuard, (req, res) => { void (async () => {
    const input = StudioContext.safeParse(req.body); if (!input.success) return studioMediaError(res, 400, "context");
    const build = res.locals.build as BuildRecord;
    const access = { ownerGmId: build.ownerGmId, delegation: res.locals.delegation as StudioDelegation };
    await store.setStudioContext(build.id, input.data, access);
    const records = await store.readStudioPreparation(build.id, access);
    const ownerName = await store.findBuildOwnerName(build.ownerGmId);
    if (!await stillGranted(req, res, build)) return;
    res.json(studioPreparationSnapshot(records, ownerName, requestLocale(res)));
  })().catch(failed(res)); });
  app.get(`${base}/files/:fileId/media`, grantGuard, (req, res) => { void (async () => {
    const build = res.locals.build as BuildRecord;
    const file = z.uuid().safeParse(req.params.fileId).success ? await store.findBuildFile(build.id, req.params.fileId as string) : null;
    if (!file) return studioMediaError(res, 404, "missing");
    if (req.query.variant !== "preview" && req.query.variant !== undefined) return studioMediaError(res, 400, "invalid");
    await sendMedia(file, req.query.variant === "preview" ? "preview" : "original", res, () => stillGranted(req, res, build));
  })().catch(failed(res)); });
}
