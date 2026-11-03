import type { CommandInput, Portal, Wall } from "@vtt/shared";

type PortalSet = Extract<CommandInput, { type: "portal.set" }>;

/** UVTT openings the GM has not made a door or window yet: GM-only until designated (ADR 0041). */
export const importedOpenings = (walls: Record<string, Wall>): Wall[] => Object.values(walls).filter((wall) => wall.uvttPortal && !wall.portal);

/** The door an imported opening becomes: open where the file says `closed: false`, closed otherwise, as a missing flag blocks (ADR 0041). */
export const importedDoor = (wall: { uvttPortal?: { closed?: boolean } }): Portal => ({ kind: "door", state: wall.uvttPortal?.closed === false ? "open" : "closed" });

/**
 * The `portal.set` commands that make every imported opening a door (FR-GM-09/18). They go through
 * the editor's draft like the Door tool's clicks, so Save sends them as ordinary portal designations.
 */
export const openingsToDoors = (walls: Record<string, Wall>): PortalSet[] =>
  importedOpenings(walls).map((wall) => ({ type: "portal.set", wallId: wall.id, portal: importedDoor(wall) }));
