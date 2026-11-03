# ADR 0037: Walls and fog prepared on a library map

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Changes:** `openspec/changes/seed-shipped-maps`
**Owner:** Real-Time Architecture (Raymond)

## Context

The library's map editor offers the room editor's Grid, Walls and Fog steps. Walls and fog were room state only (ADR 0029, ADR 0016), so a GM prepared them again in every room that used the map.

## Decision

A library map carries an optional `board`: `{ walls, fog }` (`LibraryMapBoard` in `packages/shared/src/libraryBoard.ts`), stored as one nullable JSONB column `library_assets.board` (migration 0015). Entries have no ids; the editor and the room name them. It is never part of `RoomState`, never in the asset's wire form, and is read and written only through `GET` and `PUT /api/library/:id/board`, account owners only (another account's map, a token and an unknown id all answer 404). `PUT` validates the body with the shared schema (at most `MAX_WALLS` walls and `MAX_FOG_REGIONS` fog regions, no extra fields) and with `libraryBoardProblem`, which applies the room commands' own limits (two different ends, on the map, fog with area). It parses its own body at up to 1 MB, since 1500 walls exceed the default 64 kB limit.

Placing a library map in a room copies the board in on the client, after `scene.setMap`, with the existing `wall.*` and `fog.replace` commands (`planDraftSave`), so every room-side check, authorization and undo entry is unchanged. A map with an empty board leaves the room's walls and fog as they are. ADR 0043 supersedes the sequential copy for new clients with atomic server-resolved replacement. Rooms already using the map keep theirs; later edits to the library board never reach back into them, as with the grid (ADR 0004).

Automatic wall detection is room-scoped and is not offered in the library editor. In both editors its controls are shown only while the vision service reports available.

## Consequences

No `Command`, `DomainEvent` or `RoomState` schema changes. A library map's walls and fog are a copy-on-place template, so they can drift from what a room later edits. Encounter templates still save walls and fog from a room, not from the library map.

## Amendment: one library editor draft

Grid, walls and fog now stay in one editor session across tab changes. The header shows a single
Unsaved changes status with Discard and Save changes. Saving updates the grid and board without
closing the editor. Each successful write advances its own baseline, so a partial failure retains
only the remaining unsaved work and can be retried safely.

Closing with unsaved changes opens the same in-app Save changes? modal used for encounter editing,
with Save, Discard and Keep editing. Only Save from this close prompt saves and then exits.
The editor no longer uses a browser confirm dialog. A new encounter waiting for its map's grid
starts after the editor is explicitly closed, rather than on a normal save.

## Amendment: terrain and tactical movement

Library board JSON may include compressed prepared base terrain. New preparation saves compare a revision and replace grid and board atomically; legacy omitted terrain is preserved and geometry changes cannot silently reset terrain. Room edits never update the saved library map. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
