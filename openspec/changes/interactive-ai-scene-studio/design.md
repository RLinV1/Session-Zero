# Design

**Status:** Proposed design for review. This file selects an approach for planning; it is not an implementation or architecture sign-off. See [proposal.md](proposal.md) for motivation and scope, [research.md](research.md) for evidence, and [tasks.md](tasks.md) for delivery gates.

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

No AI-facing credential acquires publication authority. In-chat owner publication/acceptance is deferred; host prompts or a model saying the owner agreed are insufficient proof for the website-only publication boundary.

### D8. Protected draft media

**User-selected requirement:** newly uploaded unpublished Studio artwork is protected, including thumbnails, canonical working images and model crops. Authorized display necessarily shares the selected data with the user's AI provider; this does not promise deletion from chat history or a viewer's device.

Introduce a private storage namespace that cannot be read through `/uploads`, local public static fallback, a public object-store policy or a direct storage URL. A different application route in front of the same public object is insufficient. Keep existing published/legacy asset delivery working; isolate the new private plane from the public store rather than changing all existing assets in place.

Website media reads use owner authorization. Embedded media reads use a build-scoped authenticated API/bridge path, with explicitly allowed origins and CSP. Prefer authenticated response bytes rendered as view-local object URLs; a transport capability, if needed, must be short-lived, scoped to the required files and rechecked against the active grant. It must not be an unrevocable public image URL. M0 proves the display mechanism before M1 finalizes it.

Private responses and errors are not shared-cacheable. Crops and thumbnails inherit the parent's access policy and cleanup. Expired or cancelled grants cannot obtain further media bytes; recovering authentication reopens the same saved draft. UI-only payload metadata can reduce model context, but is not an access control boundary.

For existing public assets, keep their provenance explicit: a new private copy cannot revoke an old URL or a recipient's cached copy. The initial guarantee covers new Studio uploads. Do not silently label previously public artwork as never disclosed; offer a clear notice and a fresh upload when the user needs a new private source.

**Alternative considered:** using the existing unguessable URLs for the first release. Rejected by the user's explicit privacy choice.

### D9. Original file intake

Provide an embedded Add files path for map and token uploads. When available, add explicit import of authorized chat attachments using host file metadata. The UI reports queued/uploaded/failed per file, binds the result to the correct build and permits retry without duplicated files. Reuse build quotas, byte/type/dimension validation and decoding limits; do not send bulk file bytes through ordinary JSON tool arguments.

Remote download descriptors are untrusted. Bound download size, redirects and time; reject private-network targets and unsupported origins; do not attach build/OAuth credentials to the source download. Determine host URL rules from the actual M0 exchange and primary documentation, not a guessed fixed list of vendor storage domains.

Receiving an expired link leaves the existing draft intact and asks for another file selection. Do not substitute a low-resolution chat preview for the original silently. An independent original-file hash check proves M0's transfer; image normalization and working coordinates are recorded separately as D3 describes.

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
