import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { StudioContext, StudioSnapshot } from "@vtt/shared";
import { studioView } from "./view";
import { studioIntake } from "../../../web/src/i18n/en/studioIntake";
import { studioIntakeZhTW } from "../../../web/src/i18n/zh-TW/studioIntake";

const File = z.strictObject({ download_url: z.string().min(1).max(8192), file_id: z.string().min(1).max(512), mime_type: z.string().max(200).optional(), file_name: z.string().max(500).optional() });
const Locale = z.enum(["en", "zh-TW"]).optional();
const securitySchemes = [{ type: "oauth2", scopes: ["studio:build"] }];
const appOnly = { ui: { visibility: ["app"] }, "openai/visibility": "private", "openai/widgetAccessible": true, securitySchemes };
const text = (value: Record<string, unknown>, display = value): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(display) }], structuredContent: value,
});
const result = (value: unknown) => z.record(z.string(), z.unknown()).parse(value);
function intakeErrorText(code: string, locale?: string) {
  const catalog = locale === "zh-TW" ? studioIntakeZhTW : studioIntake;
  return catalog[`error.${code}` as keyof typeof studioIntake] ?? catalog["error.unknown"];
}

class StudioHttpError extends Error {
  partial?: Record<string, unknown>;
  savedFileId?: string;
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface StudioToolsDeps { roomServerUrl: string; publicOrigin: string; token: string; clientAddress: string }

export function registerStudioTools(server: McpServer, deps: StudioToolsDeps) {
  async function send(buildId: string, method: string, path: string, body?: unknown, locale = "en") {
    let response: Response;
    try {
      response = await fetch(`${deps.roomServerUrl}/api/studio/builds/${encodeURIComponent(buildId)}${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${deps.token}`, "x-forwarded-for": deps.clientAddress, "accept-language": locale, ...(body !== undefined && { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new StudioHttpError(503, "storage"); }
    if (response.ok) return response;
    const problem = await response.json().catch(() => ({})) as { code?: unknown; savedFileId?: unknown };
    const error = new StudioHttpError(response.status, typeof problem.code === "string" ? problem.code : response.status === 401 ? "access" : response.status === 404 ? "missing" : "storage");
    const saved = z.uuid().safeParse(problem.savedFileId); if (saved.success) error.savedFileId = saved.data;
    throw error;
  }
  const guarded = async (locale: string | undefined, run: () => Promise<CallToolResult>): Promise<CallToolResult> => {
    try { return await run(); }
    catch (error) {
      const status = error instanceof StudioHttpError ? error.status : 503, code = error instanceof StudioHttpError ? error.code : "storage";
      return { isError: true, ...(error instanceof StudioHttpError && error.partial && { structuredContent: error.partial }), content: [{ type: "text", text: intakeErrorText(code, locale) }],
        _meta: { "sessionzero/error": { status, code }, ...(status === 401 && { "mcp/www_authenticate": [`Bearer resource_metadata="${deps.publicOrigin}/.well-known/oauth-protected-resource/mcp/studio", error="invalid_token"`] }) } };
    }
  };
  const importOne = async (buildId: string, kind: "map" | "token", file: z.infer<typeof File>, index: number, locale?: string) => {
    try {
      const data = result(await (await send(buildId, "POST", "/intake", { kind, file }, locale)).json());
      const saved = result(data.file);
      return { index, kind, status: "saved" as const, fileId: z.uuid().parse(saved.id) };
    } catch (e) {
      if (e instanceof StudioHttpError && e.savedFileId) return { index, kind, status: "saved" as const, fileId: e.savedFileId };
      const uncertain = !(e instanceof StudioHttpError) || e.status === 401 || e.status >= 500;
      const code = e instanceof StudioHttpError ? e.code : "storage";
      return { index, kind, status: uncertain ? "unknown" as const : "failed" as const, code, message: intakeErrorText(code, locale) };
    }
  };
  const snapshot = async (buildId: string, locale?: string) => {
    const saved = StudioSnapshot.parse(await (await send(buildId, "GET", "/studio", undefined, locale)).json());
    return { ...saved, websitePath: new URL(saved.websitePath, deps.publicOrigin).toString() };
  };
  registerAppResource(server, "Session Zero Scene Studio", studioView.uri, {
    description: "Session Zero saved preparation and protected build intake. Static, credential-free view.",
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  }, async () => ({ contents: [{ uri: studioView.uri, mimeType: RESOURCE_MIME_TYPE, text: studioView.html,
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } }] }));
  registerAppTool(server, "studio_open", {
    title: "Open Scene Studio",
    description: "Open this connected build's Studio whenever the user asks to see or reopen it, including before preparation. Pass originals attached in the ChatGPT chat in mapFiles/tokenFiles to import them. Report each failed file using its message. The owner can also upload originals on the Session Zero website at /builds/{buildId} after sign-in. The already-open view loads saved grid, geometry, terrain and placements as tool writes arrive. Use context or studio_set_context to explicitly select an existing map and its encounter; selection never redirects writes. Rules and sheets stay in chat. Reopening does not create a build. Use fullscreen to return to the view.",
    inputSchema: z.object({ buildId: z.uuid(), mapFiles: z.array(File).max(5).optional(), tokenFiles: z.array(File).max(5).optional(), context: StudioContext.optional(), locale: Locale }).refine((args) => (args.mapFiles?.length ?? 0) + (args.tokenFiles?.length ?? 0) <= 5),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: studioView.uri, visibility: ["model"] }, "openai/outputTemplate": studioView.uri, "openai/fileParams": ["mapFiles", "tokenFiles"], securitySchemes },
  }, async ({ buildId, mapFiles, tokenFiles, context, locale }) => guarded(locale, async () => {
    await snapshot(buildId, locale);
    const files = [...(mapFiles ?? []).map((file) => ({ kind: "map" as const, file })), ...(tokenFiles ?? []).map((file) => ({ kind: "token" as const, file }))];
    const outcomes = await Promise.all(files.map(({ kind, file }, index) => importOne(buildId, kind, file, index, locale)));
    const map = outcomes.find((outcome) => outcome.kind === "map" && outcome.status === "saved");
    try {
      if (map?.status === "saved") await send(buildId, "POST", "/binding", { fileId: map.fileId }, locale);
      if (context) await send(buildId, "POST", "/studio/context", context, locale);
      await snapshot(buildId, locale);
    } catch (e) { if (e instanceof StudioHttpError) e.partial = { buildId, bindingVersion: 1, outcomes }; throw e; }
    const payload = { buildId, bindingVersion: 1, outcomes };
    return text(payload, { ...payload, outcomes: outcomes.map(({ code: _code, ...outcome }) => outcome) });
  }));
  registerAppTool(server, "studio_snapshot", {
    title: "Read saved Studio preparation", description: "Load saved identity, explicit map/encounter context, prepared layers, detector state and actual preparation outcomes for this view. Identifiers are not credentials.",
    inputSchema: z.object({ buildId: z.uuid(), locale: Locale }), annotations: { readOnlyHint: true, openWorldHint: false }, _meta: appOnly,
  }, async ({ buildId, locale }) => guarded(locale, async () => text(await snapshot(buildId, locale))));
  registerAppTool(server, "studio_bind_file", {
    title: "Show a saved source map", description: "Choose a map file for display in this build; it does not edit a draft map or an encounter.",
    inputSchema: z.object({ buildId: z.uuid(), fileId: z.uuid(), locale: Locale }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, _meta: appOnly,
  }, async ({ buildId, fileId, locale }) => guarded(locale, async () => { await send(buildId, "POST", "/binding", { fileId }, locale); return text({ buildId, fileId }); }));
  registerAppTool(server, "studio_set_context", {
    title: "Show a saved map and encounter",
    description: "Select the exact saved source/map/encounter to display in an already-open Studio. Call after save_map and save_encounter so the user sees the prepared scene. Read get_build for keys and file ids. Use null map/encounter for a raw source, and null encounter to inspect only its map. All selected items must belong to this build; map source and encounter map must match. Does not edit or retarget any draft, confirm a grid, change owner permissions, or publish.",
    inputSchema: z.object({ buildId: z.uuid(), context: StudioContext, locale: Locale }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true, securitySchemes },
  }, async ({ buildId, context, locale }) => guarded(locale, async () => {
    await send(buildId, "POST", "/studio/context", context, locale);
    return text({ buildId, context });
  }));
  registerAppTool(server, "studio_get_media", {
    title: "Load a protected preview", description: "Return authorized preview bytes to the view through this app-initiated request. No public image URL is returned.",
    inputSchema: z.object({ buildId: z.uuid(), fileId: z.uuid(), privacy: z.enum(["private", "legacy-public"]).optional(), locale: Locale }), annotations: { readOnlyHint: true, openWorldHint: false }, _meta: appOnly,
  }, async ({ buildId, fileId, privacy, locale }) => guarded(locale, async () => {
    // A routing hint avoids a redundant snapshot for a view that just read one. It confers no
    // authority: both target routes authorize the build/file and recheck access after reading.
    let resolvedPrivacy = privacy;
    if (!resolvedPrivacy) {
      const data = await snapshot(buildId, locale);
      const file = data.files.find((f) => f.id === fileId);
      if (!file) throw new StudioHttpError(404, "missing");
      resolvedPrivacy = file.privacy;
    }
    const response = await send(buildId, "GET", resolvedPrivacy === "private" ? `/files/${fileId}/media?variant=preview` : `/files/${fileId}/preview`, undefined, locale);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4 * 1024 ** 2) throw new StudioHttpError(413, "size");
    // No image is attached to an open/model result; only this app-only response carries bytes.
    return { content: [], _meta: { "sessionzero/media": { fileId, mimeType: "image/webp", data: bytes.toString("base64") } } };
  }));
}
