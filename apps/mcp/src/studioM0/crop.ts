import { randomBytes, randomInt } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { StudioError, type StudioFile } from "./store";

/**
 * M0 ONLY (task 1.5): a crop of the map with one marker drawn ONLY into the returned pixels. Its
 * shape and color are chosen here and written to a private answer key (mode 0600, ignored by Git);
 * they never appear in tool text, structured content, metadata or logs. The model can only name
 * them by seeing the image. This tests visual delivery, not map accuracy.
 */

const SHAPES = ["circle", "square", "triangle"] as const;
const COLORS = { red: "#e0201b", green: "#16a34a", blue: "#1d4ed8", magenta: "#c026d3" } as const;
const MAX_EDGE = 1024;

export interface CropRequest {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CropResult {
  cropId: string;
  crop: { x: number; y: number; width: number; height: number };
  output: { width: number; height: number };
  png: Buffer;
}

export async function renderMarkedCrop(file: StudioFile, request: CropRequest, answerKeyFile: string, label: string): Promise<CropResult> {
  const x = Math.max(0, Math.floor(request.x ?? 0));
  const y = Math.max(0, Math.floor(request.y ?? 0));
  const width = Math.min(Math.floor(request.width ?? file.width - x), file.width - x);
  const height = Math.min(Math.floor(request.height ?? file.height - y), file.height - y);
  if (width < 32 || height < 32) throw new StudioError("The crop must be at least 32 pixels on each side and inside the map.");

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const out = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const shape = SHAPES[randomInt(SHAPES.length)] ?? "circle";
  const colorNames = Object.keys(COLORS) as (keyof typeof COLORS)[];
  const colorName = colorNames[randomInt(colorNames.length)] ?? "red";
  const size = Math.max(24, Math.round(Math.min(out.width, out.height) * 0.12));
  const cx = randomInt(size, out.width - size);
  const cy = randomInt(size, out.height - size);
  const fill = COLORS[colorName];
  const mark = shape === "circle"
    ? `<circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="${fill}" stroke="#000" stroke-width="2"/>`
    : shape === "square"
      ? `<rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="${fill}" stroke="#000" stroke-width="2"/>`
      : `<polygon points="${cx},${cy - size / 2} ${cx + size / 2},${cy + size / 2} ${cx - size / 2},${cy + size / 2}" fill="${fill}" stroke="#000" stroke-width="2"/>`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}">${mark}</svg>`);

  const png = await sharp(file.bytes).rotate().extract({ left: x, top: y, width, height })
    .resize(out.width, out.height, { fit: "fill" }).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
  const cropId = `crop_${randomBytes(6).toString("hex")}`;
  await mkdir(path.dirname(answerKeyFile), { recursive: true });
  await appendFile(answerKeyFile, `${JSON.stringify({ at: new Date().toISOString(), cropId, label, shape, color: colorName, centerOut: { x: cx, y: cy }, centerSource: { x: x + cx / scale, y: y + cy / scale } })}\n`, { mode: 0o600 });
  return { cropId, crop: { x, y, width, height }, output: out, png };
}

/** A PNG of noise close to `targetBytes`, for measuring how large an app-only media result can be (E6). */
export async function renderProbeImage(targetBytes: number): Promise<Buffer> {
  // Random RGB pixels barely compress, so bytes ≈ 3 × pixels.
  const side = Math.max(16, Math.ceil(Math.sqrt(targetBytes / 3)));
  const raw = randomBytes(side * side * 3);
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}
