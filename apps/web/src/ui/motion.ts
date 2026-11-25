import { useSyncExternalStore } from "react";
import { getClientSettings, subscribeClientSettings, type AnimationLevel } from "./clientSettings";

const QUERY = "(prefers-reduced-motion: reduce)";

const mediaQuery = () => (typeof matchMedia === "function" ? matchMedia(QUERY) : null);

/** True when the device asks for reduced motion; it forces the None level (animation-levels). */
export function systemReduced(): boolean {
  return mediaQuery()?.matches ?? false;
}

/**
 * The viewer's effective Animations level (animation-levels): None whenever the device asks for
 * reduced motion, which the in-app choice cannot override; otherwise the saved choice. No room
 * setting takes part.
 */
export function animationLevel(): AnimationLevel {
  return systemReduced() ? "none" : getClientSettings().animationLevel;
}

/** True below Full: the stillness shared by the Reduced and None levels. */
export function motionReduced(): boolean {
  return animationLevel() !== "full";
}

/** Calls `listener` when the device preference or the saved choice changes; returns the unsubscribe. */
export function watchAnimationLevel(listener: () => void): () => void {
  const query = mediaQuery();
  query?.addEventListener("change", listener);
  const unsubscribe = subscribeClientSettings(listener);
  return () => {
    query?.removeEventListener("change", listener);
    unsubscribe();
  };
}

/** The effective level, following both inputs live. */
export function useAnimationLevel(): AnimationLevel {
  return useSyncExternalStore(watchAnimationLevel, animationLevel, animationLevel);
}

/** Whether the device preference is locking the level at None, followed live (for Settings). */
export function useSystemReduced(): boolean {
  return useSyncExternalStore(watchAnimationLevel, systemReduced, systemReduced);
}

/**
 * Mirrors motionReduced() onto <html data-motion="reduced">, so the stylesheet honours the
 * in-app setting as well as the media query (design-language: "Reduced motion everywhere").
 * Before this, CSS keyframes such as the roll card's ran whenever the system allowed motion,
 * whatever the player had chosen (UI audit, step 35). Returns a function that stops syncing.
 */
export function syncMotionAttribute(root: HTMLElement = document.documentElement): () => void {
  const apply = () => {
    if (motionReduced()) root.setAttribute("data-motion", "reduced");
    else root.removeAttribute("data-motion");
  };
  apply();
  return watchAnimationLevel(apply);
}
