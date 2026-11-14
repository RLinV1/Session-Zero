## Why

Line of sight (change `dynamic-line-of-sight`) has no distance limit: a token sees until a wall, closed door, fog or the map edge. Many tables want a limit (torchlight, dim dungeons), and the GM sets up everything else about a map in the map editor, so the switch and the range belong there too.

## What Changes

- The room's map editor gains a fifth step, "5 · Sight", after Fog.
- The Sight step holds the room's Line of sight switch (the same setting as the board tool rail's Sight button) and a Sight range: Unlimited (default) or a distance in the grid's own units, e.g. 60 ft.
- Changes in the Sight step follow the editor's draft model: they are private until Save changes, and Discard drops them.
- With a range set, every player token sees only up to that distance, still blocked by walls, closed doors and fog. Anything beyond is hidden from players exactly as content behind a wall is (not sent at all).
- The step previews the result with test tokens the GM adds, removes and drags on the map; clicking one says how many of the others it sees.

Non-goals: per-token ranges (darkvision, torches), dim light bands, a range on library maps.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `line-of-sight` (still in change `dynamic-line-of-sight`): sight is limited to the room's sight range when one is set.
- `map-editor`: a fifth Sight step with the switch, the range and a preview.

## Impact

- `packages/shared`: `Scene.sightRange?: number` (grid units; absent = unlimited), command `scene.setSightRange`, event `SightRangeSet { from, to }` with undo and activity log; `viewerSight` caps rays at the range. Shared schema change: ADR 0044 amendment and Real-Time Architecture review.
- `apps/server`: none beyond the shared pipeline (players resync on `SightRangeSet`).
- `apps/web`: Sight step in `GmPanel.tsx`, draft support for both settings, preview.
