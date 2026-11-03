# ADR 0048: 2.5D map style flag

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Changes:** `openspec/changes/map-2-5d-lighting-toggle`

## Context

The GM needs to mark a map as 2.5D (isometric) or flat in the map editor's Sight step. README keeps true 3D out of scope; this is a lighting/render projection flag only.

## Decision

`Scene.isometric?: boolean` (absent = flat), command `scene.setIsometric { enabled }` (GM only, rejects a no-op) and event `IsometricSet { from, to }`, modelled on line of sight (ADR 0044). `from` carries the replaced value; undo emits the swapped event. The event is in the undoable list, appears in the activity log, and passes unchanged to players (no hidden data). The editor holds it in its draft and saves it with Save changes.

## Consequences

Additive and optional: old events, snapshots and checkpoints parse and read as flat. UVTT import/export ignore it (neither touches `Scene.lineOfSight` either); a MapSet leaves it unchanged. Library maps and encounter templates do not carry it, as with line of sight. Board rendering for 2.5D maps is future work.
