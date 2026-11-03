import type { ConditionId } from "@vtt/shared";

/**
 * The painted icon of each condition (`public/img/conditions`, see CREDITS.md there), shared by
 * the panels' markers and the board's. Each is a distinct picture, so the icon alone tells two
 * conditions apart without colour (FR-TAC-08).
 */
export const conditionIconUrl = (id: ConditionId) => `/img/conditions/${id}.webp`;
