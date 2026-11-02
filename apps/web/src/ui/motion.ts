import { getClientSettings, subscribeClientSettings } from "./clientSettings";

const QUERY = "(prefers-reduced-motion: reduce)";

function systemReduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** True when the system or the in-app Reduced animations setting asks for stillness. */
export function motionReduced(): boolean {
  return getClientSettings().reducedAnimations || systemReduced();
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
  const query = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  query?.addEventListener("change", apply);
  const unsubscribe = subscribeClientSettings(apply);
  return () => {
    query?.removeEventListener("change", apply);
    unsubscribe();
  };
}
