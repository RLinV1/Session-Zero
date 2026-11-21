## Why

Line of sight (FR-GM-19, change `dynamic-line-of-sight`) only does something on a map with walls. The maps that ship with the app have none, and automatic wall detection needs the vision service, which a local or demo setup often does not run. Storing hand-checked walls for every built-in map, and having Detect walls return them, gives a GM accurate walls in one click on any built-in map, plus a new map designed to show line of sight off.

## What Changes

- Every built-in map has stored walls and doors in the shipped catalog: the three painted maps (The Broken Span, Hollowfrost Keep, Temple of the Green Sun) and a new demo map.
- Stored walls are never applied on their own. Placing a built-in map is unchanged. When the GM presses Detect walls on a built-in map that has stored walls, detection returns the stored walls immediately instead of running the vision service, and they go through the usual review and Apply step.
- Detect walls is offered for a built-in map with stored walls even when the vision service is not available.
- A fourth built-in map, "Sunken Crypt", made for demonstrating line of sight: a top-down dungeon of rooms and corridors with pillars that cast shadows, closed doors between rooms, a window and one locked door. It follows the existing built-in map rules (top-down, no creatures, at least 2600 px wide, its own measured grid).
- GMs whose libraries were already given the shipped maps receive the new map's library row once. A shipped map a GM deleted is not added back.

Non-goals: applying walls automatically on placement, fog on built-in maps, stored walls in the library map editor (automatic detection stays room-scoped, ADR 0037), regenerating or re-measuring the existing painted maps.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `builtin-library-assets`: the catalog gains the Sunken Crypt map and stored walls for every built-in map; existing libraries pick up new shipped maps once.
- `map-editor`: on a built-in map that has stored walls for that exact map, Detect walls returns the stored walls instead of running the vision service, and is offered even when the service is unavailable.

## Impact

- `packages/shared`: `ShippedMap` gains optional stored walls (walls with portals); wall data for all four maps; the Sunken Crypt catalog entry.
- `apps/web/public/img/`: the Sunken Crypt image; `apps/web/scripts/`: the script that renders it from the same layout as its walls.
- `apps/server`: the room wall-detection endpoints and availability check serve stored walls for built-in maps; shipped-map seeding becomes per map (Postgres migration and memory store).
- `apps/web`: the map editor's Walls step offers Detect walls when the current map has stored walls.
- ADR 0029 and ADR 0036 are amended; no `Command`, `DomainEvent` or `RoomState` schema changes.
