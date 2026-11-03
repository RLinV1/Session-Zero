# ADR 0024: Reusable encounter templates

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-06 · **Amends:** `docs/adr/0004-asset-library.md`, `docs/adr/0019-checkpoints.md`
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-50-encounter-templates` · **Ticket:** KAN-50 (FR-GM-13)
**Amended by:** `docs/adr/0033-encounter-template-editor.md` (editing in temporary rooms, replace from a room)

## Context

A GM who preps a map, grid, monsters and fog for one session rebuilds it by hand for the next room. Library creatures (ADR 0012) save one monster, and checkpoints (ADR 0019) restore a board inside one room by replaying that room's log. Nothing carries a whole prepared board from one room to another. FR-GM-13 asks for exactly that, owned by the GM's account.

Walls and portals are part of the requirement's wording but do not exist in room state yet (FR-GM-06, FR-GM-07 and FR-GM-18 are planned).

## Decision

### A template is a library row, built by the server

`encounter_templates (id, owner_gm_id, name, version, data jsonb, map_asset_id, created_at, updated_at)`. It sits beside assets and creatures, is read and written only through `LibraryStore` methods scoped by owner, and never feeds back into `RoomState`. Another account's template answers 404, as for assets and creatures.

`POST /api/library/encounters { roomId, name }` builds `data` on the server from the live state of a room the caller owns. The client sends no board data, so a forged template cannot be stored. `data` is `EncounterTemplateData` at `version` 1: the map reference and size, the grid, tokens without id, owners or initiative, and fog regions without ids. Area templates, initiative, participants, chat, rolls and checkpoints are not saved: they are live play, not preparation. Hidden tokens are saved; a template is the GM's private prep.

### Maps must be library maps

A map uploaded straight into a room is deleted with the room, which would leave the template pointing at a missing file. Save therefore needs the room's map to be one of the GM's library maps, and stores its asset id (`ON DELETE SET NULL`). Apply resolves the map's address from the asset at that moment. A deleted map makes the template unusable (409 on apply) rather than silently map-less, and the map's usage warning lists the templates.

### Apply is one event, modelled on a checkpoint restore

`encounter.apply { templateId }` (GM only) emits `EncounterApplied { templateId, name, applied: TableState, previous: TableState }`. `LiveRoom.submit` reads the template for the acting seat's account, validates it, resolves the map, and passes it to `decide` through `DecideContext.encounterTemplate`. `decide` stays pure: it gets fresh token and fog ids from `ctx.newId` through `encounterTable`. `reduce` swaps the table in exactly as `CheckpointRestored` does, which ends any running encounter and clears area templates. Participants, chat, rolls, checkpoints and the room name are untouched. `previous` is the board that was replaced (invariant 6).

A template that is another account's, does not exist, has an unknown `version`, or fails schema validation reaches `decide` as no template, or as a refusal with a clear message, and commits nothing.

### New rooms use the same event

`POST /api/rooms` takes an optional `templateId`. The template is resolved before anything is created (404 when it is not the caller's, 409 when its map is gone), then `EncounterApplied` is appended after `ParticipantJoined`, with `previous` an empty table. One code path builds the table.

### Visibility

`filterEventForViewer` answers `resync` to every non-GM viewer, and the GM-only event is never sent to a player. Both tables in the event can hold hidden tokens, fog-concealed content and token owners, so a freshly filtered snapshot is simpler and provably safe compared with filtering two nested tables.

### Reversible

`EncounterApplied` joins `REVERSIBLE_EVENT_TYPES`. Its inverse swaps `applied` and `previous`. Undo is refused once the board differs from what the apply made, and an apply closes the undo history of earlier board edits, as a restore does (ADR 0019).

## Consequences

- One new command, one new event, one new library table; additive Prisma migration `0011_encounter_templates`. Web and server deploy together, as for every event addition.
- Replace, not merge: applying to a room that already has content swaps it. The web client asks for confirmation and undo puts the old board back, owners included. A merge mode could be a flag on the same command later.
- A template outlives the state shape. `version` plus schema validation on apply keep an old template from corrupting a room. Walls and portals join under a new version once state has them.
- A large apply carries two full tables in one GM-only event, bounded by the existing token and fog caps and the template's own limits.
- Apply refuses a seat with no account behind it (a guest GM seat cannot own a template).

## Alternatives considered

- **Reuse checkpoints with a cross-room restore.** A checkpoint is a seq in one room's log and depends on replaying it; a template must stand alone.
- **Let the client upload the board.** Simpler on the server, but anything could be saved as a template.
- **Copy the map file into each template.** Storage cost, plus cleanup rules for another kind of file.
- **Merge into the existing board.** Needs rules for overlapping tokens, scene conflicts and fog union for little gain over replace plus undo.

## Amendment: terrain and tactical movement

Reusable encounter templates include prepared base terrain only, omitting active temporary terrain effects alongside active AoE templates. Legacy templates still mean Normal ground. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
