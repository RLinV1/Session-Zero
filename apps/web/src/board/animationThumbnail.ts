import { Application, Container, Graphics } from "pixi.js";
import type { AnimationDef, AnimationShape } from "@vtt/shared";
import { playNuke, playStrike, type FxHost } from "./fx";
import { loadFxTextures } from "./fxTextures";
import { STAGE_TOKEN_RADIUS, drawStageBackdrop, drawStageGrid, drawStandIn, loadStageArt } from "./animationPreview";
import { STAGE_CELL, standInPositions } from "./previewStage";

/**
 * Library card thumbnails (ADR 0038): one still frame per animation, rendered by the same `fx.ts`
 * as the board, turned into a data URL and cached by definition. A single offscreen Pixi
 * application serves every thumbnail, one at a time; it is created on first use and destroyed
 * when the library tab no longer needs it. Nothing here knows about React or rooms.
 */

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 180;
/** The logical stage the effect is drawn on, as in the editor's preview (the image is this, scaled down). */
const LOGICAL_WIDTH = 360;
const LOGICAL_HEIGHT = 270;
/** The renderer's background, which a read-back still leaves out. */
const STAGE_BACKGROUND = "#14171b";
/** Step of the fast-forward to the still frame; particles need a few small steps to appear. */
const STEP_S = 1 / 30;

/** How far into the animation its most recognisable frame is: after the strike lands, before it fades. */
const PEAK: Record<AnimationShape, number> = {
  slash: 0.5, pierce: 0.5, claw: 0.5, whirlwind: 0.5, slam: 0.6, shadow: 0.6,
  projectile: 0.45, arrow: 0.5, volley: 0.45, dagger: 0.45, fireball: 0.42, meteor: 0.46, explosion: 0.68,
  bolt: 0.5, chain: 0.5, beam: 0.5, frost: 0.55, poison: 0.75, smite: 0.68, sonic: 0.5, tornado: 0.6,
  nuke: 0.5,
};

/** The moment, in seconds from the start, that the thumbnail shows. */
export function thumbnailTime(def: AnimationDef): number {
  return def.duration * PEAK[def.shape];
}

/** What identifies a thumbnail: the whole definition, since every field changes the picture. */
export function thumbnailKey(def: AnimationDef): string {
  return JSON.stringify(def);
}

/**
 * A cache of thumbnails by definition. `render` makes one image (or null when it cannot); requests
 * for a definition already being rendered share that render, and renders run one at a time.
 * A failed render is not remembered, so a later request tries again.
 */
export function createThumbnailCache(render: (def: AnimationDef) => Promise<string | null>, limit = 160) {
  const done = new Map<string, string>();
  const pending = new Map<string, Promise<string | null>>();
  let chain: Promise<unknown> = Promise.resolve();
  return {
    /** The image if it is already made. */
    peek: (def: AnimationDef): string | undefined => done.get(thumbnailKey(def)),
    get(def: AnimationDef): Promise<string | null> {
      const key = thumbnailKey(def);
      const known = done.get(key);
      if (known) {
        done.delete(key);
        done.set(key, known);
        return Promise.resolve(known);
      }
      const running = pending.get(key);
      if (running) return running;
      const job = chain.then(() => render(def)).then(
        (url) => {
          pending.delete(key);
          if (url) {
            done.set(key, url);
            while (done.size > limit) done.delete(done.keys().next().value!);
          }
          return url;
        },
        () => {
          pending.delete(key);
          return null;
        },
      );
      pending.set(key, job);
      chain = job;
      return job;
    },
    size: () => done.size,
    whenIdle: () => chain.then(() => {}),
  };
}

/** The one offscreen renderer; null until first use, and after `releaseThumbnailRenderer`. */
let rendererPromise: Promise<Rig | null> | null = null;
let readers = 0;

interface Rig {
  app: Application;
  world: Container;
  fxLayer: Container;
}

async function createRig(): Promise<Rig | null> {
  const app = new Application();
  // Without the art the stills fall back to the plain grid and discs, like the editor's preview;
  // without the effect textures, to the vector look.
  const [art] = await Promise.all([loadStageArt(), loadFxTextures()]);
  try {
    await app.init({ width: THUMB_WIDTH, height: THUMB_HEIGHT, background: STAGE_BACKGROUND, antialias: true, resolution: 1, autoStart: false });
  } catch {
    return null;
  }
  const world = new Container();
  const fxLayer = new Container();
  world.scale.set(THUMB_WIDTH / LOGICAL_WIDTH);
  const { attacker, target } = standInPositions(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  // Library cards always show the default stage; the GM's own art is the editor preview's alone.
  const a = drawStandIn("attacker", art?.attacker ?? null);
  const t = drawStandIn("target", art?.target ?? null);
  a.position.set(attacker.x, attacker.y);
  t.position.set(target.x, target.y);
  if (art) world.addChild(drawStageBackdrop(art.arena, LOGICAL_WIDTH, LOGICAL_HEIGHT));
  // The still is read back without the renderer's background, and the effect textures add their
  // black square to whatever lies under them: without the map they need the stage colour there.
  else world.addChild(new Graphics().rect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).fill(STAGE_BACKGROUND));
  world.addChild(drawStageGrid(LOGICAL_WIDTH, LOGICAL_HEIGHT, art ? 0.055 : 0.08), a, t, fxLayer);
  app.stage.addChild(world);
  return { app, world, fxLayer };
}

async function renderStill(def: AnimationDef): Promise<string | null> {
  if (readers === 0) return null;
  // Yield between cards so making a shelf of stills never monopolises input or painting.
  await new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 120 });
    else window.setTimeout(resolve, 0);
  });
  if (readers === 0) return null;
  rendererPromise ??= createRig();
  const rig = await rendererPromise;
  if (!rig) {
    rendererPromise = null;
    return null;
  }
  const { attacker, target } = standInPositions(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const host: FxHost = {
    layer: rig.fxLayer,
    shakeTarget: rig.world,
    filterTarget: rig.app.stage,
    screen: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
    reducedMotion: false,
  };
  const run =
    def.shape === "nuke"
      ? playNuke({ ...host, layer: rig.app.stage }, { def, origin: { x: THUMB_WIDTH / 2, y: THUMB_HEIGHT / 2 }, unit: STAGE_CELL, extent: Math.hypot(THUMB_WIDTH, THUMB_HEIGHT) / 2 })
      : playStrike(host, { def, from: attacker, to: target, radius: STAGE_TOKEN_RADIUS });
  try {
    const peak = thumbnailTime(def);
    for (let t = 0; t < peak; t += STEP_S) run.update(t);
    run.update(peak);
    rig.app.render();
    return await rig.app.renderer.extract.base64({ target: rig.app.stage, frame: rig.app.screen, format: "png" });
  } finally {
    run.destroy();
    rig.world.position.set(0, 0);
  }
}

const cache = createThumbnailCache(renderStill);

/** The thumbnail of `def` as an image URL, or null when this browser cannot render it (no WebGL). */
export const animationThumbnail = (def: AnimationDef): Promise<string | null> => cache.get(def);

/** The thumbnail if it has been made already. */
export const cachedAnimationThumbnail = (def: AnimationDef): string | undefined => cache.peek(def);

/** The library owns one lease; Strict Mode and quick tab switches can safely overlap leases. */
export function retainThumbnailRenderer(): () => void {
  readers++;
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    readers--;
    if (readers === 0) releaseThumbnailRenderer();
  };
}

/** Waits for extraction to finish before freeing the context. Cached images need no renderer. */
export function releaseThumbnailRenderer() {
  void cache.whenIdle().then(async () => {
    if (readers > 0) return;
    const pending = rendererPromise;
    rendererPromise = null;
    const rig = await pending;
    rig?.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
  });
}
