import { z } from "zod";
import { GridSpec } from "./geometry";
import { DEFEAT_REMOVALS, DIAGONAL_RULES, DIFFICULT_TERRAIN_MODES } from "./state";

/**
 * A GM's defaults for the rooms they create (ADR 0066): every Table tab rule, and the grid's
 * distance per square and unit label. Saved on the GM's account and put on a new room's
 * `RoomCreated`, so the room starts with them.
 */
export const RoomDefaults = z.object({
  defeatRemoval: z.enum(DEFEAT_REMOVALS),
  hideMapWithoutToken: z.boolean(),
  hideHp: z.boolean(),
  hideAc: z.boolean(),
  diagonalRule: z.enum(DIAGONAL_RULES),
  difficultTerrain: z.enum(DIFFICULT_TERRAIN_MODES),
  unitsPerCell: GridSpec.shape.unitsPerCell,
  unitLabel: z.string().trim().pipe(GridSpec.shape.unitLabel),
});
export type RoomDefaults = z.infer<typeof RoomDefaults>;

/** How every room started before a GM could save defaults; also a GM's defaults until they do. */
export const BUILTIN_ROOM_DEFAULTS: RoomDefaults = {
  defeatRemoval: "all",
  hideMapWithoutToken: false,
  hideHp: false,
  hideAc: false,
  diagonalRule: "equal",
  difficultTerrain: "entry",
  unitsPerCell: 5,
  unitLabel: "ft",
};
