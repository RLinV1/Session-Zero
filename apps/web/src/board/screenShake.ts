import type { AnimationDef } from "@vtt/shared";
import { NUKE_DROP_SHARE } from "./fxBudget";

/** How long the whole page shakes, as a share of the blast (the nuke after its drop). */
const SHAKE_SHARE = 0.77;
/** Pixels of offset at full `shake`, at the start of the blast. */
const MAX_OFFSET_PX = 22;
const activeShakes = new WeakMap<HTMLElement, () => void>();

const pageRoot = () => document.getElementById("root") ?? document.body;

/**
 * Shakes the whole page for a nuke (ADR 0038): panels, header and board together, not just the
 * canvas, and any open modal over them. Pure DOM through the Web Animations API, so it never
 * touches a token or the board's coordinates, and it is gone when the animation ends. Callers skip
 * it under reduced motion. Other animations shake only the map (`fx.ts`).
 * Returns a cancel function.
 */
export function shakeScreen(def: AnimationDef, target: HTMLElement = pageRoot()): () => void {
  if (def.shake <= 0 || typeof target.animate !== "function") return () => {};
  const steps = 18;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Strongest at the blast, easing out; the last frame is exactly at rest.
    const amp = i === steps ? 0 : def.shake * MAX_OFFSET_PX * (1 - t) ** 2;
    const x = Math.sin(i * 2.9) * amp;
    const y = Math.cos(i * 3.7) * amp;
    const tilt = Math.sin(i * 1.7) * amp * 0.04;
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)` });
  }
  const delay = def.duration * NUKE_DROP_SHARE * 1000;
  const duration = def.duration * (1 - NUKE_DROP_SHARE) * SHAKE_SHARE * 1000;
  return play(target, frames, { duration, delay, easing: "linear" });
}

/** Plays `frames` on `target` in place of any shake it is running, clipping the page meanwhile. */
function play(target: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions): () => void {
  activeShakes.get(target)?.();
  // The moved page pokes past the window edge; clip it so the shake never adds a scrollbar.
  const root = target.ownerDocument?.documentElement;
  const previousOverflow = root?.style.overflow ?? "";
  const clip = target.parentElement;
  const previousClip = clip?.style.overflow ?? "";
  if (root) root.style.overflow = "clip";
  if (clip) clip.style.overflow = "clip";
  const animation = target.animate(frames, options);
  // An open modal (the animation editor, any dialog on the board) sits in the browser's top layer,
  // which the page's transform never reaches: shake each one too, on top of its own placement.
  const dialogs = target.id === "root" ? [...target.ownerDocument.querySelectorAll<HTMLDialogElement>("dialog[open]")] : [];
  const riders = dialogs.map((dialog) => dialog.animate(frames, { ...options, composite: "add" }));
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (clip) clip.style.overflow = previousClip;
    if (root) root.style.overflow = previousOverflow;
  };
  animation.onfinish = restore;
  animation.oncancel = restore;
  const stop = () => {
    animation.cancel();
    for (const rider of riders) rider.cancel();
    restore();
  };
  activeShakes.set(target, stop);
  return stop;
}
