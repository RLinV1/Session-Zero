import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { BuildKey, type StudioPreparationOutcome } from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import type { BuildRecord } from "../store/buildStore";
import type { StudioDelegation } from "../store/studioStore";
import { BuildChoiceOffError, BuildItemChangedError, BuildItemLockedError, BuildLimitError } from "../store/buildStore";

type Code = StudioPreparationOutcome["code"];
/** One target a write named, and whether it was saved. A request without rows is one row, keyed from the request. */
export interface PreparationRow { key: string | null; saved: boolean }

const failuresOf = (res: Response) => (res.locals.studioPreparationFailures ??= new Map<string | null, Code>()) as Map<string | null, Code>;

/** Internal semantic metadata preserves existing response contracts and localized error text. */
export function preparationFailure(res: Response, error: unknown, key: string | null = null) {
  const code = error instanceof BuildItemLockedError ? "locked" : error instanceof BuildLimitError ? "limit"
    : error instanceof BuildItemChangedError ? "conflict" : error instanceof BuildChoiceOffError ? "permission" : null;
  if (code) failuresOf(res).set(key, code);
}

/** A request that names several targets (creatures) says what happened to each, rather than leaving it to be read back out of the response. */
export function preparationRows(res: Response, rows: readonly PreparationRow[]) {
  res.locals.studioPreparationRows = rows;
}

/**
 * Why a write was refused, when no store error said more. The guards answer before this
 * middleware runs, so a 404 seen here is always the handler's: a named map, file or item that
 * isn't in the build, which is a refused write the open Studio should show.
 */
function refusalCode(status: number): Code {
  return status === 403 ? "permission" : status === 409 ? "conflict" : status === 429 ? "limit" : "invalid";
}

/**
 * Persist only a bounded semantic receipt after a real builder response, never its payload.
 * Hooked on `res.end`, which every way of answering goes through. The response waits for the
 * receipt so the AI's next look at the Studio already shows it. Not recorded: 401 (the access
 * ended, so the store would refuse the receipt too) and 5xx (whether anything was saved isn't
 * known). A build that closed meanwhile refuses the receipt, which is dropped.
 */
export function preparationOutcomes(store: RoomStore, operation: StudioPreparationOutcome["operation"], now: () => number): RequestHandler {
  return (req, res, next) => {
    const build = res.locals.build as BuildRecord;
    const delegation = res.locals.delegation as StudioDelegation | undefined;
    const access = { ownerGmId: build.ownerGmId, ...(delegation ? { delegation } : { passHash: build.passHash ?? "" }) };
    const end = res.end.bind(res) as (...args: unknown[]) => Response;
    res.end = ((...args: unknown[]) => {
      res.end = end as Response["end"];
      const status = res.statusCode;
      if (status === 401 || status >= 500) return end(...args);
      const sent = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
      const ok = status >= 200 && status < 300;
      const rows = (res.locals.studioPreparationRows as PreparationRow[] | undefined) ?? [{ key: null, saved: ok }];
      const failures = res.locals.studioPreparationFailures as Map<string | null, Code> | undefined;
      const at = new Date(now()).toISOString();
      const outcomes = rows.map((row): StudioPreparationOutcome => {
        const key = BuildKey.safeParse(row.key ?? req.params.key ?? sent.key);
        const targetKey = key.success ? key.data : null;
        const saved = ok && row.saved;
        return { id: randomUUID(), at, operation, targetKey, status: saved ? "saved" : "refused",
          code: saved ? "saved" : failures?.get(targetKey) ?? failures?.get(null) ?? refusalCode(status) };
      });
      void store.recordStudioPreparation(build.id, outcomes, access)
        .catch(() => { /* Receipt failure cannot turn a committed write into a failed write response. */ })
        .finally(() => { if (!res.writableEnded) end(...args); });
      return res;
    }) as Response["end"];
    next();
  };
}
