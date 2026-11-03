/**
 * Cuts the home page's map crops and thumbnails. Run by hand after a map changes:
 * `npm run maps:home -w @vtt/web`. The outputs are committed, so nothing else needs `sharp`.
 *
 * - `maps`: the home page's own maps (generated for it; sources in scripts/home-src, prompts in
 *   public/img/home/CREDITS.md). Each crop is 20 squares wide, starts on a grid intersection and
 *   comes out at 1400 x 788, so every crop has exact 70 px squares from its top-left corner
 *   whatever the source's squares were. A source whose squares aren't quite square (`cellY`) is
 *   scaled on each axis on its own. Each also gets a whole-map thumbnail for the library strip.
 * - `builtinThumbs`: the library's thumbnails of the built-in maps (the crypt's comes from
 *   renderCryptMap.mjs instead).
 *
 * Check images with the grid drawn in red go to scripts/out/ for review.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
// The crop table is shared with the home page (src/pages/home/crops.ts), which places walls and
// tokens on these crops: one table, so the pictures and the geometry on them never disagree.
import crops from "../src/pages/home/homeCrops.json" with { type: "json" };

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const CROP = crops.crop;
const THUMB_WIDTH = crops.thumbWidth;
const SQUARE = CROP.width / CROP.squares;

/** An SVG of grid lines to lay over an image, for the check images only. */
function gridSvg(width, height, cellX, cellY, offX, offY) {
  const lines = [];
  for (let x = offX; x < width; x += cellX) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  for (let y = offY; y < height; y += cellY) lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<g stroke="#ff0000" stroke-width="1.5">${lines.join("")}</g></svg>`,
  );
}

async function check(buffer, out, cellX, cellY, offX, offY) {
  const { width, height } = await sharp(buffer).metadata();
  await sharp(buffer)
    .composite([{ input: gridSvg(width, height, cellX, cellY, offX, offY) }])
    .png()
    .toFile(root(`scripts/out/${out}`));
}

await mkdir(root("public/img/home"), { recursive: true });
await mkdir(root("scripts/out"), { recursive: true });

for (const m of crops.maps) {
  const source = root(m.source);
  const { width, height } = await sharp(source).metadata();
  if (width !== m.width || height !== m.height) throw new Error(`${m.slug}: the table says ${m.width}x${m.height}, the source is ${width}x${height}`);

  // Scale so one square is exactly 70 px on each axis, then take a whole-pixel crop from the
  // snapped origin.
  const scaleX = SQUARE / m.cell;
  const scaleY = SQUARE / m.cellY;
  const left = Math.round((m.offX + m.col * m.cell) * scaleX);
  const top = Math.round((m.offY + m.row * m.cellY) * scaleY);
  const crop = await sharp(source)
    .resize(Math.round(width * scaleX), Math.round(height * scaleY), { fit: "fill" })
    .extract({ left, top, width: CROP.width, height: CROP.height })
    .webp({ quality: 82 })
    .toBuffer();
  await sharp(crop).toFile(root(`public/img/home/${m.slug}.webp`));
  await check(crop, `${m.slug}.png`, SQUARE, SQUARE, 0, 0);

  const t = THUMB_WIDTH / width;
  const thumb = await sharp(source).resize(THUMB_WIDTH).webp({ quality: 80 }).toBuffer();
  await sharp(thumb).toFile(root(`public/img/home/${m.slug}-thumb.webp`));
  await check(thumb, `${m.slug}-thumb.png`, m.cell * t, m.cellY * t, m.offX * t, m.offY * t);

  console.log(`${m.slug}: crop at (${left}, ${top}) x${scaleX.toFixed(4)} y${scaleY.toFixed(4)}, thumbnail ${THUMB_WIDTH} wide`);
}

for (const m of crops.builtinThumbs) {
  const source = root(m.file);
  const { width } = await sharp(source).metadata();
  const t = THUMB_WIDTH / width;
  const thumb = await sharp(source).resize(THUMB_WIDTH).webp({ quality: 80 }).toBuffer();
  await sharp(thumb).toFile(root(`public/img/home/${m.slug}-thumb.webp`));
  await check(thumb, `${m.slug}-thumb.png`, m.cell * t, m.cell * t, m.offX * t, m.offY * t);
  console.log(`${m.slug}: library thumbnail ${THUMB_WIDTH} wide`);
}
