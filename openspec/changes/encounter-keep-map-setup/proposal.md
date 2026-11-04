## Why

Applying an encounter template replaces the room's whole board with the template's. When the room is already on the same library map the template uses, the GM has usually spent time on that map's walls, portals, fog, terrain and lighting, and the apply wipes or replaces them. The GM only wanted the template's tokens placed on the map they already prepared.

## What Changes

- `encounter.apply` gains an optional `keepMapSetup` flag. When set, the applied board takes its tokens from the template but keeps the room's current walls and portals, fog, terrain, and scene lighting and sight flags (line of sight, isometric, sight range).
- The flag is only valid when the room's current map is the same library map as the template's (same asset id; same URL when neither has an asset id). With a different map the server rejects the command.
- The Encounter panel shows a "Keep this map's walls, fog, terrain and lighting" option in the apply confirmation only when the room's map is the template's map. With a different map the option is not shown and apply behaves as today.
- The event already carries the replaced board, so undo needs no new data.

## Capabilities

### New Capabilities

### Modified Capabilities
- `encounter-templates`: "Apply a template to an existing room" gains the keep-map-setup option and its same-map rule.

## Impact

- `packages/shared`: `commands.ts` (additive optional field on `encounter.apply`), `decide.ts` (`encounter.apply` case); an ADR note, since an existing command schema changes.
- `apps/web`: `panels/EncounterPanel.tsx` apply confirmation.
- Tests: `packages/shared/test/encounterApply.test.ts`, `apps/server/test/encounters.test.ts`.
- No change to stored templates, events or visibility filters: `EncounterApplied` already resyncs players.
