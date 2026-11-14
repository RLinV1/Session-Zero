# ADR 0073 — Versioned Studio proposals and protected draft artwork

**Status:** Proposed; product and Real-Time Architecture review pending. No sign-off is claimed and no runtime implementation is included. Number selected against main `a86160f5` on 2026-11-14; recheck collisions before merging.

**Requirements:** FR-GM-26, FR-GM-27 and the proposed `interactive-scene-studio` capability. **Change:** [interactive-ai-scene-studio](../../openspec/changes/interactive-ai-scene-studio/proposal.md).

**Extends:** ADR 0053 (build passes and owner-approved templates), ADR 0071 (AI Base terrain), ADR 0002's public asset-delivery decision, and existing account/session ownership. The room command/event pipeline and viewer filtering remain unchanged.

## Context

The owner wants to see initial map preparation and correct selected regions inside an AI conversation. The current builder uses latest-value drafts, whole-array replacement and an owner-edited item lock. Those rules protect ordinary builds but cannot preserve alternative candidates or bind a model's change to the version it inspected.

Draft metadata is private, but source artwork currently uses publicly readable random URLs. The user explicitly chose protected unpublished Studio artwork on 2026-11-14. Hiding a URL in the UI does not meet that requirement.

## Proposed decision

1. Keep one build lifecycle. Add bounded Studio workspace/revision/request/proposal records with server-owned compare-and-swap versions and stable authoring IDs. Compile the selected candidate into the existing native map/encounter formats.
2. AI work advances a private working candidate without implying owner approval. It can propose against owner-edited snapshots but cannot overwrite the protected materialized item. Enrollment makes every write path revision-aware or refuses it actionably; ordinary builds retain their existing behavior.
3. The server enforces correction scopes, build choices, source/grid bindings and relevant dependency versions at commit. Retain stale work without automatic promotion or merge.
4. Introduce build-scoped OAuth for hosted delegated access. Passes remain limited to their supported build-only workflows. The build HTTP service verifies authority independently; `apps/mcp` remains its HTTP client and does not import server internals.
5. Store new unpublished Studio originals and derivatives in a private plane outside every public upload/static/object-store path. Use authenticated media delivery in website and embedded views. Existing public artwork is not retroactively declared secret.
6. Only the owner's signed-in website session selects the exact final candidate for publication. Bind the review to all values publication actually uses, including reused library dependencies. Keep add-only transactional library writes.
7. Private bytes must not become publicly readable on a failed publication. Prefer a library delivery alias whose access depends on committed publication/library state, while underlying bytes remain private. No pre-transaction public copy is permitted.
8. Keep room commands, events, reduction, viewer filters and GM credentials outside Studio authoring. Native room creation and application handle published results as usual.

The detailed proposal and alternatives are in [design.md](../../openspec/changes/interactive-ai-scene-studio/design.md). This ADR records architectural boundaries, not a final wire schema or storage vendor choice.

## Consequences

- Extends builder contracts and persistence; requires additive migrations and both store adapters.
- Replaces the coarse lock's collaborative role only for enrolled targets while preserving its protection on ordinary materialized drafts.
- Requires new OAuth, private-media and deletion/retention tests. Publication storage routing must respect database rollback.
- Retains useful existing rendering and validation. It does not require a live room, backend model, CRDT or portable scene generator.
- Actual host behavior remains an experiment. SDK/auth/media implementation selections must be recorded before dependent code is reviewed.

## Review scope and status

| Review | Scope | Status |
| --- | --- | --- |
| Product owner | Journey, scope, final publication behavior and milestone sequence | Packet drafted; not yet accepted as a whole |
| User privacy choice | Protect new unpublished Studio originals and derivatives | Selected by the user on 2026-11-14 |
| Real-Time Architecture owner | Delegated credentials, private asset access, authoring contracts, enrollment and guarded publication | Pending |

Plan the architecture review before M1 credential/private-media integration and M3 contract implementation. A successful prototype or local agent review is not this external sign-off. Do not copy the prior terrain branch's implementation-before-review authorization into this change.
