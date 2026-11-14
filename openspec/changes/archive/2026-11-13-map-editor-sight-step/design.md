## Context

See proposal.md. `Scene.lineOfSight` and `scene.setLineOfSight` exist (ADR 0044). `viewerSight(state, viewer)` in `packages/shared/src/sight.ts` builds one polygon per owned token with `sightPolygon(segments, origin, bounds)`, which casts rays only at visible wall endpoints and map corners, then clips to the map. The room map editor (`GmPanel.tsx`) has steps Map, Grid, Walls and Fog sharing one draft (`mapDraft.ts`, `planDraftSave`), saved with existing commands.

## Goals / Non-Goals

**Goals:** a room-wide range applied in the same pure sight function, so filters, relay and view-as-player stay consistent; Sight settings in the editor draft.

**Non-Goals:** per-token range, light falloff, range on library maps.

## Decisions

1. **State.** `Scene.sightRange?: number` in grid units (absent means unlimited). Command `scene.setSightRange { range: number | null }`: GM only, positive and at most 1000 times `unitsPerCell`, a no-op refused. Event `SightRangeSet { from, to }` (null for unlimited), undoable, activity line "<GM> set sight range to 60 ft" or "to unlimited". `filterEventForViewer` resyncs players on it, since sight changes. Grid units, not pixels, so re-measuring the grid keeps the distance.
2. **Geometry.** `sightPolygon` takes an optional `maxDistance` in board pixels (range divided by `unitsPerCell`, times `cellSize`). Each ray's length is capped at it, wall endpoints beyond it are skipped (they cannot be seen anyway), and extra rays every 4 degrees fill the arc so the edge reads as a circle where nothing blocks. Hidden endpoints keep the visible-endpoint rule, so no hidden geometry leaks. `viewerSight` passes the cap from `state.scene`. The 1500-wall timing test gains a capped case.
3. **Editor draft.** `MapDraft` gains `lineOfSight` and `sightRange`; `planDraftSave` emits `scene.setLineOfSight` and `scene.setSightRange` when they differ from the room. The board tool rail's Sight button keeps sending `scene.setLineOfSight` directly as a live play control.
4. **Preview.** The Sight step shows the map with the same inverse mask the board uses (`makeSightMaskCanvas`), from `viewerSight` run on the GM's walls and fog with the draft scene values and editor-only test tokens in place of the room's tokens. A left panel adds and removes them; they are dragged by hand or nudged with arrow keys. No selection shows their combined sight; clicking one shows its sight alone and a bottom-right notice of how many other test tokens it sees. The GM holds all walls, so this is the computation the server does.
5. **ADR.** Amend ADR 0044 with the range: state, command, event and the geometry cap.

## Risks / Trade-offs

- [Arc rays add cost] → 90 extra rays per token, small next to wall endpoints; covered by the timing test.
- [Range on a gridless map] → Uses the room grid's default 5 ft per cell, as the ruler does.
