import type { IsometricBuilding, Point } from "@vtt/shared";

/** A vertical rise expressed in map-plane coordinates, before the isometric projection. */
export function buildingGeometry(building: IsometricBuilding, cellSize: number) {
  const rise = building.height * cellSize;
  const roof = building.footprint.map((p) => ({ x: p.x - rise, y: p.y - rise }));
  const signedArea = building.footprint.reduce((sum, p, i, points) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const faces = building.footprint.flatMap((a, i, points) => {
    const j = (i + 1) % points.length, b = points[j]!;
    const facing = (b.y - a.y - (b.x - a.x)) * Math.sign(signedArea);
    return facing > 0 ? [{ points: [a, b, roof[j]!, roof[i]!], color: Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? "#89725b" : "#625342" }] : [];
  });
  return { rise, roof, faces };
}

export const polygonPoints = (points: readonly Point[]): string => points.map((p) => `${p.x},${p.y}`).join(" ");
export const polygonVertices = (points: readonly Point[]): number[] => points.flatMap((p) => [p.x, p.y]);
