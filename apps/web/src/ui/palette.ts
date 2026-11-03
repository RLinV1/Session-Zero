/**
 * The status and focus colours the board shares with the panels (design-language: "Board
 * colours follow the tokens"). The stylesheet's :root is the source of truth; Pixi needs
 * numbers, so the board reads the custom properties once and keeps these as the fallback.
 */
export type HpLevel = "ok" | "warn" | "critical";

/** Wounded reads at a glance: above half is ok, above a quarter is warn, the rest critical. */
export function hpLevel(fraction: number): HpLevel {
  return fraction > 0.5 ? "ok" : fraction > 0.25 ? "warn" : "critical";
}

/** The same level as a CSS colour, for the DOM. */
export const HP_LEVEL_VAR: Record<HpLevel, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  critical: "var(--danger)",
};

export interface BoardPalette {
  ok: number;
  warn: number;
  danger: number;
  focus: number;
}

/** :root's values today; used when a property is missing or unreadable. */
export const FALLBACK_PALETTE: BoardPalette = { ok: 0x6fbf73, warn: 0xd9a441, danger: 0xe0685c, focus: 0xe08a62 };

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)` as a Pixi colour number; anything else is null. */
export function parseCssColor(value: string): number | null {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return parseInt(short[1]! + short[1]! + short[2]! + short[2]! + short[3]! + short[3]!, 16);
  const long = /^#([0-9a-f]{6})$/.exec(v);
  if (long) return parseInt(long[1]!, 16);
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(v);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
    if (r > 255 || g > 255 || b > 255) return null;
    return (r << 16) | (g << 8) | b;
  }
  return null;
}

export function readBoardPalette(root: Element = document.documentElement): BoardPalette {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: number) => parseCssColor(style.getPropertyValue(name)) ?? fallback;
  return {
    ok: read("--ok", FALLBACK_PALETTE.ok),
    warn: read("--warn", FALLBACK_PALETTE.warn),
    danger: read("--danger", FALLBACK_PALETTE.danger),
    focus: read("--focus", FALLBACK_PALETTE.focus),
  };
}

export function hpColor(fraction: number, palette: BoardPalette): number {
  const level = hpLevel(fraction);
  return level === "ok" ? palette.ok : level === "warn" ? palette.warn : palette.danger;
}
