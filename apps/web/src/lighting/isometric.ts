export interface Point3 { x: number; y: number; z: number }
export interface Point2 { x: number; y: number }
export interface Building { id: string; x: number; y: number; width: number; depth: number; height: number; color: readonly [number, number, number] }
export const WORLD_SIZE = 20;

export function rotate(point: Point2, turn: number): Point2 {
  const x = point.x - WORLD_SIZE / 2, y = point.y - WORLD_SIZE / 2;
  switch (((turn % 4) + 4) % 4) {
    case 1: return { x: WORLD_SIZE / 2 - y, y: WORLD_SIZE / 2 + x };
    case 2: return { x: WORLD_SIZE / 2 - x, y: WORLD_SIZE / 2 - y };
    case 3: return { x: WORLD_SIZE / 2 + y, y: WORLD_SIZE / 2 - x };
    default: return { x: point.x, y: point.y };
  }
}
export function project(point: Point3, turn = 0): Point2 {
  const p = rotate(point, turn);
  return { x: (p.x - p.y) * 36, y: (p.x + p.y) * 18 - point.z * 36 };
}
export function unproject(point: Point2, turn = 0): Point2 {
  return rotate({ x: point.x / 72 + point.y / 36, y: point.y / 36 - point.x / 72 }, -turn);
}

/** Slab intersection in world space: a ray can pass above a low building. */
export function blocksLight(from: Point3, to: Point3, building: Building): boolean {
  let near = 0, far = 1;
  const axes = [
    [from.x, to.x - from.x, building.x, building.x + building.width],
    [from.y, to.y - from.y, building.y, building.y + building.depth],
    [from.z, to.z - from.z, 0, building.height],
  ];
  for (const [origin = 0, direction = 0, min = 0, max = 0] of axes) {
    if (Math.abs(direction) < 1e-9) {
      if (origin <= min || origin >= max) return false;
    } else {
      const a = (min - origin) / direction, b = (max - origin) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near >= far) return false;
    }
  }
  return far > 0.0001 && near < 0.9999;
}
export function isWalkable(point: Point2, buildings: readonly Building[]): boolean {
  return point.x >= 0.5 && point.y >= 0.5 && point.x < WORLD_SIZE && point.y < WORLD_SIZE
    && !buildings.some((b) => point.x > b.x - 0.15 && point.x < b.x + b.width + 0.15 && point.y > b.y - 0.15 && point.y < b.y + b.depth + 0.15);
}
export function findPath(from: Point2, target: Point2, buildings: readonly Building[]): Point2[] {
  const destination = { x: Math.floor(target.x) + 0.5, y: Math.floor(target.y) + 0.5 };
  if (!isWalkable(destination, buildings)) return [];
  const key = (p: Point2) => p.x + "," + p.y;
  const queue = [{ x: Math.floor(from.x) + 0.5, y: Math.floor(from.y) + 0.5 }];
  const parents = new Map<string, Point2 | null>([[key(queue[0]!), null]]);
  for (let index = 0; index < queue.length; index++) {
    const at = queue[index]!;
    if (key(at) === key(destination)) {
      const path: Point2[] = [];
      let cursor: Point2 | null = at;
      while (cursor && parents.get(key(cursor))) { path.push(cursor); cursor = parents.get(key(cursor)) ?? null; }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: at.x + dx!, y: at.y + dy! };
      if (isWalkable(next, buildings) && !parents.has(key(next))) {
        parents.set(key(next), at); queue.push(next);
      }
    }
  }
  return [];
}
export function insidePolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
