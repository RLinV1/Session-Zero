import type { Point } from "@vtt/shared";

/** How long after an attack roll its roller's ping still counts as that roll's target ping. */
export const ATTACK_PING_WINDOW_MS = 5000;

/**
 * Recognises the ping an attack roll sends at its target (attack-rolls), so a board at the None
 * Animations level can leave it out (animation-levels). The ping itself is an ordinary ephemeral
 * message, so this matches it to the roll it follows instead: the same participant, at the
 * target's position, soon after the roll arrived. A hand ping elsewhere still shows.
 */
export class AttackPings {
  private recent: { by: string; at: Point; when: number }[] = [];

  /** An attack roll by `by` at a target standing at `at` arrived at `now` (ms). */
  note(by: string, at: Point, now: number) {
    this.prune(now);
    this.recent.push({ by, at: { x: at.x, y: at.y }, when: now });
  }

  /** Whether a ping from `from` at `at` is the target ping of a recent attack roll; it is used up if so. */
  take(from: string, at: Point, now: number): boolean {
    this.prune(now);
    const index = this.recent.findIndex((r) => r.by === from && r.at.x === at.x && r.at.y === at.y);
    if (index < 0) return false;
    this.recent.splice(index, 1);
    return true;
  }

  private prune(now: number) {
    this.recent = this.recent.filter((r) => now - r.when <= ATTACK_PING_WINDOW_MS);
  }
}
