import { z } from "zod";
import { Point, inFogRegion, polygonArea, segmentsCross } from "./geometry";

export const IsometricBuilding = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  footprint: z.array(Point).min(3).max(32),
  /** Height in grid cells; this is visual geometry, separate from movement and sight walls. */
  height: z.number().finite().min(0.25).max(20),
}).strict().superRefine((building, ctx) => {
  const points = building.footprint;
  if (Math.abs(polygonArea(points)) < 1) ctx.addIssue({ code: "custom", message: "Outline a building with a nonzero area.", path: ["footprint"] });
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
    if (segmentsCross({ a: points[i]!, b: points[(i + 1) % points.length]! }, { a: points[j]!, b: points[(j + 1) % points.length]! })) {
      ctx.addIssue({ code: "custom", message: "The building outline must not cross itself.", path: ["footprint"] });
      return;
    }
  }
});
export type IsometricBuilding = z.infer<typeof IsometricBuilding>;
export const IsometricBuildings = z.array(IsometricBuilding).max(100).refine((items) => new Set(items.map((b) => b.id)).size === items.length, "Building ids must be unique.");
export const IsometricBuildingSet = z.object({ mapUrl: z.string().min(1).max(4096), items: IsometricBuildings });
export type IsometricBuildingSet = z.infer<typeof IsometricBuildingSet>;

export function buildingsForScene(scene: { map: { url: string } | null; isometricBuildings?: IsometricBuildingSet }): IsometricBuilding[] {
  return scene.isometricBuildings && scene.map?.url === scene.isometricBuildings.mapUrl ? scene.isometricBuildings.items : [];
}

const edges = (points: readonly Point[]) => points.map((a, i) => ({ a, b: points[(i + 1) % points.length]! }));

/** Withhold a partially concealed building as well as a hidden one; never send its hidden outline. */
export function buildingVisible(building: IsometricBuilding, fog: readonly Point[][], sight: Point[][] | null): boolean {
  const outline = building.footprint, sides = edges(outline);
  if (fog.some((region) => outline.some((p) => inFogRegion(region, p)) || region.some((p) => inFogRegion(outline, p))
    || edges(region).some((edge) => sides.some((side) => segmentsCross(edge, side))))) return false;
  return sight === null || sight.some((region) => outline.every((p) => inFogRegion(region, p))
    && !edges(region).some((edge) => sides.some((side) => segmentsCross(edge, side))));
}
