/**
 * The board's label faces (design-language: "One typeface", "Numbers in a monospace face"):
 * Geist for token names and condition markers, Geist Mono for distances. Pixi measures and
 * rasterises a label once, in whatever face has loaded, and never redraws it when a better
 * one arrives. So the board waits for both before its first label, with a timeout so a slow
 * font never holds up the table, and relabels once if they only arrive after that.
 */
export const BOARD_FONT = '"Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
export const BOARD_MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';
/**
 * The same stacks spelt differently. Pixi caches a label's texture by its text and style, so a
 * relabel needs a style that differs from the one the fallback face was drawn with.
 */
export const BOARD_FONT_LOADED = '"Geist Sans", system-ui, sans-serif';
export const BOARD_MONO_LOADED = '"Geist Mono", ui-monospace, monospace';
/** Long enough for a local font file, short enough not to be felt. */
export const BOARD_FONT_WAIT_MS = 1500;
/** The faces the board draws labels in. */
const FACES = ['400 16px "Geist Sans"', '600 16px "Geist Sans"', '700 16px "Geist Sans"', '600 16px "Geist Mono"'] as const;

type FontLoader = Pick<FontFaceSet, "load" | "ready">;

const fontSet = (): FontLoader | undefined => (typeof document !== "undefined" ? document.fonts : undefined);

let relabelled = false;

/** The family new name labels use: the loaded spelling once a relabel has happened. */
export function boardFontFamily(): string {
  return relabelled ? BOARD_FONT_LOADED : BOARD_FONT;
}

/** The family new distance labels use. */
export function boardMonoFamily(): string {
  return relabelled ? BOARD_MONO_LOADED : BOARD_MONO;
}

/** A label's family after a relabel: mono stays mono. */
export function relabelledFamily(current: string): string {
  return current.includes("Geist Mono") ? boardMonoFamily() : boardFontFamily();
}

/** Resolves true once every face has loaded, or false on a timeout, an error or no font API. */
export async function waitForBoardFont(fonts: FontLoader | undefined = fontSet(), waitMs = BOARD_FONT_WAIT_MS): Promise<boolean> {
  if (!fonts) return false;
  const loaded = Promise.all(FACES.map((face) => fonts.load(face))).then(
    (faces) => faces.every((face) => face.length > 0),
    () => false,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const ready = await Promise.race([loaded, timedOut]);
  clearTimeout(timer);
  return ready;
}

/**
 * After a wait that did not end with the fonts loaded: once the browser's fonts settle, switch
 * new and existing labels to the loaded spelling and call `relabel` (once) to redraw them.
 */
export function relabelWhenFontsReady(relabel: () => void, fonts: FontLoader | undefined = fontSet()): void {
  void fonts?.ready.then(() => {
    relabelled = true;
    relabel();
  });
}

/** For tests: back to the first spelling. */
export function resetBoardFontFamily() {
  relabelled = false;
}
