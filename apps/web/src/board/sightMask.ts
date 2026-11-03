import { fogPalette, type Rgb } from "./fogTexture";

type Point = { x: number; y: number };

/** The darkness takes the map's fog-bank colour, taken down this far so it reads near-black but never pure black. */
export const SIGHT_DARKEN = 0.16;
/** Width of the soft shadow just inside the sight edges, in grid cells. */
export const SIGHT_BAND_CELLS = 0.35;

/**
 * The darkness's strength when it dims the map rather than hiding it: the map shows through, and
 * nothing on it outside sight does (the server still withholds it, ADR 0044).
 */
export const DIMMED_ALPHA = 0.62;

/**
 * How strongly the darkness covers the map. With at least one token to see through, it is opaque
 * outside the viewer's sight. With none (a player who has just joined, or whose only token is
 * hidden) the viewer would see nothing at all, not even where the map is; so the map shows dimmed
 * instead. That reveals nothing new: the map's picture is on their screen either way.
 */
export function sightMaskAlpha(polygons: ReadonlyArray<ReadonlyArray<Point>>): number {
  return polygons.some((p) => p.length >= 3) ? 1 : DIMMED_ALPHA;
}

/** Near-black tinted to the map (jungle: green-black, ice: blue-black). */
export function sightColor(base?: Rgb | null): Rgb {
  return fogPalette(base).dark.map((c) => Math.max(4, Math.round(c * SIGHT_DARKEN))) as unknown as Rgb;
}

/** True when both ends of an edge lie on the same side of the map, so the board edge is not shadowed. */
export function isBorderEdge(a: Point, b: Point, width: number, height: number, tol = 1): boolean {
  return (
    (a.x <= tol && b.x <= tol) ||
    (a.x >= width - tol && b.x >= width - tol) ||
    (a.y <= tol && b.y <= tol) ||
    (a.y >= height - tol && b.y >= height - tol)
  );
}

/**
 * The line-of-sight darkness at a fraction of the map's size (FR-GM-19): opaque `rgb` everywhere
 * outside the sight polygons, clear inside, with a soft shadow fading inward from the polygon
 * edges so light falls off against walls. Edges along the map border are left unshadowed.
 * Linear sampling of the small canvas softens it further. The caller scales the sprite by 1/scale.
 */
export function makeSightMaskCanvas(
  polygons: ReadonlyArray<ReadonlyArray<Point>>,
  width: number,
  height: number,
  cell: number,
  rgb: Rgb,
): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, 10 / Math.max(1, cell), 1536 / Math.max(1, width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, scale };
  const color = `rgb(${rgb.map(Math.round).join(",")})`;
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.fillRect(0, 0, width, height);
  const polys = polygons.filter((p) => p.length >= 3);
  const trace = (points: ReadonlyArray<Point>) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };
  for (const points of polys) {
    ctx.save();
    trace(points);
    ctx.clip();
    ctx.clearRect(0, 0, width, height);
    ctx.restore();
  }
  const band = SIGHT_BAND_CELLS * cell;
  const blurs = "filter" in ctx;
  for (const points of polys) {
    ctx.save();
    trace(points);
    ctx.clip();
    // Blur is in canvas pixels, unaffected by the scale transform.
    if (blurs) ctx.filter = `blur(${Math.max(0.5, 0.08 * cell * scale)}px)`;
    ctx.lineJoin = "round";
    const edges = (lineWidth: number, alpha: number) => {
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length]!;
        if (isBorderEdge(a, b, width, height)) return;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
    };
    if (blurs) edges(2 * 0.2 * cell, 1);
    else for (let k = 8; k >= 1; k--) edges((2 * band * k) / 8, 0.2); // fallback: faint layered strokes
    ctx.restore();
  }
  return { canvas, scale };
}
