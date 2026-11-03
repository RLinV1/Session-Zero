# ADR 0043 — Library UVTT import and atomic map placement

**Status:** Proposed — Raymond Lin review required by CLAUDE.md
**Owner:** Real-Time Architecture (Raymond Lin)
**Implements:** KAN-43/44, FR-GM-06/07/12
**Extends:** ADR 0037 library-map board, proposed ADR 0041 UVTT, proposed ADR 0042 map-token adjustment

## Context

The library can store grid, walls, portal metadata and fog, but its image-only uploader rejects UVTT containers. Room UVTT preparation bypassed the library-saving option. Library placement copied geometry with commands sent after the map, exposing partial state and separate undo actions.

## Decision

1. Add account-only `POST /api/library/uvtt/imports`, using the room import's multipart reader and bounded validation worker pool. Authorize and check origin/rate limits before reading the file; recheck the session after validation. Keep the 40 MiB container, 25 MiB image, decoded-image, geometry and diagnostic limits. Remove raw files on success and failure. Library imports use `DEFAULT_GRID` for units/style; file spacing and phase remain exact.
2. Save immediately, matching library image uploads. One `createAsset` write includes the validated image record, grid and `board: { walls, fog: [] }`. Postgres writes the existing nullable board column in that same insert; no migration is needed. Like event appends, library insert and grid/board edits use parameterized JSON text cast to JSONB, preserving all JS doubles rather than Prisma's rounded JSON-input encoding. Clean up the new image when insertion fails. Return the public asset plus bounded warnings, without geometry, private storage keys or original container data. Open the existing library editor for review and editing after saving. Closing it keeps the imported map.
3. Room preparation accepts `?saveToLibrary=1`. Require both an active room GM credential and a live signed-in account holding that GM seat. Reuse the complete-map insert, reference the saved library asset in the private room preparation, and keep publication behind Apply. Library images have library retention, so cancellation and room deletion keep the saved asset. Failed preparation creation rolls back the new library row and image. As with image uploads, subsequent room draft edits affect the room; they do not silently update the library template.
4. Add optional `includeLibraryBoard` to `scene.setMap`. New clients set it for owned library maps, including maps uploaded into the library from a room. Resolve the acting GM's owned asset and complete board inside `LiveRoom`'s FIFO, validate the board and requested image identity, and inject `ResolvedLibraryMap` through `DecideContext`. Clients send a reference, not potentially large geometry. Reject missing, changed, foreign or invalid assets before any event is appended.
5. Record one `MapSet` with grid, complete replacement walls/fog and current token adjustments. IDs come from `ctx.newId`. An empty library board installs empty geometry; reapplying the same map replaces geometry rather than duplicating it. Existing composite reduction, player-filtered snapshots, guarded undo and replay apply unchanged. Later library edits never change an already applied room. Historical commands/events without the new option preserve their meaning.

## Consequences and review

The file parser, storage abstraction and editor components remain shared; account ownership and room authorization retain distinct checks. No image/base64 data or draft geometry enters Socket.IO commands, and its 64 KiB inbound limit remains unchanged. The global REST JSON limit stays 64 KiB; existing authorized geometry edits retain their 1 MiB parser.

This deliberately supersedes ADR 0037's sequential, append-only library board copy for new clients: selecting a complete library map now installs a complete scene atomically with one undo entry. Web and server must deploy together. Raymond's review remains outstanding; implementation/tests are not evidence of architecture approval.

## Amendment: terrain and tactical movement

Atomic library placement also installs the saved base terrain with no temporary effects. A private preparationVersion in stored board JSON fences owner-authorized preparation saves; it is removed before strict board validation or public board responses. UVTT terrain import/export remains out of scope. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
