# Research and decision record

**Checked:** 2026-11-14. **Code baseline:** `a86160f584c44c8e8998bc56966e214ff04b5a08`. Findings below separate observed code, published documentation, proposed choices and unperformed experiments.

## Product decisions and proposed defaults

| Topic | Disposition | Basis |
| --- | --- | --- |
| Core problem | Confirmed | The user cannot see preparation until returning from ChatGPT to Session Zero. |
| From-scratch journey | Confirmed direction | The user welcomed the walkthrough from a raw map through visible preparation, correction and final website review. |
| Unpublished artwork | Confirmed 2026-11-14 | User selected authorized access for unpublished images. Existing random public URLs are insufficient for new Studio uploads. |
| User's AI and existing builder | Confirmed | Reuse `/mcp/build`, native data and library publication; preserve the old standalone branch as reference. |
| Planning boundary | Confirmed | Work on this packet together; no feature implementation until design agreement. |
| First host | Proposed default | User has no preference; ChatGPT web addresses the described current workflow. Claude is the next compatibility target. |
| Final authority | Proposed design consistent with the agreed journey | Website owner session publishes; the AI and embedded app propose. In-chat iteration does not require a website visit between corrections. |
| Credentials | Proposed design | Scoped OAuth for hosted release; existing expiring passes can support controlled proof/local workflows. |
| Initial scope | First-release boundary confirmed 2026-11-14 | The user confirmed image maps and AI-traced geometry first, with arbitrary editing of imported UVTT walls deferred. Existing UVTT workflows remain available; one active map/encounter per working context remains the proposed implementation scope. |
| Comparison and concurrency | Proposed default | Same-camera comparison, atomic corrections, explicit stale conflicts, no automatic merging. |
| Delivery | Proposed for review | M0–M5, fresh bounded sessions, primary-source preflight and evidence-based completion. |

The earlier idea of requiring a website Keep action after every correction is superseded by private iteration in chat and one final website review. Acceptance of the image-first release boundary does not record architecture sign-off or select a runtime implementation session. The user next asked whether to start an agent's milestone research; research and actual M0 qualification remain distinct.

## Observed implementation and reuse

| Evidence in repository | Finding and consequence |
| --- | --- |
| `apps/mcp/src/buildTools.ts`, `app.ts` | Ten build tools; stateless JSON Streamable HTTP; no registered UI resource or Studio synchronization. Extend this service. |
| `apps/server/src/http/build.ts` | Separate account-owner and pass routes; pass cannot publish or change choices. The setup response has numbered lines and terrain information. |
| `apps/server/src/store/buildStore.ts`, both adapters | Owner-edited and published item locks; guarded writes and transactional publication. No immutable Studio revision history. |
| Setup save route and `DraftMapSetupChange` | Whole-part replacement. The handler supplies its own current item version to the store; the model does not submit its inspected base version. This cannot prevent a sequential stale model replacement. |
| `packages/shared/src/build.ts` | Native grid-corner lines, opening reconciliation, Base terrain, grid binding and token-placement validation. Reuse these instead of a portable manifest. |
| `apps/server/src/domain/buildPublish.ts` | Owner-reviewed dependency versions checked before planning and again by the store. Published dependencies can be reused at current library values; Studio review must bind the actual reused values too. |
| `apps/server/src/app.ts`, `store/assetStore.ts` | Public `/uploads` handling and local fallback; current object-store initialization enables public read. A protected route alone does not make those source bytes private. |
| `apps/web/src/pages/mapEditor/MapCanvas.tsx` | Reusable SVG map camera and map-coordinate input. |
| `TerrainSetup.tsx`, `MapLines.tsx`, `EncounterBoard.tsx` | Reusable terrain, geometry selection and encounter presentation; currently spread across different review views. |
| `mapEditor/draftConnection.ts`, `libraryBoardDraft.ts` | Existing private editor adapter; library geometry loses transient IDs on storage. Stable Studio IDs need their own authoring boundary. |
| `apps/web/securityHeaders.ts`, `deploy/Caddyfile` | Whole-site framing prohibited. Serve a dedicated MCP UI resource instead of weakening the website's framing headers globally. |
| `apps/mcp/package.json` | `@modelcontextprotocol/sdk` is `^1.32.2`; compatible ext-apps integration or a bounded SDK migration must be proved. |
| `openspec/changes/ai-build-terrain/tasks.md` | Terrain implementation/checks recorded; architecture review and real connector qualification remain pending there. Those checks do not qualify the Studio. |
| `docs/M5-M6-product-validation.md` | Existing product-validation guidance favors observable complete-session evidence. Studio qualification should follow that standard. |

Recent main includes guest hosting. Build routes still require accounts; guest-room credentials are not a shortcut to Studio access.

## Primary documentation

These are documentation observations, not evidence that Session Zero has passed a live host test. Recheck relevant pages when a milestone depends on changing behavior.

| ID | Primary source | Relevant documented fact |
| --- | --- | --- |
| R1 | [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) | Tools reference `ui://` HTML resources; the app communicates with a sandboxing host. Support is optional. |
| R2 | [MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html) | Host, server and view have distinct responsibilities; views can call tools, read resources and be torn down. |
| R3 | [OpenAI: Add UI](https://developers.openai.com/plugins/build/chatgpt-ui) | ChatGPT supports the shared Apps bridge. Fullscreen accommodates canvases; data and render operations can be separated. |
| R4 | [OpenAI: File APIs](https://developers.openai.com/plugins/reference#file-apis) | Explicit file metadata and optional file helpers support original-file handoff. Tool data visible to the model differs from component-only metadata. |
| R5 | [OpenAI: Authentication](https://developers.openai.com/plugins/build/auth) | Private/write integrations use MCP-compatible OAuth and discovery. The authorization server can connect an existing application identity. |
| R6 | [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | Defines resource-server/client roles and protected-resource discovery. Registration options differ across protocol generations. |
| R7 | [SDK App reference](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html#updateModelContext) | Updating model context prepares future turns; it does not itself trigger an immediate response. |
| R8 | [OpenAI: Plugin extensions](https://developers.openai.com/plugins/build/extensions) | Panels, sidebar entry points and deeper host integration are extensions with surface/access limits. They are optional for this design. |
| R9 | [Official SDK README](https://github.com/modelcontextprotocol/ext-apps#readme) | Current examples document 2.x MCP SDK peers and wire compatibility of 1.x/2.x views. Dependency selection needs a real compatibility check. Resolved to a recommendation by the M0 research below (Q1). |
| R10 | [Claude: Getting started](https://claude.com/docs/connectors/building/mcp-apps/getting-started) | Standard Apps are supported; richer app features can have organization, remote-server and listing prerequisites. |
| R11 | [Claude: Display modes](https://claude.com/docs/connectors/building/mcp-apps/display-modes) | Larger views are host controlled; side-panel availability is not universal. |
| R12 | [Claude: Messages](https://claude.com/docs/connectors/building/mcp-apps/send-messages) | Prior inspection documented consent/composer behavior. Reopening this page on 2026-11-14 failed; recheck before Claude qualification rather than relying on that earlier observation. |
| R13 | [OpenSpec workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md) | Planning artifacts can be refined as implementation supplies evidence. Optional exploration is distinct from implementation. |

### Claims deliberately not made

- A ChatGPT attachment automatically reaches this server.
- A model necessarily sees an image just because the tool returned one.
- An open view automatically receives every later tool result.
- Host acknowledgement proves that the AI received or completed a correction.
- Tool annotations or app-only visibility prove a human approved publication.
- A local harness proves ChatGPT, Claude, mobile or production behavior.

## Required experiments

### M0: actual ChatGPT web

Use an authorized development endpoint or tunnel, non-sensitive fixtures and the existing application service boundary. A separate standalone product service is not the deliverable.

1. Confirm the actual ChatGPT surface, model, available connection settings and user-visible consent. Record exact versions and access conditions.
2. Exercise transport discovery/initialization, UI resource retrieval and the chosen compatible SDK path. Render the map UI in the host and inspect console failures.
3. Transfer a known original image and compare its hash/dimensions independently. Demonstrate an actionable expired-descriptor failure.
4. Return a crop containing a marker introduced only in the server-generated visual response. Ask the model to identify it without putting the answer in text/metadata. Record a control without the visual response. This is a visibility check, not a general map-accuracy benchmark.
5. Modify a saved test value through another actual tool call and verify the mounted view retrieves it. Reopen the view and verify persistent state.
6. Select a region, submit a readable request and observe what the host actually does, including composer/consent/error handling. Trace the exact request ID through the subsequent AI tool read.
7. Prove the proposed OAuth and protected-media mechanisms in the host using test identities/assets before integrating them with real build authority. Record which pieces use fixtures/stubs and which use the application stack.

If a required host action cannot be performed, retain the harness and instructions, label that experiment pending and keep M0 unqualified. Do not replace the named evidence with a scripted MCP client and check the task complete.

### Reachability is a separate observation

Earlier public probes received Cloudflare browser challenges. They did not establish origin MCP availability. An operator-access health/log check can establish origin behavior; a real public MCP exchange establishes the proxy path; authentication and real-chat UI tests establish further layers. Record each separately. A development tunnel does not verify production. No production or edge-configuration change is authorized by this planning packet.

### M1–M5 targeted follow-up

| Milestone | Question/experiment | Decision it supplies |
| --- | --- | --- |
| M1 | Probe private originals, crops and thumbnails through every application/static/storage path with missing, foreign, expired and revoked authority. | Private storage routing, authenticated media transport and revocation implementation. |
| M2 | Measure one representative map's save-to-display latency and tool-call volume, including an unmounted/hidden view. | Refresh interval and whether polling is adequate. |
| M3 | Race an owner edit, a stale AI proposal and a legacy save against the same target in memory and Postgres. | Precise write guard and compatibility behavior. |
| M3 | Measure bounded snapshot sizes for representative dense geometry and terrain. | History cap and byte budget with an actionable non-destructive limit error. |
| M4 | Select a crossing wall, cropped-edge cells and a multi-cell token after pan/zoom. | Scope hit-testing and complete-object confirmation. |
| M5 | Fail publication before its last dependency and probe the would-be public image alias throughout. | Evidence that failed publication cannot disclose protected media. |
| M5 | Change a reused library dependency after review. | A dependency manifest that binds what is actually published. |

## M0 research — 2026-11-14

**Scope:** research only. No application code, dependency, lockfile, deployment, infrastructure, tunnel or host connection was created or changed. No M0 experiment against ChatGPT was performed; every task in tasks.md §1 remains unchecked. M1 was not started.

**Base:** branch `docs/interactive-ai-scene-studio-m0-research`, created from planning commit `5159b88aeaa3071f52ec23eb71414e1300dfff9b` (code baseline `a86160f5`). `origin/main` is now `16a9262a` (one commit, #198, web guest-demo UI). It changes none of the paths inspected here: `apps/mcp`, build routes, asset store, `app.ts`, security headers, Caddyfile, lockfile. The old standalone branch `feat/mcp-scene-preparation` (`2d19d1ec`, local only, not on origin, with uncommitted edits in its worktree) was **read only** and preserved.

### Evidence labels

| Label | Meaning |
| --- | --- |
| **[D]** | Documented in a primary source; not observed by Session Zero. |
| **[L]** | Observed locally in this session against installed packages; not host behavior. |
| **[P]** | Observed in real ChatGPT on 2026-11-12 by the old standalone branch: a different service and SDK stack, user-transcribed, **without any MCP Apps view**. Supporting evidence only; it does not qualify this change. |
| **[U]** | Unobserved; requires the M0 experiment named. |

### Additional sources (checked 2026-11-14; no page showed a revision date unless stated)

| ID | Source | Relevant fact |
| --- | --- | --- |
| R14 | [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | Removes `initialize`/`notifications/initialized` and `Mcp-Session-Id`. Each request carries protocol version and capabilities in `_meta`. Adds `server/discover`; `Mcp-Method`/`Mcp-Name` headers are required on HTTP POST. Deprecates DCR. |
| R15 | [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md) | A modern client against a legacy server "Fails". A *dual-era* client falls back to `initialize` after an HTTP 4xx without a modern error body. Modern servers reject unknown versions with -32022. |
| R16 | [MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md) | Client priority is pre-registered, then CIMD, then DCR. CIMD and pre-registration are SHOULD; DCR is MAY and deprecated. Servers MUST validate the token audience (RFC 8707) and MUST NOT pass tokens through. |
| R17 | [OpenAI: Connect ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Auth](https://developers.openai.com/plugins/build/auth) | ChatGPT supports CIMD, DCR, predefined clients and PKCE S256, and sends `resource` on authorize and token requests. Callback is `https://chatgpt.com/connector_platform_oauth_redirect` (with RFC 9207) or `https://chatgpt.com/connector/oauth/{id}`. `_meta["mcp/www_authenticate"]` triggers linking. "Account and workspace policies apply." |
| R18 | [OpenAI MCP extensions spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) | `ui/message` extension defaults to `{ target: "active", send: true }`; `send: false` drafts without submitting. "On Web: image content in model context is not yet supported" (for `ui/update-model-context`). Context is "attached ... on initialization or remount". |
| R19 | [ext-apps: migrate to v2](https://apps.extensions.modelcontextprotocol.io/api/documents/migrate-to-v2.html) | The two SDK lines "share no classes or types"; remove 1.x. Requires zod ^4.2 and Node 20+. `extra.signal` becomes `extra.mcpReq.signal`. `ui/*` wire messages are byte-identical to 1.x. |
| R20 | [ext-apps releases](https://github.com/modelcontextprotocol/ext-apps/releases); npm registry metadata queried 2026-11-14 | npm `latest` is **2.0.4** (2026-10-27). 2.1.0 is on npm (2026-10-27T08:31Z) but untagged, while GitHub labels v2.1.0 "Latest" (10 Nov) with "no new wire messages". 1.7.5 (2026-07-23) is the last 1.x and peers `@modelcontextprotocol/sdk ^1.29.0`. 2.x peers `core`/`client` ^2 (required) and `server` ^2 (optional). |
| R21 | [App class reference](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html) | `callServerTool`/`readServerResource` are "proxied through the host". `downloadFile` exists and "typically" asks confirmation. `sendMessage`/`updateModelContext` entries were not read verbatim. |
| R22 | Old branch `openspec/changes/mcp-scene-preparation/tasks.md` §1.2 records and `review.md` (commit `2d19d1ec`) | [P] evidence summarized under Q3/Q5. Raw evidence lives in that branch's ignored `.local`/`proof.local` folders and was not copied. |

### Q1. MCP SDK / ext-apps compatibility

| Finding | Label |
| --- | --- |
| `apps/mcp` pins `@modelcontextprotocol/sdk ^1.32.2` (lock 1.32.2, the current npm `latest` of the 1.x line). The SDK is imported only in `apps/mcp`: `src/app.ts`, `src/tools.ts`, `src/buildTools.ts`, `test/helpers.ts`, `test/path.test.ts`. | [L] |
| SDK 1.32.2 supports protocol versions up to `2025-11-25`. Same transport configuration as `app.ts` (stateless, JSON responses): `initialize` offering `2026-07-28` is answered `200` with `protocolVersion: 2025-11-25`. `tools/list` and `server/discover` with header `2026-07-28` return **HTTP 400, code -32000** ("Unsupported protocol version"), not the modern -32022. | [L] |
| `@modelcontextprotocol/server` 2.4.0 `createMcpHandler(factory, { legacy: "stateless" })` answers legacy `initialize` (200, `2025-11-25`) **and** modern `server/discover`/`tools/list` (200, `supportedVersions: ["2026-07-28"]`). It rejects a modern request that lacks `Mcp-Method` with -32020. | [L] |
| ChatGPT sent `MCP-Protocol-Version: 2026-07-28` on authenticated tool calls to a v2 (`server` 2.4.0) endpoint. | [P] |
| Whether ChatGPT is dual-era, i.e. would fall back to `initialize` against the current v1 endpoint. `/mcp/build` has never been connected to ChatGPT (`mcp-game-builder` 1.3/8.4 and `ai-build-terrain` 4.6 unchecked). | [U] |
| ext-apps 1.7.5 works with SDK 1.x but is a frozen line. ext-apps 2.x requires the v2 packages and "share[s] no classes" with 1.x. The `ui/*` wire is identical, so the view-side choice does not affect the host. | [D] |
| `@modelcontextprotocol/ext-apps@2.0.4` ships `dist/src/app-with-deps.js`: a 541,828-byte self-contained ESM bundle with no imports that exports `App`. It can be inlined into a static `ui://` HTML resource without a bundler. `./server` exports `registerAppTool`, `registerAppResource` and `RESOURCE_MIME_TYPE`. | [L] |
| `@modelcontextprotocol/express` 2.0.2 exports resource-server helpers only (`requireBearerAuth`, `mcpAuthMetadataRouter`, `OAuthTokenVerifier`, host/origin validation). It has no authorization-server router. | [L] |

**Conclusion:** migrate `apps/mcp` (both `/mcp` and `/mcp/build`, since they share one package) to the v2 split packages with `createMcpHandler({ legacy: "stateless" })`, and use ext-apps 2.0.4. This is the only stack with observed ChatGPT success ([P]). It serves both protocol eras ([L]), so it removes the unobserved dual-era dependency. It is also the maintained ext-apps line. The migration is bounded to five files plus `package.json`, and the 15 existing MCP test files guard regressions. **Fallback**, only if the migration regresses the player endpoint: keep v1 1.32.2 with ext-apps 1.7.5. In that case M0 must first prove that ChatGPT falls back to `2025-11-25`. **Reevaluate** when ext-apps moves npm `latest` to 2.1.x, or if ChatGPT negotiates differently.

### Q2. Rendering and refreshing an open Studio inside ChatGPT web

| Finding | Label |
| --- | --- |
| ChatGPT "implements the open MCP Apps standard". Resources use `text/html;profile=mcp-app`; tools link through `_meta.ui.resourceUri` (`openai/outputTemplate` is an alias). | [D] R3, R1 |
| Attaching a template to every tool "can re-render your iframe too often". Only the open/render tool should carry `resourceUri`. | [D] R3 |
| The spec requires `tool-result` delivery only for the tool whose execution the view displays. **No rule delivers later, unrelated tool results to an open view.** Persistence and restoration are listed as future work. | [D] R1 |
| `visibility: ["app"]` tools are hidden from the model but callable via `tools/call`. The host MUST reject app calls to tools without `"app"`. OpenAI's `openai/widgetAccessible` is a compatibility field (default false), and its default is not reconciled with `visibility`. | [D] R1, R3 |
| `requestDisplayMode({ mode: "fullscreen" })`, `availableDisplayModes` inline/fullscreen/pip and `widgetSessionId` per mounted instance are documented. Whether widget state or the tool result is re-delivered when a conversation is reloaded is not stated. | [D] R3 |
| The website's `X-Frame-Options: DENY` / `frame-ancestors 'none'` (`apps/web/securityHeaders.ts`, `deploy/Caddyfile`) do not affect a `ui://` resource, which is delivered as JSON-RPC content. | [L] |

**Conclusion:** keep D2. Use one model-visible `open` tool with `resourceUri`, and app-only read tools polled while visible (5 s, paused when `document.hidden`, stopped on teardown). Refresh immediately after the view's own writes. Recover state from the backend using the workspace ID carried in the open tool's result. Polling is required by the spec's silence, not just a precaution. **[U]:** E4 measures latency, call volume and reopen behavior.

### Q3. Original-image transfer and model-visible cropped images

| Finding | Label |
| --- | --- |
| `_meta["openai/fileParams"]` names top-level file inputs `{ download_url, file_id, mime_type?, file_name? }`. Widget helpers `uploadFile`, `selectFiles` (feature-detect) and `getFileDownloadUrl({ fileId })` cover files "uploaded by the widget, selected from the file library, passed via file params". There are no documented size, type or URL-lifetime limits, and passing a widget-obtained URL into a tool is not documented. These helpers are OpenAI extensions, not MCP Apps standard (the standard has no upload). | [D] R4, R1 |
| A composer-attached PNG reached a model-invoked tool via fileParams. The observed download origin was `https://sdmntpreastus3.oaiusercontent.com`, and the hosted SHA-256, byte count and decoded 1024×768 matched an independent local check (14,741 bytes). An unapproved-origin refusal, cross-scope refusal and expired-reference refusal were also observed. | [P] R22 |
| A model-invoked tool returning an MCP `image/png` block (256×192 crop with two overlay-only marks) let the model name both marks' colors and shapes, with ≤0.176 source-pixel error. A fresh-chat control with the image omitted was run. | [P] R22 |
| `_meta` is "Delivered only to the component. Hidden from the model"; `content` and `structuredContent` are surfaced to both. Image content in `ui/update-model-context` is "not yet supported" on Web. | [D] R3, R18 |
| Current uploads keep original bytes unchanged (`apps/server/src/http/imageUpload.ts` reads `metadata()` only) and record EXIF-oriented width and height. Previews apply `.rotate()` (`build.ts` preview route). Orientation is the only coordinate-affecting transform today, which fits D3. | [L] |
| `view_file` already returns MCP `image/webp` content from `/files/:id/preview`, including region crops with overlays (`buildTools.ts`). This is the existing model-visible crop path. | [L] |

**Conclusion:** crops for the model are **tool results with image content**, never model-context updates. For originals, the documented route is fileParams. Test both entry points in E2: a composer attachment with a model tool call, and the embedded view (`selectFiles`/`uploadFile`, then `getFileDownloadUrl`, then an app-only import tool). Port the old branch's bounded downloader policy (empty origin allowlist, approve only the observed origin after verification, no redirects, identity encoding, streamed byte cap, timeout, no credentials) rather than hard-coding a vendor domain. Do not move bulk bytes through ordinary JSON tool arguments (D9).

### Q4. Selection-to-chat message submission

| Finding | Label |
| --- | --- |
| `ui/message`: "Host SHOULD add the message to the conversation context"; "Host MAY request user consent". It returns `{}` on success and -32000 "Message sending denied" on refusal. The standard does not say whether the message is sent immediately or drafted. | [D] R1 |
| On ChatGPT, `ui/message` defaults to `send: true` (submits); `send: false` drafts into the composer. `sendFollowUpMessage` is the legacy alias. No limits or consent rules are documented. | [D] R18, R3 |
| `ui/update-model-context` is used in future turns and MAY be deferred to the next user message. It does not by itself trigger a turn. | [D] R1, R7 |

**Conclusion:** save first, then hand off. The view calls an app-only `save_request` tool, which returns a server-issued request ID. It then calls `sendMessage` with readable text naming that ID and the tool to call. The view shows *handed off* until the server logs the model's `get_request(requestId)`, then *observed*. A `{}` acknowledgement is never shown as completion. Fallback if refused: a copyable prompt plus `send: false`. **[U]:** E5 records actual send, draft and consent behavior.

### Q5. Scoped OAuth and protected image delivery

| Finding | Label |
| --- | --- |
| The server MUST serve RFC 9728 metadata (well-known path or 401 `resource_metadata`) and MUST validate the audience. The `resource` parameter is sent by ChatGPT. Use 401/403 `insufficient_scope` challenges. | [D] R16, R17 |
| Real ChatGPT completed authorization code + PKCE against an independent Cognito test directory with a **predefined confidential client** and the callback `https://chatgpt.com/connector/oauth/{id}`. The resource server verified issuer, audience (public `/mcp` URL), expiry, subject, scope and client ID with `requireBearerAuth` and a `jose` verifier. That infrastructure is retired. | [P] R22 |
| Whether **app-originated** `tools/call` carries the same bearer. The docs state the token is attached to "subsequent MCP requests" and that view calls are host-proxied, but do not say so explicitly for widget calls. | [U] |
| The view never holds the token. `apps/mcp` rejects requests whose `Origin` is not allowlisted (`app.ts:46-50`), so a view `fetch()` to `/mcp` fails by design, while host-proxied calls (no `Origin`) pass. | [L] |
| Default view CSP when `ui.csp` is omitted: `img-src 'self' data:`, `connect-src 'none'`. The spec also shows a `connect-src 'self'` template, which is inconsistent. `blob:` is not mentioned. Server image origins need `resourceDomains`. The default sandbox domain is `https://web-sandbox.oaiusercontent.com`; a unique `_meta.ui.domain` is required only for submission. | [D] R1, R3 |
| Every build file is currently public: `assets.put` returns `/uploads/<uuid>`; S3 bucket policy `s3:GetObject` for `*`; local `express.static` fallback with `cache-control: public, immutable` (`assetStore.ts`, `app.ts:194-216`). `readPrivate` is a server-side read, not private storage. | [L] |
| Pass authority today is a bearer pass hashed and looked up per request (`passGuard`, `build.ts:666-686`). Another build reads as nonexistent, and the pass never carries publication authority. | [L] |

**Conclusion (proposed for M1, proved with stubs in M0):**

- **Grant verification:** Session Zero itself is the authorization server. The owner's website session signs in, chooses builds and consents. It issues opaque, hashed, expiring, revocable delegated tokens with audience = the public `/mcp/build` resource, following the existing pass-hash pattern. `apps/mcp` validates through an `OAuthTokenVerifier` that calls an `apps/server` introspection route. It then calls build routes carrying a server-verified grant reference, not caller-asserted identity. This keeps `apps/mcp` an HTTP client and avoids external IdP infrastructure. The maintained AS library choice remains an M1 decision, since v2 `express` has no AS router.
- **Media:** the view calls an app-only `get_media` tool with the user's bearer (host-proxied). It receives bounded bytes in the result (`_meta` preferred, because it is hidden from the model, but not an access-control boundary). It renders them as `data:` (spec default) or `blob:` (to be proved). No public URL, no `resourceDomains` image origin, and private responses use `no-store`. A short-lived, single-file capability URL is the fallback only if E6 shows payload limits make tool transport impractical.

### Recommended approach

One approach, grounded in the existing service:

1. Migrate `apps/mcp` to SDK v2 (`createMcpHandler({ legacy: "stateless" })` behind the existing Express app, keeping its origin guard, 64 KB body limit and scrubbed errors) and add ext-apps 2.0.4.
2. Add an **M0-only, fixture-only** endpoint `/mcp/studio-m0`, mounted only when an explicit environment flag is set. It has its own in-memory fixture workspace, a credential-free inline `ui://` view, and a stub OAuth test authorization server shaped like the proposed M1 design. It does **not** touch real build authority, `apps/server`, `packages/shared` or `apps/web`, consistent with D7 ("before integrating them with real build authority").
3. Keep `/mcp` and `/mcp/build` behavior unchanged apart from the SDK swap.
4. Run E1–E7 in real ChatGPT web through a user-authorized development tunnel, then record results here and update D2/D7/D8/D9 only where evidence requires.

Rejected for M0: staying on v1 (it depends on unobserved dual-era fallback and the frozen ext-apps 1.x line); importing the old standalone service; framing the website; an external cloud IdP (needs provisioning outside M0's authority).

### Bounded M0 prototype and test plan

**Proposed files** (none created yet):

| Path | Change |
| --- | --- |
| `apps/mcp/package.json`, `package-lock.json` | Remove `@modelcontextprotocol/sdk`. Add exact pins `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/node@2.1.2`, `@modelcontextprotocol/core@2.4.0`, `@modelcontextprotocol/client@2.4.0` (ext-apps peer; also used by tests), `@modelcontextprotocol/ext-apps@2.0.4`, optionally `@modelcontextprotocol/express@2.0.2` for `requireBearerAuth`. zod 4.6.7 already satisfies ^4.2. All versions were published ≥18 days before 2026-11-14. |
| `apps/mcp/src/app.ts`, `tools.ts`, `buildTools.ts` | Import and handler-context migration only. |
| `apps/mcp/test/helpers.ts`, `test/path.test.ts` | Client migration; all existing MCP tests must pass unchanged in intent. |
| `apps/mcp/src/studioM0/` (new) | `server.ts` (tools/resources), `view.html` (inline `app-with-deps` + small view script), `fixtureStore.ts`, `fixtureAuth.ts` (stub AS + verifier), `download.ts` (bounded provider fetch). |
| `apps/mcp/test/studioM0.test.ts` (new) | Dual-era transport, app/model visibility, auth refusal/expiry/revocation, download bounds, hash checks. |
| `openspec/changes/interactive-ai-scene-studio/research.md`, `handoff.md`, `tasks.md` | Evidence; check boxes only for real-host passes. |

**Proposed M0 tools:**

| Tool | Visibility | Purpose |
| --- | --- | --- |
| `studio_m0_open` | model, carries `resourceUri` | Opens the view on a fixture workspace and returns its ID. |
| `studio_m0_workspace` | app | Polled read of the versioned fixture state. |
| `studio_m0_set_value` | model | Independent write for E4. |
| `studio_m0_import_file` | model + app, `openai/fileParams` | Original intake for E2. |
| `studio_m0_view_crop` | model | Overlay-marker crop or control for E3. |
| `studio_m0_save_request` | app | Saves a selection request (E5). |
| `studio_m0_get_request` | model | Reads a saved request (E5). |
| `studio_m0_get_media` | app | Authenticated bytes for E6. |

**Experiments** (map to tasks.md 1.1–1.9; each stays unchecked until it passes in real ChatGPT web):

| # | Task | Procedure | Success criterion |
| --- | --- | --- | --- |
| E0 | 1.1, 1.2 | Record surface (web vs "Work" mode), plan, model label, Chrome version and workspace policy. Run origin health and tunnel health separately, then a real ChatGPT MCP exchange. | Readiness record names the commit, tunnel host, versions and each layer's result; no production or edge change. |
| E1 | 1.3 | Connect ChatGPT, list tools, open the view inline, request fullscreen. Capture server-side `MCP-Protocol-Version`/era per request and browser console. Also run locally: v2 legacy `initialize` and modern `server/discover` against all three endpoints. | View renders and responds in ChatGPT; negotiated era recorded; zero CSP/console errors attributable to the app; existing MCP tests pass. |
| E2 | 1.4 | A: attach a synthetic fixture PNG in the composer and ask for import. B: import from inside the view. Compare hash, bytes and decoded size with a locally computed record. Replay a stale descriptor after it expires (measure lifetime). Try an unapproved origin and an oversize file. | Byte-identical original for at least one route; actionable expiry/size/origin refusals with the fixture workspace intact; no thumbnail accepted. Route B is recorded as unsupported if the host lacks it. |
| E3 | 1.5 | Server draws a randomly chosen overlay-only marker on a crop (operator-only answer key). Ask the model to describe it; repeat in a fresh chat with the image omitted. | Correct identification with the image; control cannot identify it; no answer in text, metadata or prompt. |
| E4 | 1.6 | With the view open, change the value through `studio_m0_set_value` in a later turn. Measure save-to-display time and app call count per minute while visible, hidden and after close. Reload the conversation and reopen. | Change displayed within one 5 s interval with no reload; polling stops when hidden or closed; reopened view shows backend state (not only widget state). |
| E5 | 1.7 | Draw a rectangle, enter instructions, submit. Observe send/draft/consent; then confirm via server log that the model called `studio_m0_get_request` with the same ID. Also try a denial or cancel. | Request ID traced end to end; view distinguishes saved, handed off and observed; acknowledgement never shown as completion. |
| E6 | 1.8 | Connect with the stub AS (discovery, PKCE, `resource`, audience). Confirm app-only calls arrive with the bearer. Render media via `data:` and `blob:` at about 256 KiB, 1, 4 and 8 MiB. Expire and revoke the token mid-session; probe with a missing or foreign token. | App calls authenticated; denied/expired/revoked calls return no bytes and a `mcp/www_authenticate` recovery; working render scheme and size ceiling recorded; no public URL used. |
| E7 | 1.9 | Independent diff review, `npm run lint && npm run typecheck && npm test`, handoff with redacted evidence. | All repository checks pass; every stub listed; M0 qualification status stated per experiment. |

**Exit:** M0 is qualified only if E1–E6 pass in real ChatGPT web. A host limitation (for example no view file selection, `ui/message` refused, or unauthenticated app calls) keeps its task unchecked and returns a concrete design amendment to the user before M1.

### Unresolved questions

1. Is ChatGPT dual-era? This only matters if the v1 fallback is chosen (E1).
2. Do app-originated `tools/call` requests carry the user's OAuth bearer (E6)?
3. Does reload or reopen re-deliver the tool result or remount with context, and how long does widget state persist (E4)?
4. ChatGPT web `ui/message` behavior: immediate send vs draft, consent, length and rate limits (E5).
5. File helper availability on web, size/type limits, download-URL lifetime, and whether a widget-obtained URL or file ID is accepted by an app-initiated fileParams call (E2).
6. `data:` vs `blob:` under ChatGPT's actual CSP, and the maximum app-call result size (E6). Spec inconsistency: `connect-src 'none'` vs `'self'`.
7. Do MCP image blocks still reach the model on the current ChatGPT web surface and model? Seen on 2026-11-12 "Work" web only (E3).
8. Exact product surface naming ("ChatGPT web" vs "ChatGPT Work web") and the plan/workspace policy that permits custom MCP connections (E0).
9. Which maintained authorization-server implementation M1 uses (out of M0 scope; the M0 AS is a stub).
10. ext-apps 2.1.0 is GitHub "Latest" but npm `latest` is 2.0.4. Pin 2.0.4; reassess before M2.

### Local probe record

Two throwaway Node scripts constructed the SDK 1.32.2 transport exactly as `apps/mcp/src/app.ts` does, and the v2 `createMcpHandler({ legacy: "stateless" })`. Both used installed packages: the main checkout's `node_modules` for 1.32.2 and the old branch worktree's for `server` 2.4.0. They posted the JSON-RPC bodies shown in Q1. The scripts lived in a session scratch directory and were not committed; the request and response facts above are the durable record. Rerun them during E1 from the migrated workspace instead of relying on these.

## M0 host results — 2026-11-14 (real ChatGPT web)

**Label [H]:** observed in real ChatGPT web by this change's M0 harness (`/mcp/studio-m0`, fixture data, stub OAuth, development tunnel). Full redacted record: [evidence/m0-2026-11-14.md](evidence/m0-2026-11-14.md). Code: branch `feat/interactive-ai-scene-studio-m0` (`5f0d7919` SDK migration, `2190ec48` harness, `90e11bc8` live-run fixes). Host: ChatGPT web Work mode, Plus, GPT-6.1 Terra · Light, Chrome/macOS, driven through the Claude in Chrome extension with the user's authorization.

### Resolution of the open questions

| # | Question | Result | Label |
| --- | --- | --- | --- |
| 1 | Is ChatGPT dual-era? | Moot for the chosen stack: ChatGPT sent only `2026-07-28` (`server/discover`, `Mcp-Method`), 0 `initialize` calls in 267 requests. A v1-only server would have answered 400 (Q1 [L]); whether ChatGPT then falls back was not tested and is no longer needed. **SDK v2 is confirmed.** | [H] |
| 2 | Do app-originated calls carry the bearer? | **Yes.** App-only tool calls arrived with the same bearer/subject; expired, revoked and foreign tokens were refused on app calls too. | [H] |
| 3 | Reopen behavior | Reload remounts the view, re-reads the resource and **re-delivers the original tool result** (stale); backend refresh is what shows current state. Re-delivered results stay in the conversation after revocation. No teardown on page reload. | [H] |
| 4 | `ui/message` behavior | Posted **immediately as a user turn**, `{}` after 192 ms, no consent, no draft. Refusal/timeout path not observed. | [H] |
| 5 | File helpers | `selectFiles` opens the host Library picker; `getFileDownloadUrl` returns an **Azure Blob origin** different from the composer's `oaiusercontent.com` origin; both delivered byte-identical originals. Composer descriptors expire after **5 minutes** (SAS `se`); expired → HTTP 403. Composer attachments are saved to the user's ChatGPT Library. `uploadFile` not run. | [H] |
| 6 | Image scheme and size | **`data:` works, `blob:` is blocked** by host CSP `img-src`. App results carried up to **8.4 MB** in `_meta` (no ceiling found). | [H] |
| 7 | Do image blocks reach the model? | **Yes** on GPT-6.1 Terra · Light: 2/2 correct shape and position, image-omitted control refused to guess. | [H] |
| 8 | Surface naming | The tested surface is ChatGPT web **Work** mode, personal plugin in DEVELOPMENT status; "Allow low-risk" permission showed no per-tool confirmations. | [H] |
| 9 | M1 AS implementation | Still M1's decision. The stub shape (DCR public client + PKCE + resource-bound opaque tokens) is what ChatGPT used; it did **not** use refresh tokens on 401. | [H] partial |
| 10 | ext-apps 2.1.0 | Unchanged: pinned 2.0.4 worked. | — |

### New host facts that affect the design

1. **Templates and tool metadata are snapshotted per connector version.** ChatGPT kept rendering the `ui://` HTML it read at connector creation even after the server changed it; tool lists are not re-fetched on reconnect. *Settings → Refresh tools* re-lists and pre-reads templates. → Use content-versioned `ui://` URIs and keep server behavior backward compatible with the last refreshed tool list; a release that changes tools/templates needs a user-visible refresh step (or a new connector version).
2. **Tool results are retained by the host and re-delivered on remount**, independent of later authorization. → Never put private media, crops or sensitive values in a tool result (`content`, `structuredContent` or `_meta`) meant to be gated; deliver them only through app-initiated calls that recheck the grant. The open tool returns identifiers and non-sensitive status only.
3. **`blob:` images are blocked; `data:` works.** → D8's "view-local object URLs" must become `data:` URLs (or canvas drawing from decoded bytes).
4. **Host file URLs vary by route** (composer: `*.oaiusercontent.com`; view helpers: `oaisdmntpreastus3.blob.core.windows.net`) and the view-supplied URL is client-provided, not host-attested. → Keep the exact-origin allowlist plus byte/time/redirect bounds; record each origin's provenance; prefer the composer/fileParams route where possible; treat a new origin as a reevaluation trigger. The 5-minute lifetime means intake must download promptly.
5. **Composer attachments persist in the user's ChatGPT Library** and ChatGPT's consent text allows model-training use when the user has opted in. → The Studio's privacy notice must say that artwork shared through the chat is also held by the AI provider; Session Zero's protection covers its own storage and delivery only (consistent with D8's existing caveat, now concrete).
6. **ChatGPT does not refresh tokens on 401; it asks the user to reconnect** (modal over a view; inline card for a model call), and a model call is not always retried afterwards. → Size access-token lifetime for a working session, keep the view's stale state and recovery path, and tell the user to resend if the AI did not continue.
7. **OIDC is enabled by default if `/.well-known/openid-configuration` answers.** → The M1 authorization server must either support the OIDC scopes ChatGPT requests or not advertise OIDC.
8. **Request `_meta` carries `openai/userLocation`, `openai/subject`, `openai/session`, `openai/organization`.** → M1 must not log or store these beyond what is needed; `openai/subject` is not an authorization input.
9. **Fullscreen is a large side panel on web** with resize notifications. Adequate for the canvas; layouts must handle container-dimension changes.

### Design amendment candidates (for review; not applied to design.md)

- **D2:** polling is required (confirmed); add content-versioned template URIs and the connector refresh step; the open tool result carries no gated data.
- **D7:** record that ChatGPT used DCR with a public PKCE client, sends `resource`, does not refresh on 401, and needs OIDC either supported or not advertised. Proposed M1 shape stands: Session Zero authorization server, opaque hashed tokens, `apps/server` introspection.
- **D8:** replace "object URLs" with `data:` rendering; app-only media calls are the only gated channel; tool results are not.
- **D9:** two observed host origins with different provenance; 5-minute descriptor lifetime; Library side effect and provider-retention notice.

## Recording a later finding

Append the question, code commit, dated primary source, exact experiment, observed result, selected approach and reevaluation trigger. Identify stubs and unavailable prerequisites. Store redacted evidence in a durable repository artifact or an explicitly retained location; temporary paths alone are not continuity. Do not commit credentials, private user art or raw authenticated URLs.
