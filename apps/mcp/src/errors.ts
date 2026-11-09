import type { SessionEndReason } from "@vtt/shared";

/** A failure the AI should read. Its message goes back as the tool's error, so it never holds a credential. */
export class ToolError extends Error {}

const ENDED: Record<SessionEndReason, string> = {
  revoked: "The GM removed this seat, so it can't be used any more. Ask the GM before joining again.",
  left: "This seat has left the room, so it can't be used any more. Call join_room to sit down again.",
  deleted: "This room no longer exists: the GM deleted it.",
  signed_out: "This seat's sign-in ended, so it can't be used any more.",
};

/** The seat is over for good (ADR 0006), so no retry can help. */
export class SeatEndedError extends ToolError {
  constructor(readonly reason: SessionEndReason) {
    super(ENDED[reason]);
  }
}

export const INVALID_SEAT = "This seat doesn't work: its room may no longer exist, or the seat value is wrong or belongs to another room.";
export const ROOM_UNAVAILABLE = "This seat's room can't be reached right now. It may have failed to load, or it may be being deleted. Try again in a moment, and ask the GM if this keeps happening.";
export const GM_SEAT_REFUSED = "Only player seats are supported. A GM's seat can't be connected to an AI, because it sees everything the players can't.";
export const SERVER_BUSY = "The AI connection server is busy right now. This seat is safe: try again in a minute.";
export const UNREACHABLE = "Couldn't reach the room right now. Try again in a moment.";
export const CONNECTION_DROPPED = "The connection to the room dropped before it answered. Call get_view to see whether that happened, then try again if it didn't.";

/** Blanks anything long enough to be a credential, so an unexpected error can be logged safely. */
export function scrubbed(err: unknown): string {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return text.replace(/[A-Za-z0-9_.-]{32,}/g, "[redacted]");
}
