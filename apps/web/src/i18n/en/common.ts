import type { CatalogSource } from "@vtt/shared";

/**
 * Text used across the app: the language control, page titles, the document's description and
 * the browser settings dialog. English is the source; `zh-TW/common.ts` must match it id for id.
 */
export const common = {
  "common.done": "Done",
  "common.loading": "Loading…",

  // The language control (design.md §11).
  "language.label": "Language",
  "language.trigger": ({ name }: { name: string }) => `Language: ${name}`,
  "language.savedNote": "Your language is saved in this browser and changes right away.",
  "language.tableNote": "Only you see this change. Everyone else at the table keeps their own language.",
  "language.loadFailed": "Couldn't load that language. Check your connection and try again.",

  // The browser tab's title, per page; the home page is the product name alone.
  "title.page": ({ page }: { page: string }) => `${page} · Session Zero`,
  "title.signin": "Sign in",
  "title.signup": "Create account",
  "title.join": "Join the table",
  "title.notFound": "Page not found",
  "title.gmDashboard": "Your rooms",
  "title.library": "Library",
  "title.account": "Your account",
  "title.privacy": "Privacy",
  "title.terms": "Terms",
  "title.isometricLighting": "Lighting demo",
  "title.room": "Table",
  "title.encounterEdit": "Encounter editor",
  "meta.description":
    "Session Zero, a free virtual tabletop. Your game starts here: shared battle map, tokens, initiative and dice for remote play.",

  // How long ago (ui/formatRelative.ts).
  "time.justNow": "just now",
  "time.minutesAgo": ({ n }: { n: number }) => `${n} min ago`,
  "time.hoursAgo": ({ n }: { n: number }) => `${n} h ago`,
  "time.daysAgo": ({ n }: { n: number }) => `${n} d ago`,

  // The room connection's own messages (net/roomConnection.ts).
  "connection.lost": "Connection lost",
  "connection.disconnected": "Disconnected",
  "connection.offline": "Not connected",
  "connection.draftSaveFailed": "Couldn't save the map draft.",
  "connection.ended.left": "You left this room",
  "connection.ended.revoked": "You were removed from this room",
  "connection.ended.deleted": "This room was deleted",
  "connection.ended.signed_out": "You signed out on this device",

  // Settings (ui/SettingsMenu.tsx).
  "settings.title": "Settings",
  "settings.sections": "Settings sections",
  "settings.tab.audio": "Audio",
  "settings.tab.graphics": "Graphics",
  "settings.tab.table": "Table",
  "settings.browserNote": "Audio and graphics are saved in this browser. Changes apply immediately.",
  "settings.musicVolume": "Music volume",
  "settings.soundVolume": "Sound effects volume",
  "settings.percent": ({ value }: { value: number }) => `${value} percent`,
  "settings.graphicsQuality": "Graphics quality",
  "settings.quality.high": "High",
  "settings.quality.balanced": "Balanced",
  "settings.quality.low": "Low",
  "settings.reducedAnimations": "Reduced animations",
  "settings.reducedAnimationsHint": "Still effects instead of moving ones.",
  "settings.focusAttacks": "Focus on attacks",
  "settings.focusAttacksHint": "Zoom the board to the fight.",
  "settings.tableShared": "This setting is shared by everyone at the table.",
  "settings.removeAtZero": "Remove tokens at 0 HP",
  "settings.removeAtZeroHint": "Tokens are removed when their HP reaches 0 or below. Undo brings one back.",
} as const satisfies CatalogSource;
