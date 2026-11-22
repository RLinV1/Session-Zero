import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEWS } from "../src/news/entries";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

describe("news entries (site-news-and-feedback)", () => {
  it("have unique ids and run newest first", () => {
    expect(new Set(NEWS.map((e) => e.id)).size).toBe(NEWS.length);
    const dates = NEWS.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("carry every word in both languages", () => {
    for (const e of NEWS) {
      for (const lang of ["en", "zh-TW"] as const) {
        expect(e.title[lang].trim(), `${e.id} title ${lang}`).not.toBe("");
        expect(e.body[lang].length, `${e.id} body ${lang}`).toBeGreaterThan(0);
        if (e.link) expect(e.link.label[lang].trim()).not.toBe("");
        if (e.media) expect(e.media.alt[lang].trim(), `${e.id} alt ${lang}`).not.toBe("");
      }
    }
  });

  it("say the same thing in both languages, section for section", () => {
    const shape = (blocks: (typeof NEWS)[number]["body"]["en"]) => blocks.map((b) => ("ul" in b ? `ul${b.ul.length}` : "h" in b ? "h" : "p"));
    for (const e of NEWS) expect(shape(e.body["zh-TW"]), e.id).toEqual(shape(e.body.en));
  });

  it("open with a dated lead paragraph, as a press release does", () => {
    for (const e of NEWS) {
      const lead = e.body.en[0];
      expect(lead && "p" in lead && lead.p, e.id).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4} — /);
      expect(new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }), e.id)
        .toBe((lead as { p: string }).p.split(" — ")[0]);
    }
  });

  it("point at media that exists, each used by one post only", () => {
    const srcs = NEWS.flatMap((e) => (e.media ? [e.media.src] : []));
    expect(new Set(srcs).size).toBe(srcs.length);
    for (const src of srcs) expect(existsSync(PUBLIC + src), src).toBe(true);
  });
});
