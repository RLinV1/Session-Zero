import { attackDistance, diagonalRuleOf, inRange, type AttackRange, type Footprint, type RoomState } from "@vtt/shared";
import { formatDistance } from "./tools";
import { t } from "../i18n/locale";

/**
 * What the aim from `attacker` to `target` says while picking a target (attack-targeting,
 * attack-range): the distance nearest square to nearest square under the room's Diagonals rule,
 * as the target list shows it, and whether the target is out of the chosen attack's range. The
 * target is a token, or the one square under the pointer when no token is.
 */
export function attackAim(state: Pick<RoomState, "scene" | "diagonalRule">, attacker: Footprint, target: Footprint, range: AttackRange | null) {
  const grid = state.scene.grid;
  const rule = diagonalRuleOf(state);
  const distance = formatDistance(attackDistance(attacker, target, grid, rule), grid);
  const outOfRange = !inRange(range ?? undefined, attacker, target, grid, rule);
  return { outOfRange, label: outOfRange ? `${distance} · ${t("board.outOfRange")}` : distance };
}
