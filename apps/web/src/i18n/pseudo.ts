/**
 * The development-only pseudo-locale (localization, design.md §9): every catalog string accented
 * and bracketed, "⟦Śéţţîñĝš⟧", so text that skipped the catalog stands out as plain English on
 * screen. Opened with `?locale=pseudo` on a development build; production builds never include it.
 */
const ACCENTED: Record<string, string> = {
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
  n: "ñ", o: "ó", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ",
  N: "Ñ", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

export function pseudoize(text: string): string {
  return text ? `⟦${text.replace(/[A-Za-z]/g, (ch) => ACCENTED[ch] ?? ch)}⟧` : text;
}

/** Whether this page load asked for the pseudo-locale. */
export function pseudoRequested(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("locale") === "pseudo";
}
