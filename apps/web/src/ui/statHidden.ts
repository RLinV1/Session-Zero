import type { Participant, RoomState, Token } from "@vtt/shared";

/**
 * Whether the room's rules withhold a token's HP or AC from this viewer (ADR 0057): a player who
 * doesn't own the token, while "Hide HP from Players" or "Hide AC from Players" is on. The server
 * has already sent `null` for it; this only lets the UI say "Hidden" instead of "Not tracked".
 */
export function statHidden(state: Pick<RoomState, "hideHp" | "hideAc">, you: Participant, token: Pick<Token, "ownerIds">, stat: "hp" | "ac"): boolean {
  if (you.role === "gm" || token.ownerIds.includes(you.id)) return false;
  return stat === "hp" ? state.hideHp === true : state.hideAc === true;
}
