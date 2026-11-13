import { Assets, Container, Sprite, type Texture } from "pixi.js";
import type { Point } from "@vtt/shared";

/**
 * The painted effect textures (`public/img/fx`, see CREDITS.md there) and the sprites that draw
 * them. Each texture is grey on black, without alpha: a sprite tints it with the animation's
 * colours and draws it additively, where black adds nothing, so it needs an opaque picture under
 * it. A texture that has not loaded, or failed to, is simply missing, and every caller then draws
 * its vector look instead (`stamp`, `oval`, `span` and `arc` return false).
 */

export const FX_ART = [
  "slash-arc", "glow", "impact-burst", "shockwave-ring", "smoke-puff", "energy-streak", "lightning", "ice-shard",
  "fire-billow", "fireball-flight", "explosion-blast", "beam", "sonic-wave", "tornado", "dagger",
  "shadow-wisp", "shadow-wraith", "arrow", "arcane-orb", "toxic-cloud", "mushroom-cloud",
  "particle-spark", "particle-star", "particle-square", "particle-shard", "particle-ring", "tnt",
  "poison-vial", "poison-splash", "poison-bubble", "poison-drop", "poison-puddle", "skull-wisp",
  "dust-swirl", "debris-1", "debris-2", "debris-3", "debris-4",
  "nuke-bomb", "nuke-billow", "blast-wave", "holy-sigil", "holy-pillar", "pierce-blade",
] as const;
export type FxArt = (typeof FX_ART)[number];

export const fxArtUrl = (name: FxArt) => `/img/fx/${name}.webp`;

/**
 * Where the drawing sits inside each picture, as shares of its side (measured from the files).
 * A ring's radius; for the arc-shaped pictures, the circle the arc is a part of and the angle its
 * middle bulges towards; the two ends of the long pictures, which run from left to right.
 */
export const RING_RADIUS = 0.313;
export const ARCS: Partial<Record<FxArt, { x: number; y: number; radius: number; bulge: number }>> = {
  "slash-arc": { x: 0.538, y: 0.414, radius: 0.354, bulge: (136 * Math.PI) / 180 },
  "sonic-wave": { x: 0.432, y: 0.498, radius: 0.338, bulge: (2 * Math.PI) / 180 },
};
export const ART_ENDS: Partial<Record<FxArt, { from: Point; to: Point }>> = {
  "energy-streak": { from: { x: 0.1, y: 0.5 }, to: { x: 0.844, y: 0.495 } },
  lightning: { from: { x: 0.047, y: 0.373 }, to: { x: 0.965, y: 0.575 } },
  "ice-shard": { from: { x: 0.16, y: 0.5 }, to: { x: 0.91, y: 0.52 } },
  // Even along its length, so pieces laid end to end read as one beam.
  beam: { from: { x: 0.05, y: 0.5 }, to: { x: 0.95, y: 0.5 } },
  // From the end of the fletching to the arrowhead's tip.
  arrow: { from: { x: 0.05, y: 0.494 }, to: { x: 0.95, y: 0.494 } },
  // The pierce's blade (768 x 256): from the end of its grip to the glint on its point. The
  // speed streaks trail off to the left of `from`, behind the thrust.
  "pierce-blade": { from: { x: 0.06, y: 0.486 }, to: { x: 0.952, y: 0.486 } },
};
/** The pierce blade's picture is three times as wide as it is tall. */
export const PIERCE_BLADE_ASPECT = 3;
/** The tornado's tip, which sits on the ground: its picture is anchored there. */
export const TORNADO_TIP = { x: 0.5, y: 0.96 };
/** The mushroom cloud: the foot of its column (anchored on the ground), the top of its cap, and its cap's width. */
export const MUSHROOM = { base: { x: 0.5, y: 0.92 }, top: 0.05, width: 0.87 };
/**
 * The TNT bundle, the one picture in colour with its own transparency, drawn plainly over the
 * effect (a `StampLayer` made with `"normal"`): the middle of the bundle, which it turns about,
 * the tip of its fuse, and the bundle's height.
 */
export const TNT = { centre: { x: 0.48, y: 0.55 }, fuse: { x: 0.83, y: 0.09 }, height: 0.81 };
/** The poison bottle, greyscale with its own transparency and tinted, drawn like the TNT: its middle and height. */
export const POISON_VIAL = { centre: { x: 0.5, y: 0.55 }, height: 0.94 };
/** The venom drop hangs straight down: the middle of its round end, and its length. */
export const POISON_DROP = { bulb: { x: 0.49, y: 0.8 }, length: 0.92 };
/** The skull wisp: the middle of the skull's face, and how tall the whole wisp stands. */
export const SKULL_WISP = { face: { x: 0.5, y: 0.32 }, height: 0.92 };
/** Chunks of rubble a tornado lifts: greyscale with their own transparency, tinted and drawn plainly. */
export const DEBRIS: readonly FxArt[] = ["debris-1", "debris-2", "debris-3", "debris-4"];
/** The nuke's falling bomb (coloured, with transparency): how much of its picture's height it fills, nose down. */
export const NUKE_BOMB = { height: 0.96, nose: 0.975 };
/** The holy circle: its outer ring's radius, as a share of its picture's side. */
export const HOLY_SIGIL_RADIUS = 0.44;
/** The pillar of holy light: where it meets the ground, and how much of its picture's height it stands. */
export const HOLY_PILLAR = { foot: { x: 0.5, y: 0.9 }, height: 0.88 };
/** The blast wave, seen at a slant: how far its bright front reaches across and down its picture from the middle. */
export const BLAST_WAVE = { across: 0.41, down: 0.285 };

const loaded = new Map<FxArt, Texture>();
let loading: Promise<void> | null = null;

/**
 * Loads every texture once for every board and preview. Resolves when each has loaded or failed;
 * if any failed, the next call tries those again.
 */
export function loadFxTextures(): Promise<void> {
  loading ??= Promise.all(
    FX_ART.map((name) =>
      Assets.load<Texture>({ src: fxArtUrl(name), data: { autoGenerateMipmaps: true } }).then(
        (texture) => {
          loaded.set(name, texture);
          return true;
        },
        () => false,
      ),
    ),
  ).then((ok) => {
    if (ok.includes(false)) loading = null;
  });
  return loading;
}

/** The texture once it has loaded; null before then or if it failed. */
export function fxTexture(name: FxArt): Texture | null {
  return loaded.get(name) ?? null;
}

/** Sprites one effect may show at once; past this a frame draws no more. */
export const MAX_STAMPS = 192;

/**
 * Reusable sprites for one playing effect, additive unless made `"normal"` (for the coloured
 * pictures with transparency). Each frame calls `begin`, draws, then `end`, which hides what the
 * frame did not use. Destroying the container never destroys the shared textures.
 */
export class StampLayer {
  readonly container = new Container();
  private sprites: Sprite[] = [];
  private used = 0;

  constructor(private readonly blend: "add" | "normal" = "add") {
    this.container.eventMode = "none";
  }

  begin() {
    this.used = 0;
  }

  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }

  /** `texture` at `x, y`, `width` by `height` (a negative height mirrors it), anchored at `ax, ay`. */
  draw(texture: Texture, x: number, y: number, width: number, height: number, rotation: number, ax: number, ay: number, tint: number, alpha: number) {
    if (this.used >= MAX_STAMPS || alpha <= 0.005) return;
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.blendMode = this.blend;
      this.container.addChild(sprite);
      this.sprites.push(sprite);
    }
    this.used++;
    sprite.texture = texture;
    sprite.anchor.set(ax, ay);
    sprite.position.set(x, y);
    sprite.rotation = rotation;
    sprite.scale.set(width / texture.width, height / texture.height);
    sprite.tint = tint;
    sprite.alpha = Math.min(1, alpha);
    sprite.visible = true;
  }
}

/** Picture `name` centred on `at`, `size` across. False when it has not loaded: draw the vector look. */
export function stamp(layer: StampLayer, name: FxArt, at: Point, size: number, tint: number, alpha: number, rotation = 0): boolean {
  const texture = fxTexture(name);
  if (!texture) return false;
  layer.draw(texture, at.x, at.y, size, size, rotation, 0.5, 0.5, tint, alpha);
  return true;
}

/**
 * Picture `name` squeezed to `width` by `height` (a negative size mirrors it), with its point
 * `anchor` (shares of its side, the centre unless given) on `at`. False when not loaded.
 */
export function oval(layer: StampLayer, name: FxArt, at: Point, width: number, height: number, tint: number, alpha: number, rotation = 0, anchor: Point = { x: 0.5, y: 0.5 }): boolean {
  const texture = fxTexture(name);
  if (!texture) return false;
  layer.draw(texture, at.x, at.y, width, height, rotation, anchor.x, anchor.y, tint, alpha);
  return true;
}

/**
 * A long picture stretched so its drawing runs from `a` to `b`, `height` across. `flip` mirrors
 * it, which makes a jagged picture look different from frame to frame. False when not loaded.
 */
export function span(layer: StampLayer, name: FxArt, a: Point, b: Point, height: number, tint: number, alpha: number, flip = false): boolean {
  const texture = fxTexture(name);
  const ends = ART_ENDS[name];
  if (!texture || !ends) return false;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1) return true;
  const du = ends.to.x - ends.from.x;
  // The drawing may slope inside its picture: tilt the sprite back so its ends land on `a` and `b`.
  const rise = Math.min((ends.to.y - ends.from.y) * height, length * 0.9) * (flip ? -1 : 1);
  const width = Math.sqrt(length * length - rise * rise) / du;
  const rotation = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(rise, du * width);
  layer.draw(texture, a.x, a.y, width, flip ? -height : height, rotation, ends.from.x, ends.from.y, tint, alpha);
  return true;
}

/**
 * An arc-shaped picture (`ARCS`) laid on a circle around `centre` of `radius`, bulging towards
 * `toward` (radians); `side` -1 mirrors it. `squash` below 1 narrows it across its bulge, for a
 * picture that bulges along its width (the sonic wave). False when not loaded.
 */
export function arc(layer: StampLayer, name: FxArt, centre: Point, radius: number, toward: number, side: number, tint: number, alpha: number, squash = 1): boolean {
  const texture = fxTexture(name);
  const shape = ARCS[name];
  if (!texture || !shape) return false;
  const size = radius / shape.radius;
  layer.draw(texture, centre.x, centre.y, size, size * side * squash, toward - side * shape.bulge, shape.x, shape.y, tint, alpha);
  return true;
}
