import type { Point } from "./geometry";
import type { Portal, PortalState, Wall } from "./state";
import type { Locale } from "./i18n/core";
import { portalChangeZhTW } from "./i18n/sentences.zh-TW";

/**
 * Doors and windows on walls (FR-GM-18, ADR 0030). The rules every reader shares: what blocks
 * movement, where a portal is for fog, and how a change reads in the activity log and undo.
 */

/** Whether a wall stops tokens: a plain wall, or a closed or locked portal. Open portals don't. */
export const blocksMovement = (wall: Pick<Wall, "portal" | "uvttPortal">): boolean => wall.portal ? wall.portal.state !== "open" : wall.uvttPortal?.closed !== false;

/** The point fog is tested at for a portal, as a token's centre is (ADR 0016). */
export const wallMidpoint = (wall: Pick<Wall, "a" | "b">): Point => ({ x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 });

/** "a door", "an open window". */
const withArticle = (words: string) => `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`;

/** Same-kind state changes, as [base verb, past tense, gerund]. */
const STATE_VERBS: Partial<Record<`${PortalState}>${PortalState}`, [string, string, string]>> = {
  "closed>open": ["open", "opened", "opening"],
  "open>closed": ["close", "closed", "closing"],
  "closed>locked": ["lock", "locked", "locking"],
  "locked>closed": ["unlock", "unlocked", "unlocking"],
  "locked>open": ["unlock and open", "unlocked and opened", "unlocking and opening"],
  "open>locked": ["close and lock", "closed and locked", "closing and locking"],
};

/**
 * One portal change in words (ADR 0030): `past` for the activity log ("opened a door"), `verb`
 * for the Undo button ("open a door") and `gerund` for "Undid …" ("opening a door").
 */
export function describePortalChange(from: Portal | null, to: Portal | null, locale: Locale = "en"): { past: string; verb: string; gerund: string } {
  if (locale === "zh-TW") return portalChangeZhTW(from, to);
  const phrase = (base: string, past: string, gerund: string, rest: string) =>
    ({ verb: `${base} ${rest}`, past: `${past} ${rest}`, gerund: `${gerund} ${rest}` });
  if (from && to && from.kind === to.kind) {
    const [base, past, gerund] = STATE_VERBS[`${from.state}>${to.state}`] ?? ["change", "changed", "changing"];
    return phrase(base, past, gerund, withArticle(to.kind));
  }
  if (from && !to) return phrase("turn", "turned", "turning", `${withArticle(from.kind)} back into a wall`);
  const target = to ? withArticle(`${to.state} ${to.kind}`) : "a wall";
  return phrase("make", "made", "making", `${from ? withArticle(from.kind) : "a wall"} ${target}`);
}
