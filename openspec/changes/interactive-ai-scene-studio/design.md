# Design

**Status:** Architecture review accepted by Raymond on 2026-11-16 at `6f645f29`; M0 amendments to D2, D7, D8 and D9 approved by the user the same day. Implementation proceeds milestone by milestone. See [proposal.md](proposal.md) for motivation and scope, [research.md](research.md) for evidence, and [tasks.md](tasks.md) for delivery gates.

## Context

Inspected main: `a86160f584c44c8e8998bc56966e214ff04b5a08` (2026-11-14). The terrain merge in PR #194 is included. Later merges add guest hosting, browser security headers and product-validation documentation; they do not make guest credentials valid for builds.

The existing builder stores private `Build`, `BuildFile` and `BuildItem` records. Ten tools at `/mcp/build` call build HTTP APIs; `apps/mcp` does not import server internals. Passes reach one build, expire, and cannot publish. The owner reviews in the browser; `planPublish` and the store check reviewed item versions and commit library rows together.

The builder currently replaces arrays of lines, terrain and encounter placements. Lines and placements have no stable authoring IDs. The owner-edited item lock prevents subsequent AI writes to the entire item. Setup saves check a version read by the HTTP handler, not the version inspected earlier by the model. These mechanisms remain valuable for ordinary builds but do not provide revision history or precise collaborative corrections.

`MapCanvas` already handles map-coordinate pointer input, pan, zoom and touch. Terrain rendering, line picking, private editor connections and draft validation are reusable. The library editor demonstrates editing without a live room. Source artwork is currently readable through random public URLs, including draft uploads. New browser headers prohibit framing the whole website.

The original `game-build-*` specs remain in active changes, not the durable capability inventory. Some durable encounter-template wording also predates implemented walls support. Treat the inspected code and ADRs as baseline evidence, record discrepancies, and reconcile the affected specs before final archival without rewriting unrelated changes here.

## Goals / Non-Goals

**Goals**

- One build identity and saved authoring model across website, tools and embedded views.
- Useful visibility while an image-based scene is first prepared, followed by exact regional corrections.
- Server-enforced scopes, revisions and image access; all clients are untrusted requesters.
- One owner, one active map and optional encounter per working context, with existing build limits and other items preserved.
- A practical implementation sequence with a real ChatGPT proof before relying on host behavior.

**Non-Goals**

- Importing the old standalone service, infrastructure or portable scene contracts.
- Hosting a model, routing user AI credentials through Session Zero, or reproducing chat history.
- Creating a temporary live room to author drafts, changing room event semantics, or granting the AI a GM seat.
- CRDTs, automatic rebases, cross-map edit batches, fine-grained permanent object locks, or a new universal scene file format.

## Decisions

### D13. M2 visible preparation implementation — agreed 2026-11-17, before dependent code

The user approved the researched M2 design and implementation in this session. Exact base:
`2bcfa0a1f772a94a907f2c6597aed41d0cef0234` (all M1 merged). Branch/worktree:
`feat/interactive-ai-scene-studio-m2`, `/private/tmp/session-zero-studio-m2`.
Raymond's approval of all M1 work is user-reported; the user waives remaining external review
gates and authorizes the temporary tunnel and real ChatGPT synthetic-account test autonomously.
Only tasks 3.1–3.7 are authorized; no merge/deployment or M3–M5 implementation.

- **Projection and renderer:** add a validated saved Studio snapshot using native grid,
  effective portal-cut geometry, terrain-grid binding and token-footprint helpers. Extract a
  provider-free SVG viewport/layers, shared by an owner website adapter and the embedded
  bridge adapter. Bundle the embedded React entry/styles inline with existing workspace
  tooling; the static content-hashed resource contains no credentials/private data and loads
  no CDN code. Retain editor-specific behavior in its wrapper. Do not change room contracts.
- **Display context:** persist nullable `{sourceFileId, mapKey, encounterKey}` in the existing
  build lifecycle. Validate the tuple atomically under the build lock in both stores: map
  source matches, encounter map matches, all items belong to this build. Raw source-only
  context is valid; ambiguous maps/encounters require explicit selection. Context does not
  redirect existing explicitly keyed tool writes or alter any build item. Display changes
  and reads do not refresh retention. This is not M3 enrollment/revision authority.
- **Saved status:** snapshot includes available contexts, permitted choices, actual detection
  and validation results, and the latest 20 sanitized real preparation outcomes. Record
  target, operation and saved/refused result only; no rejected payloads, URLs, credentials
  or model reasoning. Status recording requires current authority and rejected attempts do
  not extend retention. Refused saves retain saved overlays. Transport ambiguity remains
  unknown/stale until resolved by saved state. Snapshot reads must not mix contexts/data.
  A display fingerprint never serves as an inspected authoring revision token.
- **Refresh/recovery:** keep the five-second visible-only, single-flight fallback and coalesce
  focus/local-operation reads. Bind async results to build/context/generation. Stop timers,
  listeners and media work on hidden/teardown. Cache only in-memory active source/token art
  by immutable identity/hash, deduplicate reused art and bound bursts within the existing
  120-request/minute shared grant limit. Measure latency and aggregate traffic. After a
  failed bridge refresh pause until explicit Retry/open; preserve stale authorized content,
  but clear it on definitive foreign/unknown refusal. Authoring-choice refusal is distinct
  from access loss and never clears an otherwise authorized scene.
- **Presentation:** retain drawable unconfirmed grids, effective walls/openings, Difficult
  single hatching, Blocked crosshatching, implicit Normal, clipped edge cells and native
  hidden/large/small token footprints. Do not paint stale terrain onto another grid. Separate
  unfinished, actual detector activity, saved, awaiting-input, invalid and uncertain states;
  no invented percentages or reasoning. Missing grant, disabled choices, no grid, invalid
  image and unavailable detector each explain their own recovery. Snapshot Retry is not a
  detector retry. Studio OAuth instructions are separate from the legacy 24-hour pass prompt.
- **Access/layout:** new controls/status use en/zh-TW catalogs/glossary. Keyboard pan/zoom/Fit,
  context/layer review and textual issue/hidden-token cues remain available in narrow layouts;
  fullscreen is feature-detected. Saved batches do not steal focus or reset the camera.
  Deliberate source/context changes may fit/restore per-context cameras. Text/image tools
  and the website remain useful without Apps. Protected media, server authority, owner
  choices/locks and private-publication refusal until M5 remain authoritative.
- **Verification:** synthetic users/art only; fresh isolated Postgres/S3 and real vision
  service with explicit DATABASE_URL/storage/VISION_URL, pinned Node 22 and no default-service
  discovery. Preserve cse416 and manual sz-studio-m1b-cce5e8a7. Verify context isolation,
  native layer parity, actual saved/refused tool writes, cleanup/retention, private delivery,
  restart, latency/traffic, focus/camera and localized keyboard/narrow/fullscreen workflows.
  Run required checks/build, independent diff review and re-review, then actual ChatGPT
  preparation before marking host proof complete. Missing evidence remains pending.

### D14. M3 authoring contract

**Review status:** The owner explicitly waived the M3 architecture review on 2026-11-18. The approved product
choices are first-correction enrollment and using the owner's website save as the next working
revision. The implementation baseline is main `dbb6cd3d` after PRs #220 and #221.

#### Storage and versioning

- Use one workspace per `(buildId, mapKey)`, with an optional, fixed encounter key. Enrollment
  checks that the draft and its source are editable, the encounter uses that map, and the scene
  has a usable native grid. A proposed grid is sufficient. Independent maps can enroll
  separately. The M2 display context selects the view and never supplies an implicit edit target.
- Keep separately addressable immutable revisions, correction requests and operation receipts.
  A workspace points to the reference revision, current working revision, and the latest
  materialized revision. The reference captures enrollment. The materialized pointer tracks the
  ordinary build data last saved by the owner. The working pointer advances on an applicable
  proposal, owner save or restore. A server-issued revision UUID serves as the compare-and-swap
  token. Restore records the current head as parent and the restored revision as provenance.
- Persist native authoring data with server-issued IDs for lines, editable openings, marks, and
  placements. Resolve imported openings by their source file and native opening number. A portal can split a
  display segment. The stable ID belongs to the authored line. The ordinary
  owner editor carries the materialized IDs for existing rows and receives new IDs for added rows.
- Bind each snapshot to the source file ID, canonical identity, dimensions and orientation,
  plus exact effective grid geometry and profile units. For legacy files, bind the file ID,
  dimensions and stored content hash when present. Record relevant creature scene values and
  their normalized data digests, with token art identities and dimensions. Keep immutable
  artwork in the existing media store and use the snapshot's bound values for historical reads.
  Published library values and their exact-use manifest are part of M5.
- Count UTF-8 bytes of the stored revision, request and receipt payloads. Limit each workspace
  to 32 revisions, 64 requests and 32 MiB, and each build to 64 MiB of authoring history.
  Reference and stale revisions count toward the same limits. Refuse a delegated proposal
  before any pointer changes when it would exceed a limit, so a connection can't push out the
  owner's history. Never refuse an owner write (native save, request or restore) for history:
  it prunes to 24 revisions, oldest first, keeping the reference, working and materialized
  revisions (and a restore's source). Pruning a revision also removes requests based on it,
  and receipts for removed records. This amendment followed the 2026-11-18 M3 code review. Reads, refusals and idempotent replays leave retention
  timestamps alone. Discard, the 14-day abandoned-build sweep and account deletion remove
  authoring records alongside existing draft cleanup.

#### HTTP and MCP

Use the owner's existing same-origin session path `/api/builds/:id/studio/authoring` and the
verified grant path `/api/studio/builds/:buildId/authoring`. Response headers for both are
private and non-cacheable. Tool results carry metadata and authorized structured context.

| Operation | Authority | Input and output |
| --- | --- | --- |
| `GET /maps/:mapKey` | Owner or delegated connection | Optional `encounterKey` identifies the proposed enrollment target. Returns the explicit map/encounter, head ID when enrolled, materialized inspection version, and eligible objects with their full extents. A pre-enrollment inspection version is a digest of the materialized inputs and effective bindings. |
| `POST /maps/:mapKey/requests` | Owner | `{ encounterKey, inspectedVersion, operationId, instruction, selection: { region, layers, objectIds, wholeObjectIds } }`. The instruction is plain text up to 2,000 characters. Server checks the inspected version, derives scope, and atomically saves the request and enrollment if needed. Returns `{ requestId, baseRevisionId, scope }`. |
| `GET /requests/:requestId` | Owner or delegated connection | Returns the saved instruction, base scene and revision, current head ID and derived scope. MCP exposes `studio_get_correction_request`. |
| `POST /requests/:requestId/proposals` | Delegated connection | `{ baseRevisionId, operationId, operations }`. Returns `{ status, requestId, revisionId, currentRevisionId }`. MCP exposes `studio_submit_correction`. |
| `GET /maps/:mapKey/revisions` and `GET /maps/:mapKey/revisions/:revisionId` | Owner or delegated connection | List bounded revision headers newest first or return the authorized exact revision and its metadata. MCP exposes `studio_get_revision` for detailed inspection. |
| `POST /maps/:mapKey/restore` | Owner | `{ revisionId, expectedCurrentRevisionId, operationId }`. Checks that the source, grid and dependencies still match current materialized bindings, then creates a new working revision. |
| `DELETE /maps/:mapKey` | Owner | Ends the correction. Removes the workspace and all of its revisions, requests and receipts. The map, its encounter and their creatures can then be edited, deleted and published as ordinary drafts. Returns `{ mapKey, ended: true }`. Also the way to change an enrollment's encounter. |

Request, authoring-object and operation identifiers are UUIDs. A legacy opening is exposed to
clients by its stored authoring UUID. Enrolled requests use the current revision UUID as
`inspectedVersion`. Scope fields received with a proposal are invalid. `region` contains
`minX`, `minY`, `maxX`, `maxY` in canonical source pixels and has positive area. Scope uses
the named layers `geometry`, `terrain`, and `placements`. The server validates membership
against that revision and stores the normalized region and authorized IDs. The read result
identifies crossing objects and their complete extents. A selected crossing object requires
the explicit whole-object acknowledgment. An acknowledgment allows changing that object's
existing extent. New or moved line endpoints, a new or moved mark's whole square clipped to
the image, and a moved token's full snapped footprint must lie within the destination region.
A mark's extent for selection is that clipped square, not its corner. Terrain scope includes cells with positive-area intersection
with the region clipped to the image, including cropped map edges.

Use a strict discriminated union for operations. `line.add` takes a native line.
`line.update` takes the ID and replacement native line. `line.remove` takes the ID.
`opening.set` takes the ID and the native opening settings apart from its server-owned number.
`mark.add`, `mark.update` and `mark.remove` follow the same pattern with the native mark.
`terrain.paint` takes native paint runs with null clearing to implicit Normal.
`placement.move` takes an ID and native square anchor, and `placement.set_visibility` takes
an ID and hidden boolean. Preserve the existing JSON request limit, terrain cell limit and
native structural limits. Resolve and validate the complete operation batch against the saved
base. Use the native effective-wall, portal-cutting, terrain and footprint rules. Reject a
batch introducing an off-map or blocked placement, including terrain edits under an existing
token. Unchanged unresolved issues in the base remain inspectable.

`status` is `advanced` or `stale`. A valid current proposal creates its revision and advances
the working pointer atomically. A valid stale proposal is saved against its original base and
returns HTTP 409 with its saved revision ID and the current head ID. A stale result remains
structured through MCP. Use HTTP 409 with an actionable code for stale enrollment, an old
owner edit, incompatible dependencies, history limits or a legacy replacement. Use 422
for invalid operations or scope violations and 403 for disabled owner choices. Access loss
follows existing 401 and opaque 404 responses. Check access before disclosing or replaying
outcomes. Identical retries use a receipt keyed by build, operation type and UUID with a
normalized input digest. A reused key with a different input is an explicit conflict.

#### Serialization and compatibility

- In Postgres, use the existing per-build advisory lock with READ COMMITTED and the grant
  row check for delegated writes. The memory adapter makes the same transition atomically.
  Recheck current build status, ownership or grant coverage, choices, scope, source/grid
  bindings, dependencies and working pointer inside that boundary. A choice refusal or
  access loss prevents saving even a stale candidate.
- Native website edits to an enrolled map, encounter or relevant creature send the inspected
  `X-Studio-Authoring-Version` header. It hashes the affected working IDs, their live dependency bindings and the materialized item.
  Setup and encounter edits can carry `studioIds` alongside their native fields to preserve row identity. Save the ordinary owner edit and
  capture the new working state from materialized data in the same transaction. Preserve
  the older AI candidate in history. Return a conflict with reload guidance for old forms.
  On detector, choice or profile changes that affect the binding, serialize the relevant
  mutation and make the drift visible. Reject new requests from a drifted head until the
  owner saves a fresh revision. Previously saved requests remain inspectable. An owner edit
  that leaves the scene impossible to capture, such as an unusable grid, is still saved; the
  working revision stays, and the drift stays visible until a later owner save captures the
  scene again.
- Guard ordinary AI and pass map/setup/encounter replacement and deletion, and mutations
  that would bypass an enrolled dependency. The guarded creatures and files are those of the
  current working and materialized revisions, recomputed on each write, not all history.
  The owner's own deletes are never refused. Deleting an enrolled map or encounter ends the
  correction. Deleting a creature the scene uses leaves it drifted. Allow unrelated items
  through existing builder routes. Guard publication against its entire dependency closure under the build lock,
  including publication via a raw map file or another encounter sharing that map. The
  existing M2 snapshot stays readable and gains an optional working revision ID, using the
  working projection only for an exact enrolled context. Preserve old client parsing.
- Keep history outside polling payloads. Reuse the existing signed-in and grant guards,
  private media routes, rate limits and same-origin protection. Add the MCP tools to
  `/mcp/studio` and use the existing connector tool refresh procedure.

#### Verification matrix

| Task | Required evidence |
| --- | --- |
| 4.1 | Record the owner’s architecture review waiver. Measure and record UTF-8 size of the implemented projection using representative and dense synthetic scenes. |
| 4.2 | Both adapters preserve parent/actor, IDs and artwork references, reject capacity overflow and replay the original receipt. Restore records a new revision. Isolated Postgres restart preserves pointers and history. |
| 4.3 | Source replacement, grid correction and a creature/art change invalidate old work. A cropped-edge terrain run keeps its recorded cell coordinates. |
| 4.4 | Doorway portal cutting, whole crossing wall authorization, cropped-edge erasure and full multi-cell destination. An out-of-scope or blocked-footprint operation in a mixed batch saves zero revisions. |
| 4.5 and 4.6 | In both stores, a native owner save wins against the AI's older base, simultaneous AI writes produce one advance, a losing legacy save cannot replace enrolled state, and revocation/choice changes are rechecked at commit. Exercise old-client behavior for an unenrolled target. |
| 4.7 | Exercise owner request creation and delegated reads and writes through the real HTTP and MCP servers, including structured stale results and reopening the same candidate in both snapshot adapters. |
| 4.8 | Run repository checks, focused browser regressions, existing builder/terrain publication, history cleanup and a diff review. Record exact evidence and scope in the handoff. |

The initial in-memory sizing model serialized 40,542 bytes for 100 lines, 350 terrain runs
and 40 placements. A dense fixture with 500 lines, 10,000 single-cell terrain runs, 500
placements and 200 creature references serialized 845,198 bytes. Thirty-two dense snapshots
consume approximately 25.79 MiB before request and receipt overhead. These measurements use
synthetic data. On the implemented schema, the respective measurements were 45,248 and
901,786 UTF-8 bytes. Thirty-two dense revisions consume 27.52 MiB before request and receipt overhead.

### D1. User journey and interaction contract

1. A signed-in owner starts an AI build on the website and chooses permitted AI work using the existing choices.
2. A launch prompt opens the authorized build's Studio in ChatGPT. OAuth connects the owner identity, with explicit grants to selected builds; the prompt names a build rather than conferring access by its identifier.
3. The user adds a source map and token art through the embedded Studio. Composer attachments have an explicit import action when supported. Rules and sheets remain with the user's AI.
4. The AI uses deterministic tools. The Studio displays saved grid, walls, openings, Base terrain and encounter placements in meaningful batches.
5. A rectangle or picked object defines a correction. The user supplies instructions and submits them into the conversation.
6. The AI inspects the exact saved selection and returns a candidate. The user compares it, asks for another attempt, or continues with another correction in the private working candidate.
7. Review in Session Zero opens that exact candidate. The owner confirms any required grid, resolves blocking issues, chooses the publish set and publishes through their website session.
8. The existing room-creation path starts a room from the published encounter.

There is no compulsory return to the website between correction rounds. Selecting the next private candidate is not owner approval for publication. Existing website owner edits remain possible and generate new revisions once a target is enrolled in the Studio.

**Alternative considered:** a mandatory owner acceptance after every AI edit. Rejected for the first release because it restores the repeated site switching the Studio is meant to remove. Final review still binds the exact result used.

### D2. Shared components with small environment adapters

Extract the canvas and useful layers from existing web components. A website shell uses the existing account/API adapter; an embedded shell uses the MCP Apps bridge and delegated build access. Shared components receive validated authoring data and actions, not browser cookies or a live room connection.

Use a bundled `ui://` resource served by `apps/mcp`. Keep HTML templates static and credential-free. One open/render tool establishes the workspace; data and mutation tools do not create another iframe for every operation. Do not depend on unrelated tool results automatically reaching an already-open view: refresh the backend's versioned workspace explicitly through the bridge.

A mounted view refreshes immediately after its own operations and on focus, and polls while visible for other tool writes. Start with a five-second fallback interval, within current rate limits; shorten only after measuring aggregate tool traffic. Pause when hidden, stop on teardown, and show stale/offline status. The acceptance target is a saved batch visible within one active refresh interval, without manual site navigation. Shared state never depends on an iframe remaining mounted.

**M0 amendments (approved 2026-11-16; evidence in research.md "M0 host results"):**

- `apps/mcp` uses MCP SDK 2.x (`@modelcontextprotocol/server`/`node`/`client`, exact pins) with `@modelcontextprotocol/ext-apps`. ChatGPT speaks only protocol `2026-07-28`; 2025-era clients remain supported on the same routes.
- The host snapshots a connector's tool list and `ui://` templates. Every release that changes the view or tools uses a new content-versioned `ui://` URI and a user-visible **Refresh tools** step, and the server keeps working with the previously refreshed tool list until then.
- The open tool's result carries identifiers and non-sensitive status only. The host re-delivers stored tool results when a view remounts, so they can be stale; the view always loads current state through its own calls, and polling remains required.
- Reopening: the open tool's description tells the model to call it whenever the user asks to see the Studio, and fullscreen (a side panel on web) is the primary way back. Do not rely on the host moving an earlier view in the conversation.

Use inline layout and request fullscreen when available. Panels, sidebar launchers and file-library helpers are optional enhancements. Preserve useful text/image outputs and a website link for hosts without Apps. The website supplies a saved correction and a copyable prompt when no chat bridge is present; it cannot start a separate AI conversation by itself.

**Alternative considered:** framing the existing website inside the app. Rejected because it introduces nested frames, third-party session assumptions and extra host access requirements, and conflicts with the website's framing protections.

### D3. Model, source and coordinates

The domain remains a build. A Studio workspace projects a specific map plus an optional encounter and its creature dependencies. It is not a second standalone scene lifecycle. Render effective geometry and terrain with the same compiler and validation that publication will use.

Keep canonical source image identity, pixel dimensions and grid geometry in every relevant version. Intake records an original-file hash; if the existing image pipeline normalizes orientation or encoding, record the canonical working image identity and any coordinate-affecting transform separately. Do not silently resize artwork to improve a grid fit.

Selection bounds use canonical map-image pixels. AI-authored lines retain the current whole/half-square convention; terrain uses native cell runs and cropped-edge rules. Token placements use native square anchors and footprints. Pan, zoom and iframe size never enter saved geometry. More precise freeform wall coordinates are deferred.

The first qualified journey uses an image map and AI-authored lines. Existing UVTT import and publication remain supported through the normal builder. General editing of arbitrary imported source-wall topology is deferred; mark unavailable edits explicitly rather than dropping source walls or pretending a selected imported wall was changed.

### D4. Versioned authoring with a private working candidate

The proposed logical records are:

| Record | Responsibility |
| --- | --- |
| Workspace | Build/owner/active-target binding, a reference revision and current working revision |
| Revision | Immutable snapshot of the relevant authoring state, parent, actor, source/grid bindings and dependency versions |
| Correction request | Saved instruction, base revision, target map/encounter, region and permitted edits |
| Proposal | A request's immutable candidate revision(s), validation results and lifecycle status |
| Publication receipt | Exact reviewed revision, dependency manifest and library items created |

These are logical responsibilities, not a commitment to one database table for each row. Use additive persistence with memory and Postgres implementations. Store snapshots of bounded authoring data and asset references, never duplicate image bytes per revision. A server-controlled monotonic workspace version or equivalent opaque compare-and-swap token orders writes; timestamps alone are not the contract.

The reference revision is the draft state from which the user started. The working revision is the latest complete saved candidate used for further AI work; it does not imply owner approval. The initial preparation can produce several incomplete-but-renderable candidates. Each saved batch is structurally valid; publication remains unavailable until full semantic checks pass. Never present partially streamed tool arguments as committed work.

A correction specifies the base revision the AI inspected. A validated new candidate advances the working pointer only if that revision is still current. Retain stale proposals for inspection, but do not move the pointer. Refining a pending proposal creates a new candidate against the current working version, without requiring an intermediate owner acceptance. The history can be presented as a simple chronological list; no branch-management interface is required.

Restoring an earlier candidate creates another revision. Publication and library deletion retain their current semantics; restoring an authoring revision does not undo a room or remove library items.

**Alternatives considered:** retaining only `updatedAt` would not preserve candidates or prove the model's base; room event sourcing would introduce a room to a workflow that does not need one. Use bounded draft revisions instead.

### D5. Stable identities and scoped operations

Assign stable authoring IDs to drawn lines, imported opening references, uncertainty marks and encounter placements. Preserve the native published formats by compiling away authoring-only metadata. Do not identify a token solely by its array index or display name. IDs stay scoped to their build and workspace.

A correction has two distinct bounds:

- Inspection context: a padded crop and surrounding data the AI may examine.
- Edit scope: named layers, terrain cells and explicit object IDs it may change.

A rectangle initially selects overlapping cells and candidate objects. Show the complete extent of a crossing wall or token footprint before including that object. Authorizing a whole object permits editing it as an object; authorizing only cells does not permit changes to walls or tokens. New line endpoints and moved-token destination footprints must remain in the authorized region unless the owner explicitly expands it. Never silently clip a wall at the selection edge.

The server derives scope membership and rejects every operation outside it, including indirect edits to referenced creatures. Return a useful scope problem and save no partial correction. Region selection does not grant new build-level capabilities. Existing walls/terrain choices are checked inside the write; changing grid geometry requires a dedicated map-wide request and invalidates dependent regional work.

Once submitted, a correction request's scope is immutable. Proposal operations name its server-issued request ID and cannot replace its scope. An expanded selection creates another explicit request. This binds a proposal to recorded instructions; it does not claim that app-only visibility proves human presence or grants publication authority.

Operations should describe intent at the data level: add/update/remove a line by ID, change an opening, paint named cells (including Normal/erase), or move/change visibility of a placement. Exact tool names and serialization are chosen after M0 and recorded before M3. Arbitrary code, generated HTML and whole-scene replacement are not correction operations.

One correction is atomic across geometry, terrain and tokens. Partial acceptance is deferred because excluding one dependent change can invalidate the rest.

### D6. Existing tools and owner edits

Before enrollment, ordinary builder tools retain their current behavior and locks. Enrollment captures the current draft and publishes its revision token to readers. After enrollment, all writes to that target must pass the Studio revision boundary. Adapt safe builder operations into revision-producing operations or refuse legacy replacement with an actionable message. A stale legacy save must not overwrite a newer candidate.

Keep the existing `editedByUser` protection on materialized build items. The AI can propose a candidate against a snapshot containing owner changes; it cannot overwrite the owner-edited item in place. Owner selection at final review authorizes materialization of the selected candidate. This is an explicit new proposal path, not removal of the old lock.

Owner edits to an enrolled target also advance the working revision. An owner edit made after an AI read makes that proposal stale. Concurrent AI sessions receive the same rule; the first successful compare-and-swap wins and the other receives a conflict. One account can have multiple views; view-local camera and hover state stay local, while saved requests carry their own selection identity.

### D7. Authentication and authority

For the hosted release use MCP-compatible OAuth linked to the existing signed-in account, with explicit grants to selected builds. Discovery, authorization-code protection, audience/resource binding, expiry and revocation are required. Pick a maintained implementation compatible with the current stack; a new account/password system or cloud identity deployment is not part of the default design.

The build API independently resolves a server-verified delegated grant. A caller-supplied owner ID or arbitrary forwarding header is not identity. `apps/mcp` continues to use HTTP APIs, not imports from `apps/server`. M0 establishes the compatible SDK/auth path; M1 records the exact internal verification mechanism before implementation review.

| Principal | Allowed authority |
| --- | --- |
| Owner's website session | Manage build choices/grants, edit drafts, choose a final candidate, publish and discard |
| Delegated AI / embedded view | Read authorized build data and artwork, upload, inspect and propose within allowed scopes |
| Existing build pass | Its existing build-only actions; Studio proposal operations only when explicitly supported and authorized |
| Room/player credential | No Studio or build authority |

Passes can support a controlled M0 proof using non-sensitive fixtures. They are not the hosted release's default login experience. A template, build ID, selection ID or view ID is never a credential. Keep OAuth tokens, passes and website sessions out of launch URLs, model-readable status and committed evidence. Do not assume tool-result `structuredContent` is hidden from the model. App-only visibility and tool annotations are host controls, not server authorization.

**M0 amendments (approved 2026-11-16):**

- **Authorization server:** Session Zero runs its own OAuth authorization server linked to existing accounts. ChatGPT registers as a public client through dynamic client registration and uses authorization code + PKCE (S256) with the `resource` parameter; tokens are opaque, stored hashed, bound to the Studio resource and build grants, and verified by `apps/server` (introspection over HTTP). No external identity provider.
- **Token lifetime:** about 8 hours, one working session. ChatGPT did not use refresh tokens on 401; it asks the user to reconnect. The view keeps its last state during reconnection and tells the user to resend if the AI did not continue.
- **OIDC:** not advertised (no `/.well-known/openid-configuration`) unless Session Zero later supports the OIDC scopes the host requests; when advertised, ChatGPT enables it by default.
- **Host request metadata** (`openai/userLocation`, `openai/subject`, `openai/session`, `openai/organization` and similar) is never an authorization input and is not logged or stored beyond operational need.

No AI-facing credential acquires publication authority. In-chat owner publication/acceptance is deferred; host prompts or a model saying the owner agreed are insufficient proof for the website-only publication boundary.

**M1a implementation record (task 2.1, recorded 2026-11-16 on base `4033fd4c` before dependent code).** These choices stay inside D7 as amended; they are implementation selections under the user's pre-approval of 2026-11-16, not new authority. Inspected: `identity/sessions.ts`, `identity/middleware.ts`, `http/build.ts` (`/api/builds/*` cookie vs `/api/build/*` pass), `store/buildStore.ts` and both adapters, `prisma/schema.prisma`, `apps/mcp/src/buildTools.ts` and `app.ts`, `deploy/Caddyfile`, and the M0 stub (`studioM0/auth.ts`) as a record of what ChatGPT sent.

- **Where it lives.** The authorization server is in `apps/server` (`http/studioOAuth.ts`), served on the website origin. Issuer = the website origin; resource = `<origin>/mcp/studio`. The authorization endpoint is the website page `/studio/connect`, so consent uses the owner's existing signed-in session cookie; its decision is a cookie-and-same-origin `POST /api/oauth/authorize`. Token, registration, revocation and introspection endpoints are under `/api/oauth/*`. Both metadata documents (`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp/studio`) are served by `apps/server`, because it owns the resource binding; `/.well-known/openid-configuration` answers 404 so no static fallback can answer it. Everything is off unless `STUDIO_PUBLIC_ORIGIN` is set on both `apps/server` and `apps/mcp`; it is unset by default and in every deployment file.
- **No library.** A narrow implementation of exactly RFC 6749 authorization code, RFC 7636 PKCE (S256 only), RFC 7591 registration (public clients only, `token_endpoint_auth_method: none`), RFC 8707 resource binding, RFC 8414/9728 metadata, RFC 7009 revocation and RFC 9207 `iss`. Rejected: `oidc-provider` (an OIDC framework that advertises OIDC, against amendment 7, and runs on Koa); `@node-oauth/oauth2-server` (no registration or resource indicators); the MCP SDK v1 auth router (absent in the v2 packages `apps/mcp` uses). The token, hash and expiry code follows the existing pass/session pattern (`hashToken`, random 256-bit values).
- **Records (additive migration, both stores).** `studio_oauth_clients` (public client id, name, exact redirect URIs, created/last-used). `studio_grants` (one consent = one token family: owner GM identity, client, resource, scope `studio:build`, the selected build ids, the hashed single-use authorization code with its PKCE challenge, redirect URI and 5-minute expiry, absolute family expiry 30 days, `revoked_at`, `last_used_at`). `studio_tokens` (SHA-256 of each access or refresh token, its grant, kind, expiry, and `used_at` for a rotated refresh token). Only hashes are stored; tokens, codes and verifiers never are.
- **Lifetimes and rotation.** Access tokens 8 hours (amendment 6a). Refresh tokens 14 days, rotated on every use; reusing a rotated refresh token or replaying an authorization code revokes the whole grant (family), including when two presentations race and one loses the atomic claim. The family never outlives its 30-day absolute expiry. Revocation sets `revoked_at` on the grant, which ends every token in it at once. ChatGPT did not refresh in M0, so refresh is supported but not relied on.
- **Bounded registration.** At most 200 registered clients. A client that never receives a token is deleted after one hour; a used client with no live grant is deleted after 90 days without use. When the table is full, a registration may drop the oldest client that never got a token, has no grant and is over ten minutes old; otherwise it is refused (503 `temporarily_unavailable`). A working client id is never dropped, and a flood can't hold registration shut. Registration is limited to 20 per address (IPv6 by /64) per hour. At most 20 live grants per account. Client names lose control and format characters (bidi overrides, zero-width) and may be empty; the pages show a translated "Unnamed app".
- **How `apps/mcp` verifies.** For every `/mcp/studio` request it calls `POST /api/oauth/introspect` on `apps/server` over HTTP (it never imports server code), presenting the bearer it received as the request's own `Authorization`. The endpoint describes only that token (`active`, `aud`, `scope`, `exp`, `client_id`, granted build ids), so it needs no shared secret and tells an unauthenticated caller nothing; failures are rate-limited per address like passes. No result is cached, so revocation applies on the next request. An inactive token, or one whose `aud` isn't this resource, gets 401 with `WWW-Authenticate: Bearer resource_metadata=…`. An introspection that can't answer (limited, busy, down) gets 503 with `Retry-After`, never 401, because a 401 makes the host discard the token and ask the user to reconnect.
- **Failure limits.** A token that resolves to live access is never refused because of its address: one AI host sends every user's requests from a few addresses. Only tokens, codes, refresh tokens and clients that don't exist at all count against the address (60 per 15 minutes), and only on the failure path. Expired tokens and revoked or expired grants are kept seven days before the sweep drops them, so a host still sending a stale token reads "ended", not "unknown".
- **How the build API accepts a grant.** A third route family, `/api/studio/builds/*`, has its own `grantGuard`, as `/api/build/*` has `passGuard`; `resolveOwner`, `requireAccount`, `passGuard` and the socket handshake don't know grants exist, so a delegated token is no credential anywhere else, and a pass, session cookie, guest token or seat credential is no credential here. The guard resolves the token hash to a live grant for the configured resource, takes the owner from the grant (never from a header, query or body), and serves a build only when it is in the grant, owned by that owner and open; any other build reads as unknown (404). Every write also passes the grant to the store, which rechecks token expiry, grant revocation, family expiry, owner and build membership inside the same per-build lock as the write (Postgres: `FOR SHARE` on the grant row, which a concurrent revocation's update waits for), so a revocation between read and write refuses the write and saves nothing. The store reads the clock at the write, so a token that expires meanwhile writes nothing either. A creatures batch cut off partway answers 401 with the per-item results saved before it ended.
- **What a delegated token can do (M1a).** Exactly the existing pass operations that read or write unpublished draft values through the existing item lock and owner choices: list its granted builds, read a build, view a file's small copy, read a map's setup, check the build, and save the game profile, creatures, maps, map setups and encounters. Not offered: file upload (the private plane is M1b), item removal, owner choices, passes, publication, discard, library, rooms, accounts and grants. Rate limit: 120 requests per minute per grant, as for a pass.
- **Owner controls.** The build page lists live connections that include the build (client name as registered, the redirect host, builds covered, created/last used/expiry) and disconnects one, which revokes the whole grant. A password change ends every grant on the account, as it ends passes. Account deletion deletes the account's grants and tokens. Closing a build leaves its grants but makes the build unreachable through them.
- **Host metadata.** `apps/mcp` never reads, logs or forwards request `_meta` (`openai/subject`, `openai/userLocation`, `openai/session`, `openai/organization`); identity comes only from the server's answer about the token.
- **Routing.** `deploy/Caddyfile` and the Vite dev proxy send the three `/.well-known/` OAuth paths to `apps/server`. This is a repository change only; nothing is deployed by M1a.

### D8. Protected draft media

**User-selected requirement:** newly uploaded unpublished Studio artwork is protected, including thumbnails, canonical working images and model crops. Authorized display necessarily shares the selected data with the user's AI provider; this does not promise deletion from chat history or a viewer's device.

Introduce a private storage namespace that cannot be read through `/uploads`, local public static fallback, a public object-store policy or a direct storage URL. A different application route in front of the same public object is insufficient. Keep existing published/legacy asset delivery working; isolate the new private plane from the public store rather than changing all existing assets in place.

Website media reads use owner authorization. Embedded media reads use a build-scoped authenticated API/bridge path, with explicitly allowed origins and CSP. Render authenticated response bytes as `data:` URLs (or canvas drawing from decoded bytes); the host's CSP blocks `blob:` images, and `data:` was proven up to 8.4 MB in an app-only result's `_meta`. A transport capability, if needed, must be short-lived, scoped to the required files and rechecked against the active grant. It must not be an unrevocable public image URL. M0 proves the display mechanism before M1 finalizes it.

Private responses and errors are not shared-cacheable. Crops and thumbnails inherit the parent's access policy and cleanup. Expired or cancelled grants cannot obtain further media bytes; recovering authentication reopens the same saved draft. UI-only payload metadata can reduce model context, but is not an access control boundary.

For existing public assets, keep their provenance explicit: a new private copy cannot revoke an old URL or a recipient's cached copy. The initial guarantee covers new Studio uploads. Do not silently label previously public artwork as never disclosed; offer a clear notice and a fresh upload when the user needs a new private source.

**M0 amendments (approved 2026-11-16):**

- **Only app-initiated calls are a protected channel.** Private artwork, thumbnails and crops reach the view only through app-only calls that recheck the grant on every request. Tool results are not protected: the host retains them and re-delivers them after revocation.
- **Images shown to the AI** (model-visible crops) stay in the conversation permanently. This is accepted as part of sharing with the user's AI provider and is stated in the privacy notice.
- **Privacy notice:** artwork shared through the chat is also saved in the user's ChatGPT Library and may be used for training if the user has opted in. Session Zero's protection covers only its own storage and delivery.

**Alternative considered:** using the existing unguessable URLs for the first release. Rejected by the user's explicit privacy choice.

**M1b implementation record (approved by the user in this session, 2026-11-16; base `a422cc78e1c8b3cf1533e152e6ac74681411e421`; recorded before dependent code).**

- **Storage boundary.** A separate `StudioMediaStore` supports local disk and S3-compatible storage. Keys are `studio-private/v1/<random-file-uuid>/original.<verified-extension>` and `preview-v1.webp`; they contain no owner, build name or uploader filename. The private adapter returns no public URL. Local storage and its staging directory are outside `UPLOAD_DIR`, with 0700 directories, 0600 files, atomic writes and containment/symlink checks. Configuration rejects overlapping real paths. S3 uses explicit `STUDIO_S3_ENDPOINT`, `STUDIO_S3_BUCKET`, credentials and region, distinct from the public bucket; there is no autodetection, public disk mirror, public fallback, runtime bucket creation or bucket-policy mutation. A synthetic anonymous GET/HEAD/list denial probe gates intake. Missing or unsafe configuration fails closed. The development SeaweedFS default can allow anonymous access without configured identities; a separate bucket alone is insufficient.
- **Public exclusion and delivery.** `/uploads` rejects the reserved private namespace before object reads or static fallback; static paths cannot escape through symlinks. Private originals and previews are never written into the public directory or public asset adapter. Server-internal build preview/grid-analysis reads dispatch reserved private keys to the private adapter, never to public fallback. Owner media is served by an account-authorized `/api/builds/:id/files/:fileId/media` route; embedded media uses the delegated family and app-only tools. Every request checks build ownership/membership, expiry and revocation; media is checked again after storage/processing and before response. No signed URL or identifier authorizes access. Private successes, errors and MCP responses use `Cache-Control: no-store`, with no conditional 304 path; images use verified content type and `nosniff`.
- **Persistence and identity.** Add nullable server-only `BuildFile.studio` metadata (legacy rows stay null): original SHA-256, verified type, raw dimensions, EXIF orientation, canonical coordinate identity, preview key/hash/bytes, total stored bytes and bounded receipt keys. Canonical coordinates are the original interpreted through versioned EXIF auto-orientation; canonical identity hashes original identity plus that transform and dimensions. The original is byte-identical, never resized or replaced. A bounded, metadata-stripped 1500-edge WebP preview is stored privately. Derivative bytes count against the existing build storage budget. A nullable `Build.studioFileId` is only the saved source-file view binding, not an active authoring map/encounter or revision. No existing `packages/shared` schema changes.
- **Recovery and retention.** Open returns only build/file identifiers, protocol version and non-sensitive intake status. App-only snapshot/media calls load current state; no private bytes enter a resource, open result, widget state or browser storage. Visible views refresh metadata every five seconds, pause while hidden and stop on teardown. A mounted view may keep its last authorized state marked stale during reconnect; definitive foreign/unknown-build refusal clears it. Reauthorization reloads the same backend build and binding. Reads/binding-only changes do not extend build retention.
- **Cleanup refinement (before its implementation):** cancellation of an in-flight write retains its intent through the bounded write lease. Failed/deduplicated writes receive immediate deletion plus a delayed verification after that lease, so a late S3 completion cannot escape cleanup. Store states are `write`, `cancelled`, `delete`; only a live `write` intent can commit. Per-build intake outcomes retain the latest 20 results, without extending retention on failures or reads.
- **Real-host recovery refinement (2026-11-16, before the dependent fix):** healthy visible views poll every five seconds. A failed refresh pauses polling until the user chooses Retry or explicitly opens the Studio again; visibility/focus alone cannot repeat a declined host authorization prompt. The last authorized state stays marked stale, while definitive foreign/unknown-build refusals still clear private content. No credentials or additional authority are introduced.
- **Cleanup.** `StudioMediaJob` records storage write intents before bytes are written and durable deletion jobs within discard/account-delete transactions. A successful file commit consumes its intent; expired incomplete intents and deletion failures are retried after restart. File metadata identifies every derivative. Closing a build removes it from grant access, revoking a family when no granted build remains; other granted builds keep working. Account deletion removes all new binding/media records. The 14-day abandoned-build sweep uses the same cleanup. Legacy and published assets retain their existing rules. Jobs contain generated keys only, never descriptors or host request metadata.
- **Publication boundary until M5.** Existing publication copies file URLs into library rows, so publication selections depending on a private file are refused before any library write, with a catalog message. This covers indirect creature/map/encounter dependencies and is repeated at store commit. Legacy publication remains available. No public copy or M5 alias is introduced in M1b.
- **Environment and authority.** The user approved this design, the exact two origins and 40-million-pixel ceiling, then authorized autonomous M1b implementation. Isolated local SeaweedFS/Postgres checks are selected; additional AWS test-bucket permission is unused. No development stack, cloud, production, DNS or edge change. The later real ChatGPT run/tunnel still requires a separate yes. Main advanced from `4033fd4c` to `c007fba3` (policy text and guest tutorial only); it was not merged into this branch.

### D9. Original file intake

The 2026-11-17 M2 amendment below defines current intake policy. The M0 and M1b sections record the earlier decisions and behavior.

Provide an embedded Add files path for map and token uploads. When available, add explicit import of authorized chat attachments using host file metadata. The UI reports queued/uploaded/failed per file, binds the result to the correct build and permits retry without duplicated files. Reuse build quotas, byte/type/dimension validation and decoding limits; do not send bulk file bytes through ordinary JSON tool arguments.

Remote download descriptors are untrusted. Bound download size, redirects and time; reject private-network targets and unsupported origins; do not attach build/OAuth credentials to the source download. Determine host URL rules from the actual M0 exchange and primary documentation, not a guessed fixed list of vendor storage domains.

**M0 amendments (approved 2026-11-16):**

- **Chat attachments are a primary intake route**, alongside the Studio's own Add files buttons (host file picker and device upload), because users already know the chat's attach button. The open/set-up tool accepts attached files directly (`openai/fileParams`), so attaching a map and asking for the Studio imports it without depending on the model choosing a separate import tool. All three routes delivered byte-identical originals in M0.
- **Allowed download origins** are the two exact observed origins, one composer host under `oaiusercontent.com` and the Azure Blob host used by the picker and device upload. Any new origin is refused until reviewed.
- **Download on receipt.** Observed descriptor lifetimes were 5 and 10 minutes. Never hold a descriptor for later.

Receiving an expired link leaves the existing draft intact and asks for another file selection. Do not substitute a low-resolution chat preview for the original silently. An independent original-file hash check proves M0's transfer; image normalization and working coordinates are recorded separately as D3 describes.

**M1b intake implementation record (same approval and base as D8, recorded before dependent code).**

- `studio_open(buildId, mapFiles?, tokenFiles?)` accepts top-level arrays through `openai/fileParams`, each descriptor declaring `download_url`, `file_id`, optional `mime_type` and `file_name`. At most five files per call. The resource URI is content-hashed and static; the existing pinned SDK remains. App-only `studio_import_files`, `studio_snapshot` and `studio_get_media` support feature-detected host picker/device upload, backend recovery and `data:` display. The UI contains only identity/source display, intake outcomes, retry and reconnect actions; no M2 overlays or authoring context.
- Both attachment and view routes use the same server-side pipeline: authorize, check quota/rate/concurrency, resolve an existing receipt if present, immediately download, validate full decode, hash original, create tracked private objects, then insert under the build lock with a fresh delegated check and quota/deduplication check. Successful earlier files survive later failures. Receipt keys are scoped to the build and kind; content identity deduplicates retries whose host ids changed. Lost-response retries return the saved file. Failed writes queue their generated objects for deletion.
- Partial results distinguish `saved`, definite validation `failed`, and `unknown` when a transport failure or ended connection prevents confirming the commit. A post-commit access refusal can report the saved identifier without returning private metadata. Reauthorization and retry resolve uncertainty from backend receipts; an outage must never falsely claim that nothing was saved.
- Merged M1b permitted two exact origins: `https://sdmntpreastus3.oaiusercontent.com` (M0 composer exchange) and `https://oaisdmntpreastus3.blob.core.windows.net` (M0 picker/device exchanges). It required HTTPS on the default port and rejected userinfo, fragments, redirects, non-public IPv4/IPv6 destinations, encoding ambiguity, compressed, incomplete and oversized bodies. Bounded DNS validated every answer and the connection used a validated address with normal TLS hostname verification. Each download had a 20-second and 25 MiB limit, with bounded concurrent intake and no forwarded cookies, bearer, authorization or proxy credentials. Expiry returned catalog guidance to select or attach again.
- Validate actual PNG/JPEG/WebP bytes, full decode, the existing 16384-pixel edge bound, and the approved 40,000,000 decoded-pixel ceiling from M0. Reuse 100 files / 20 maps / 500 MiB per build and the existing per-owner upload budget; no original-file substitution or silent resizing. Preserve raw dimensions/orientation and report canonical dimensions. Legacy UVTT routes are unchanged.
- New controls use `t()` with English/zh-TW catalogs; server outcomes use catalog-backed codes/messages. State clearly that provider chat/Library retention and opt-in training are outside Session Zero's storage guarantee. Existing model-visible image inspection is deliberate AI-provider sharing and never the view's protected-media channel.
- Verification uses synthetic fixtures on isolated services: storage refusal paths on disk/S3, downloader adversarial tests, identity/orientation/partial retry tests, grant/quota races on memory/Postgres, cleanup failures and restart, browser bridge simulation plus owner media/consent checks. Local bridge simulation does not qualify ChatGPT. Tasks 2.5 and 2.8 retain their actual-host gates until the separately authorized real run.

**M2 amendment — ChatGPT attachment origins and website fallback (approved 2026-11-17, FR-GM-26).**

- Match the hostname against `^sdmntpr[a-z0-9]{2,32}\.oaiusercontent\.com$`. Accept HTTPS on default port 443 with a plain ASCII authority, and refuse userinfo, fragments, backslashes and control characters. Retain bounded DNS, validation of every answer as public, address pinning, normal TLS, no redirects, identity encoding, the 20-second and 25 MiB limits, no forwarded credentials, and full image decode and pixel limits. Descriptors remain untrusted.
- The 2026-11-17 manual run received two `studio_open` composer `openai/fileParams` files from different origins, `https://sdmntprnortheu.oaiusercontent.com` and `https://sdmntprnznorth.oaiusercontent.com`. M0 recorded `https://sdmntpreastus3.oaiusercontent.com`. The reported inspection found the same `*.oaiusercontent.com` certificate on all three (Google Trust Services WE1, identical SHA-256 fingerprint), behind Cloudflare on the MarkMonitor-registered domain. Interim commit `9481a162` added the first two origins to the exact list. This amendment supersedes that interim list.
- The bounded prefix matches the observed composer host family across regions. The broader `*.oaiusercontent.com` scope also contains `web-sandbox.oaiusercontent.com` and per-app widget origins that serve third-party developer content. Reject every `*.blob.core.windows.net` host, including the former picker/device host. Its Azure account names share a globally unique, first-come namespace. The reviewed OpenAI material documents temporary descriptors and widget helpers without publishing a composer host list, descriptor signature or attestation that Studio can verify, or a server-side fetch-by-`file_id` API. The observed certificate and naming pattern inform the policy without attesting to individual requests. [OpenAI File APIs](https://developers.openai.com/plugins/reference#file-apis), [OpenAI widget origins](https://developers.openai.com/plugins/reference#component-resource-meta-fields), [OpenAI Security & Privacy](https://developers.openai.com/plugins/guides/security-privacy), [Azure account naming](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-storage-account-name).
- This changes merged M1b behavior by removing `selectFiles`, `uploadFile`, `getFileDownloadUrl` and the app-only `studio_import_files` tool from the product Studio. The Azure URLs passed from the view are client-provided, with no host attestation to the server. Chat attachments enter via `studio_open` and `openai/fileParams`. The English and zh-TW Studio views direct users to attach an image in ChatGPT or use the owner upload on the existing `/builds/:buildId` page from the authorized snapshot. The fallback explains that anyone with a website upload's file link can access it.
- Emit one structured `studio_attachment_origin_refused` server line per origin refusal. The only descriptor-derived field is the parsed `URL.origin`, or `null` for an unparseable URL. Path, query, signature, file ID and filename are excluded. Keep failure codes for programmatic handling and catalog translation. Show English or zh-TW guidance to attach again in chat or upload on the website. Expired links still ask the user to reattach the original in chat.

### D10. Final review, private media and atomic publication

Review in Session Zero opens the selected immutable candidate, not whatever happens to be newest by page load. Show its changes and dependency manifest: source image, grid/profile units, map, encounter, creature values and artwork. A newer working version is announced without changing the candidate under review. The owner can choose to review that version instead.

Immediately before publication, recheck the selected working/reference versions and all relevant dependency versions under the build lock. A concurrent change returns a conflict and publishes nothing. Existing grid confirmation, stale terrain, off-map geometry, portal cutting, Blocked footprints, quotas and hidden-token rules remain authoritative. Unconfirmed grids can be inspected and revised in chat; any outstanding owner confirmation happens during final review, followed by revalidation.

Use one owner-authorized operation to materialize the selected candidate and produce the existing publish plan. Do not let an intervening tool write alter the selected state. Changes to a map invalidate affected encounter reviews even if the token list itself did not change. A map shared by other draft encounters requires explicit dependency reporting; no unrelated encounter is published automatically.

Private media must remain private if publication fails. Prefer leaving bytes in private storage and making a new ordinary library delivery alias readable only after its library/publication row commits. The new alias is resolved through that committed record; it must not fall through to public static storage before commit. The owner's reviewed publication action authorizes delivery using the existing library image rules, with that consequence explained on review. The private draft URL remains protected.

This avoids a public object copy before a database transaction, which would leak artwork on rollback. File storage and access-state lookup must be designed together; if the chosen store cannot supply a commit-gated alias, resolve that architecture before coding M5 rather than claiming cross-system atomicity.

Publication stays add-only and idempotent. Existing published items that the plan reuses must be included in validation of the actual values used; relevant library dependency changes cannot silently replace what was reviewed. Keep a receipt that connects candidate and dependency versions to resulting items. Existing room creation, filtering and removal behavior are reused. The AI receives no GM credential.

### D11. Validation, comparison and accessibility

Use deterministic validation for structural, geometric, terrain and placement problems. Unknown visual interpretation remains an uncertainty mark. The UI labels these differently; passing a schema does not establish map accuracy.

Compare before/current candidate at the same camera. Render added/removed geometry, token movement arrows, portal-state changes and visibility changes with shape/text as well as color. Preserve the board's terrain patterns. A change list focuses the relevant map area; keyboard selection and cancellation work without pointer-only gestures. Announce saved batches without moving focus or resetting the camera.

Include English and zh-TW text, narrow embedded layouts, loading/error/expired-access states and cancellation. Mobile-sized website checks do not establish mobile ChatGPT qualification. A withdrawn or superseded widget can still display its revision, but writes always require current revision checks.

### D12. Delivery and autonomous sessions

Use the milestone briefs in tasks.md. Each session investigates named uncertainties, implements within the approved design, verifies, reviews and updates handoff.md. Re-read current code and primary sources where needed; do not repeat the entire research phase. Material changes to user behavior, authority, privacy or scope return for a decision with a concrete recommendation. Routine reversible choices do not require another approval.

One branch/PR per bounded milestone is the default. If M1 access/storage or M3 contracts exceed one reviewable change, split into named submilestones before implementation. A fresh session starts from the merged predecessor or an explicitly named unmerged predecessor, never an assumed local main. Keep this parent change open until the complete spec is delivered; partial milestone completion is not a reason to archive it.

## Risks / Trade-offs

- Host render/message/file behavior differs from documentation → M0 requires the real ChatGPT web client, including reopening and independent tool writes.
- Current MCP SDK is 1.x while current ext-apps examples use 2.x peers → choose a tested compatible version or a bounded migration; do not combine unrelated player-protocol changes without regression proof.
- Credential or private-media work is larger than a canvas wrapper → complete it in M1 before private artwork is used in a user-facing Studio.
- Polling can spend host calls and hit rate limits → use mounted/visible-only refresh, immediate local refresh and measured intervals; add a separate push channel only if evidence warrants it.
- Source/grid changes make earlier visual context unreliable → require source/grid-bound requests and refuse stale promotion/publication.
- Snapshot history increases storage and dependency retention → inherit build expiry, cap revisions and request sizes, and preserve references until cleanup is safe.
- An AI can propose visually incorrect but valid data → keep uncertainty visible, preserve prior candidates and require owner review.
- One-owner conflict rejection creates occasional retries → preserve stale work and make regeneration explicit; automatic merging is deferred.

## Migration Plan

1. Obtain product review of this packet and architecture review of the proposed credential, asset and contract boundaries. No implementation approval is implied by creating documents.
2. Prove host assumptions with non-sensitive fixtures. Record production separately from an authorized development endpoint or tunnel.
3. Add compatible storage/contracts and memory/Postgres behavior. Ordinary builds and public assets keep working; old rows have no Studio enrollment or private-media claim.
4. Introduce private media and OAuth for Studio access. Keep the new experience explicitly unavailable until its prerequisites work. Never route a private upload through public fallback during a rolling deployment.
5. Add the workspace, visible preparation, versioned proposal path and correction UI in milestone order. Deploy matching server/MCP/web contract versions together; unsupported version pairs fail actionably without data loss.
6. Integrate owner review and commit-gated publication. Verify restart, retries, expiry, account deletion and the existing 14-day abandoned-build cleanup across history, grants and media.
7. Rollback disables new Studio entry points and writes; it must preserve protected media, existing drafts and published items. Do not roll a deployment back to a public file handler while private objects remain reachable by that handler. Storage/access compatibility is a release prerequisite, not an emergency script.

## Open Questions

The following are bounded implementation selections under the proposed architecture, not unresolved product scope:

- Which compatible ext-apps/SDK versions and maintained OAuth implementation pass M0 in the actual host?
- Which authenticated media transport passes the CSP and image-size constraints in that same host?
- What history cap and byte budget fit the existing build limits after measuring representative snapshots? State the limits and recovery behavior before M3 ships; hitting a cap must preserve the last saved candidate and allow owner review/discard.
- Does measured refresh cost require something beyond the initial polling approach? Add a push channel only with a demonstrated need.

These selections are recorded in research.md as they are resolved. The privacy requirement, website publication boundary and from-scratch visible journey are not open questions.
