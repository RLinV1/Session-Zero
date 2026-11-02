/**
 * A seamless, cloudy fog texture drawn once with domain-warped fractal value noise: wisps of pale
 * mist curling through darker blue-grey banks. Tiles at `FOG_TEXTURE_SIZE` pixels, so the fog can
 * repeat across any map; the board layers it twice, at different scales and angles, so the
 * repeat doesn't show.
 */
export const FOG_TEXTURE_SIZE = 512;

/** Small deterministic generator so every client draws the same clouds. */
function lattice(size: number, seed: number): Float32Array {
  const values = new Float32Array(size * size);
  let s = seed >>> 0;
  for (let i = 0; i < values.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    values[i] = s / 0xffffffff;
  }
  return values;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise on a wrapping `cells`×`cells` lattice, sampled at (u, v) in [0, 1). */
function sample(values: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (n: number) => ((n % cells) + cells) % cells;
  const at = (gx: number, gy: number) => values[wrap(gy) * cells + wrap(gx)]!;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export type Rgb = readonly [number, number, number];

/** Blue-grey banks and pale mist, used when the map's own colour is not known. */
const DEFAULT_DARK: Rgb = [96, 104, 118];
const DEFAULT_LIGHT: Rgb = [236, 240, 246];

/** Extremes of the sample that do not count towards the map's colour: this share off each end, by brightness. */
const TRIM = 0.1;
/** Share of the map colour's hue the fog keeps: mostly grey, with just enough of the map to sit in it. */
const HUE_KEEP = 0.3;
/** Banks sit this far down from the map colour towards black, and mist this far up towards white. */
const BANK_DARKEN = 0.92;
const MIST_LIGHTEN = 0.4;

/** The mean colour of RGBA pixels once the darkest and lightest tenth are left out. */
export function trimmedMean(data: ArrayLike<number>): Rgb {
  const pixels: { luma: number; r: number; g: number; b: number }[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    pixels.push({ luma: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b });
  }
  pixels.sort((a, b) => a.luma - b.luma);
  const cut = Math.floor(pixels.length * TRIM);
  const kept = pixels.slice(cut, pixels.length - cut);
  const used = kept.length > 0 ? kept : pixels;
  if (used.length === 0) return DEFAULT_DARK;
  let r = 0, g = 0, b = 0;
  for (const p of used) { r += p.r; g += p.g; b += p.b; }
  return [r / used.length, g / used.length, b / used.length];
}

/** The map's own colour, or null when the browser won't let the image be read. */
export function averageColor(source: CanvasImageSource): Rgb | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, 16, 16);
    return trimmedMean(ctx.getImageData(0, 0, 16, 16).data);
  } catch {
    return null;
  }
}

const clamp = (n: number) => Math.min(255, Math.max(0, n));

/**
 * The fog's two shades. With the map's colour, the fog is grey with a hint of the map's hue, banks
 * only a little darker than the map and mist a little lighter, so it blends into this map; without
 * it, the default blue-grey.
 */
export function fogPalette(base?: Rgb | null): { dark: Rgb; light: Rgb } {
  if (!base) return { dark: DEFAULT_DARK, light: DEFAULT_LIGHT };
  const luma = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
  const greyed = base.map((c) => clamp(luma + (c - luma) * HUE_KEEP)) as unknown as Rgb;
  return {
    dark: greyed.map((c) => c * BANK_DARKEN) as unknown as Rgb,
    light: greyed.map((c) => c + (255 - c) * MIST_LIGHTEN) as unknown as Rgb,
  };
}

/**
 * The fog as a canvas; the caller turns it into a repeating texture. Given the map's colour,
 * the fog's dark banks and pale mist are shades of it, so it sits in the map instead of looking
 * pasted on.
 */
export function makeFogCanvas(base?: Rgb | null): HTMLCanvasElement {
  const { dark, light } = fogPalette(base);
  return paintFog((lift) => [
    dark[0] + lift * (light[0] - dark[0]),
    dark[1] + lift * (light[1] - dark[1]),
    dark[2] + lift * (light[2] - dark[2]),
  ]);
}

/**
 * The same clouds as density, grey on black: what the fog shader reads (`fogShader.ts`) until the
 * painted fog bank has loaded.
 */
export function makeFogDensityCanvas(): HTMLCanvasElement {
  return paintFog((lift) => [255 * lift, 255 * lift, 255 * lift]);
}

function paintFog(shade: (lift: number) => [number, number, number]): HTMLCanvasElement {
  const size = FOG_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const fbm = (octaves: { cells: number; weight: number; values: Float32Array }[], u: number, v: number) => {
    let n = 0;
    for (const o of octaves) n += sample(o.values, o.cells, u, v) * o.weight;
    return n;
  };
  const octaves = (seed: number) => [
    { cells: 4, weight: 0.5, seed },
    { cells: 8, weight: 0.27, seed: seed + 12 },
    { cells: 16, weight: 0.15, seed: seed + 26 },
    { cells: 32, weight: 0.08, seed: seed + 40 },
  ].map((o) => ({ ...o, values: lattice(o.cells, o.seed) }));
  const mist = octaves(11);
  const warpX = octaves(101);
  const warpY = octaves(211);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Bend the lookup by another noise field, so the clouds stretch into curls and wisps.
      const n = fbm(mist, u + 0.35 * (fbm(warpX, u, v) - 0.5), v + 0.35 * (fbm(warpY, u, v) - 0.5));
      // Stretch the middle of the range for contrast: dark blue-grey banks, pale mist on top.
      const t = Math.min(1, Math.max(0, (n - 0.02) * 2));
      const [r, g, b] = shade(t * t * (3 - 2 * t));
      const i = (y * size + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** How far mist fades out past a fog region's edge, in grid cells. Inside the edge the fog is solid. */
export const FOG_FEATHER_CELLS = 2;
/** How far the edge's noise can move the fade in or out, as a share of the fade. */
const FOG_BILLOW = 0.25;

/**
 * The fog's opacity at `distance` grid cells from a region's edge (positive inside), with `noise`
 * in [0, 1] moving the fade. Opaque inside, nothing past `FOG_FEATHER_CELLS`, and in between an
 * even fall that the noise pushes out or pulls in. The noise's reach is zero at both ends of the
 * fade, so it can never open the inside or carry mist past the end. Mirrored in `fogShader.ts`.
 */
export function fogEdgeAlpha(distance: number, noise: number): number {
  if (distance >= 0) return 1;
  const u = Math.min(1, Math.max(0, 1 + distance / FOG_FEATHER_CELLS));
  // With |shift| at most u(1 - u), the fade still falls steadily with distance.
  const shift = (noise - 0.5) * 2 * FOG_BILLOW * 4 * u * (1 - u);
  const v = Math.min(1, Math.max(0, u + shift));
  return v * v * (3 - 2 * v);
}

/** How many cells each side of an edge the distance texture holds; farther is clamped. */
export const FOG_DISTANCE_RANGE = 4;
/** Distance samples per grid cell, and the most along either side of the texture. */
const DISTANCE_SAMPLES_PER_CELL = 8;
const DISTANCE_MAX_SIDE = 1024;

/**
 * Signed distance from every sample to the nearest fog edge, in grid cells: positive inside a
 * region, negative outside. Sample (i, j) sits at board point ((i + 0.5) / scale, (j + 0.5) / scale).
 */
export interface FogDistanceField {
  cols: number;
  rows: number;
  scale: number;
  cells: Float32Array;
}

/**
 * The regions' signed distance field: their union rasterised by scanline, then the exact
 * Euclidean distance transform of the inside and of the outside. Rebuilt only when fog or the grid
 * changes; the shader reads it to fade the border evenly whatever the regions' shapes.
 */
export function fogDistanceField(
  regions: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  width: number,
  height: number,
  cell: number,
): FogDistanceField {
  const size = Math.max(1, width, height);
  const scale = Math.min(1, DISTANCE_SAMPLES_PER_CELL / Math.max(1, cell), DISTANCE_MAX_SIDE / size);
  const cols = Math.max(1, Math.ceil(width * scale));
  const rows = Math.max(1, Math.ceil(height * scale));
  const inside = new Uint8Array(cols * rows);
  for (const points of regions) fillPolygon(points, scale, cols, rows, inside);
  const toOutside = squaredDistances(inside, cols, rows, 0);
  const toInside = squaredDistances(inside, cols, rows, 1);
  const cells = new Float32Array(cols * rows);
  // Samples straddle the edge, so it lies half a sample from the nearest one on the other side.
  const perCell = scale * Math.max(1, cell);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = inside[i] ? (Math.sqrt(toOutside[i]!) - 0.5) / perCell : -(Math.sqrt(toInside[i]!) - 0.5) / perCell;
  }
  return { cols, rows, scale, cells };
}

/** Marks the samples inside one polygon (even-odd), row by row. */
function fillPolygon(points: ReadonlyArray<{ x: number; y: number }>, scale: number, cols: number, rows: number, inside: Uint8Array) {
  if (points.length < 3) return;
  const crossings: number[] = [];
  for (let j = 0; j < rows; j++) {
    const y = (j + 0.5) / scale;
    crossings.length = 0;
    for (let k = 0; k < points.length; k++) {
      const a = points[k]!, b = points[(k + 1) % points.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k]! * scale - 0.5));
      const to = Math.min(cols - 1, Math.floor(crossings[k + 1]! * scale - 0.5));
      for (let i = from; i <= to; i++) inside[j * cols + i] = 1;
    }
  }
}

const FAR = 1e20;

/** Squared distance, in samples, from every sample to the nearest one whose mark is `target`. */
function squaredDistances(marks: Uint8Array, cols: number, rows: number, target: 0 | 1): Float64Array {
  const grid = new Float64Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = marks[i] === target ? 0 : FAR;
  const n = Math.max(cols, rows);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) f[j] = grid[j * cols + i]!;
    lowerEnvelope(f, rows, d, v, z);
    for (let j = 0; j < rows; j++) grid[j * cols + i] = d[j]!;
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) f[i] = grid[j * cols + i]!;
    lowerEnvelope(f, cols, d, v, z);
    for (let i = 0; i < cols; i++) grid[j * cols + i] = d[i]!;
  }
  return grid;
}

/** One pass of Felzenszwalb and Huttenlocher's distance transform: the lower envelope of parabolas. */
function lowerEnvelope(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
}

/**
 * The distance field as a texture for the shader: 0.5 grey at the edge, white `FOG_DISTANCE_RANGE`
 * cells inside, black as far outside. Linear sampling of it gives a smooth distance between samples.
 */
export function makeFogDistanceCanvas(field: FogDistanceField): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = field.cols;
  canvas.height = field.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(field.cols, field.rows);
  for (let i = 0; i < field.cells.length; i++) {
    const value = Math.round(255 * Math.min(1, Math.max(0, 0.5 + field.cells[i]! / (2 * FOG_DISTANCE_RANGE))));
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
