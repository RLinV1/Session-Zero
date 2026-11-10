
import { t } from "../i18n/locale";

/**
 * Step arithmetic for the replay bar (FR-PL-07), kept pure so it is tested without a DOM.
 * Steps run from 0 (the replay point itself) to `count` (after the last change).
 */

/** How long each step shows while playing. */
export const REPLAY_STEP_MS = 800;

/** `index + delta`, kept inside `0..count`. */
export function stepTo(index: number, delta: number, count: number): number {
  return Math.min(count, Math.max(0, index + delta));
}

/** One tick of playback: the next step, and whether playback goes on after it. */
export function playTick(index: number, count: number): { index: number; playing: boolean } {
  const next = stepTo(index, 1, count);
  return { index: next, playing: next < count };
}

/** Pressing play at the end starts again from the point. */
export function playFrom(index: number, count: number): number {
  return index >= count ? 0 : index;
}

/** "Step 3 of 12", or "Start" for step 0. */
export function stepLabel(index: number, count: number): string {
  return index === 0 ? t("replay.startChanges", { n: count }) : t("replay.stepOf", { n: index, total: count });
}
