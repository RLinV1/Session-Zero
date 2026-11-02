import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { FxHost, NukeFxParams, RunningFx } from "./fx";
import { withDefaults } from "./effectPresets";
import { burst, clamp01, easeOut, hex, lerp, mix, ring, stepSparks, type Spark } from "./fxKit";
import { SparkRenderer } from "./fxParticles";
import { BLAST_WAVE, MUSHROOM, NUKE_BOMB, RING_RADIUS, StampLayer, fxTexture, oval, stamp } from "./fxTextures";
import { graphicsBudget } from "../ui/clientSettings";

import { NUKE_DROP_SHARE, NUKE_FALL_SHARE, nukeLayout } from "./fxBudget";

let fireTexture: Texture | null = null;
let smokeTexture: Texture | null = null;
/** One small baked fire billow. No per-frame paths, noise generation, blur or screen filters. */
function billowTexture(smoke = false): Texture {
  const cached = smoke ? smokeTexture : fireTexture;
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  const glow = ctx.createRadialGradient(88, 77, 6, 96, 96, 94);
  glow.addColorStop(0, smoke ? "#ad7950" : "#fffbd1");
  glow.addColorStop(0.2, smoke ? "#926040" : "#ffe784");
  glow.addColorStop(0.43, smoke ? "#6b4030" : "#ffb525");
  glow.addColorStop(0.66, smoke ? "#40251f" : "#ee4e0b");
  glow.addColorStop(0.82, smoke ? "#251b19" : "#7c200d");
  glow.addColorStop(1, "rgba(49,12,5,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 192, 192);
  // Seeded eddies give the fire texture a mottled surface instead of a flat white disc.
  let seed = 7831;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) {
    const x = 24 + random() * 144;
    const y = 24 + random() * 144;
    const r = 8 + random() * 25;
    const distance = Math.hypot(x - 96, y - 96) / 90;
    const eddy = ctx.createRadialGradient(x, y, 0, x, y, r);
    eddy.addColorStop(0, i % 3 || smoke ? `rgba(55,18,9,${0.12 + distance * 0.3})` : "rgba(255,250,183,0.35)");
    eddy.addColorStop(1, "rgba(90,15,0,0)");
    ctx.fillStyle = eddy;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Cut the eddies to the soft billow silhouette.
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(96, 96, 55, 96, 96, 94);
  mask.addColorStop(0, "#fff");
  mask.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 192, 192);
  const texture = Texture.from(canvas);
  if (smoke) smokeTexture = texture;
  else fireTexture = texture;
  return texture;
}

/**
 * Falling bomb, a brief flash, rolling orange fire, mushroom cap and drifting embers. Painted, the
 * bomb and the billows the mushroom is built from are ChatGPT's pictures (`fxTextures.ts`), and a
 * blast wave of dust and air races out across the ground ahead of the fire; without them, the
 * baked billows and drawn bomb below.
 */
export function playNuke(host: FxHost, params: NukeFxParams): RunningFx {
  const def = withDefaults(params.def);
  const { origin, extent, unit } = params;
  const root = new Container();
  root.eventMode = "none";
  host.layer.addChild(root);
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    root.destroy({ children: true });
  };
  // A static marker leaves the map readable and allocates no fire texture.
  if (host.reducedMotion) {
    root.addChild(new Graphics().circle(origin.x, origin.y, Math.max(22, unit)).stroke({ color: hex(def.primary), width: 4 }));
    params.onImpact?.();
    return { animated: false, duration: 0.8, update: (elapsed) => !destroyed && elapsed < 0.8, destroy };
  }

  const { cloudHeight: H, capWidth: W, baseDrop } = nukeLayout(host.screen.width, host.screen.height, def.size);
  const shade = new Graphics().rect(origin.x - extent, origin.y - extent, extent * 2, extent * 2).fill(0x410900);
  const flash = new Graphics().rect(origin.x - extent, origin.y - extent, extent * 2, extent * 2).fill(0xffedbd);
  shade.alpha = flash.alpha = 0;
  const waves = new Graphics();
  waves.label = "nuke-waves";
  // The painted starburst and shockwave rings (`fxTextures.ts`); the vector rings when not loaded.
  const glows = new StampLayer();
  glows.container.label = "nuke-glows";
  // The painted mushroom cloud, glowing over the billows.
  const cloudGlow = new StampLayer();
  cloudGlow.container.label = "nuke-cloud-glow";
  const cloud = new Container();
  cloud.label = "nuke-cloud";
  const particles = new SparkRenderer();
  const bomb = new Container();
  bomb.label = "nuke-bomb";
  root.addChild(shade, waves, glows.container, cloud, cloudGlow.container, particles.container, bomb, flash);
  const b = Math.min(38, Math.max(14, host.screen.height * 0.045));
  const body = new Graphics();
  // Tail fins, olive steel body, yellow warning band and a black radiation mark.
  body.poly([-b * 0.75, -b * 1.65, -b * 0.25, -b * 0.65, b * 0.25, -b * 0.65, b * 0.75, -b * 1.65, b * 0.2, -b * 1.4, -b * 0.2, -b * 1.4]).fill(0x919482);
  body.ellipse(0, -b * 0.35, b * 0.47, b).fill(0x555e43).stroke({ color: 0xd4d5af, width: 2 });
  body.roundRect(-b * 0.44, -b * 0.6, b * 0.88, b * 0.46, 2).fill(0xf6c542);
  body.circle(0, -b * 0.36, b * 0.09).fill(0x25281c);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    body.moveTo(0, -b * 0.36).arc(0, -b * 0.36, b * 0.22, a, a + 0.8).closePath().fill(0x25281c);
  }
  const bombArt = fxTexture("nuke-bomb");
  if (bombArt) {
    const sprite = new Sprite(bombArt);
    sprite.anchor.set(0.5, NUKE_BOMB.nose);
    sprite.height = (b * 2.6) / NUKE_BOMB.height;
    sprite.scale.x = sprite.scale.y;
    sprite.y = b * 0.65;
    bomb.addChild(sprite);
  } else bomb.addChild(body);

  // The painted billow is fire and soot in one picture; tinted dark, it is the smoke.
  const painted = fxTexture("nuke-billow");
  const texture = painted ?? billowTexture();
  const smoke = painted ?? billowTexture(true);
  const smokeTint = painted ? 0x6e5c50 : 0xffffff;
  // These sprites share two small textures. Expanding smoke occupies the map in every direction,
  // while the central fireball gives the strike weight before the mushroom takes over.
  const surge = new Container();
  surge.label = "nuke-surge";
  const fireball = new Sprite(texture);
  fireball.anchor.set(0.5);
  fireball.position.set(origin.x, origin.y);
  fireball.visible = false;
  root.addChildAt(surge, 2);
  root.addChildAt(fireball, 3);
  const dust = Array.from({ length: 24 }, (_, i) => {
    const sprite = new Sprite(i % 4 === 0 ? texture : smoke);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    surge.addChild(sprite);
    if (i % 4 !== 0) sprite.tint = smokeTint;
    return { sprite, angle: i * Math.PI * 2 / 24, phase: i * 2.399 };
  });
  const billows: Array<{ sprite: Sprite; kind: "ground" | "stem" | "cap"; u: number; phase: number; flip: number }> = [];
  const add = (kind: "ground" | "stem" | "cap", count: number) => {
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      cloud.addChild(sprite);
      billows.push({ sprite, kind, u: i / Math.max(1, count - 1), phase: i * 2.399, flip: i % 2 ? -1 : 1 });
    }
  };
  add("ground", 14);
  add("stem", 15);
  add("cap", 23);
  const sparks: Spark[] = [];
  const blastAt = def.duration * NUKE_DROP_SHARE;
  const blastLen = def.duration - blastAt;
  // The bomb waits above the screen while the siren winds up, then falls in the last stretch.
  const fallFrom = blastAt - def.duration * NUKE_FALL_SHARE;
  let last = -Infinity;
  let sparked = false;
  return {
    update(elapsed) {
      if (destroyed || elapsed >= def.duration) return false;
      // Transform updates and the handful of spark paths run at 30 fps, even on 144 Hz screens.
      if (elapsed - last < graphicsBudget().frameMs / 1000 - 0.001) return true;
      const dt = Number.isFinite(last) ? Math.max(0, elapsed - last) : 0;
      last = elapsed;
      const since = elapsed - blastAt;
      const t = clamp01(since / blastLen);
      const rise = easeOut(t / 0.65);
      const alpha = clamp01(t / 0.045) * (1 - clamp01((t - 0.78) / 0.22));
      shade.alpha = since < 0 ? 0.22 * elapsed / blastAt : 0.58 * (1 - t * 0.8);
      flash.alpha = since < 0 ? 0 : def.flash * 0.95 * (1 - clamp01(since / 0.24)) ** 2;
      bomb.visible = since < 0;
      if (bomb.visible) {
        const fall = clamp01((elapsed - fallFrom) / (blastAt - fallFrom));
        bomb.position.set(origin.x, lerp(-b * 3, origin.y, fall * fall));
        bomb.rotation = Math.sin(fall * Math.PI) * 0.08;
      }
      waves.clear();
      glows.begin();
      if (since < 0) {
        ring(waves, origin, b * (2.5 - elapsed / blastAt), 2, 0xff9e30, 0.65);
        glows.end();
        return true;
      }
      if (!sparked) {
        sparked = true;
        params.onImpact?.();
        burst(sparks, origin, Math.min(64, graphicsBudget().particles, def.particles), W * 1.3, 2, [hex(def.primary), hex(def.secondary), 0xffbb41], blastLen * 0.65, def.gravity * 120, 2);
      }
      const expansion = easeOut(t / 0.56);
      const dustAlpha = clamp01(t / 0.045) * (1 - clamp01((t - 0.48) / 0.52));
      for (const p of dust) {
        const radius = extent * expansion * (0.8 + 0.09 * Math.sin(p.phase));
        p.sprite.position.set(origin.x + Math.cos(p.angle) * radius, origin.y + Math.sin(p.angle) * radius * 0.8);
        const diameter = Math.min(host.screen.width, host.screen.height) * (0.32 + 0.07 * Math.sin(p.phase)) * (0.35 + expansion * 0.9);
        p.sprite.scale.set(diameter / p.sprite.texture.width, diameter * (0.9 + 0.15 * Math.sin(since * 2 + p.phase)) / p.sprite.texture.height);
        p.sprite.rotation = p.angle + Math.sin(since + p.phase) * 0.25;
        p.sprite.visible = dustAlpha > 0;
        p.sprite.alpha = dustAlpha * 0.85;
      }
      const fireballScale = easeOut(t / 0.18);
      const diameter = Math.min(host.screen.width, host.screen.height) * 1.4 * fireballScale;
      fireball.width = fireball.height = diameter;
      fireball.alpha = clamp01(t / 0.015) * (1 - clamp01((t - 0.14) / 0.25));
      fireball.visible = fireball.alpha > 0;
      fireball.rotation = since * 0.16;
      // A starburst flares at the blast as the white flash fades.
      const flare = def.flash * (1 - clamp01(since / 0.5));
      stamp(glows, "impact-burst", origin, Math.min(host.screen.width, host.screen.height) * (0.9 + since * 1.2), mix(hex(def.secondary), 0xffffff, 0.5), flare, since * 0.4);
      // The blast wave: a front of air and dust racing out across the ground ahead of the fire,
      // and a fainter echo behind it.
      for (const [delay, strength] of [[0, 1], [0.1, 0.55]] as const) {
        const k = clamp01((t - delay) / 0.5);
        if (k <= 0 || k >= 1) continue;
        const radius = easeOut(k) * extent * 1.15;
        oval(glows, "blast-wave", origin, radius / BLAST_WAVE.across, (radius * 0.8) / BLAST_WAVE.down, mix(hex(def.secondary), 0xffffff, 0.35), (1 - k) * strength, 0);
      }
      for (let i = 0; i < Math.min(3, def.rings); i++) {
        const k = clamp01((t - i * 0.05) / 0.65);
        if (k <= 0 || k >= 1) continue;
        const radius = easeOut(k) * extent;
        const color = i ? 0xff7823 : 0xffdfa0;
        if (!stamp(glows, "shockwave-ring", origin, radius / RING_RADIUS, color, (1 - k) * 0.85, i * 1.3)) {
          ring(waves, origin, radius, (i ? 7 : 18) * (1 - k) + 1, color, (1 - k) * 0.85);
        }
      }
      glows.end();
      for (const p of billows) {
        const { sprite, u, phase, flip } = p;
        const churn = since * (1 + def.spin) + phase;
        const baseY = origin.y + baseDrop * rise;
        const capY = baseY - H * rise;
        let x: number, y: number, diameter: number;
        if (p.kind === "ground") {
          x = origin.x + (u - 0.5) * W * 1.15 * easeOut(t / 0.4);
          y = baseY + Math.sin(phase) * H * 0.3;
          diameter = W * (0.36 + 0.05 * Math.sin(phase)) * (0.45 + rise * 0.55);
          sprite.scale.set(diameter / texture.width, diameter * 0.8 / texture.height);
        } else if (p.kind === "stem") {
          x = origin.x + Math.sin(churn) * W * 0.045 * (1 - u * 0.4);
          y = lerp(baseY, capY + W * 0.05, u);
          diameter = W * (0.29 - u * 0.08) * (0.5 + rise * 0.5);
          sprite.scale.set(diameter / texture.width, diameter * 1.2 / texture.height);
        } else {
          const angle = Math.PI + u * Math.PI * 2;
          x = origin.x + Math.cos(angle) * W * 0.34 * (0.3 + rise * 0.7);
          // Painted, every other puff sits higher so the cap swells into a dome.
          y = capY + Math.sin(angle) * W * 0.055 * rise - (painted && flip > 0 ? W * 0.08 * rise : 0);
          diameter = W * (0.38 + 0.04 * Math.sin(churn)) * (0.3 + rise * 0.7);
          sprite.scale.set(diameter / texture.width, diameter * ((painted ? 0.78 : 0.58) + 0.06 * Math.sin(phase)) / texture.height);
        }
        sprite.scale.x *= flip;
        sprite.position.set(x, y);
        sprite.rotation = Math.sin(churn * 0.6) * (p.kind === "cap" ? 0.12 : 0.2);
        sprite.visible = alpha > 0;
        sprite.alpha = alpha * (0.85 + def.glow * 0.15);
        // Painted, the fire cools to soot as it climbs; the column stays hotter than the cap and skirt.
        sprite.tint = painted
          ? mix(mix(hex(def.primary), 0x3a302a, p.kind === "stem" ? 0.35 : 0.75), 0xffffff, Math.max(0, 1 - t * (p.kind === "stem" ? 0.8 : 1.1)))
          : mix(hex(def.primary), 0xffffff, Math.max(0, 1 - t * 0.6));
      }
      // The painted cloud stands on the column's foot and reaches the top of the cap, as wide as it.
      cloudGlow.begin();
      const footY = origin.y + baseDrop * rise;
      const tall = H * rise * 1.15;
      const wide = W * 1.1 * (0.3 + rise * 0.7);
      oval(cloudGlow, "mushroom-cloud", { x: origin.x, y: footY }, wide / MUSHROOM.width, tall / (MUSHROOM.base.y - MUSHROOM.top), mix(hex(def.primary), 0xffffff, Math.max(0, 0.6 - t * 0.6)), alpha * 0.55 * (painted ? 1 - t * 0.7 : 1), 0, MUSHROOM.base);
      cloudGlow.end();
      stepSparks(sparks, dt);
      particles.draw(sparks, def.particleShape);
      return true;
    },
    destroy,
  };
}
