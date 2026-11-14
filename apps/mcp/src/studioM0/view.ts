import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

/**
 * M0 ONLY: the Studio proof view, served as a static, credential-free `ui://` resource (design D2).
 * The ext-apps browser bundle is inlined so the view needs no network access of its own. All data
 * and media come through host-proxied tool calls; nothing here carries a token or a private URL.
 */

export const VIEW_URI = "ui://session-zero/studio-m0.html";

/** The bundle ends in `export{a as App,...}`; expose those names on a global so the view script can use them. */
export function exposeBundle(source: string): string {
  const match = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(source);
  if (!match) throw new Error("ext-apps bundle has no trailing export clause");
  const pairs = (match[1] ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [local, exported] = part.split(/\s+as\s+/);
    return `${JSON.stringify(exported ?? local)}:${local}`;
  });
  return `${source.slice(0, match.index)}globalThis.__extApps={${pairs.join(",")}};`.replace(/<\/script/gi, "<\\/script");
}

export async function buildViewHtml(): Promise<string> {
  const require = createRequire(import.meta.url);
  const bundle = exposeBundle(await readFile(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8"));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session Zero Studio M0</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f2;--fg:#1f1b16;--muted:#6b6255;--line:#d8cfbf;--accent:#7c4a1e;--ok:#15803d;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1b1916;--fg:#eee7da;--muted:#a59b8b;--line:#3b362f;--accent:#e0a36b;--ok:#4ade80;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{padding:12px;display:grid;gap:10px}header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
h1{font-size:15px;margin:0}.pill{font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}button{font:inherit;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
#stage{position:relative;border:1px solid var(--line);border-radius:6px;overflow:hidden;touch-action:none;user-select:none;max-width:100%}
#stage img{display:block;width:100%;height:auto}#sel{position:absolute;border:2px dashed var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);display:none;pointer-events:none}
label{font-size:12px;color:var(--muted)}input[type=number]{width:72px}input,textarea{font:inherit;background:transparent;color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:3px 5px}
textarea{width:100%;min-height:52px}.value{font-size:18px;font-weight:600}.ok{color:var(--ok)}.bad{color:var(--bad)}
details{border-top:1px solid var(--line);padding-top:6px}pre{font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;margin:4px 0}
</style></head>
<body><main>
<header><h1>Session Zero Studio — M0 proof (fixture only)</h1><span class="row"><span class="pill" id="conn">connecting…</span><button id="fullscreen" type="button">Fullscreen</button></span></header>
<section class="row" aria-live="polite"><span>Saved value:</span><span class="value" id="value">—</span><span class="pill" id="version">v—</span><span class="pill" id="poll">refresh: idle</span></section>
<div id="stage" aria-label="Fixture map. Drag to select a region, or use the number fields."><img id="map" alt="Fixture map"><div id="sel"></div></div>
<section class="row" aria-label="Selection in map pixels">
<label>x <input id="sx" type="number" min="0" step="1"></label><label>y <input id="sy" type="number" min="0" step="1"></label>
<label>width <input id="sw" type="number" min="1" step="1"></label><label>height <input id="sh" type="number" min="1" step="1"></label></section>
<label for="instruction">What should the AI change in this region?</label>
<textarea id="instruction" maxlength="500">Make the doorway on this wall a locked door.</textarea>
<div class="row"><button class="primary" id="send" type="button">Send selection to chat</button><span id="reqstatus" aria-live="polite"></span></div>
<div class="row"><button id="pick" type="button">Add file from ChatGPT</button><label class="row">Upload from this device <input id="file" type="file" accept="image/png,image/jpeg,image/webp"></label><span id="filestatus" aria-live="polite"></span></div>
<details><summary>Diagnostics</summary><pre id="diag"></pre></details>
</main>
<script type="module">${bundle}</script>
<script type="module">
const { App, PostMessageTransport } = globalThis.__extApps;
const $ = (id) => document.getElementById(id);
const POLL_MS = 5000;
const state = { workspaceId: null, version: null, mapFileId: null, mapShown: null, timer: null, polls: 0, pending: [], requests: {}, lastVersionAt: null };
const diag = [];
function note(type, detail) {
  const entry = { at: new Date().toISOString(), type, detail };
  diag.push(entry); state.pending.push(entry);
  $("diag").textContent = diag.slice(-80).map((d) => d.at.slice(11, 23) + " " + d.type + " " + JSON.stringify(d.detail ?? "")).join("\\n");
}
addEventListener("securitypolicyviolation", (e) => note("csp_violation", { directive: e.effectiveDirective, blocked: String(e.blockedURI).slice(0, 60), sample: e.sample?.slice(0, 60) }));
addEventListener("error", (e) => note("error", { message: String(e.message).slice(0, 300) }));
addEventListener("unhandledrejection", (e) => note("unhandled_rejection", { message: String(e.reason?.message ?? e.reason).slice(0, 300) }));

const app = new App({ name: "session-zero-studio-m0", version: "0.0.1" }, {}, { autoResize: true });
async function call(name, args) {
  const started = performance.now();
  try {
    const result = await app.callServerTool({ name, arguments: args });
    if (name !== "studio_m0_report") note("call", { name, ms: Math.round(performance.now() - started), isError: result.isError === true, hasMeta: Boolean(result._meta), hasStructured: Boolean(result.structuredContent) });
    if (result.isError) throw new Error(result.content?.map((c) => c.text).join(" ") || "tool error");
    return result;
  } catch (err) {
    if (name !== "studio_m0_report") note("call_failed", { name, ms: Math.round(performance.now() - started), message: String(err?.message ?? err).slice(0, 300) });
    throw err;
  }
}
async function flushReport() {
  if (!state.pending.length) return;
  const events = state.pending.splice(0, 40);
  try { await call("studio_m0_report", { workspaceId: state.workspaceId ?? undefined, events }); } catch { state.pending.unshift(...events); }
}
setInterval(() => { if (!document.hidden) void flushReport(); }, 10000);

function show(summary) {
  if (!summary?.workspaceId) return;
  const changed = state.version !== null && summary.version !== state.version;
  state.workspaceId = summary.workspaceId;
  if (changed) { state.lastVersionAt = Date.now(); note("version_seen", { from: state.version, to: summary.version, value: summary.value, polls: state.polls }); }
  state.version = summary.version;
  $("value").textContent = summary.value; $("version").textContent = "v" + summary.version;
  for (const r of summary.requests ?? []) {
    const before = state.requests[r.requestId];
    if (before && before.status !== r.status) note("request_status", { requestId: r.requestId, status: r.status });
    state.requests[r.requestId] = { ...(before ?? {}), status: r.status };
    if (r.requestId === state.lastRequestId) renderRequest();
  }
  if (summary.mapFileId && summary.mapFileId !== state.mapFileId) { state.mapFileId = summary.mapFileId; void loadMap(); }
}
async function refresh(reason) {
  if (!state.workspaceId) return;
  state.polls++;
  $("poll").textContent = "refresh: " + reason + " #" + state.polls;
  try { show((await call("studio_m0_workspace", { workspaceId: state.workspaceId })).structuredContent); $("conn").textContent = "connected"; $("conn").className = "pill ok"; }
  catch { $("conn").textContent = "stale — retrying"; $("conn").className = "pill bad"; }
}
function startPolling() { if (state.timer || document.hidden) return; state.timer = setInterval(() => void refresh("poll"), POLL_MS); note("poll_start", { everyMs: POLL_MS }); }
function stopPolling(why) { if (!state.timer) return; clearInterval(state.timer); state.timer = null; note("poll_stop", { why }); }
document.addEventListener("visibilitychange", () => { note("visibility", { hidden: document.hidden }); if (document.hidden) stopPolling("hidden"); else { void refresh("visible"); startPolling(); } });

function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function tryImage(src, scheme) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ scheme, ok: true, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve({ scheme, ok: false }); img.src = src; });
}
async function fetchMedia(args) {
  const meta = await call("studio_m0_get_media", { ...args, carrier: "meta" });
  let media = meta._meta?.["sessionzero/media"];
  let carrier = "meta";
  if (!media?.data) { const structured = await call("studio_m0_get_media", { ...args, carrier: "structured" }); media = structured.structuredContent?.media; carrier = "structured"; }
  if (!media?.data) throw new Error("no media bytes in either carrier");
  return { ...media, carrier };
}
async function loadMap() {
  try {
    const media = await fetchMedia({ workspaceId: state.workspaceId, fileId: state.mapFileId });
    const dataUrl = "data:" + media.mimeType + ";base64," + media.data;
    const blobUrl = URL.createObjectURL(new Blob([b64ToBytes(media.data)], { type: media.mimeType }));
    const [d, b] = await Promise.all([tryImage(dataUrl, "data"), tryImage(blobUrl, "blob")]);
    note("media_render", { fileId: media.fileId, bytes: media.bytes, carrier: media.carrier, data: d, blob: b });
    const img = $("map");
    if (b.ok) { img.src = blobUrl; state.mapShown = "blob"; } else if (d.ok) { img.src = dataUrl; state.mapShown = "data"; URL.revokeObjectURL(blobUrl); } else note("media_unrenderable", {});
  } catch (err) { note("media_failed", { message: String(err?.message ?? err).slice(0, 300) }); }
}
// Size ceiling probe for E6: called from the diagnostics on demand by the operator through the model-visible tool text.
window.studioProbe = async (bytes) => { try { const m = await fetchMedia({ workspaceId: state.workspaceId, probeBytes: bytes }); const r = await tryImage("data:" + m.mimeType + ";base64," + m.data, "data"); note("probe", { requested: bytes, bytes: m.bytes, carrier: m.carrier, render: r }); } catch (err) { note("probe_failed", { requested: bytes, message: String(err?.message ?? err).slice(0, 200) }); } };

// Selection in canonical map pixels; pan and zoom never enter saved geometry.
let drag = null;
const stage = $("stage");
function toMap(ev) { const img = $("map"); const box = img.getBoundingClientRect(); const s = img.naturalWidth / box.width || 1; return { x: Math.round((ev.clientX - box.left) * s), y: Math.round((ev.clientY - box.top) * s) }; }
function drawSel() {
  const img = $("map"); const s = img.getBoundingClientRect().width / (img.naturalWidth || 1); const el = $("sel");
  const [x, y, w, h] = ["sx", "sy", "sw", "sh"].map((id) => Number($(id).value));
  if (!w || !h) { el.style.display = "none"; return; }
  Object.assign(el.style, { display: "block", left: x * s + "px", top: y * s + "px", width: w * s + "px", height: h * s + "px" });
}
stage.addEventListener("pointerdown", (ev) => { drag = toMap(ev); stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => { if (!drag) return; const p = toMap(ev); $("sx").value = Math.min(drag.x, p.x); $("sy").value = Math.min(drag.y, p.y); $("sw").value = Math.abs(p.x - drag.x); $("sh").value = Math.abs(p.y - drag.y); drawSel(); });
stage.addEventListener("pointerup", () => { drag = null; });
for (const id of ["sx", "sy", "sw", "sh"]) $(id).addEventListener("input", drawSel);
addEventListener("resize", drawSel);

function renderRequest() {
  const r = state.requests[state.lastRequestId]; if (!r) return;
  const label = { saved: "Saved", handedOff: "Handed to chat — waiting for the AI", handoffRefused: "The chat didn't accept the message", observed: "The AI read this request" }[r.phase ?? r.status] ?? r.status;
  $("reqstatus").textContent = state.lastRequestId + ": " + (r.status === "observed" ? "The AI read this request" : label);
}
$("send").addEventListener("click", async () => {
  const rect = { x: Number($("sx").value), y: Number($("sy").value), width: Number($("sw").value), height: Number($("sh").value) };
  const instruction = $("instruction").value.trim();
  if (!rect.width || !rect.height || !instruction) { $("reqstatus").textContent = "Select a region and write an instruction first."; return; }
  try {
    const saved = (await call("studio_m0_save_request", { workspaceId: state.workspaceId, rect, instruction, baseVersion: state.version ?? 0 })).structuredContent;
    state.lastRequestId = saved.requestId; state.requests[saved.requestId] = { status: "saved", phase: "saved" }; renderRequest();
    const text = "Session Zero Studio request " + saved.requestId + ": " + instruction + "\\nPlease call studio_m0_get_request with requestId \\"" + saved.requestId + "\\" and tell me which map region it names.";
    const started = performance.now();
    const result = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    note("send_message", { requestId: saved.requestId, ms: Math.round(performance.now() - started), result });
    state.requests[saved.requestId].phase = result?.isError ? "handoffRefused" : "handedOff"; renderRequest();
    void refresh("after-send");
  } catch (err) { note("send_failed", { message: String(err?.message ?? err).slice(0, 300) }); $("reqstatus").textContent = "Couldn't send: " + (err?.message ?? err); }
});

async function importFileId(fileId, meta) {
  const { downloadUrl } = await window.openai.getFileDownloadUrl({ fileId });
  note("file_download_url", { fileId, origin: (() => { try { return new URL(downloadUrl).origin; } catch { return "invalid"; } })() });
  const result = await call("studio_m0_import_file", { workspaceId: state.workspaceId, file: { download_url: downloadUrl, file_id: fileId, mime_type: meta?.mimeType, file_name: meta?.fileName } });
  $("filestatus").textContent = result.content?.map((c) => c.text).join(" ") ?? "imported";
  note("file_imported", { fileId, structured: result.structuredContent });
  void refresh("after-import");
}
$("pick").addEventListener("click", async () => {
  if (typeof window.openai?.selectFiles !== "function") { note("select_files_unavailable", { openai: Boolean(window.openai), keys: window.openai ? Object.keys(window.openai).slice(0, 40) : [] }); $("filestatus").textContent = "This host doesn't offer a file picker to apps."; return; }
  try { const files = await window.openai.selectFiles(); note("select_files", { count: files?.length ?? 0, types: (files ?? []).map((f) => f.mimeType) }); for (const f of files ?? []) await importFileId(f.fileId, f); }
  catch (err) { note("select_files_failed", { message: String(err?.message ?? err).slice(0, 300) }); $("filestatus").textContent = "Couldn't add the file: " + (err?.message ?? err); }
});
$("file").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0]; if (!file) return;
  note("file_input", { name: file.name, type: file.type, bytes: file.size });
  if (typeof window.openai?.uploadFile !== "function") { note("upload_file_unavailable", {}); $("filestatus").textContent = "This host doesn't let apps upload files."; return; }
  try { const { fileId } = await window.openai.uploadFile(file); note("upload_file", { fileId }); await importFileId(fileId, { mimeType: file.type, fileName: file.name }); }
  catch (err) { note("upload_file_failed", { message: String(err?.message ?? err).slice(0, 300) }); $("filestatus").textContent = "Couldn't upload: " + (err?.message ?? err); }
});
$("fullscreen").addEventListener("click", async () => {
  try { const r = await app.requestDisplayMode({ mode: "fullscreen" }); note("display_mode", r); } catch (err) { note("display_mode_failed", { message: String(err?.message ?? err) }); }
});

app.ontoolinput = (p) => note("tool_input", { keys: Object.keys(p?.arguments ?? {}) });
app.ontoolresult = (p) => { note("tool_result", { hasStructured: Boolean(p?.structuredContent), workspaceId: p?.structuredContent?.workspaceId ?? null }); show(p?.structuredContent); void refresh("tool-result"); startPolling(); };
app.onhostcontextchanged = (p) => note("host_context_changed", { keys: Object.keys(p ?? {}), displayMode: p?.displayMode });
app.onteardown = async () => { stopPolling("teardown"); note("teardown", {}); await flushReport(); return {}; };

try {
  await app.connect(new PostMessageTransport(window.parent, window.parent));
  const ctx = app.getHostContext?.();
  note("connected", { host: app.getHostVersion?.(), capabilities: app.getHostCapabilities?.(), displayMode: ctx?.displayMode, availableDisplayModes: ctx?.availableDisplayModes, platform: ctx?.platform, locale: ctx?.locale, openaiGlobal: Boolean(window.openai), openaiKeys: window.openai ? Object.keys(window.openai).slice(0, 40) : [], origin: location.origin });
  $("conn").textContent = "connected"; $("conn").className = "pill ok";
  setTimeout(async () => {
    if (state.workspaceId) return;
    note("recover_open", { reason: "no tool result after 2s" });
    try { show((await call("studio_m0_open", {})).structuredContent); startPolling(); } catch { /* noted */ }
  }, 2000);
} catch (err) { note("connect_failed", { message: String(err?.message ?? err).slice(0, 300) }); $("conn").textContent = "not connected"; $("conn").className = "pill bad"; }
</script></body></html>`;
}
