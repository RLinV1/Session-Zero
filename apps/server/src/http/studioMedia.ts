import type { Express, Request, RequestHandler, Response } from "express";
import { BUILD_LIMITS } from "@vtt/shared";
import { z } from "zod";
import { requireAccount } from "../identity/middleware";
import { BuildClosedError, BuildLimitError, type BuildFileRecord, type BuildRecord } from "../store/buildStore";
import { StudioAccessEndedError, type StudioDelegation } from "../store/studioStore";
import type { RoomStore } from "../store/roomStore";
import { StudioMedia, STUDIO_PREVIEW_BYTES } from "../domain/studioMedia";
import { StudioIntakeError, STUDIO_FILE_BYTES } from "../domain/studioDownload";
import { resolveStudioAccess, studioResource, type StudioAccessConfig } from "./studioOAuth";
import type { AccountLimits } from "../identity/routes";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import { requestLocale } from "../i18n/locale";

const Descriptor = z.strictObject({ download_url: z.string().min(1).max(8192), file_id: z.string().min(1).max(512), mime_type: z.string().max(200).optional(), file_name: z.string().max(500).optional() });
const Intake = z.strictObject({ kind: z.enum(["map", "token"]), file: Descriptor });
const Binding = z.strictObject({ fileId: z.uuid().nullable() });
const messages = {
  origin: "studio.media.origin", expired: "studio.media.expired", download: "studio.media.download", size: "studio.media.size", image: "studio.media.image",
  busy: "studio.media.busy", storage: "studio.media.storage", limit: "studio.media.limit", access: "studio.media.access", missing: "studio.media.missing", invalid: "studio.media.invalid",
} as const;
export function studioMediaError(res: Response, status: number, code: keyof typeof messages, extra: Record<string, unknown> = {}) {
  const id = messages[code];
  const catalog = requestLocale(res) === "zh-TW" ? serverZhTW : serverEn;
  return res.status(status).json({ error: catalog[id], messageId: id, code, ...extra });
}
export function studioFileView(file: BuildFileRecord) {
  return { id: file.id, kind: file.kind, name: file.originalName, width: file.width, height: file.height, sizeBytes: file.sizeBytes,
    privacy: file.studio ? "private" : "legacy-public", originalSha256: file.studio?.originalSha256 ?? null, canonicalId: file.studio?.canonicalId ?? null,
    orientation: file.studio?.orientation ?? null, previewHash: file.studio?.previewSha256 ?? null };
}
export function registerStudioMediaRoutes(app: Express, deps: { store: RoomStore; media: StudioMedia; studio: StudioAccessConfig | null; grantGuard: RequestHandler; limits: AccountLimits; now: () => number }) {
  const { store, media, studio, grantGuard, limits, now } = deps;
  const failed = (res: Response) => (e: unknown) => {
    if (res.headersSent) return;
    if (e instanceof StudioAccessEndedError) return studioMediaError(res, 401, "access");
    if (e instanceof BuildClosedError) return studioMediaError(res, 404, "missing");
    if (e instanceof BuildLimitError) return studioMediaError(res, 409, "limit");
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
      if ((await store.findBuild(build.id, account.user.ownerId))?.status !== "open") { studioMediaError(res, 404, "missing"); return false; } return true;
    });
  })().catch(failed(res)); });
  if (!studio) return;
  const base = "/api/studio/builds/:buildId";
  app.post(`${base}/intake`, grantGuard, (req, res) => { void (async () => {
    const input = Intake.safeParse(req.body); if (!input.success) return studioMediaError(res, 400, "invalid");
    const build = res.locals.build as BuildRecord;
    const budget = `upload:${build.ownerGmId}`;
    const limit = limits.uploadsPerOwner.check(budget);
    if (!limit.ok) { res.setHeader("Retry-After", String(limit.retryAfterSec)); return studioMediaError(res, 429, "busy"); }
    const result = await media.intake(build.id, input.data.kind, input.data.file, res.locals.delegation as StudioDelegation);
    if (!await stillGranted(req, res, build, result.file.id)) return;
    if (result.created) limits.uploadsPerOwner.hit(budget);
    res.status(result.created ? 201 : 200).json({ file: studioFileView(result.file), created: result.created });
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
    const files = await store.listBuildFiles(build.id);
    const ownerName = await store.findBuildOwnerName(build.ownerGmId);
    if (!await stillGranted(req, res, build)) return;
    res.json({ buildId: build.id, buildName: build.name, ownerName, sourceFileId: files.some((f) => f.id === build.studioFileId && f.kind === "map") ? build.studioFileId : files.find((f) => f.kind === "map")?.id ?? null,
      files: files.map(studioFileView), intakeOutcomes: build.studioIntake ?? [], limits: BUILD_LIMITS });
  })().catch(failed(res)); });
  app.get(`${base}/files/:fileId/media`, grantGuard, (req, res) => { void (async () => {
    const build = res.locals.build as BuildRecord;
    const file = z.uuid().safeParse(req.params.fileId).success ? await store.findBuildFile(build.id, req.params.fileId as string) : null;
    if (!file) return studioMediaError(res, 404, "missing");
    if (req.query.variant !== "preview" && req.query.variant !== undefined) return studioMediaError(res, 400, "invalid");
    await sendMedia(file, req.query.variant === "preview" ? "preview" : "original", res, () => stillGranted(req, res, build));
  })().catch(failed(res)); });
}
