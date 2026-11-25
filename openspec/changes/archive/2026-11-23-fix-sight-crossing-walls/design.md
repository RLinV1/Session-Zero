# Design

## Context

See `proposal.md` (Why) for the bug, and `specs/line-of-sight/spec.md` for the required behaviour.

How sight works today (`packages/shared/src/sight.ts`, ADR 0044):

- `viewerSight` collects the blocking segments: walls where `blocksSight` is true, plus every fog region's edges. For each unhidden token the viewer owns, it drops the edges of fog regions the token stands in, then calls `sightPolygon`. That exemption is why a token in fog sees out of it.
- Players' boards draw the fog mist (`fogLayer`) under the darkness (`sightLayer`, `boardView.ts:668`), so wherever a player has sight, fog shows as mist. No change is needed on the board for a token in fog to show the mist around it.
- `sightPolygon` casts three rays at each segment endpoint and each map corner: one straight at it and one ±1e-4 rad either side. It skips targets hidden behind a nearer wall, then `dropCollinear` removes vertices that would point at hidden endpoints. The method is correct only if segments meet at endpoints. A crossing in the middle of a segment is a corner of the visible area that never gets a ray.
- The server caches each viewer's `Concealment` (`liveRoom.ts`) and rebuilds it when the player resyncs. Every room surface gets sight through `viewerSight`: the server filter, the GM's view-as-player (`gmSightView.ts`), the map editor's Sight step (`SightSetup.tsx`), and through the server filter, the AI seat's map image.
- Limits: `MAX_WALLS = 1500`, and fog can add up to 100 regions × 64 points = 6,400 edges. So the split must handle about 7,900 segments.
- The reducer replaces `state.walls` with a new object whenever a wall is added, removed or edited, or a portal changes state, and `state.fog` whenever fog changes. Otherwise both keep the same object.

Measured in exploration on this machine: one `sightPolygon` takes 0.9 ms on 627 walls and 1.4 ms on about 1,500. A naive all-pairs crossing check takes 1.2 ms and 5.8 ms on the same sets, and would take about 150 ms at the 7,900-segment worst case.

## Goals / Non-Goals

**Goals:**
- Before ray-casting, turn the blocking segments into pieces that meet only at their ends, so `sightPolygon`'s assumption holds.
- Make the split robust to overlapping, duplicate, near-collinear and zero-length input without adding hairline gaps or slivers.
- Keep sight pure and deterministic (invariant 2), with the same result on server and client.
- Keep the anti-leak property: no ray at a hidden crossing.
- Keep the split off the per-event path unless walls or fog change.
- Give a token in fog sight of only the fogged area around it, using the same blocking set as every other token.

**Non-Goals:**
- Changing `sightPolygon`'s ray-casting, epsilons or the `inSight` tolerance.
- Changing wall data or history. Stored walls stay exactly as drawn.
- A general robust-geometry library or exact arithmetic.

## Decisions

### 1. Split in `viewerSight`, not inside `sightPolygon` or at write time

A new exported pure function, `splitSegments`, in `sight.ts` (or a sibling `sightSegments.ts`) splits the blocking segments. `viewerSight` calls it once and passes the pieces to `sightPolygon` for each token.

- *Inside `sightPolygon`:* the split would run once per token per viewer, and would also cost the home page demo and every other direct caller. Rejected for cost. `sightPolygon`'s JSDoc will instead state its precondition: segments meet only at endpoints.
- *At write time (`decide` splits walls into new events):* this would rewrite what the GM drew, add events and history for a rendering concern, and leave existing rooms, imports and checkpoints unfixed. Rejected.

### 2. Fog edges are split with the walls, and only the fogged area's outer edge blocks

Each input segment carries a source: `wall`, or `fog`. After the split (Decision 3), each fog piece is classified once. Take its midpoint and step 1e-3 px to each side, along the piece's normal. (Originally 0.5 px. The visibility audit showed that this misjudges fog regions less than 0.5 px apart, or less than 0.5 px wide, and opens a channel into the fog.) If both points are strictly inside some fog region (`pointInPolygon`, without the 1 px band), the piece is **inner**: it lies inside the fogged area, where regions overlap or share an edge. Inner pieces are dropped. A fog piece with fog on neither side is kept, because a fog edge that wrongly blocks only hides more. The remaining fog pieces form the **outer edge** of the fog.

Every token then casts against the same set: blocking walls plus the fog's outer edge. There is no per-token filtering.

- **Token outside fog:** same result as today. The inner pieces it no longer sees all lie behind the outer edge, so they never bounded its view. ADR 0044's "no vertex strictly inside fog the token isn't in" still holds.
- **Token in fog:** the outer edge now blocks its view from inside. Its sight is the part of the fogged area it can reach through walls (spec: "A token in fog sees only the fog around it"). Overlapping strokes and adjacent regions don't leave seams, because their shared and overlapping edges are inner.
- **Cuts left on walls:** a wall cut where it crossed an inner fog piece keeps an interior point on a straight wall. That's harmless. The three rays there hit the same wall, and `dropCollinear` removes the collinear vertices.

This replaces ADR 0044's exemption, where a token ignored the edges of a region containing it. That exemption is what let a token in fog see out.

*Alternatives:*
- **Keep per-token region filtering, plus a second pass that clips each fogged token's sight to its region.** This needs polygon clipping in `packages/shared`, a new dependency. It also gives the wrong answer for overlapping strokes: the token would see only its own stroke. Rejected.
- **Split per token.** Exact, but it can't be cached across tokens or viewers. Rejected.

### 7. A token on the fog's edge casts from just inside the fog

A token counts as in fog when `inFogRegion` is true: inside a region or within 1 px of its edge, the same test concealment uses. If its centre is on an outer-edge piece, or up to 1 px outside one, rays from there would escape. `sightPolygon` deliberately ignores a wall passing through the origin (t ≈ 0).

So `viewerSight` moves such a token's ray origin to the nearest point on the outer edge, stepped 1 px along that piece's normal toward the side that is in fog, or along the normals' sum at a corner. Only fog edges are stepped across, never a wall lying on a fog edge. The step halves, down to 1e-3 px, until the new origin is strictly inside the fog, which handles fog thinner than 1 px. If the step would touch a wall, the token casts from its centre instead; the wall then stops its sight on that side. (Both rules come from the visibility audit. Without them, a token 0.5 px outside a wall lying on a fog edge stepped through the wall and saw the hidden walls in the fogged room.) Tokens strictly inside fog by more than 1 px, and tokens outside fog, cast from their centre unchanged. This is deterministic and uses only the cached pieces. The origin moves by at most 2 px, which can't be seen at any zoom.

*Alternative:* treat edge tokens as outside fog for sight only. Rejected, because the token would then be hidden from other players yet see out, which the spec's "On the fog's edge" scenario rules out.

### 3. Numerical rules (all in board pixels)

`EPS = 1e-6` px is the distance tolerance, applied in this order:

1. **Clean the input.** Drop zero-length segments (length ≤ EPS).
2. **Find candidate pairs by bounding box.** Sort segments by min x and sweep, testing only pairs whose boxes, grown by EPS, overlap in x and y. This is near-linear for real maps, where walls are short and local. The worst case is still all pairs, but it only runs when walls or fog change (Decision 4).
3. **Classify each pair** by the sine of the angle between them: `|r × s| ≤ 1e-9·|r|·|s|`.
   - **Not parallel:** compute the crossing point X once. If X lies within both segments (parameters in [0, 1] widened by EPS/length), record X as a cut on both segments. The same `Point` value is used for both, so the pieces meet exactly.
   - **Parallel and on the same line** (each segment's endpoints are within EPS of the other's line): cut each segment at the other's endpoints that lie strictly inside it. Use those endpoints' own coordinates, not a value projected onto the line, so overlapping walls produce pieces with identical ends.
   - **Parallel, separate lines:** no cut. Walls 0.01 px apart stay two walls. Anything crossing them is still cut at each wall by the non-parallel rule.
4. **Endpoint touches** (T-junctions): an endpoint of one segment lying within EPS of the interior of another cuts the other at that endpoint's exact coordinates. Rule 3 already covers this when the parameters land at 0 or 1. It is listed separately so tests cover it.
5. **Build pieces.** Sort each segment's cuts along it, merge cuts within EPS of each other (keep the first one recorded, so a shared point stays shared), and emit the consecutive pieces. Drop pieces of length ≤ EPS.
6. **Dedupe.** Two pieces are the same if their end coordinates match exactly in either direction. Keep one piece, with source `wall` if any duplicate came from a wall. A wall lying on a fog edge must keep blocking even if that fog piece turns out to be inner.

Why exact coordinate matches: every shared point is copied, never recomputed (rules 3 to 5), so exact equality is reliable. A rounded-key dedupe would merge pieces that should stay separate, such as near-collinear walls.

### 4. Cache by the `walls` and `fog` objects

A module-level `WeakMap<walls, WeakMap<fog, Piece[]>>`, holding the final blocking set: wall pieces plus the fog's outer edge. The walls are filtered by `blocksSight` inside the cached computation, so a portal change, which creates a new `walls` object, misses the cache as it should. A hit returns a frozen array.

This is caching of a pure function's result. It adds no inputs, so it doesn't affect determinism. Callers that build fresh objects each time, such as `SightSetup`'s derived state, still get correct results, just without caching.

*Alternative:* cache per viewer, inside `Concealment`. That would re-split for each viewer after every resync. Rejected.

### 5. Anti-leak is unchanged

Crossing points join the ray targets in exactly the same way as endpoints: through `cast`'s hidden-target check. ADR 0044's guarantee (no vertex bearing toward hidden geometry) therefore extends to crossings without new code. A test covers it: two walls crossing behind a wall give a byte-identical polygon to the same walls without the crossing.

### 6. ADR

ADR 0044 gets a dated amendment under Sight with two points. First: "Blocking segments are split at their crossings and overlaps before rays are cast; crossings are ray targets with the same hidden-target rule." Second: "Only the outer edge of the fogged area blocks sight, for every token. A token in fog (`inFogRegion`) therefore sees only the fogged area around it, casting from 1 px inside the fog when it stands on the edge. This replaces the exemption for a fog region containing the token." The `inFogRegion` JSDoc, which mentions "the sight exemption", is updated to match. There are no schema, command or event changes, so a new ADR isn't needed. The amendment still goes to the Real-Time Architecture owner for review, because the fog rule changes what players can see.

### 8. Clip the blockers to the map (added during implementation)

The randomized test (task 3.3) found a case of the same bug at the map's edge. A wall that runs off the map crosses the map rectangle part-way along its length, and `sightPolygon` bounds every ray at that rectangle. So the crossing is a corner of the visible area with no ray, and the outline cuts a chord near the map border. `viewerSight` clips the prepared pieces to the map (Liang–Barsky, `clipSegmentsToMap`) before casting, which makes each such crossing an end.

This runs on every call, not inside the cache, because the map size isn't part of the cache key. It's a single linear pass. *Alternative:* add the four map edges to the split as walls. Rejected, because the cache would then also need keying on the map size.

## Risks / Trade-offs

- **[Risk] A shipped map whose walls already cross changes appearance** (more is lit, correctly). → Mitigation: a regression test over every shipped map. Where a map's walls don't cross, polygons must be the same within tolerance. Where they do, the differences are listed and checked once by hand.
- **[Risk] Worst-case split time with large fog sets and many walls,** about 7,900 segments. → Mitigation: the bounding-box sweep plus the cache. A benchmark test at the caps checks the split is under 50 ms. If it isn't, a uniform grid replaces the sweep. Either way it runs only when walls or fog change.
- **[Risk] Floating-point edge cases:** a crossing landing a hair outside a segment, or nearly parallel lines with a far-away crossing. → Mitigation: parameters widened by EPS/length, the parallel test uses the sine of the angle, cuts are merged within EPS, and a randomized property test compares `inSight` against a brute-force check. The brute-force check counts a point as visible when the straight line from the token to it crosses no blocking segment. Points within 1 px of a blocking segment are skipped.
- **[Trade-off] Rays at cuts that are no longer real corners,** where a wall crossed an inner fog piece (Decision 2). → These cost three extra rays each, and `dropCollinear` removes their vertices.
- **[Risk] Players notice the fog behaviour change.** A token that used to see out of fog now sees only fog. → This is the requested behaviour. Mention it in the PR description and the next release notes. It applies only with line of sight on.
- **[Risk] A fog region narrower than 1 px,** or the 0.5 px offset test misjudging an inner piece in a sliver. → Such slivers can't be seen. If a piece is misjudged, the error is only a seam or a gap 1 px wide inside fog, where content stays hidden by the fog rules anyway.
- **[Trade-off] A token in fog sees no doors and no other content in the fog around it.** → The fog rules hide them, and that is unchanged (proposal non-goals).
- **[Trade-off] A module-level cache in a "no I/O" package.** → A `WeakMap` holds no global state that can be seen. Entries go away with the state objects, and results are identical with or without it.

## Migration Plan

No data migration. Deployed with the server and web together. Server and client then compute the same sight again, and they share the `packages/shared` build, so they can't diverge. Rollback is reverting the commit. Stored data is unaffected.
