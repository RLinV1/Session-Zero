/**
 * Converts the generated ambient pictures (public/img/ambient/CREDITS.md) to the WebP files the
 * app serves, and writes the blurred entry-page variants. Run by hand after adding or replacing
 * one: `npm run images:ambient -w @vtt/web`. Sources go in scripts/ambient-src/ (not committed);
 * the outputs are committed, so nothing else needs `sharp`.
 *
 * Each image is cropped to its shape, never enlarged, and re-encoded at falling quality until it
 * fits its budget. A source that cannot fit at the lowest quality fails the run, so an oversized
 * picture never ships silently. A missing source is skipped with a note.
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const SOURCE_DIR = process.env.AMBIENT_SRC ?? root("scripts/ambient-src");
const OUT_DIR = process.env.AMBIENT_OUT ?? root("public/img/ambient");

const KB = 1024;
/** The largest each image is kept at, its crop focus, and its size budget. */
const IMAGES = [
  { name: "table-dark", width: 2560, height: 1440, budget: 300 * KB, blur: true },
  { name: "table-light", width: 2560, height: 1440, budget: 300 * KB, blur: true },
  { name: "closing", width: 2400, height: 1000, budget: 300 * KB },
  { name: "empty-rooms", width: 800, height: 600, budget: 80 * KB },
  { name: "empty-library", width: 800, height: 600, budget: 80 * KB },
  { name: "empty-map", width: 800, height: 600, budget: 80 * KB },
  { name: "wood-tile", width: 1024, height: 1024, budget: 120 * KB },
];
/** The entry pages show the table behind a card: small, soft and dim is all it needs to be. */
const BLUR = { width: 1280, height: 720, sigma: 18, budget: 300 * KB };
const QUALITIES = [82, 76, 70, 64, 58, 52, 46, 40];

async function sourceFor(name) {
  const files = await readdir(SOURCE_DIR).catch(() => []);
  const file = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f) && f.replace(/\.[^.]+$/, "") === name);
  return file ? `${SOURCE_DIR}/${file}` : null;
}

/** The same crop at falling quality until it fits; returns the quality used and the bytes. */
async function encode(pipeline, out, budget) {
  for (const quality of QUALITIES) {
    const info = await pipeline.clone().webp({ quality, effort: 6 }).toFile(out);
    if (info.size <= budget) return { quality, size: info.size, width: info.width, height: info.height };
  }
  const { size } = await stat(out);
  throw new Error(`${out} is ${Math.round(size / KB)} KB at quality ${QUALITIES.at(-1)}, over its ${Math.round(budget / KB)} KB budget`);
}

const report = (file, r) =>
  console.log(`  ${file}: ${r.width}x${r.height}, ${Math.round(r.size / KB)} KB at quality ${r.quality}`);

await mkdir(OUT_DIR, { recursive: true });
let made = 0;
const missing = [];
for (const image of IMAGES) {
  const source = await sourceFor(image.name);
  if (!source) {
    missing.push(image.name);
    continue;
  }
  // Cover the target shape (cropping, centred), but never upscale a smaller download.
  const shaped = sharp(source).resize({ width: image.width, height: image.height, fit: "cover", position: "centre", withoutEnlargement: true });
  report(`${image.name}.webp`, await encode(shaped, `${OUT_DIR}/${image.name}.webp`, image.budget));
  made++;
  if (image.blur) {
    const blurred = sharp(source)
      .resize({ width: BLUR.width, height: BLUR.height, fit: "cover", position: "centre", withoutEnlargement: true })
      .blur(BLUR.sigma);
    report(`${image.name}-blur.webp`, await encode(blurred, `${OUT_DIR}/${image.name}-blur.webp`, BLUR.budget));
    made++;
  }
}
console.log(`${made} file(s) written to ${OUT_DIR}`);
if (missing.length) console.log(`No source yet for: ${missing.join(", ")} (expected in ${SOURCE_DIR})`);
