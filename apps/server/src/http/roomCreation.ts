import type { Response } from "express";
import { sharedMsg } from "@vtt/shared";
import { MAX_OWNED_ROOMS, RoomCreationRefused } from "../domain/roomLifecycle";
import { requestLocale } from "../i18n/locale";
import { sharedText } from "../i18n/localize";

/** Both room entrypoints report the same localized creation limits. */
export function refuseRoomCreation(res: Response, error: unknown): boolean {
  if (!(error instanceof RoomCreationRefused)) return false;
  if (error.retryAfterSec !== undefined) res.setHeader("Retry-After", String(error.retryAfterSec));
  const message = error.reason === "cap" ? sharedMsg("reject.roomCap", { max: MAX_OWNED_ROOMS }) : sharedMsg("reject.roomRate");
  res.status(429).json({ error: sharedText(requestLocale(res), message), ...(error.retryAfterSec !== undefined && { retryAfterSec: error.retryAfterSec }) });
  return true;
}
