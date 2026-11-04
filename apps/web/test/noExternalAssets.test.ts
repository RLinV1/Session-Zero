import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css|html)$/.test(p) ? [p] : [];
  });

// shortcut: line-based regex, not a parser; a URL built across lines is not caught.
const LOADERS = [
  /\b(?:src|srcSet|poster|data)\s*=\s*["'{`]*\s*["'`]https?:\/\//,
  /<link\b[^>]*\bhref\s*=\s*["']https?:\/\//,
  /url\(\s*["']?https?:\/\//,
  /\bimport\s*(?:\(|[^;]*?from\s*)["']https?:\/\//,
  /\bfetch\(\s*["'`]https?:\/\//,
  /\bnew\s+(?:Audio|Image|Worker|WebSocket|EventSource)\(\s*["'`]https?:\/\//,
  /\b(?:@import|importScripts)\b[^\n]*https?:\/\//,
];

describe("no third-party loads at runtime (site-policies)", () => {
  it("never loads scripts, fonts, images or audio from another origin", () => {
    const hits: string[] = [];
    for (const file of [join(web, "index.html"), ...walk(join(web, "src"))]) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (LOADERS.some((re) => re.test(line))) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
