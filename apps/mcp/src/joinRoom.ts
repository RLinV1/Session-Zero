import { randomBytes } from "node:crypto";
import { ROOM_FULL, ROOM_LOCKED, type JoinRoomResponse } from "@vtt/shared";
import { briefFor } from "./brief";
import { ToolError, UNREACHABLE } from "./errors";
import type { Limits } from "./limits";
import { formatSeat } from "./seatConnection";

const AI_LABEL = " (AI)";
/** The room's 40-character display name limit, less the label. */
export const MAX_CHARACTER_NAME = 35;

/** Takes a whole invite link or a bare code. Only the code is used: a link never chooses the server. */
export function parseInvite(invite: string): string | null {
  const trimmed = invite.trim();
  const code = /\/join\/([^/?#\s]+)/.exec(trimmed)?.[1] ?? trimmed;
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : null;
}

/** "Oswin" and "Oswin (AI)" both read "Oswin (AI)" (design D10). */
export function labelledName(name: string): string {
  const base = name.trim().replace(/\s*\(AI\)$/i, "").trim();
  if (!base) throw new ToolError("The character needs a name.");
  if (base.length > MAX_CHARACTER_NAME) {
    throw new ToolError(`That name is too long. Use at most ${MAX_CHARACTER_NAME} characters.`);
  }
  return base + AI_LABEL;
}

interface JoinDeps {
  roomServerUrl: string;
  limits: Limits;
  /** Forwarded, so the room server's per-address limits stay per client (design D11). */
  clientAddress: string;
}

/** The invite route a browser uses (design D1). The room decides each join in its own queue. */
export async function joinRoom(deps: JoinDeps, invite: string, name: string) {
  const code = parseInvite(invite);
  if (!code) throw new ToolError("That doesn't look like an invite link or code. Ask the GM for the room's invite link.");
  const displayName = labelledName(name);

  const slowDown = deps.limits.takeJoin(code, deps.clientAddress);
  if (slowDown) throw new ToolError(slowDown);

  // The same credential a browser generates: 32 random bytes, of which the room stores only a hash.
  const guestToken = randomBytes(32).toString("base64url");
  let res: Response;
  try {
    res = await fetch(`${deps.roomServerUrl}/api/invites/${code}/join`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", "x-forwarded-for": deps.clientAddress },
      body: JSON.stringify({ displayName, guestToken }),
    });
  } catch {
    deps.limits.refundJoin(code, deps.clientAddress);
    throw new ToolError(UNREACHABLE);
  }
  if (!res.ok) {
    if (res.status === 404) deps.limits.refundJoin(code, deps.clientAddress);
    throw new ToolError(await refusal(res, displayName));
  }
  const joined = (await res.json()) as JoinRoomResponse;
  const seat = formatSeat(joined.roomId, guestToken);
  return { seat, participantId: joined.participantId, displayName, brief: briefFor(displayName, seat) };
}

async function refusal(res: Response, displayName: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: string };
  const said = typeof body.error === "string" ? body.error : null;
  if (res.status === 404) return "Invite not found. It may be wrong, or the GM may have reset it. Ask the GM for the room's current invite link.";
  if (body.code === ROOM_FULL) return "The room is full. The GM can remove a seat to make room.";
  if (body.code === ROOM_LOCKED) return "The GM has locked this room to new players. Ask the GM to unlock it.";
  if (res.status === 409) {
    return `${displayName} is already at this table. Try another name, or if this is your own old seat, ask the GM to remove it first.`;
  }
  return said ?? "The room refused this join.";
}
