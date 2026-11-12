import type { Participant, RoomState, Wall } from "@vtt/shared";

/**
 * The plain walls a board draws as wall lines: every one for the GM, none for a player (ADR 0056).
 * A player's state holds only the pieces of walls they can see, for path search and previews; the
 * GM previewing as a player is shown as that player, so nothing is drawn there either.
 */
export function plainWallLines(walls: RoomState["walls"], viewer: Pick<Participant, "role"> | null): Wall[] {
  if (viewer?.role !== "gm") return [];
  return Object.values(walls).filter((w) => !w.portal);
}
