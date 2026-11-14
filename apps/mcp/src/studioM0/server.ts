import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import { STUDIO_SCOPE, type Principal } from "./auth";
import { renderMarkedCrop, renderProbeImage } from "./crop";
import { downloadOriginal, type DownloadPolicy } from "./download";
import { StudioError, summarize, type EvidenceLog, type WorkspaceStore } from "./store";
import { VIEW_URI } from "./view";

/**
 * M0 ONLY — the fixture Studio's MCP tools (interactive-ai-scene-studio tasks 1.3–1.8). Every call is
 * already authenticated by the HTTP guard; `principal` is that verified identity. Nothing here
 * reaches Session Zero builds, rooms, accounts or library items.
 */

export interface StudioServerDeps {
  principal: Principal;
  store: WorkspaceStore;
  log: EvidenceLog;
  download: DownloadPolicy;
  answerKeyFile: string;
  viewHtml: string;
}

const MAX_PROBE_BYTES = 12 * 1024 * 1024;
const MAX_DECODED_PIXELS = 40_000_000;

const securitySchemes = [{ type: "oauth2", scopes: [STUDIO_SCOPE] }];
const appOnly = { ui: { visibility: ["app"] }, "openai/visibility": "private", "openai/widgetAccessible": true, securitySchemes };
const modelOnly = { ui: { visibility: ["model"] }, securitySchemes };

const text = (value: string): CallToolResult["content"][number] => ({ type: "text", text: value });
const refusal = (message: string): CallToolResult => ({ isError: true, content: [text(message)] });

async function guard(name: string, log: EvidenceLog, subject: string, run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof StudioError) {
      await log.write("tool_refused", { tool: name, subject, message: err.message });
      return refusal(err.message);
    }
    await log.write("tool_failed", { tool: name, subject, message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return refusal("Something went wrong on the Studio M0 server. Try again.");
  }
}

const rectArg = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().min(1), height: z.number().int().min(1) });
const fileArg = z.object({
  download_url: z.string().max(4096),
  file_id: z.string().max(512),
  mime_type: z.string().max(200).optional(),
  file_name: z.string().max(500).optional(),
}).describe("A file the user attached in chat or chose in the Studio. ChatGPT fills this in.");

export function createStudioM0Server(deps: StudioServerDeps): McpServer {
  const { principal, store, log } = deps;
  const subject = principal.subject;
  const server = new McpServer({ name: "session-zero-studio-m0", version: "0.0.1" }, {
    instructions: "Session Zero Studio M0 is a TEST fixture: synthetic images only, no real builds. Use studio_m0_open to show the Studio. When the user sends a Studio request id, read it with studio_m0_get_request.",
  });
  const workspaceFor = async (workspaceId?: string) => (workspaceId ? store.get(subject, workspaceId) : store.open(subject));

  registerAppResource(server, "Session Zero Studio M0", VIEW_URI, {
    description: "Fixture-only Studio proof view.",
    _meta: { ui: { prefersBorder: true } },
  }, async () => {
    await log.write("resource_read", { subject, uri: VIEW_URI, bytes: Buffer.byteLength(deps.viewHtml) });
    return { contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.viewHtml, _meta: { ui: { prefersBorder: true } } }] };
  });

  registerAppTool(server, "studio_m0_open", {
    title: "Open the Studio (M0 test)",
    description: "Show the Session Zero Studio M0 test view for this user's fixture workspace. It shows a synthetic map and the workspace's saved value.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: VIEW_URI }, "openai/outputTemplate": VIEW_URI, "openai/widgetAccessible": true, securitySchemes },
  }, async () => guard("studio_m0_open", log, subject, async () => {
    const workspace = await store.open(subject);
    await log.write("tool", { tool: "studio_m0_open", subject, workspaceId: workspace.id, version: workspace.version });
    return { structuredContent: summarize(workspace), content: [text(`Opened the Studio M0 fixture workspace ${workspace.id} at version ${workspace.version}. Its saved value is "${workspace.value}".`)] };
  }));

  registerAppTool(server, "studio_m0_workspace", {
    title: "Read the Studio workspace",
    description: "Read the fixture workspace's current version, value, files and saved requests. Used by the Studio view to refresh.",
    inputSchema: z.object({ workspaceId: z.string().max(64) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: appOnly,
  }, async ({ workspaceId }) => guard("studio_m0_workspace", log, subject, async () => {
    const workspace = store.get(subject, workspaceId);
    await log.write("poll", { subject, workspaceId, version: workspace.version });
    return { structuredContent: summarize(workspace), content: [text(`Workspace ${workspace.id} is at version ${workspace.version}.`)] };
  }));

  server.registerTool("studio_m0_set_value", {
    title: "Change the saved test value",
    description: "Change the fixture workspace's saved value. An open Studio view should show the new value without being reopened.",
    inputSchema: z.object({ value: z.string().min(1).max(80), workspaceId: z.string().max(64).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: modelOnly,
  }, async ({ value, workspaceId }) => guard("studio_m0_set_value", log, subject, async () => {
    const workspace = await workspaceFor(workspaceId);
    store.setValue(workspace, value);
    await log.write("tool", { tool: "studio_m0_set_value", subject, workspaceId: workspace.id, version: workspace.version, value });
    return { content: [text(`Saved "${value}". Workspace ${workspace.id} is now at version ${workspace.version}.`)] };
  }));

  registerAppTool(server, "studio_m0_import_file", {
    title: "Import an original image",
    description: "Store the original bytes of a map image the user attached in chat or chose in the Studio, and report its SHA-256, byte count and decoded size. The original is never resized.",
    inputSchema: z.object({ file: fileArg, workspaceId: z.string().max(64).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { "openai/fileParams": ["file"], "openai/widgetAccessible": true, securitySchemes },
  }, async ({ file, workspaceId }, ctx) => guard("studio_m0_import_file", log, subject, async () => {
    const workspace = await workspaceFor(workspaceId);
    let origin: string | null = null;
    try { origin = new URL(file.download_url).origin; } catch { /* reported by the downloader */ }
    await log.write("import_attempt", { subject, workspaceId: workspace.id, fileId: file.file_id, origin, mimeType: file.mime_type ?? null, fileName: file.file_name ?? null, protocolMeta: ctx.mcpReq._meta ? Object.keys(ctx.mcpReq._meta) : [] });
    const downloaded = await downloadOriginal(file.download_url, deps.download);
    let meta: Metadata;
    try {
      meta = await sharp(downloaded.bytes, { limitInputPixels: MAX_DECODED_PIXELS }).metadata();
      await sharp(downloaded.bytes, { limitInputPixels: MAX_DECODED_PIXELS }).raw().toBuffer(); // full decode
    } catch {
      throw new StudioError("That file isn't a readable PNG, JPEG or WebP image (or it's too large to decode). Nothing was stored.");
    }
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
    const mimeType = formats[meta.format ?? ""];
    if (!mimeType || !meta.width || !meta.height) throw new StudioError("Only PNG, JPEG and WebP images can be imported. Nothing was stored.");
    const turned = (meta.orientation ?? 1) >= 5;
    const stored = store.addFile(workspace, {
      name: (file.file_name ?? "import").slice(0, 200), source: "import", mimeType, bytes: downloaded.bytes,
      width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height, origin: downloaded.origin,
    });
    const report = { fileId: stored.id, sha256: stored.sha256, bytes: stored.bytes.length, width: stored.width, height: stored.height, format: meta.format, exifOrientation: meta.orientation ?? null, origin: downloaded.origin, workspaceVersion: workspace.version };
    await log.write("import_stored", { subject, workspaceId: workspace.id, hostFileId: file.file_id, ...report });
    return { structuredContent: report, content: [text(`Stored the original: ${report.bytes} bytes, ${report.width}×${report.height}, SHA-256 ${report.sha256}.`)] };
  }));

  server.registerTool("studio_m0_view_crop", {
    title: "Look at part of the map",
    description: "Return a picture of a region of the workspace map, in map pixels (whole map if no region is given). Describe anything drawn on the picture that isn't part of the map. With includeImage false, no picture is returned.",
    inputSchema: z.object({
      x: z.number().int().min(0).optional(), y: z.number().int().min(0).optional(),
      width: z.number().int().min(1).optional(), height: z.number().int().min(1).optional(),
      includeImage: z.boolean().optional(), fileId: z.string().max(64).optional(), workspaceId: z.string().max(64).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: modelOnly,
  }, async ({ x, y, width, height, includeImage, fileId, workspaceId }) => guard("studio_m0_view_crop", log, subject, async () => {
    const workspace = await workspaceFor(workspaceId);
    const file = workspace.files.get(fileId ?? workspace.mapFileId);
    if (!file) throw new StudioError("No file with that id in this workspace.");
    const withImage = includeImage !== false;
    const crop = await renderMarkedCrop(file, { x, y, width, height }, deps.answerKeyFile, withImage ? "image" : "control");
    await log.write("crop", { subject, cropId: crop.cropId, withImage, crop: crop.crop, output: crop.output, pngBytes: crop.png.length });
    const summary = `Crop ${crop.cropId} of ${file.name}: map pixels x ${crop.crop.x}, y ${crop.crop.y}, ${crop.crop.width}×${crop.crop.height}, shown at ${crop.output.width}×${crop.output.height}.`;
    return withImage
      ? { content: [text(summary), { type: "image", data: crop.png.toString("base64"), mimeType: "image/png" }] }
      : { content: [text(`${summary} The picture was left out of this result.`)] };
  }));

  registerAppTool(server, "studio_m0_save_request", {
    title: "Save a selection request",
    description: "Save the region the user selected in the Studio and their instruction. Returns the request id the chat message names.",
    inputSchema: z.object({ workspaceId: z.string().max(64), rect: rectArg, instruction: z.string().min(1).max(500), baseVersion: z.number().int().min(0) }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: appOnly,
  }, async ({ workspaceId, rect, instruction, baseVersion }) => guard("studio_m0_save_request", log, subject, async () => {
    const workspace = store.get(subject, workspaceId);
    const map = workspace.files.get(workspace.mapFileId)!;
    if (rect.x + rect.width > map.width || rect.y + rect.height > map.height) throw new StudioError(`The selection must lie inside the ${map.width}×${map.height} map.`);
    const request = store.saveRequest(workspace, { rect, instruction, baseVersion });
    await log.write("request_saved", { subject, workspaceId, requestId: request.id, rect, baseVersion, instructionChars: instruction.length });
    return { structuredContent: { requestId: request.id, status: request.status, workspaceVersion: workspace.version }, content: [text(`Saved request ${request.id}.`)] };
  }));

  server.registerTool("studio_m0_get_request", {
    title: "Read a Studio request",
    description: "Read a region and instruction the user saved in the Studio, by the request id their message names.",
    inputSchema: z.object({ requestId: z.string().max(64) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: modelOnly,
  }, async ({ requestId }) => guard("studio_m0_get_request", log, subject, async () => {
    const { workspace, request } = store.findRequest(subject, requestId);
    const first = request.status !== "observed";
    store.markObserved(workspace, request);
    await log.write("request_observed", { subject, requestId, first, msSinceSaved: Date.parse(request.observedAt!) - Date.parse(request.createdAt) });
    const map = workspace.files.get(workspace.mapFileId)!;
    return {
      structuredContent: { requestId, rect: request.rect, instruction: request.instruction, baseVersion: request.baseVersion, map: { fileId: map.id, width: map.width, height: map.height } },
      content: [text(`Request ${requestId}: "${request.instruction}" for the map region x ${request.rect.x}, y ${request.rect.y}, ${request.rect.width}×${request.rect.height} pixels (of ${map.width}×${map.height}), saved at workspace version ${request.baseVersion}.`)],
    };
  }));

  registerAppTool(server, "studio_m0_get_media", {
    title: "Get image bytes for the Studio view",
    description: "Return one workspace image's bytes to the Studio view through this authenticated call, so no public image address is needed.",
    inputSchema: z.object({
      workspaceId: z.string().max(64), fileId: z.string().max(64).optional(),
      carrier: z.enum(["meta", "structured"]).optional(), probeBytes: z.number().int().min(1024).max(MAX_PROBE_BYTES).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: appOnly,
  }, async ({ workspaceId, fileId, carrier, probeBytes }) => guard("studio_m0_get_media", log, subject, async () => {
    const workspace = store.get(subject, workspaceId);
    let bytes: Buffer;
    let mimeType = "image/png";
    let id: string;
    if (probeBytes) {
      bytes = await renderProbeImage(probeBytes);
      id = `probe-${probeBytes}`;
    } else {
      const file = workspace.files.get(fileId ?? workspace.mapFileId);
      if (!file) throw new StudioError("No file with that id in this workspace.");
      bytes = file.bytes;
      mimeType = file.mimeType;
      id = file.id;
    }
    const media = { fileId: id, mimeType, bytes: bytes.length, data: bytes.toString("base64") };
    const via = carrier ?? "meta";
    await log.write("media", { subject, fileId: id, bytes: bytes.length, base64Chars: media.data.length, carrier: via });
    const info = { fileId: id, mimeType, bytes: bytes.length, carrier: via };
    return via === "meta"
      ? { structuredContent: info, content: [text("Image bytes delivered to the Studio view.")], _meta: { "sessionzero/media": media } }
      : { structuredContent: { ...info, media }, content: [text("Image bytes delivered to the Studio view.")] };
  }));

  registerAppTool(server, "studio_m0_report", {
    title: "Report Studio view diagnostics",
    description: "Record the Studio view's own diagnostics (host behavior, render and CSP results) for the M0 evidence log.",
    inputSchema: z.object({
      workspaceId: z.string().max(64).optional(),
      events: z.array(z.object({ at: z.string().max(40), type: z.string().max(60), detail: z.unknown() })).max(40),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: appOnly,
  }, async ({ events }) => guard("studio_m0_report", log, subject, async () => {
    for (const event of events) {
      const detail = JSON.stringify(event.detail ?? null);
      await log.write("view", { subject, viewAt: event.at, type: event.type, detail: detail.length > 2000 ? `${detail.slice(0, 2000)}…` : JSON.parse(detail) });
    }
    return { content: [text(`Recorded ${events.length} events.`)] };
  }));

  return server;
}
