import type { Point } from "@vtt/shared";

export const ISO_X = Math.sqrt(3) / 2;

/** Projection changes the view only; game rules continue to use map pixels. */
export function projectMap(p: Point & { z?: number }, isometric = false): Point {
  return isometric ? { x: (p.x - p.y) * ISO_X, y: (p.x + p.y) / 2 - (p.z ?? 0) } : p;
}

export function unprojectMap(p: Point, isometric = false): Point {
  return isometric ? { x: p.y + p.x / (2 * ISO_X), y: p.y - p.x / (2 * ISO_X) } : p;
}

export function projectedBounds(width: number, height: number, isometric = false, elevation = 0) {
  return isometric
    ? { x: -height * ISO_X, y: elevation ? -elevation : 0, width: (width + height) * ISO_X, height: (width + height) / 2 + elevation }
    : { x: 0, y: 0, width, height };
}
