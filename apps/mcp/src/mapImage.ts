import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { shippedMapByUrl, type MapImage, type Participant, type Point, type RoomState } from "@vtt/shared";
import { ToolError } from "./errors";
import { squareOfToken } from "./grid";

/** Longest edge of a returned image. Large enough to read the grid, small enough for an AI app to take. */
export const MAX_IMAGE_EDGE = 1500;
/** About 256 MB to decode, so one map can't take the container's whole memory (design D7). */
export const MAX_MAP_PIXELS = 64_000_000;
/** The room server's upload limit is 25 MB, so a real map never gets near this. */
const MAX_MAP_BYTES = 32 * 1024 * 1024;
const MAX_RENDERS_AT_ONCE = 2;
/** A stalled read would hold one of those places, and the leases of everyone waiting behind it. */
const MAP_READ_TIMEOUT_MS = 20_000;
/** What the room server lets a GM upload. Anything else, an SVG above all, is never decoded. */
const MAP_FORMATS = new Set(["png", "jpeg", "webp"]);

/** A stored upload, read from the room server. The first character keeps `.` and `..` out. */
const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

const MASK_COLOR = "#14141a";
const BACKGROUND = { r: 0x14, g: 0x14, b: 0x1a };

// One render is a large, short-lived allocation, and keeping decoded images around helps nobody here.
sharp.cache(false);

export interface MapSources {
  roomServerUrl: string;
  builtinMapDir: string;
  readTimeoutMs?: number;
}

export type RenderedMap =
  | { kind: "image"; data: Buffer; mimeType: string; columns: { first: number; last: number }; rows: { first: number; last: number } }
  | { kind: "message"; message: string };

const NO_MAP: RenderedMap = { kind: "message", message: "There is no map yet. get_view still works." };
const UNAVAILABLE: RenderedMap = { kind: "message", message: "The map image is unavailable. get_view still works." };
const TOO_LARGE: RenderedMap = { kind: "message", message: "The map is too large to show as an image. get_view still works." };
const MASK_FAILED = "The map couldn't be drawn safely, so no image was returned. get_view still works.";

/** Reads a map only from the two places a real one lives (design D7). Any other address is never requested. */
async function readMapFile(map: MapImage, sources: MapSources): Promise<Buffer | null> {
  const shipped = shippedMapByUrl(map.url);
  if (shipped) return readFile(path.join(sources.builtinMapDir, path.basename(shipped.url))).catch(() => null);
  if (!UPLOAD_URL.test(map.url)) return null;

  try {
    const res = await fetch(`${sources.roomServerUrl}${map.url}`, {
      redirect: "error",
      signal: AbortSignal.timeout(sources.readTimeoutMs ?? MAP_READ_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_MAP_BYTES) return null;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/** Also drops what XML can't carry at all, which a token's name may hold and would fail the whole drawing. */
const escapeXml = (text: string) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Grid squares that touch the map, as get_view numbers them. */
function squaresOn(length: number, offset: number, cellSize: number) {
  return { first: Math.floor(-offset / cellSize), last: Math.floor((length - 1 - offset) / cellSize) };
}

interface OverlayInput {
  state: RoomState;
  you: Participant;
  map: MapImage;
  width: number;
  height: number;
}

/**
 * Everything drawn over the map, at the output's size: the masks first, so that nothing a seat
 * can't see shows through, then the grid, the labels and the tokens the seat's filtered state holds.
 */
export function mapOverlay({ state, you, map, width, height }: OverlayInput): Buffer {
  const { grid } = state.scene;
  const scaleX = width / map.width;
  const scaleY = height / map.height;
  const points = (list: readonly Point[]) => list.map((p) => `${p.x * scaleX},${p.y * scaleY}`).join(" ");
  const parts: string[] = [];

  // With line of sight on and no polygons, the seat sees nothing: fail closed.
  const sight = state.sight ?? (state.scene.lineOfSight ? [] : null);
  if (sight) {
    parts.push(
      `<mask id="sight" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>`,
      ...sight.map((polygon) => `<polygon points="${points(polygon)}" fill="black"/>`),
      `</mask><rect width="${width}" height="${height}" fill="${MASK_COLOR}" mask="url(#sight)"/>`,
    );
  }
  for (const region of Object.values(state.fog)) parts.push(`<polygon points="${points(region.points)}" fill="${MASK_COLOR}"/>`);

  const cellX = grid.cellSize * scaleX;
  const cellY = grid.cellSize * scaleY;
  const columns = squaresOn(map.width, grid.offsetX, grid.cellSize);
  const rows = squaresOn(map.height, grid.offsetY, grid.cellSize);
  const lineX = (column: number) => (grid.offsetX + column * grid.cellSize) * scaleX;
  const lineY = (row: number) => (grid.offsetY + row * grid.cellSize) * scaleY;

  if (cellX >= 6 && cellY >= 6) {
    let lines = "";
    for (let column = columns.first + 1; column <= columns.last; column++) lines += `M${lineX(column)} 0V${height}`;
    for (let row = rows.first + 1; row <= rows.last; row++) lines += `M0 ${lineY(row)}H${width}`;
    parts.push(`<path d="${lines}" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" fill="none"/>`);
  }

  // Dark outlined text, so a label reads on any map. Fewer labels when squares are small.
  const text = `font-family="DejaVu Sans, Verdana, sans-serif" font-size="12" fill="#ffffff" stroke="#000000" stroke-width="3" paint-order="stroke"`;
  const everyColumn = Math.max(1, Math.ceil(24 / cellX));
  const everyRow = Math.max(1, Math.ceil(16 / cellY));
  for (let column = columns.first; column <= columns.last; column++) {
    if (column % everyColumn === 0) parts.push(`<text x="${Math.max(10, lineX(column) + cellX / 2)}" y="13" text-anchor="middle" ${text}>${column}</text>`);
  }
  for (let row = rows.first; row <= rows.last; row++) {
    if (row % everyRow === 0) parts.push(`<text x="3" y="${Math.max(13, lineY(row) + cellY / 2 + 4)}" ${text}>${row}</text>`);
  }

  for (const token of Object.values(state.tokens)) {
    const x = token.position.x * scaleX;
    const y = token.position.y * scaleY;
    const radius = Math.max(5, (token.size * Math.min(cellX, cellY)) / 2 - 2);
    const yours = token.ownerIds.includes(you.id);
    const { column, row } = squareOfToken(token.position, token.size, grid);
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${radius}" fill="${token.color}" fill-opacity="0.65" stroke="${yours ? "#ffe066" : "#ffffff"}" stroke-width="${yours ? 3 : 2}"/>`,
      `<text x="${x}" y="${y + radius + 12}" text-anchor="middle" ${text}>${escapeXml(`${token.name.slice(0, 16)} (${column},${row})`)}</text>`,
    );
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`);
}

/**
 * The masks are in board coordinates, and the board draws the picture at its own size from the corner,
 * never stretched. So a picture of any other size than the room stored would slide out from under
 * them, which `scene.setMap` allows because it takes the size on trust. Browsers also disagree about
 * a WebP's rotation tag, so what a player sees can't be known for one that has it. Both fail closed.
 */
function sitsUnderTheMasks(info: Metadata, map: MapImage) {
  const orientation = info.orientation ?? 1;
  if (info.format === "webp" && orientation > 1) return false;
  // Tags 5 to 8 turn the picture on its side.
  const [width, height] = orientation >= 5 ? [info.height, info.width] : [info.width, info.height];
  return width === map.width && height === map.height;
}

let rendersRunning = 0;
const rendersWaiting: (() => void)[] = [];

/** At most two renders at once, since each briefly holds a whole decoded map. The rest take turns. */
async function oneOfFewRenders<T>(fn: () => Promise<T>): Promise<T> {
  if (rendersRunning >= MAX_RENDERS_AT_ONCE) await new Promise<void>((resolve) => rendersWaiting.push(resolve));
  else rendersRunning++;
  try {
    return await fn();
  } finally {
    const next = rendersWaiting.shift();
    if (next) next();
    else rendersRunning--;
  }
}

/**
 * `get_map_image`, per seat. Fog is otherwise painted by each browser over the raw picture, so this
 * has to paint it here. The masks and the map are one pipeline: if the overlay can't be used, the
 * whole render fails, and there is no path that returns the picture without them.
 */
export async function renderMapImage(state: RoomState, you: Participant, sources: MapSources, overlayFor = mapOverlay): Promise<RenderedMap> {
  const map = state.scene.map;
  if (!map) return NO_MAP;
  if (map.width * map.height > MAX_MAP_PIXELS) return TOO_LARGE;

  return oneOfFewRenders(async () => {
    const file = await readMapFile(map, sources);
    if (!file) return UNAVAILABLE;
    const info = await sharp(file, { limitInputPixels: false }).metadata().catch(() => null);
    if (!info?.format || !MAP_FORMATS.has(info.format)) return UNAVAILABLE;
    if ((info.width ?? 0) * (info.height ?? 0) > MAX_MAP_PIXELS) return TOO_LARGE;
    if (!sitsUnderTheMasks(info, map)) return UNAVAILABLE;

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(map.width, map.height));
    const width = Math.max(1, Math.round(map.width * scale));
    const height = Math.max(1, Math.round(map.height * scale));
    try {
      const data = await sharp(file, { limitInputPixels: MAX_MAP_PIXELS })
        // As a browser shows it. `sitsUnderTheMasks` has already said that this size is the board's.
        .rotate()
        .resize(width, height, { fit: "fill" })
        .flatten({ background: BACKGROUND })
        .composite([{ input: overlayFor({ state, you, map, width, height }), top: 0, left: 0 }])
        .jpeg({ quality: 82 })
        .toBuffer();
      return {
        kind: "image",
        data,
        mimeType: "image/jpeg",
        columns: squaresOn(map.width, state.scene.grid.offsetX, state.scene.grid.cellSize),
        rows: squaresOn(map.height, state.scene.grid.offsetY, state.scene.grid.cellSize),
      };
    } catch {
      throw new ToolError(MASK_FAILED);
    }
  });
}
