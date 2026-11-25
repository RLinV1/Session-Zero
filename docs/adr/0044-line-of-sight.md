# ADR 0044 — Line of sight

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Extends:** `docs/adr/0016-manual-fog.md`, `docs/adr/0029-walls-and-wall-detection.md`, `docs/adr/0030-portals.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/dynamic-line-of-sight` · **Requirements:** FR-GM-19, FR-GM-23

## Context

FR-GM-19 asks for player-specific 2D line of sight from wall and portal segments, with no elevation, soft shadows or coloured light. Walls (ADR 0029) and portals (ADR 0030) exist and block movement. Plain walls are GM-only, so a player's client cannot compute sight without learning the wall layout. Concealment today is decided by three predicates in `visibility.ts` that take only `fog`.

## Decision

### State

- `Scene` gains `lineOfSight?: boolean`. Absent means off; old events, snapshots and checkpoint tables parse unchanged. Because `scene` is part of `TableState`, checkpoints and replay carry it.
- `RoomState` gains `sight?: Point[][]`, a derived per-viewer field. `reduce` never sets it and it is never persisted; only `filterStateForViewer` sets it, for a player, while line of sight is on.

### Command and event

- **`scene.setLineOfSight { enabled }`** — GM only (`forbidden` for players). Setting the current value is `invalid`.
- **`LineOfSightSet { from, to }`** — `from` is the replaced value (invariant 6). Undoable by a compensating event (ADR 0013).

### Sight

- Sight is computed in `packages/shared/src/sight.ts`, pure and deterministic (invariant 2), on the server for players and on the GM's client for view-as-player.
- Blocking segments: plain walls, and doors whose state is `closed` or `locked`. Windows never block sight; open doors never block sight. Fog region edges block sight like walls, so the polygon never outlines walls under fog. ~~Except those of a fog region containing the token's centre~~ — replaced by the crossing-walls amendment below: only the fogged area's outer edge blocks, for every token, so a token in fog sees only the fog around it. Map bounds close the polygon; with no map, sight is empty.
- A player's sight is the union of the visibility polygons from the centres of the tokens they own that are not hidden. No range limit, no memory of previously seen areas. The GM has no sight limit.
- Rays are cast only at endpoints visible from the token, so the outline never encodes hidden geometry. "In fog" includes points within 1 board pixel of a fog edge, for both concealment (`isInFog`) and, since the crossing-walls amendment, for whether a token's sight is held inside the fog.
- A point within 1 board pixel of a sight edge counts as inside, so a portal that bounds the view is visible.

### Visibility

- `Concealment = { fog, sight: Point[][] | null }`, built once per viewer by `concealmentFor(state, viewer)`, replaces the `fog` argument of `concealedFrom`, `templateConcealedFrom` and `portalConcealedFrom`. Content the viewer does not own is concealed when its reference point (token centre, template origin, portal midpoint) is outside sight. Fog and hiding still apply.
- `fogConcealsSide` stays fog-only: `reduce` has no viewer.
- `filterEventForViewer` resyncs a player, while line of sight is on, on `LineOfSightSet`, any wall, portal or map change, and any token create, delete, move, owner change or hide of a token the player owns before or after the event. All other events leave sight unchanged and keep their existing decision against the `Concealment` built from `before`. So a player's `sight` changes only through a snapshot.
- The ephemeral relay uses the same predicates with a per-recipient `Concealment`, cached until the next committed event.

## Consequences

- Line of sight joins hiding and fog in one concealment rule, so snapshots, events, relays and `decide` cannot disagree.
- Owned-token moves resync their owner while line of sight is on. Accepted for now; diff-style updates can come later without a schema change.
- A token deleted while out of a player's sight but never under fog may later show its name in old attack rolls. Accepted.
- Sight data a player receives never reaches inside the fogged area around none of their tokens, and a token in fog contributes nothing outside the fogged area.
- Removing the feature later must keep `LineOfSightSet` in the event schema so existing logs still parse.

## Amendment: sight range

Change `openspec/changes/map-editor-sight-step`.

- **State:** `Scene.sightRange?: number` (positive, in grid units). Absent means unlimited, so old scenes and events parse unchanged.
- **Command and event:** `scene.setSightRange { range: number | null }` is GM only, refuses the current value, and refuses more than 1000 squares (`1000 * grid.unitsPerCell`). `SightRangeSet { from, to }` (null = unlimited) is undoable by a compensating event and appears in the activity log.
- **Conversion:** `viewerSight` converts to board pixels as `sightRange / unitsPerCell * cellSize`, so a later grid change keeps the same distance in feet.
- **Geometry:** `sightPolygon(..., maxDistance?)` caps every ray at `maxDistance`, skips wall endpoints and map corners farther than that, and adds a ray every 4 degrees so the open boundary is an arc. The visible-endpoint rule is unchanged. Arc vertices lie on a circle around the token and reveal no wall geometry.
- **Visibility:** `filterEventForViewer` resyncs players on `SightRangeSet`, like `LineOfSightSet`. Content beyond the range is concealed exactly as content outside sight.

## Amendment: crossing walls and sight in fog (2026-11-23)

Change `openspec/changes/fix-sight-crossing-walls`. No schema, command or event changes.

- **Crossings get rays.** Rays are aimed only at segment ends, so a crossing part-way along a segment (a door drawn a few pixels past the corridor wall it sits between, a fog edge across a wall, a wall running off the map) was a corner of the visible area no ray reached, and the outline cut a straight chord across lit floor, which also concealed what stood there. `viewerSight` now splits all blocking segments where they cross, touch mid-length or overlap before casting (`splitSegments` in `sightSegments.ts`), and clips them to the map, so every crossing is an end. Walls lying on each other (duplicates, reversed, partly overlapping on one line, a door over a plain wall) resolve to one set of pieces with shared end points, so no hairline gap opens. `sightPolygon` itself is unchanged and now documents the precondition that segments meet only at their ends.
- **Hidden crossings stay hidden.** Crossings pass the same visible-endpoint test as ends, so the outline still never encodes geometry the token cannot see.
- **Only the fog's outer edge blocks.** After the split, a fog piece with fog on both sides (regions overlapping or sharing an edge) is dropped; every token casts against the walls plus the fogged area's outer edge. A token outside fog sees exactly what it did. A token in fog (`inFogRegion`, the same 1 px test concealment uses) now sees only the fogged area around it, where it was previously exempt from its own region's edges and saw out. A token on the edge, or within 1 px outside it, casts from up to 1 px inside the fog so its rays cannot escape. It steps only across fog edges, never through a wall: if the step would touch a wall, it casts from its centre. Fog pieces are judged inner by sampling 1e-3 px either side, so fog regions a fraction of a pixel apart, or thin fog, still block.
- **Cost.** The split and fog classification are cached per `walls` and `fog` object (both are replaced whenever they change), so all tokens and viewers share one. About 31 ms at 1,500 walls plus 100 fog regions of 64 points; about 1 ms for three tokens on The Broken Span once cached.
