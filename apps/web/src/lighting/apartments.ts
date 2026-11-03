import type { Building, Point2, Point3 } from "./isometric";
export interface Light extends Point3 { range: number; strength: number; color: readonly [number, number, number] }
export const APARTMENTS: readonly Building[] = [
  { id: "copper-house", x: 2, y: 2, width: 5, depth: 4, height: 3.4, color: [139, 86, 65] },
  { id: "lantern-house", x: 13, y: 2, width: 4, depth: 5, height: 4.4, color: [133, 99, 78] },
  { id: "ivy-house", x: 2, y: 11, width: 4, depth: 5, height: 3.8, color: [111, 111, 92] },
  { id: "blue-house", x: 13, y: 13, width: 5, depth: 3, height: 2.8, color: [104, 115, 120] },
];
export const START: Point2 = { x: 9.5, y: 12.5 };
export const WALK_STOPS: readonly Point2[] = [
  { x: 8.5, y: 8.5 }, { x: 9.5, y: 4.5 }, { x: 11.5, y: 1.5 },
  { x: 18.5, y: 3.5 }, { x: 18.5, y: 9.5 }, { x: 11.5, y: 11.5 },
  { x: 7.5, y: 17.5 }, { x: 1.5, y: 17.5 }, { x: 1.5, y: 8.5 }, START,
];
export const LAMPS: readonly Point2[] = [{ x: 8, y: 7.5 }, { x: 12, y: 11.5 }, { x: 7.5, y: 16.5 }, { x: 18, y: 8 }];
export const WINDOW_LIGHTS: readonly Light[] = APARTMENTS.flatMap((b) => [
  { x: b.x + 1, y: b.y + b.depth + 0.08, z: 1.1, range: 3.5, strength: 0.6, color: [1, 0.65, 0.3] as const },
  { x: b.x + b.width + 0.08, y: b.y + 1.5, z: 1.3, range: 3.5, strength: 0.7, color: [1, 0.65, 0.3] as const },
]);
