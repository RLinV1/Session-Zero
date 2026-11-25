import type { Express, Request, RequestHandler, Response } from "express";
import { BuildKey, StudioCorrectionInput, StudioProposalInput, StudioRestoreInput, type StudioSelection } from "@vtt/shared";
import { z } from "zod";
import { requireAccount } from "../identity/middleware";
import type { Sessions } from "../identity/sessions";
import { StudioAuthoringError, type RevisionScene } from "../domain/studioSceneRevision";
import { renderStudioCrop } from "../domain/studioCrop";
import type { AssetStore } from "../store/assetStore";
import { BuildClosedError, type BuildRecord } from "../store/buildStore";
import type { RoomStore } from "../store/roomStore";
import type { AuthoringCommand } from "../store/studioAuthoring";
import { StudioContextConflictError } from "../store/studioPreparation";
import { StudioAccessEndedError, type StudioDelegation } from "../store/studioStore";
import { serverEn } from "../i18n/en";
import { serverZhTW } from "../i18n/zh-TW";
import { requestLocale } from "../i18n/locale";

export function studioAuthoringMessage(res: Response, error: StudioAuthoringError) {
  const key = `studio.authoring.${error.code}` as const;
  return requestLocale(res) === "zh-TW" ? serverZhTW[key] : error.message;
}
export function studioAuthoringFailure(res: Response, error: StudioAuthoringError) {
  const status = { missing: 404, access: 401, conflict: 409, limit: 409, invalid: 422, scope: 422, permission: 403, corrections_disabled: 403, enrolled: 409 }[error.code];
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ code: error.code, error: studioAuthoringMessage(res, error) });
}
function invalid(): never { throw new StudioAuthoringError("invalid", "Provide a valid correction target and input."); }
function validated<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}
const targetKey = (req: Request) => validated(BuildKey, req.params.mapKey);
const requestId = (req: Request) => validated(z.uuid(), req.params.requestId);

export function registerStudioAuthoringRoutes(app: Express, deps: { store: RoomStore; assets: AssetStore; sessions: Sessions; grantGuard?: RequestHandler }) {
  const owner = "/api/builds/:id/studio/authoring";
  const delegated = "/api/studio/builds/:buildId/authoring";
  let cropsRunning = 0;
  const handle = (getCommand: (req: Request) => AuthoringCommand, viaGrant: boolean): RequestHandler => (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.vary("Authorization").vary("Cookie");
    void (async () => {
      const account = viaGrant ? null : requireAccount(res);
      if (!viaGrant && !account) return;
      const buildId = viaGrant ? (res.locals.build as BuildRecord).id : validated(z.uuid(), req.params.id);
      const ownerGmId = viaGrant ? (res.locals.build as BuildRecord).ownerGmId : account!.user.ownerId;
      if (account && !await deps.sessions.isLive(account.session.tokenHash)) throw new StudioAccessEndedError();
      const access = { ownerGmId, delegation: viaGrant ? res.locals.delegation as StudioDelegation : undefined };
      const command = getCommand(req);
      const read = () => deps.store.studioAuthoring(buildId, access, command);
      if (command.kind === "crop") {
        if (cropsRunning >= 2) return void res.status(503).json({ code: "busy",
          error: (requestLocale(res) === "zh-TW" ? serverZhTW : serverEn)["studio.authoring.cropBusy"] });
        cropsRunning++;
        try {
          const { scene, scope, baseRevisionId } = await read() as { scene: RevisionScene; scope: StudioSelection; baseRevisionId: string };
          const file = await deps.store.findBuildFile(buildId, scene.source.id);
          const { webp, crop } = await renderStudioCrop(deps.assets, file, scene, scope);
          // The scope and source are immutable. A build or request may have ended during rendering.
          if ((await read()).baseRevisionId !== baseRevisionId) throw new StudioAuthoringError("missing", serverEn["studio.authoring.missing"]);
          if (account && !await deps.sessions.isLive(account.session.tokenHash)) throw new StudioAccessEndedError();
          res.set({ "Content-Length": String(webp.length), "Content-Type": "image/webp", "X-Studio-Crop": JSON.stringify(crop),
            "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
          return void res.end(webp);
        } finally { cropsRunning--; }
      }
      const result = await read();
      if (result.status === "stale") return void res.status(409).json({ ...result, code: "stale",
        error: (requestLocale(res) === "zh-TW" ? serverZhTW : serverEn)["studio.authoring.stale"] });
      res.json(result);
    })().catch((error: unknown) => {
      if (error instanceof StudioAccessEndedError) {
        if (viaGrant) res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
        return studioAuthoringFailure(res, new StudioAuthoringError("access", serverEn["studio.authoring.access"]));
      }
      if (error instanceof BuildClosedError || error instanceof StudioContextConflictError) {
        return studioAuthoringFailure(res, new StudioAuthoringError("missing", serverEn["studio.authoring.missing"]));
      }
      if (error instanceof StudioAuthoringError) return studioAuthoringFailure(res, error);
      next(error);
    });
  };
  function read(path: string, command: (req: Request) => AuthoringCommand) {
    app.get(owner + path, handle(command, false));
    if (deps.grantGuard) app.get(delegated + path, deps.grantGuard, handle(command, true));
  }
  read("/maps/:mapKey", (req) => ({ kind: "inspect", mapKey: targetKey(req),
    encounterKey: req.query.encounterKey === undefined ? undefined : validated(BuildKey, req.query.encounterKey) }));
  read("/requests/:requestId", (req) => ({ kind: "request", requestId: requestId(req) }));
  read("/requests/:requestId/crop", (req) => ({ kind: "crop", requestId: requestId(req) }));
  read("/maps/:mapKey/revisions", (req) => ({ kind: "history", mapKey: targetKey(req) }));
  read("/maps/:mapKey/revisions/:revisionId", (req) => ({ kind: "revision", mapKey: targetKey(req), revisionId: validated(z.uuid(), req.params.revisionId) }));
  read("/maps/:mapKey/revisions/:revisionId/view", (req) => ({ kind: "revisionView", mapKey: targetKey(req), revisionId: validated(z.uuid(), req.params.revisionId) }));
  function write(path: string, command: (req: Request) => AuthoringCommand) {
    app.post(owner + path, handle(command, false));
    if (deps.grantGuard) app.post(delegated + path, deps.grantGuard, handle(command, true));
  }
  write("/maps/:mapKey/requests", (req) => ({ kind: "create", mapKey: targetKey(req), input: validated(StudioCorrectionInput, req.body) }));
  write("/maps/:mapKey/restore", (req) => ({ kind: "restore", mapKey: targetKey(req), input: validated(StudioRestoreInput, req.body) }));
  // The owner's way out of enrollment: the map edits, deletes and publishes as an ordinary draft again.
  app.delete(owner + "/maps/:mapKey", handle((req) => ({ kind: "end", mapKey: targetKey(req) }), false));
  if (deps.grantGuard) app.post(delegated + "/requests/:requestId/proposals", deps.grantGuard,
    handle((req) => ({ kind: "propose", requestId: requestId(req), input: validated(StudioProposalInput, req.body) }), true));
}
