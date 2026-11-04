# ADR 0050 — Keep the map's setup when applying an encounter template

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0024-encounter-templates.md`
**Change:** `openspec/changes/encounter-keep-map-setup` · **Requirements:** FR-GM-13

## Context

`encounter.apply` replaces the room's whole board with the template's. When the room is already on the template's map, the GM has usually prepared that map's walls, portals, fog, terrain and lighting, and the apply discards them. The GM only wanted the template's tokens.

## Decision

- `encounter.apply` gains an optional `keepMapSetup: boolean`. Existing clients and logs are unaffected (additive field; absent = today's behaviour).
- `decide` rejects `invalid` unless the room's map and the template's are the same map (asset id when both have one, otherwise URL) and the grid geometry matches (`gridGeometryChanged`). The test is one shared helper, `sameMapAndGrid`; the web client uses it as a UI hint only, the server decides (invariant 7).
- When it holds, `decide` overlays the room's `walls` (portals included, ids kept), `fog`, `terrain` and the scene's `lineOfSight`, `isometric` and `sightRange` onto the applied table. Tokens still come from the template.
- No new event. `EncounterApplied` already carries `applied` and `previous`, so `reduce`, undo, the activity log and the player resync are unchanged. Kept data is the room's own, so no visibility filter changes: players still get a fresh filtered snapshot.
- `EncounterSummary` gains optional `grid` so the panel can tell whether the grid matches before offering the option.
- The Encounter panel shows "Keep this map's walls, fog, terrain and lighting" in the apply confirmation only when map and grid match. Default unchecked.

## Consequences

- A forged flag on a different map or grid is rejected with the board unchanged.
- Old summaries without `grid` simply never offer the option.
