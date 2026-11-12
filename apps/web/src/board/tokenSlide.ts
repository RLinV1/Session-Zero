/**
 * How a token slides when it moves (token-slide): it starts from rest, speeds up over `SPEED_UP_MS`,
 * then keeps a steady pace of `MS_PER_SQUARE`, so a 6-square move takes just under 1 s. Pure timing,
 * in board pixels and milliseconds, so it is testable without Pixi.
 */

/** Cruising pace once up to speed: 6 squares take 6 x 136 + 125 = about 0.94 s. */
export const MS_PER_SQUARE = 136;
/** How long a slide takes to reach its pace; a refused move barely shows inside it. */
export const SPEED_UP_MS = 250;
/** A replay slide must end before the next auto-play step, which comes every `REPLAY_STEP_MS`. */
export const REPLAY_SLIDE_MARGIN_MS = 100;

/**
 * How long a slide of `length` board pixels takes on a grid of `cellSize` pixels, at most `capMs`
 * when given (replays). Live slides are not capped: a longer move takes longer.
 */
export function slideDuration(length: number, cellSize: number, capMs?: number): number {
  const natural = MS_PER_SQUARE * (length / cellSize) + SPEED_UP_MS / 2;
  return capMs === undefined ? natural : Math.min(natural, capMs);
}

/**
 * How far along a slide of `length` pixels, lasting `duration` ms, the token is `t` ms after it
 * started: speeding up evenly for the first `SPEED_UP_MS` (or the whole slide, if shorter), then
 * steady, reaching `length` exactly at `duration`. Speed never decreases.
 */
export function slideDistance(t: number, length: number, duration: number): number {
  if (t <= 0 || length <= 0) return 0;
  if (t >= duration) return length;
  const rampMs = Math.min(SPEED_UP_MS, duration);
  const speed = length / (duration - rampMs / 2);
  return t < rampMs ? (speed * t * t) / (2 * rampMs) : (speed * rampMs) / 2 + speed * (t - rampMs);
}
