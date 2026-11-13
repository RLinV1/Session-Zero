import { MIN_HP, type TokenStats } from "@vtt/shared";

/** The most HP a token may have when it has no maximum (the stats schema's bound). */
const HP_CEILING = 9999;

/**
 * A token's stats after damage (negative) or healing (positive), kept within what the server
 * accepts: healing never goes above max HP, damage never below MIN_HP (token-quick-hp).
 * Null when the token tracks no HP.
 */
export function applyHpDelta(stats: TokenStats, delta: number): TokenStats | null {
  if (stats.hp === null) return null;
  const hp = Math.min(stats.maxHp ?? HP_CEILING, Math.max(MIN_HP, stats.hp + delta));
  return { ...stats, hp };
}
