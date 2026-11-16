# Proposal: Interactive AI Scene Studio

**Status:** Draft for product and architecture review. Planning only; no implementation is authorized by this packet. Inspected baseline: `origin/main` at `a86160f584c44c8e8998bc56966e214ff04b5a08` on 2026-11-14.

## Why

Today a GM gives their AI instructions and artwork, then switches back to Session Zero to discover what it produced. A shared visual Studio should make initial map preparation and precise corrections visible inside the AI conversation, while Session Zero continues to supply deterministic tools and the owner controls publication.

## What Changes

- Open the same saved private build through a website Studio and an interactive MCP App. ChatGPT web is the first qualification target; other clients retain useful tools, pictures and website links.
- Start from original map images and token art inside the embedded Studio. An explicit file handoff stores originals in the correct build; attaching something to a chat alone is not treated as an upload to Session Zero.
- **Protect unpublished Studio images**, including originals, thumbnails and crops, with authorized delivery. The user selected this requirement on 2026-11-14. Existing public uploads require an explicit legacy policy; a private copy cannot undo earlier disclosure.
- Show saved grid, geometry, terrain and encounter work as it arrives. Clearly distinguish unfinished work, validated results and questions for the owner. Progress represents actual operations, not model reasoning or invented percentages.
- Select a region or objects, supply precise instructions, and let the AI propose scoped changes against an explicit revision. Compare candidates using one camera and visible additions, removals and token moves.
- Preserve revisions and owner changes. Iterate on a private candidate in chat without a mandatory website approval between corrections. Final selection and publication take place in the owner's signed-in website session.
- Extend existing build services, validation, map components and transactional publication. Keep authoring separate from player tools and live rooms. Provide scoped OAuth for the hosted Studio; retain existing build passes for supported local/proof workflows.
- Deliver through M0–M5, with bounded investigation, evidence and a fresh-session handoff for each milestone. M2 delivers visible preparation from a raw image; M5 qualifies the complete correction-to-publication journey.

## Capabilities

### New Capabilities

- `interactive-scene-studio`: shared authoring views, protected draft artwork, explicit file intake, visible preparation, versioned scoped proposals, comparison, conflict handling, owner publication and recovery.

### Modified Capabilities

None in the durable `openspec/specs/` inventory. Studio behavior is an opt-in extension of the implemented builder, whose `game-build-*` requirements currently remain in the active `mcp-game-builder` and `ai-build-terrain` changes. The design records those relationships and the required review of their boundaries; this packet does not archive or rewrite those changes. Ordinary library and room workflows retain their requirements.

## Impact

- `apps/mcp`: MCP Apps resources, host adapter, image handoff, delegated identity and revision-aware authoring tools over build HTTP APIs.
- `apps/server`: build-scoped Studio records, private asset delivery, permission enforcement, guarded publication and memory/Postgres adapters.
- `apps/web`: shared canvas and layers, embedded shell, selection, comparison and owner review. New user-facing text follows the existing English and zh-TW catalogs.
- `packages/shared`: builder contracts and reusable deterministic validation; no new live-room commands, events or state are planned.
- Additive persistence changes and a proposed ADR; architecture review is required before dependent credential, asset-access and shared-contract implementation.
- Real ChatGPT and deployment qualification remain separate from unit, integration and local browser tests. Production is currently unverified.

## Non-goals

Backend model invocation, source-image repainting, a second standalone scene/UVTT service, live-room editing, simultaneous multi-owner editing, automatic geometry merges, partial acceptance of dependent edits, full chat-history synchronization, mandatory vendor-specific panels, a public connector-directory listing, and a complete redesign of existing library screens.

Movement and visibility rehearsal remain a later vision. The first qualified journey uses one active image-based map and one encounter within an existing build; existing multi-map builds and native UVTT workflows must continue to work.
