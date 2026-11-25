# ADR 0073 — Versioned Studio proposals and protected draft artwork

**Status:** Accepted on 2026-11-16 (architecture review by Raymond at `6f645f29`). Implementation begins with M1; M0 was a proof endpoint only. Number selected against main `a86160f5` on 2026-11-14; recheck collisions before merging.

**Requirements:** FR-GM-26, FR-GM-27 and the proposed `interactive-scene-studio` capability. **Change:** [interactive-ai-scene-studio](../../openspec/changes/interactive-ai-scene-studio/proposal.md).

**Extends:** ADR 0053 (build passes and owner-approved templates), ADR 0071 (AI Base terrain), ADR 0002's public asset-delivery decision, and existing account/session ownership. The room command/event pipeline and viewer filtering remain unchanged.

## Context

The owner wants to see initial map preparation and correct selected regions inside an AI conversation. The current builder uses latest-value drafts, whole-array replacement and an owner-edited item lock. Those rules protect ordinary builds but cannot preserve alternative candidates or bind a model's change to the version it inspected.

Draft metadata is private, but source artwork currently uses publicly readable random URLs. The user explicitly chose protected unpublished Studio artwork on 2026-11-14. Hiding a URL in the UI does not meet that requirement.

## Proposed decision

1. Keep one build lifecycle. Add bounded Studio workspace/revision/request/proposal records with server-owned compare-and-swap versions and stable authoring IDs. Compile the selected candidate into the existing native map/encounter formats.
2. AI work advances a private working candidate without implying owner approval. It can propose against owner-edited snapshots but cannot overwrite the protected materialized item. Enrollment makes every write path revision-aware or refuses it actionably; ordinary builds retain their existing behavior.
3. The server enforces correction scopes, build choices, source/grid bindings and relevant dependency versions at commit. Retain stale work without automatic promotion or merge.
4. Introduce build-scoped OAuth for hosted delegated access, served by Session Zero's own authorization server (dynamic client registration, PKCE, resource-bound opaque tokens verified by the build HTTP service; no OIDC advertisement). Passes remain limited to their supported build-only workflows. The build HTTP service verifies authority independently; `apps/mcp` remains its HTTP client and does not import server internals.
5. Store new unpublished Studio originals and derivatives in a private plane outside every public upload/static/object-store path. Use authenticated media delivery in website and embedded views; in embedded views only app-initiated calls carry private bytes, rendered as `data:` URLs. Existing public artwork is not retroactively declared secret.
6. Only the owner's signed-in website session selects the exact final candidate for publication. Bind the review to all values publication actually uses, including reused library dependencies. Keep add-only transactional library writes.
7. Private bytes must not become publicly readable on a failed publication. Prefer a library delivery alias whose access depends on committed publication/library state, while underlying bytes remain private. No pre-transaction public copy is permitted.
8. Keep room commands, events, reduction, viewer filters and GM credentials outside Studio authoring. Native room creation and application handle published results as usual.

**M1a implementation (recorded 2026-11-16, before dependent code; inside decision 4).** The authorization server lives in `apps/server` on the website origin, with the consent page at `/studio/connect` using the owner's signed-in session. It is a narrow in-house implementation (no OAuth library: the maintained candidates either advertise OIDC or lack registration and resource indicators). Records: `studio_oauth_clients`, `studio_grants` (one consent = one token family, bound to the selected builds and the `/mcp/studio` resource) and `studio_tokens` (hashes only). Access tokens last 8 hours, refresh tokens 14 days with rotation, families at most 30 days; code replay or refresh reuse revokes the family. Registration is capped at 200 clients with expiry of unused ones. `apps/mcp` verifies each request by HTTP introspection against `apps/server`; the build API accepts grants only on its own `/api/studio/builds/*` family with a write-time recheck under the build lock. Details: design.md D7, "M1a implementation record".

**M1b implementation (user approved 2026-11-16, recorded before dependent code; decisions 5 and 7).** New Studio files use a separate private disk/S3 adapter with the reserved `studio-private/v1/<uuid>/` namespace, no public URL/mirror/fallback, explicit S3 configuration and anonymous-denial qualification. Local real paths cannot overlap public uploads. Server-only file metadata records exact original hash, orientation/canonical identity and private preview; derivative bytes count against build limits. Build/source binding, guarded idempotent intake and durable storage intents/deletion jobs work in both adapters. `studio_open` accepts attachment arrays; only app-initiated authorized calls populate the credential-free content-versioned view with private bytes. Downloads allow exactly the two M0-observed concrete origins, reject redirects/private network targets, pin validated DNS, and enforce 20 seconds / 25 MiB plus full image validation (16384 edge, 40 million decoded pixels). Discard, account deletion and the abandoned-build sweep remove new records/access and retry object cleanup after restart. Until M5, publication selections depending on private files fail before library writes. No shared room schema or authority is added. Exact layout, recovery, cleanup and intake choices are in design.md D8/D9's M1b records. The user authorized autonomous implementation after approval; isolated local services are selected and optional AWS authorization is unused. Actual ChatGPT qualification is recorded in the review table below; architecture-owner code review remains a separate gate.

The real M1 host run also refines recovery within this boundary: after a failed bridge refresh, pause polling until an explicit Retry/open, preventing repeated authorization prompts after dismissal. Last authorized state is marked stale; definitive foreign refusals clear it. Recorded before the dependent fix in design.md D8. Final implementation `7eadf503` also binds pending operations to their initiating build/generation; a later context cannot inherit a delayed picker, upload or binding result. Required real-host qualification passed; architecture-owner code review remains a separate gate.

The detailed proposal and alternatives are in [design.md](../../openspec/changes/interactive-ai-scene-studio/design.md). This ADR records architectural boundaries, not a final wire schema or storage vendor choice.

## M3 revision and enrollment amendment

The product owner selected first-correction enrollment and confirmed that a website save should become the next working revision. The exact [M3 contract and verification matrix](../../openspec/changes/interactive-ai-scene-studio/design.md#d14-m3-authoring-contract) records the implementation choices. The product owner explicitly waived architecture review for this implementation on 2026-11-18.

The owner's signed-in website session creates the correction request and enrolls its map and optional encounter. The delegated connection reads the saved request and submits typed operations within its scope. The server checks the current grant, choices, source, grid, relevant dependencies and working revision in the write transaction. An applicable proposal advances only the private working pointer. A stale candidate is retained as an immutable revision, and a native owner save advances the pointer from the materialized draft the owner edited.

Enrollment and ordinary saves, removals and publication use the same per-build serialization boundary. Legacy replacement cannot overwrite an enrolled draft. Review of the exact candidate for publication belongs to M5. History is bounded, shares the existing protected artwork references, and follows the build's discard and retention lifecycle.

## M4 private correction authority

The approved M4 plan authorizes the signed-in build owner to enable or disable private correction requests and restores for each connection on that build. The grant records the opted-in builds. Existing and new grants start with an empty set. The connection's existing build coverage, lifetime and revocation still apply. The adjustment takes effect on the current grant without a new OAuth flow.

The app exposes request creation and private revision restore as app-only tools. App-only visibility controls discovery. The build service enforces authorization with the live grant, explicit build opt-in, owner choices and revision checks under the build write boundary. The grant establishes the caller's authority to use those operations. A correct request binds the displayed source, scene and editable scope. Restoring a revision moves the private working pointer by adding a revision, with the expected current revision as a precondition. Delegated calls cannot end corrections, change permissions or publish. A previously saved request remains a scoped authorization to submit a proposal while the connection remains live and the applicable choices allow it.

Crop delivery inherits build and source access. It renders the saved request's base and padded source region, then rechecks access and request existence before returning bytes. The model receives this deliberately shared image in the tool result. The chat provider can retain it. App views continue to load previews through authorized media paths.

The M4 authority review checked the two store boundaries, the grant update and write lock ordering, the distinction between tool visibility and authorization, and the owner-only paths. This record precedes the dependent implementation. The owner expressly waived Raymond review gates for M4 on 2026-11-18.

## Consequences

**M2 implementation decision (user agreed 2026-11-17, before dependent code):** design.md D13
records the exact bounded visible-preparation design on merged main `2bcfa0a1`. Add a shared
native saved-scene projection/renderer, atomically validated persisted display context and
20 bounded sanitized preparation outcomes, separate from future authoring revisions. Website
owner and embedded delegated adapters retain existing authority/media boundaries. Reads,
display context and refused attempts do not extend retention. M1 implementation approval is
reported by the user as Raymond's approval of everything; remaining external approval gates
are waived by the user. The user also authorizes autonomous isolated real ChatGPT testing.
This does not authorize publication, deployment, merging or later-milestone contracts.

- Extends builder contracts and persistence; requires additive migrations and both store adapters.
- Replaces the coarse lock's collaborative role only for enrolled targets while preserving its protection on ordinary materialized drafts.
- Requires new OAuth, private-media and deletion/retention tests. Publication storage routing must respect database rollback.
- Retains useful existing rendering and validation. It does not require a live room, backend model, CRDT or portable scene generator.
- Actual host behavior remains an experiment. SDK/auth/media implementation selections must be recorded before dependent code is reviewed.

## Review scope and status

| Review | Scope | Status |
| --- | --- | --- |
| Product owner | Journey, scope, final publication behavior and milestone sequence | M0 design amendments approved by the user on 2026-11-16 (one revised, one declined; see research.md) |
| User privacy choice | Protect new unpublished Studio originals and derivatives | Selected by the user on 2026-11-14 |
| Real-Time Architecture owner | Delegated credentials, private asset access, authoring contracts, enrollment and guarded publication | Accepted by Raymond on 2026-11-16, reviewed revision `6f645f29` (reported by the user, with Raymond present) |
| M1a implementation choices | The "M1a implementation" paragraph above and design.md D7's record | Pre-approved by the user on 2026-11-16 for choices inside D7 as amended (M1a starter); recorded before dependent code. Not a separate review by Raymond of this code; the PR is open for that |
| M1b implementation choices | The "M1b implementation" paragraph above and design.md D8/D9's records | User approved the researched design and autonomous implementation on 2026-11-16; recorded in `1a2f7639` before dependent code. Required real ChatGPT qualification passed ([evidence](../../openspec/changes/interactive-ai-scene-studio/evidence/m1-host-2026-11-16.md)); independent fixes re-reviewed through `7eadf503`. Architecture-owner code review remains pending and is not replaced by those checks. |
| M4 correction authority | Build-specific grant opt-in, delegated request creation and restore, and authorized model crops | The owner approved the M4 plan and waived Raymond review gates. The amendment above records the authority and write-boundary review before implementation. |

The review rows record the decisions for each milestone. The M3 implementation used the owner’s explicit waiver recorded above. A successful prototype or local agent review is not this external sign-off. Do not copy the prior terrain branch's implementation-before-review authorization into this change.
