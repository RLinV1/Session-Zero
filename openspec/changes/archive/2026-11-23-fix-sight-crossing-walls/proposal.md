# Proposal

## Why

With line of sight on (FR-GM-19), a player standing straight in front of a closed door can see a slanted wedge of darkness over part of the doorway and the door. Sometimes the whole doorway is dark. This happens when a hand-drawn door runs a few pixels past the corridor walls it sits between. `sightPolygon` aims rays only at segment endpoints, and it skips any endpoint hidden behind a nearer wall (ADR 0044). The point where the door crosses the wall is a real corner of the visible area, but it is not an endpoint, so no ray goes there. The outline then cuts a straight chord across floor the token can see. The server builds concealment from the same outline, so tokens and areas inside the wedge are also withheld from the player, not just drawn dark.

Reproduced with the real `sightPolygon`. A recessed door 70 px long that overshoots the corridor's bottom wall by 6 px leaves part of the doorway and the door's lower end dark from a token straight in front of it. If the door overshoots both walls, the whole doorway is dark. If the door ends exactly on both walls, it is fully lit. Any two blocking segments that cross away from their endpoints break the outline the same way: wall and wall, wall and fog edge, or two walls a hair apart.

Separately, a token standing in fog currently sees straight out of it. `viewerSight` ignores the edges of any fog region containing the token (ADR 0044), so a token hidden in fog sees the open room around it. A token in fog should see the fog it stands in, drawn as the fog overlay, and nothing outside it.

## What Changes

- Before casting rays, sight splits every blocking segment where it crosses another: plain walls, closed and locked doors, and fog-region edges. Each crossing becomes an endpoint, and gets rays like any other endpoint.
- Walls lying on top of each other still give correct sight. This covers exact and reversed duplicates, walls partly overlapping on the same line, a door drawn over a plain wall, near-collinear walls, and zero-length segments. They resolve to a single set of non-crossing pieces with no slivers and no hairline gaps.
- The anti-leak rule is unchanged: a crossing hidden behind a nearer wall gets no ray, just like a hidden endpoint.
- **Behaviour change:** with line of sight on, a token whose centre is in fog sees only the fogged area around it. That area is the union of overlapping or adjacent fog regions, bounded by walls and the fog's outer edge. On the player's board, the area shows the fog overlay and everything outside it is dark. Its contents stay hidden by the existing fog rules, so the player sees mist and their own token. This replaces the ADR 0044 rule that a token in fog ignores that region's edges.
- Fog edges where regions overlap or touch no longer block sight. Only the fogged area's outer edge does. For a token outside fog this changes nothing, because the inner edges lie behind the outer edge.
- The split is computed once per set of walls and fog, not once per token, and is shared by every viewer of that set.
- Every room's sight comes from `viewerSight`, so the fix covers player boards, server filtering, the GM's view-as-player, the map editor's Sight step and the AI seat's map image. No schema, command or event changes.

Non-goals:
- Snapping door ends onto walls in the Doors tool or line editor. That would only prevent new overshoots; it can be proposed separately.
- An open door drawn over a plain wall still being blocked by that wall. This is an authoring problem, not geometry.
- The diagonal shadow a wall corner casts onto a recessed door from an oblique position. That is geometrically correct sight. Whether to reveal such doors anyway is a separate visibility decision.
- The home page sight demo, which calls `sightPolygon` directly on fixed walls that don't cross.
- Doors and other content inside the fog around a token in fog. Fog still hides them (`fog-of-war`, `portals`), unchanged.
- Rooms with line of sight off. A token in fog there still sees the whole map, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `line-of-sight`: adds a requirement that sight follows walls as drawn. Walls, doors and fog edges that cross, touch mid-segment or lie on top of each other block exactly the area their union covers, with no false shadows and no gaps. Also adds a requirement that a token in fog sees only the fogged area around it.

## Impact

- `packages/shared/src/sight.ts`: a new pure function that splits segments at their crossings, used by `viewerSight` before `sightPolygon`, plus a cache keyed on the `walls` and `fog` objects. Determinism and purity are unchanged (invariant 2).
- `packages/shared/test`: new unit tests covering the doorway case from the reported screenshot, every overlap case, fog-edge crossings, and that a hidden crossing leaks no bearing.
- `docs/adr/0044-*.md`: an amendment explaining that crossings get rays, and replacing the rule that a token in fog ignores that region's edges. No schema changes, so no new ADR is needed. The Real-Time Architecture owner should still review it, because ADR 0044 is theirs and the fog rule changes what players can see.
- `packages/shared/test/sight.test.ts`: the existing test "lets a token inside a fog region see out of it" is replaced by its opposite.
- Performance: an all-pairs split takes about 1.2 ms for 627 walls and about 5.8 ms at the 1,500-wall cap. One sight polygon takes about 1 to 1.4 ms. Caching keeps the split off the per-event path unless walls or fog change.
- No client code, protocol or persisted data changes.
