/** Share of a nuke before impact: the siren winds up, and the bomb falls at the end of it. */
export const NUKE_DROP_SHARE = 0.46;
/** Share of a nuke the bomb takes to fall, ending on the impact: 0.88 s at the default 6.5 s, as before the siren. */
export const NUKE_FALL_SHARE = 0.135;
/** Heavy effects render at 30 fps, independent of display refresh rate. */
export const FX_FRAME_MS = 1000 / 30;

/** Screen-sized mushroom cloud, independent of map dimensions or zoom. */
export function nukeLayout(width: number, height: number, size: number) {
  const h = Math.max(1, height);
  const strength = Math.min(1.08, 0.76 + size * 0.08);
  const capWidth = Math.min(Math.max(1, width) * 0.7, h * 0.98) * strength;
  // Let the stem extend below the impact point as it rises, leaving room for a taller cloud.
  const baseDrop = h * 0.12;
  const cloudHeight = Math.max(1, Math.min(
    Math.min(h * 0.39, Math.max(1, width) * 0.46) * strength,
    h * 0.48 + baseDrop - capWidth * 0.22,
  ));
  return { origin: { x: width / 2, y: height / 2 }, cloudHeight, capWidth, baseDrop };
}
