// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { FALLBACK_PALETTE, HP_LEVEL_VAR, hpColor, hpLevel, parseCssColor, readBoardPalette } from "../src/ui/palette";

afterEach(() => {
  for (const name of ["--ok", "--warn", "--danger", "--focus"]) document.documentElement.style.removeProperty(name);
});

describe("board colours follow the tokens (design-language, FR-TAC-07)", () => {
  it("parses the colour forms the stylesheet uses", () => {
    expect(parseCssColor("#6fbf73")).toBe(0x6fbf73);
    expect(parseCssColor("  #E08A62 ")).toBe(0xe08a62);
    expect(parseCssColor("#fff")).toBe(0xffffff);
    expect(parseCssColor("rgb(224, 104, 92)")).toBe(0xe0685c);
    expect(parseCssColor("rgba(217, 164, 65, 0.5)")).toBe(0xd9a441);
  });

  it("refuses what it cannot read", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("var(--ok)")).toBeNull();
    expect(parseCssColor("#12345")).toBeNull();
    expect(parseCssColor("rgb(300, 0, 0)")).toBeNull();
  });

  it("reads :root, and falls back where a property is missing", () => {
    document.documentElement.style.setProperty("--ok", "#00ff00");
    document.documentElement.style.setProperty("--focus", "not a colour");
    const palette = readBoardPalette();
    expect(palette.ok).toBe(0x00ff00);
    expect(palette.focus).toBe(FALLBACK_PALETTE.focus);
    expect(palette.danger).toBe(FALLBACK_PALETTE.danger);
  });

  it("uses the roster's thresholds: above half ok, above a quarter warn, else critical", () => {
    expect(hpLevel(1)).toBe("ok");
    expect(hpLevel(0.51)).toBe("ok");
    expect(hpLevel(0.5)).toBe("warn");
    expect(hpLevel(0.26)).toBe("warn");
    expect(hpLevel(0.25)).toBe("critical");
    expect(hpLevel(0.2)).toBe("critical");
    expect(hpLevel(0)).toBe("critical");
  });

  it("colours a 20% token with the danger colour on the board and in the DOM", () => {
    expect(hpColor(0.2, FALLBACK_PALETTE)).toBe(FALLBACK_PALETTE.danger);
    expect(HP_LEVEL_VAR[hpLevel(0.2)]).toBe("var(--danger)");
    expect(hpColor(0.4, FALLBACK_PALETTE)).toBe(FALLBACK_PALETTE.warn);
    expect(hpColor(0.9, FALLBACK_PALETTE)).toBe(FALLBACK_PALETTE.ok);
  });
});
