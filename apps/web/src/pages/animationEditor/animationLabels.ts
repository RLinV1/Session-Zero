import type { AnimationDef } from "@vtt/shared";

/** What the Animations tab shows for a shape: catalog ids, read with `t()` when shown. */
export const SHAPE_LABELS = {
  slash: "animation.shape.slash",
  claw: "animation.shape.claw",
  whirlwind: "animation.shape.whirlwind",
  slam: "animation.shape.slam",
  shadow: "animation.shape.shadow",
  projectile: "animation.shape.projectile",
  volley: "animation.shape.volley",
  dagger: "animation.shape.dagger",
  fireball: "animation.shape.fireball",
  meteor: "animation.shape.meteor",
  explosion: "animation.shape.explosion",
  bolt: "animation.shape.bolt",
  chain: "animation.shape.chain",
  beam: "animation.shape.beam",
  frost: "animation.shape.frost",
  poison: "animation.shape.poison",
  smite: "animation.shape.smite",
  sonic: "animation.shape.sonic",
  tornado: "animation.shape.tornado",
  nuke: "animation.shape.nuke",
} as const satisfies Record<AnimationDef["shape"], string>;

