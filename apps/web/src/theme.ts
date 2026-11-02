import { useLayoutEffect, useSyncExternalStore } from "react";
import type { Route } from "./router";

/**
 * Light or dark, for every page outside the table (design-language: "Light and dark outside
 * the table"). The table at /r/:roomId, and the encounter editor that reuses it, stay dark,
 * because the board is a lit surface and Pixi renders against it.
 *
 * Each route belongs to a layer, which decides the theme and how much ambient background the
 * page gets (INTERFACE.md §11.9). Both go on <html> as `data-layer` and `data-theme`, so the
 * whole document, portals included, follows one choice.
 */
export type ThemeChoice = "auto" | "light" | "dark";
export type Layer = "home" | "entry" | "hub" | "table";

const KEY = "vtt.theme";
const CHOICES: ThemeChoice[] = ["auto", "light", "dark"];

export function loadThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    return CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : "auto";
  } catch {
    // Storage unavailable (private mode): follow the system for this page load.
    return "auto";
  }
}

function saveThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* ignore */
  }
}

export function layerFor(route: Route): Layer {
  switch (route.page) {
    case "home":
      return "home";
    case "signin":
    case "signup":
    case "join":
    case "notFound":
      return "entry";
    case "gmDashboard":
    case "library":
      return "hub";
    case "room":
    case "encounterEdit":
      return "table";
  }
}

/** jsdom and very old browsers have no matchMedia; they get the dark ground. */
function lightQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;
}

function systemTheme(): "light" | "dark" {
  return lightQuery()?.matches ? "light" : "dark";
}

/** What a layer renders in: the table is always dark, everything else follows the choice. */
export function themeFor(layer: Layer, choice: ThemeChoice, system: "light" | "dark"): "light" | "dark" {
  if (layer === "table") return "dark";
  return choice === "auto" ? system : choice;
}

export function applyLayer(layer: Layer, theme: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-layer", layer);
  root.setAttribute("data-theme", theme);
}

/** Before React renders, so a light-theme visitor never sees a dark first frame. */
export function applyStoredLayer(route: Route) {
  const layer = layerFor(route);
  applyLayer(layer, themeFor(layer, loadThemeChoice(), systemTheme()));
}

// One choice for the whole app: the header toggle writes it, the route hook reads it.
let choice: ThemeChoice = loadThemeChoice();
const listeners = new Set<() => void>();

function subscribeChoice(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setThemeChoice(next: ThemeChoice) {
  choice = next;
  saveThemeChoice(next);
  listeners.forEach((fn) => fn());
}

function subscribeSystem(fn: () => void) {
  const mq = lightQuery();
  mq?.addEventListener("change", fn);
  return () => mq?.removeEventListener("change", fn);
}

/** The choice, a setter, and what that choice resolves to right now. */
export function useGroundTheme() {
  const current = useSyncExternalStore(subscribeChoice, () => choice);
  const system = useSyncExternalStore(subscribeSystem, systemTheme);
  return { choice: current, choose: setThemeChoice, resolved: current === "auto" ? system : current };
}

/** Keeps <html>'s layer and theme in step with the route and the choice. */
export function useRouteLayer(route: Route) {
  const { choice: current } = useGroundTheme();
  const system = useSyncExternalStore(subscribeSystem, systemTheme);
  const layer = layerFor(route);
  const theme = themeFor(layer, current, system);
  // Layout, not passive: the new route's first paint already has its own ground.
  useLayoutEffect(() => applyLayer(layer, theme), [layer, theme]);
}

/** For tests: forget the in-memory choice and read storage again. */
export function reloadThemeChoice() {
  choice = loadThemeChoice();
  listeners.forEach((fn) => fn());
}
