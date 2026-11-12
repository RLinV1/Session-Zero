// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseLocale, formattingLocale, resetLocaleForTests } from "../src/i18n/locale";
import { formatClock, formatDate, formatRelative, formatStamp } from "../src/ui/formatRelative";

const NOW = new Date(2026, 10, 9, 15, 5, 9).getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
/** ICU picks the space between parts, and it changes between versions (U+2009 before a zh-TW time, U+202F before "PM"). */
const spaced = (text: string) => text.replace(/\s/gu, " ");

beforeEach(async () => {
  localStorage.clear();
  await resetLocaleForTests();
});
afterEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await resetLocaleForTests();
});

describe("dates and times follow the language (localization)", () => {
  it("keeps the English relative times exactly as before", () => {
    expect(formatRelative(ago(10_000), NOW)).toBe("just now");
    expect(formatRelative(ago(5 * MIN), NOW)).toBe("5 min ago");
    expect(formatRelative(ago(3 * 60 * MIN), NOW)).toBe("3 h ago");
    expect(formatRelative(ago(3 * 24 * 60 * MIN), NOW)).toBe("3 d ago");
  });

  it("writes relative times in Traditional Chinese", async () => {
    await chooseLocale("zh-TW");
    expect(formatRelative(ago(10_000), NOW)).toBe("剛剛");
    expect(formatRelative(ago(5 * MIN), NOW)).toBe("5 分鐘前");
    expect(formatRelative(ago(3 * 60 * MIN), NOW)).toBe("3 小時前");
    expect(formatRelative(ago(3 * 24 * 60 * MIN), NOW)).toBe("3 天前");
  });

  it("formats clock times, dates and log stamps in each language", async () => {
    const at = new Date(NOW).toISOString();
    expect(spaced(formatClock(at))).toBe("3:05 PM");
    expect(formatDate(at)).toBe("11/9/2026");
    expect(spaced(formatStamp(at))).toBe("11/9/2026, 3:05:09 PM");
    await chooseLocale("zh-TW");
    expect(formatClock(at)).toBe("下午3:05");
    expect(formatDate(at)).toBe("2026/11/9");
    expect(spaced(formatStamp(at))).toBe("2026/11/9 下午3:05:09");
  });

  it("returns nothing for a timestamp that isn't one", () => {
    expect(formatClock("not a date")).toBe("");
  });

  it("keeps an English browser's own region for English", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB", "en"]);
    expect(formattingLocale()).toBe("en-GB");
    expect(formatClock(new Date(NOW).toISOString())).toBe("15:05");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    expect(formattingLocale()).toBe("en");
    await chooseLocale("zh-TW");
    expect(formattingLocale()).toBe("zh-TW");
  });
});
