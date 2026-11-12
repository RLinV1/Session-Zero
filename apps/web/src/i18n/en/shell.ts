import type { CatalogSource } from "@vtt/shared";

/** The app shell and shared controls: header, footer, not-found page, modal and pickers. */
export const shell = {
  "common.close": "Close",
  "notFound.title": "Page not found",
  "notFound.body": "There is nothing at this address. The link may be old, or mistyped.",
  "notFound.home": "Go home",
  "theme.auto": "Theme: follows your system. Switch to light",
  "theme.light": "Theme: light. Switch to dark",
  "theme.dark": "Theme: dark. Switch to system",
  "nav.main": "Main",
  "nav.rooms": "Your rooms",
  "nav.library": "Library",
  "nav.policies": "Policies",
  "nav.privacy": "Privacy",
  "nav.terms": "Terms",
  "animationPicker.choose": "Choose animation",
  "animationPicker.title": "Choose attack animation",
  "animationPicker.search": "Search animations",
  "animationPicker.list": "Animations",
  "animationPicker.none": "No animations match your search.",
} as const satisfies CatalogSource;
