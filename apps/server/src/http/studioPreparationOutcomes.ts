import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { BuildKey, type StudioPreparationOutcome } from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import type { BuildRecord } from "../store/buildStore";
import type { StudioDelegation } from "../store/studioStore";
import { BuildChoiceOffError, BuildItemChangedError, BuildItemLockedError, BuildLimitError } from "../store/buildStore";

/** Internal semantic metadata preserves existing response contracts and localized error text. */
export function preparationFailure(res: Response, error: unknown, key: string | null = null) {
  const code = error instanceof BuildItemLockedError ? "locked" : error instanceof BuildLimitError ? "limit"
    : error instanceof BuildItemChangedError ? "conflict" : error instanceof BuildChoiceOffError ? "permission" : null;
  if (!code) return;
  const failures = (res.locals.studioPreparationFailures ??= new Map<string | null, StudioPreparationOutcome["code"]>()) as Map<string | null, StudioPreparationOutcome["code"]>;
  failures.set(key, code);
}

/** Persist only a bounded semantic receipt after a real builder response, never its payload. */
export function preparationOutcomes(store: RoomStore, operation: StudioPreparationOutcome["operation"], now: () => number): RequestHandler {
  return (req, res, next) => {
    const build = res.locals.build as BuildRecord;
    const delegation = res.locals.delegation as StudioDelegation | undefined;
    const access = { ownerGmId: build.ownerGmId, ...(delegation ? { delegation } : { passHash: build.passHash ?? "" }) };
    const original = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      if (status === 401 || status === 404 || status >= 500) return original(body);
      const response = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
      const rows = operation === "creature" && Array.isArray(response.results) ? response.results as unknown[] : [null];
      const sent = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
      const outcomes = rows.map((row): StudioPreparationOutcome => {
        const result = row && typeof row === "object" ? row as Record<string, unknown> : null;
        const key = BuildKey.safeParse(result?.key ?? req.params.key ?? sent.key);
        const saved = status >= 200 && status < 300 && (!result || result.saved === true);
        const failures = res.locals.studioPreparationFailures as Map<string | null, StudioPreparationOutcome["code"]> | undefined;
        const semantic = failures?.get(key.success ? key.data : null) ?? failures?.get(null);
        return { id: randomUUID(), at: new Date(now()).toISOString(), operation, targetKey: key.success ? key.data : null,
          status: saved ? "saved" : "refused", code: saved ? "saved" : semantic ?? (status === 403 ? "permission" : status === 409 ? "conflict" : status === 429 ? "limit" : "invalid") };
      });
      void (async () => {
        try { for (const outcome of outcomes) await store.recordStudioPreparation(build.id, outcome, access); }
        catch { /* Receipt failure cannot turn a committed write into a failed write response. */ }
        if (!res.headersSent) original(body);
      })();
      return res;
    };
    next();
  };
}
