import type { Point, RoomState } from "@vtt/shared";

/** The mask's longer side at most, in canvas pixels: sharp enough at normal zoom, bounded in memory. */
export const AREA_MASK_MAX_PX = 2048;

/**
 * What a viewer can see, as a mask for areas they may not edit (ADR 0059): opaque where they can
 * see, clear under fog and outside their sight. `fill` is "board" with no line-of-sight limit, else
 * the sight polygons; `cut` are the fog regions. Board pixels, scaled by `scale` onto the canvas.
 */
export type VisibleRegionPlan = {
  width: number;
  height: number;
  scale: number;
  fill: "board" | Point[][];
  cut: Point[][];
};

export function visibleRegionPlan(fog: RoomState["fog"], sight: Point[][] | null | undefined, width: number, height: number): VisibleRegionPlan {
  const scale = Math.min(1, AREA_MASK_MAX_PX / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.ceil(width * scale)),
    height: Math.max(1, Math.ceil(height * scale)),
    scale,
    fill: sight ? sight.filter((p) => p.length >= 3) : "board",
    cut: Object.values(fog).map((r) => r.points).filter((p) => p.length >= 3),
  };
}

/** The part of a 2D context the painter uses, so tests can record it. */
export type MaskContext = Pick<CanvasRenderingContext2D, "scale" | "fillRect" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill"> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  globalCompositeOperation: CanvasRenderingContext2D["globalCompositeOperation"];
};

/** Paint a plan: white where the viewer can see, then fog cut out of it. */
export function paintVisibleRegion(ctx: MaskContext, plan: VisibleRegionPlan) {
  const trace = (points: readonly Point[]) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  };
  ctx.scale(plan.scale, plan.scale);
  ctx.fillStyle = "#ffffff";
  ctx.globalCompositeOperation = "source-over";
  if (plan.fill === "board") ctx.fillRect(0, 0, plan.width / plan.scale, plan.height / plan.scale);
  else plan.fill.forEach(trace);
  ctx.globalCompositeOperation = "destination-out";
  plan.cut.forEach(trace);
  ctx.globalCompositeOperation = "source-over";
}

/** The mask as a canvas, for a Pixi sprite scaled by `1 / scale`. */
export function makeVisibleRegionCanvas(fog: RoomState["fog"], sight: Point[][] | null | undefined, width: number, height: number): { canvas: HTMLCanvasElement; scale: number } {
  const plan = visibleRegionPlan(fog, sight, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (ctx) paintVisibleRegion(ctx, plan);
  return { canvas, scale: plan.scale };
}
