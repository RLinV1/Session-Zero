import { parseDiceExpression, type DomainEvent, type Participant, type Point, type RoomState } from "@vtt/shared";

/**
 * Dice for group and area-effect rolls (ADR 0046): each token's dice are thrown onto that token
 * the way a Roll-button throw is, every token at once, so a roll for thirty tokens lands as soon
 * as a roll for one. Past `MAX_DROP_DICE`, each token instead gets one die with its total, dropped
 * straight down. Pure, so it is testable without the DOM; `DroppedDice` draws what it plans.
 */

/** How long a total-only die falls, how long any roll's dice stay after landing, and their fade. */
export const DROP_MS = 700;
export const DROP_LINGER_MS = 3000;
export const DROP_FADE_MS = 400;
/** Over this many dice in one roll, each token gets a single die with its total instead. */
export const MAX_DROP_DICE = 40;
/** Rolls dropping on the board at once; a newer one clears the oldest. Separate from thrown rolls. */
export const MAX_BOARD_DROPS = 3;

/** One token's share of a drop: where it lands and what it shows. */
export interface DropGroup {
  key: string;
  at: Point;
  dice: number[];
  total: number;
}

/** A roll's dice, dropped onto the board as one unit. */
export interface BoardDrop {
  /** The roll's id, or the effect's id with `:saves` or `:damage`; what `airborne` tracks. */
  rollId: string;
  sides: number;
  gmOnly: boolean;
  groups: DropGroup[];
  /** True when the roll has too many dice to draw: each group shows its total on one die. */
  totalsOnly: boolean;
}

export const savesRollId = (effectId: string) => `${effectId}:saves`;
export const damageRollId = (effectId: string) => `${effectId}:damage`;

/** The middle of some points, for a single damage roll over several targets. */
export function centroid(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function drop(rollId: string, expression: string, gmOnly: boolean, groups: DropGroup[]): BoardDrop | null {
  if (groups.length === 0) return null;
  const parsed = parseDiceExpression(expression);
  const sides = parsed.ok ? parsed.expression.sides : 20;
  const count = groups.reduce((n, g) => n + g.dice.length, 0);
  return { rollId, sides, gmOnly, groups, totalsOnly: count > MAX_DROP_DICE };
}

/**
 * What to drop for a live event, from the viewer's own copy of the room after it. The event was
 * already filtered for them, so only numbers they were sent are drawn: a player's saves are
 * null, and a player's targets are only the ones they can see.
 */
export function dropFor(event: DomainEvent, after: Pick<RoomState, "tokens" | "areaEffect">, viewer: Pick<Participant, "role">): BoardDrop | null {
  const at = (tokenId: string) => after.tokens[tokenId]?.position ?? null;
  switch (event.type) {
    case "GroupRolled": {
      const { roll } = event;
      const groups = roll.entries.flatMap((e) => {
        const p = at(e.tokenId);
        return p ? [{ key: e.tokenId, at: p, dice: e.dice, total: e.total }] : [];
      });
      return drop(roll.id, roll.expression, roll.visibility === "gm", groups);
    }
    case "AreaEffectStarted": {
      // The saves are the GM's alone.
      if (viewer.role !== "gm") return null;
      const { effect } = event;
      const groups = effect.targets.flatMap((t) => {
        const p = at(t.tokenId);
        return p && t.roll ? [{ key: t.tokenId, at: p, dice: t.roll.dice, total: t.roll.total }] : [];
      });
      return drop(savesRollId(effect.id), effect.expression, true, groups);
    }
    case "AreaEffectDamageRolled": {
      const effect = after.areaEffect ?? null;
      if (!effect || effect.id !== event.effectId) return null;
      const { damage } = event;
      if (damage.mode === "perTarget") {
        const groups = damage.results.flatMap((r) => {
          const p = at(r.tokenId);
          return p ? [{ key: r.tokenId, at: p, dice: r.dice, total: r.total }] : [];
        });
        return drop(damageRollId(effect.id), damage.expression, false, groups);
      }
      const middle = centroid(effect.targets.flatMap((t) => at(t.tokenId) ?? []));
      return middle ? drop(damageRollId(effect.id), damage.expression, false, [{ key: "all", at: middle, dice: damage.dice, total: damage.total }]) : null;
    }
    default:
      return null;
  }
}

/** Adds a drop, keeping at most `max`; the drops cleared to make room come back for their callbacks. */
export function addDrop<T extends { drop: BoardDrop }>(list: readonly T[], next: T, max = MAX_BOARD_DROPS): { kept: T[]; evicted: T[] } {
  const all = [...list.filter((d) => d.drop.rollId !== next.drop.rollId), next];
  const evicted = all.splice(0, Math.max(0, all.length - max));
  return { kept: all, evicted };
}
