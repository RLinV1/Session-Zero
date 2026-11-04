## Context

`encounter.apply` builds the applied board from the resolved template (`encounterTable`) and replaces the room's board. `resolveEncounter` rebuilds the scene as `{ map, grid }`, so scene flags (line of sight, isometric, sight range) are never part of a template. `decide` already holds the room state, so it can read the current board.

## Decisions

- **Flag on the command, resolved in `decide`.** `keepMapSetup?: boolean` is added to `encounter.apply`. `decide` compares `state.scene.map` with `encounter.scene.map` (asset id when both have one, otherwise URL). On a mismatch it rejects `invalid`. On a match it overlays the room's `walls`, `fog`, `terrain` and the scene flags onto the applied table. Authorization stays first; the client's view of "same map" is a UI hint only (invariant 7).
- **Overlay, not a new event.** The result is still an `EncounterApplied` with `applied` and `previous`, so reduce, undo, activity log and the player resync need no change (invariants 1, 5, 6).
- **Keep ids.** Kept walls, fog and terrain keep their ids, since they are the room's own entities and nothing else references the template's.
- **Grid must match too.** The same map can carry a different grid in the template. Keeping the room's terrain and walls under a different grid would misalign, so `decide` also rejects `keepMapSetup` when the grid geometry differs, and the UI offers the option only when map and grid both match. Tokens are positioned in the template's grid.
- **UI.** The confirmation in `EncounterPanel.tsx` shows a checkbox only when the room's `scene.map` and grid match the summary's. It sends `keepMapSetup: true` when checked. Default unchecked, so today's behavior is unchanged.
- **ADR.** Short ADR documenting the additive command field.

## Risks

- The client and server must use the same "same map" test; the server is authoritative and a client mismatch only shows a rejected message.
- `EncounterSummary` may not carry the map asset id or grid. Check before adding a field.
