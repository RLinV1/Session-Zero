import { CanvasSource, ImageSource, Rectangle, Texture } from "pixi.js";
import { PUFF_ART, WISP_ART } from "./fogPuffs";

/**
 * The painted fog (`public/img/fog`, see CREDITS.md there): the seamless fog bank the shader reads
 * (`fogShader.ts`), and the puffs and wisps, packed into one atlas so a single `ParticleContainer`
 * draws them all. Each picture is grey on black; in the atlas its brightness becomes opacity over
 * white, so a particle's tint is its colour.
 */

export const fogArtUrl = (name: string) => `/img/fog/${name}.webp`;

export interface FogArt {
  bank: Texture;
  puffs: Texture[];
  wisps: Texture[];
}

/** Puffs are packed at this side, wisps at this width; the atlas is as wide as eight puffs. */
const PUFF_SIDE = 256;
const WISP_WIDTH = 512;
const ATLAS_WIDTH = PUFF_ART * PUFF_SIDE;
const GAP = 2;

let art: FogArt | null = null;
let loading: Promise<FogArt | null> | null = null;

/** The fog art once it has loaded; null before then or if it failed. */
export function fogArt(): FogArt | null {
  return art;
}

/**
 * Loads the fog art once for every board. Resolves null if any picture failed; the next call
 * tries again, and until then the board draws its procedural fog without particles.
 */
export function loadFogArt(): Promise<FogArt | null> {
  if (art) return Promise.resolve(art);
  loading ??= build().then(
    (built) => {
      art = built;
      return built;
    },
    () => {
      loading = null;
      return null;
    },
  );
  return loading;
}

async function build(): Promise<FogArt> {
  const names = [
    "fog-bank",
    ...Array.from({ length: PUFF_ART }, (_, i) => `fog-puff-${i + 1}`),
    ...Array.from({ length: WISP_ART }, (_, i) => `fog-wisp-${i + 1}`),
  ];
  const [bankImage, ...sprites] = await Promise.all(names.map(loadImage));
  const bank = new Texture({
    source: new ImageSource({ resource: bankImage!, addressMode: "repeat", autoGenerateMipmaps: true, label: "fog-bank" }),
  });
  const puffImages = sprites.slice(0, PUFF_ART);
  const wispImages = sprites.slice(PUFF_ART);
  const wispHeights = wispImages.map((img) => Math.round((WISP_WIDTH * img.naturalHeight) / Math.max(1, img.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = PUFF_SIDE + GAP + Math.max(...wispHeights);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context for the fog atlas");
  const frames: Rectangle[] = [];
  puffImages.forEach((img, i) => {
    const frame = new Rectangle(i * PUFF_SIDE + GAP / 2, GAP / 2, PUFF_SIDE - GAP, PUFF_SIDE - GAP);
    ctx.drawImage(img, frame.x, frame.y, frame.width, frame.height);
    frames.push(frame);
  });
  wispImages.forEach((img, i) => {
    const frame = new Rectangle(i * WISP_WIDTH + GAP / 2, PUFF_SIDE + GAP, WISP_WIDTH - GAP, wispHeights[i]!);
    ctx.drawImage(img, frame.x, frame.y, frame.width, frame.height);
    frames.push(frame);
  });
  // Grey on black to white mist whose brightness is its opacity.
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i + 3] = image.data[i]!;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, label: "fog-atlas" });
  const textures = frames.map((frame) => new Texture({ source, frame }));
  return { bank, puffs: textures.slice(0, PUFF_ART), wisps: textures.slice(PUFF_ART) };
}

function loadImage(name: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = fogArtUrl(name);
  return img.decode().then(() => img);
}
