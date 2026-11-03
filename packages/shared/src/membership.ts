import { z } from "zod";
import type { GridSpec, Point } from "./geometry";
import type { GmRoomSummary, SessionEndReason } from "./protocol";
import type { Role } from "./state";

/**
 * Room seats kept on an account (ADR 0017, the membership layer). Which seats belong to which
 * account is access data, like credentials: it never enters room state or any room payload.
 */

/**
 * `POST /api/rooms/:roomId/seat`: a new credential for the account's seat in the room. The
 * browser generates it, as for a join (DESIGN.md §5); the server stores only its SHA-256.
 */
export const SeatRequest = z.object({ guestToken: z.string().min(16).max(256) });
export type SeatRequest = z.infer<typeof SeatRequest>;

export interface SeatResponse {
  roomId: string;
  participantId: string;
  role: Role;
}

/** `GET /api/invites/:code/seat`: the account's active seat in that invite's room. */
export interface InviteSeatResponse {
  roomId: string;
  displayName: string;
  role: Role;
}

/** A signed-in join for a room where the account already holds an active seat. */
export const ALREADY_MEMBER = "already_member";

/** Why resuming a seat was refused: it has ended, for the reason the seat itself records. */
export interface SeatEndedResponse {
  error: string;
  reason: Extract<SessionEndReason, "left" | "revoked">;
}

/** Why keeping a guest seat on the account was refused (ADR 0017 M3). */
export type KeepSeatRefusal = "account_has_seat" | "seat_taken" | "seat_ended";

export interface KeepSeatRefusedResponse {
  error: string;
  reason: KeepSeatRefusal;
}

/** A room the account plays in. */
export type PlayingRoomSummary = GmRoomSummary;

/** `GET /api/me/rooms`: the rooms the account hosts and the ones it plays in. */
export interface MyRoomsResponse {
  hosting: GmRoomSummary[];
  playing: PlayingRoomSummary[];
}

/**
 * `GET /api/me/rooms/:roomId/preview`: a hosted room's board as its GM seat sees it, drawn small
 * on the room's dashboard card. Only what the picture needs, in board coordinates: no names,
 * stats or ids.
 */
export interface RoomPreview {
  map: { url: string; width: number; height: number } | null;
  grid: GridSpec;
  tokens: { position: Point; size: number; color: string; imageUrl: string | null; hidden: boolean }[];
  /** Each fog region's outline. */
  fog: Point[][];
}
