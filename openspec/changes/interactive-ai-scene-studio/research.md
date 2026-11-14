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
| Initial scope | Proposed default | One active image-based map and encounter at a time; existing multi-map builds continue to work. |
| Comparison and concurrency | Proposed default | Same-camera comparison, atomic corrections, explicit stale conflicts, no automatic merging. |
| Delivery | Proposed for review | M0–M5, fresh bounded sessions, primary-source preflight and evidence-based completion. |

The earlier idea of requiring a website Keep action after every correction is superseded by private iteration in chat and one final website review. No product or architecture approval for the complete packet has yet been recorded.

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
| R9 | [Official SDK README](https://github.com/modelcontextprotocol/ext-apps#readme) | Current examples document 2.x MCP SDK peers and wire compatibility of 1.x/2.x views. Dependency selection needs a real compatibility check. |
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

## Recording a later finding

Append the question, code commit, dated primary source, exact experiment, observed result, selected approach and reevaluation trigger. Identify stubs and unavailable prerequisites. Store redacted evidence in a durable repository artifact or an explicitly retained location; temporary paths alone are not continuity. Do not commit credentials, private user art or raw authenticated URLs.
