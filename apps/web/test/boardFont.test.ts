import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_FONT,
  BOARD_FONT_LOADED,
  BOARD_FONT_WAIT_MS,
  BOARD_MONO,
  BOARD_MONO_LOADED,
  boardFontFamily,
  boardMonoFamily,
  relabelWhenFontsReady,
  relabelledFamily,
  resetBoardFontFamily,
  waitForBoardFont,
} from "../src/board/boardFont";

const face = {} as FontFace;

function fonts(load: (font: string) => Promise<FontFace[]>, ready: Promise<unknown> = Promise.resolve()) {
  return { load: vi.fn(load), ready } as unknown as Pick<FontFaceSet, "load" | "ready">;
}

afterEach(() => {
  vi.useRealTimers();
  resetBoardFontFamily();
});

describe("the board waits for its label face (design-language: One typeface)", () => {
  it("draws its first labels in Geist once every weight has loaded", async () => {
    const set = fonts(async () => [face]);
    await expect(waitForBoardFont(set)).resolves.toBe(true);
    expect(set.load).toHaveBeenCalledWith('600 16px "Geist Sans"');
    expect(set.load).toHaveBeenCalledWith('700 16px "Geist Sans"');
    // Distances on the board are numbers, so the ruler's face loads too (Numbers in a monospace face).
    expect(set.load).toHaveBeenCalledWith('600 16px "Geist Mono"');
    expect(boardFontFamily()).toBe(BOARD_FONT);
    expect(boardMonoFamily()).toBe(BOARD_MONO);
  });

  it("stops waiting after the timeout, so a slow font never holds up the table", async () => {
    vi.useFakeTimers();
    const set = fonts(() => new Promise<FontFace[]>(() => {}));
    const waiting = waitForBoardFont(set);
    await vi.advanceTimersByTimeAsync(BOARD_FONT_WAIT_MS);
    await expect(waiting).resolves.toBe(false);
  });

  it("treats a failed or empty load, or no font API, as not ready", async () => {
    await expect(waitForBoardFont(fonts(() => Promise.reject(new Error("offline"))))).resolves.toBe(false);
    await expect(waitForBoardFont(fonts(async () => []))).resolves.toBe(false);
    await expect(waitForBoardFont(undefined)).resolves.toBe(false);
  });

  it("relabels once with a new style key when the fonts finally settle", async () => {
    let settle!: () => void;
    const ready = new Promise<void>((resolve) => (settle = resolve));
    const relabel = vi.fn();
    relabelWhenFontsReady(relabel, fonts(async () => [], ready));
    expect(relabel).not.toHaveBeenCalled();
    settle();
    await ready;
    await Promise.resolve();
    expect(relabel).toHaveBeenCalledTimes(1);
    expect(boardFontFamily()).toBe(BOARD_FONT_LOADED);
    expect(BOARD_FONT_LOADED).not.toBe(BOARD_FONT);
    // A distance label stays mono, a name label stays sans.
    expect(relabelledFamily(BOARD_MONO)).toBe(BOARD_MONO_LOADED);
    expect(relabelledFamily(BOARD_FONT)).toBe(BOARD_FONT_LOADED);
  });
});
