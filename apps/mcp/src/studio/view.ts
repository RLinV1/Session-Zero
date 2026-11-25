import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { studioIntake } from "../../../web/src/i18n/en/studioIntake";
import { studioIntakeZhTW } from "../../../web/src/i18n/zh-TW/studioIntake";
import { VIEW_SCRIPT } from "./viewScript";
import { buildStudio } from "../../../web/scripts/build-studio.mjs";

/** Static, credential-free resource. Neither original URLs nor account data are interpolated. */
async function buildView() {
  const require = createRequire(import.meta.url);
  const source = await readFile(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
  const match = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(source);
  if (!match) throw new Error("Unsupported MCP Apps browser bundle");
  const pairs = match[1]!.split(",").filter(Boolean).map((part) => { const [local, exported] = part.trim().split(/\s+as\s+/); return `${JSON.stringify(exported ?? local)}:${local}`; });
  const bundle = source.slice(0, match.index) + `globalThis.__studioApps={${pairs.join(",")}};`;
  const renderer = process.env.NODE_ENV === "production"
    ? JSON.parse(await readFile(new URL("../../dist/studio.json", import.meta.url), "utf8")) as { script: string; styles: string }
    : await buildStudio();
  const catalogs = JSON.stringify({ en: studioIntake, "zh-TW": studioIntakeZhTW }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Session Zero</title>
<style>${renderer.styles.replace(/<\/style/gi, "<\\/style")}
:root{color-scheme:dark;--bg:#121417;--panel:#181b20;--text:#e3e6ea;--muted:#a4adb9;--line:#6a7280;--accent:#b3552d;--focus:#e08a62;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:20px;display:grid;gap:20px}header,.controls,.identity{display:flex;align-items:center;flex-wrap:wrap;gap:12px}header{justify-content:space-between}h1{font-size:21px;line-height:1.2;margin:0}h2{font-size:16px;margin:0 0 8px}p{margin:0;max-width:72ch}small,.muted{color:var(--muted)}button,select,input{font:inherit;color:inherit}button,select{border:1px solid var(--line);border-radius:6px;background:var(--panel);padding:9px 12px;min-height:44px}button{cursor:pointer}button:hover{background:#272c33}button:disabled{opacity:.55;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:3px}::selection{background:var(--accent);color:#fff8f3}a{color:var(--focus);text-underline-offset:3px}select{max-width:100%}.identity{font-size:14px}.identity strong{font-weight:600;overflow-wrap:anywhere}.identity span{color:var(--muted)}#status{font-size:13px;min-height:20px}#stage{min-height:220px;background:#0e1013;border-radius:8px;overflow:hidden}#preparation{width:100%}#source{width:100%;height:auto;max-height:min(55vh,560px);object-fit:contain;-webkit-user-drag:none}#source[hidden],#empty[hidden],#legacy[hidden]{display:none}#empty{padding:40px 24px;text-align:center}#empty h2{font-size:21px}#empty p{margin-top:8px;color:var(--muted)}.files{border-top:1px solid #272c33;padding-top:20px}ul{list-style:none;padding:0;margin:0}li{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:10px 0;border-bottom:1px solid #272c33}.filename{flex:1;min-width:100px;overflow-wrap:anywhere}#legacy{font-size:13px;color:var(--muted)}.language{display:flex;gap:8px;align-items:center;font-size:13px}@media(max-width:480px){main{padding:14px;gap:16px}.controls>*{max-width:100%}#stage{min-height:180px}li small{width:100%}}
</style></head><body><main>
<header><h1 data-t="title"></h1><button id="fullscreen" data-t="fullscreen" type="button"></button></header>
<div class="identity"><span data-t="build"></span><strong id="build"></strong><span data-t="owner"></span><strong id="owner"></strong></div>
<p id="status" role="status" aria-live="polite"></p>
<section id="stage"><div id="preparation"></div></section>
<p id="legacy" data-t="legacy" hidden></p>
<section class="files"><h2 data-t="outcomes"></h2><ul id="outcomes" aria-live="polite"></ul></section>
<section class="files"><h2 data-t="files"></h2><ul id="files"></ul></section>
<div class="controls"><button id="refresh" type="button" data-t="refresh"></button><label class="language"><span data-t="language"></span><select id="language"><option value="en" data-t="en"></option><option value="zh-TW" data-t="zh"></option></select></label></div>

</main><script type="module">${renderer.script.replace(/<\/script/gi, "<\\/script")}</script><script type="module">${bundle.replace(/<\/script/gi, "<\\/script")}</script><script type="module">const catalogs=${catalogs};\n${VIEW_SCRIPT}</script></body></html>`;
  return { html, uri: `ui://session-zero/studio.${createHash("sha256").update(html).digest("hex").slice(0, 16)}.html` };
}
export const studioView = await buildView();
