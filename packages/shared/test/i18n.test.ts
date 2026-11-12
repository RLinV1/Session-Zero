import { describe, expect, it } from "vitest";
import {
  cjk,
  formatDateTime,
  formatList,
  formatRef,
  formatTime,
  isLocale,
  localeForTag,
  localeFromAcceptLanguage,
  messageRefs,
  parseAcceptLanguage,
  resolveLocale,
  translate,
  type Catalog,
  type CatalogSource,
} from "../src";
import { sharedEn } from "../src/i18n/en";
import { sharedZhTW } from "../src/i18n/zh-TW";

const en = {
  "greeting": "Hello",
  "walls": ({ n }: { n: number }) => (n === 1 ? "1 wall" : `${n} walls`),
  "moved": ({ actor, token }: { actor: string; token: string }) => `${actor} moved ${token}`,
} as const satisfies CatalogSource;
const zh = {
  "greeting": "你好",
  "walls": ({ n }) => `${n} 面牆`,
  "moved": ({ actor, token }) => `${actor} 移動了 ${token}`,
} satisfies Catalog<typeof en>;

describe("message catalogs (localization)", () => {
  it("translates fixed and parameterised entries", () => {
    expect(translate(zh, en, "greeting")).toBe("你好");
    expect(translate(zh, en, "walls", { n: 3 })).toBe("3 面牆");
    expect(translate(undefined, en, "walls", { n: 1 })).toBe("1 wall");
  });

  it("falls back to English for an entry missing at runtime, never to the id", () => {
    const partial = { greeting: "你好" } as unknown as Catalog<typeof en>;
    expect(translate(partial, en, "walls", { n: 2 })).toBe("2 walls");
  });

  it("formats refs with nested messages, and passes user content through untouched", () => {
    const msg = messageRefs<typeof en>();
    const ref = msg("moved", { actor: "Sam", token: "Aria" });
    expect(formatRef(zh, en, ref)).toBe("Sam 移動了 Aria");
    expect(formatRef(zh, en, msg("moved", { actor: "Sam", token: msg("greeting") }))).toBe("Sam 移動了 你好");
  });

  it("returns null for an unknown id, including inherited object keys", () => {
    expect(formatRef(zh, en, { id: "nope" })).toBeNull();
    expect(formatRef(zh, en, { id: "constructor" })).toBeNull();
    expect(formatRef(zh, en, { id: "moved", params: { actor: "Sam", token: { id: "toString" } } })).toBeNull();
  });

  it("makes a missing id, an extra id or wrong params a type error", () => {
    // @ts-expect-error "moved" is missing, so the build fails and names it.
    const missing = { greeting: "你好", walls: ({ n }) => `${n}` } satisfies Catalog<typeof en>;
    // @ts-expect-error "extra" is not an English id.
    const extra = { greeting: "你好", walls: "牆", moved: "移動", extra: "多餘" } satisfies Catalog<typeof en>;
    // Type-checked, never run: the calls themselves are what must not compile.
    const wrongParams = () => {
      // @ts-expect-error "walls" takes { n: number }, not a string param.
      translate(zh, en, "walls", { n: "3" });
      // @ts-expect-error "walls" needs its params.
      translate(zh, en, "walls");
    };
    expect([missing, extra, wrongParams]).toHaveLength(3);
  });

  it("checks the shared Traditional Chinese catalog has every English id", () => {
    expect(Object.keys(sharedZhTW).sort()).toEqual(Object.keys(sharedEn).sort());
    for (const value of Object.values(sharedZhTW)) expect(value).not.toBe("");
  });
});

describe("choosing a language from browser preferences (localization)", () => {
  it.each([
    [["zh-TW", "en-US"], "zh-TW"],
    [["zh-HK"], "zh-TW"],
    [["zh-MO"], "zh-TW"],
    [["zh-Hant"], "zh-TW"],
    [["zh-Hant-CN"], "zh-TW"],
    [["ja-JP", "zh-TW"], "zh-TW"],
    [["en-GB", "zh-TW"], "en"],
    [["zh-CN"], null],
    [["zh-Hans-HK"], null],
    [["zh"], null],
    [["fr-FR", "de"], null],
    [[], null],
  ] as const)("%j → %s", (tags, expected) => {
    expect(resolveLocale(tags)).toBe(expected);
  });

  it("accepts underscores and any case", () => {
    expect(localeForTag("ZH_tw")).toBe("zh-TW");
    expect(localeForTag(" EN ")).toBe("en");
  });

  it("knows which values are supported locales", () => {
    expect(isLocale("zh-TW")).toBe(true);
    expect(isLocale("zh-CN")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("Accept-Language (localization)", () => {
  it("orders by q, keeps header order for ties, and drops * and q=0", () => {
    expect(parseAcceptLanguage("fr;q=0.5, zh-TW, en;q=0.8, *;q=0.1, de;q=0")).toEqual(["zh-TW", "en", "fr"]);
    expect(parseAcceptLanguage("en, zh-TW")).toEqual(["en", "zh-TW"]);
  });

  it("skips malformed q values instead of preferring them", () => {
    expect(parseAcceptLanguage("zh-TW;q=abc, en;q=0.2")).toEqual(["en"]);
  });

  it("resolves a request's language, English when nothing maps", () => {
    expect(localeFromAcceptLanguage("zh-TW")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("zh-HK,zh;q=0.9")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("fr-FR")).toBe("en");
    expect(localeFromAcceptLanguage("ja;q=0.9, zh-TW;q=0.5")).toBe("zh-TW");
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
  });
});

describe("Intl formatting (localization)", () => {
  const at = new Date(2026, 10, 9, 15, 5);

  it("formats clock times in each language", () => {
    // ICU picks the space before "PM" (U+0020 or U+202F) and it changes between versions.
    expect(formatTime("en", at).replace(/\s/gu, " ")).toBe("3:05 PM");
    expect(formatTime("zh-TW", at)).toBe("下午3:05");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDateTime("en", new Date("nope"))).toBe("");
  });

  it("joins lists in each language", () => {
    expect(formatList("en", ["Aria", "Brom", "Cass"])).toBe("Aria, Brom, and Cass");
    expect(formatList("zh-TW", ["Aria", "Brom", "Cass"])).toBe("Aria、Brom和Cass");
  });
});

describe("Chinese spacing (localization)", () => {
  it("puts a half-width space only where a Han character meets a Latin letter or digit", () => {
    const gone = (name: string) => cjk`${name}已不存在。`;
    expect(gone("Goblin")).toBe("Goblin 已不存在。");
    expect(gone("弓箭手")).toBe("弓箭手已不存在。");
    expect(cjk`最多${12}個`).toBe("最多 12 個");
    expect(cjk`已經有名為「${"Aria"}」的群組`).toBe("已經有名為「Aria」的群組");
    expect(cjk`${"1d20"} 的結果`).toBe("1d20 的結果");
  });
});
