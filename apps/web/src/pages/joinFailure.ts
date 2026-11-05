import { ROOM_FULL, ROOM_LOCKED } from "@vtt/shared";
import { ApiError } from "../net/api";

/**
 * What the join form shows for a refused join. A full or locked room is not the name's fault, so the
 * name field is not marked as the cause (room-player-cap); every other refusal is shown against it.
 */
export function joinFailure(err: unknown): { message: string; nameIsCause: boolean } {
  return {
    message: err instanceof Error ? err.message : "Could not join",
    // A full room and too many joins from this address (security-hardening) are not the name's fault.
    nameIsCause: !(err instanceof ApiError && (err.detail.code === ROOM_FULL || err.detail.code === ROOM_LOCKED || err.status === 429)),
  };
}
