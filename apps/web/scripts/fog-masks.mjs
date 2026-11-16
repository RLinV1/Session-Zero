/**
 * Writes the alpha masks the home page's fog dividers draw with (public/img/fog/mask). The fog art
 * is grey on black with no alpha (public/img/fog/CREDITS.md), and a CSS luminance mask would turn
 * that brightness into opacity, but WebKit on iOS ignores `mask-mode: luminance` and draws each
 * wisp as a solid box. So the brightness is baked into the alpha channel of a white image here,
 * and the page masks with alpha, which every browser supports. The board keeps the original art.
 *
 * Run by hand after replacing a wisp: `npm run images:fog -w @vtt/web`. The outputs are committed.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const SOURCE_DIR = root("public/img/fog");
const OUT_DIR = root("public/img/fog/mask");
const WISPS = ["fog-wisp-1", "fog-wisp-2", "fog-wisp-3", "fog-wisp-4"];

await mkdir(OUT_DIR, { recursive: true });
for (const name of WISPS) {
  const source = sharp(`${SOURCE_DIR}/${name}.webp`);
  const { width, height } = await source.metadata();
  const alpha = await source.clone().greyscale().extractChannel(0).raw().toBuffer();
  const info = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .webp({ quality: 50, alphaQuality: 50, effort: 6 })
    .toFile(`${OUT_DIR}/${name}.webp`);
  console.log(`  mask/${name}.webp: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
}
