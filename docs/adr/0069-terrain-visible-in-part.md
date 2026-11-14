# ADR 0069: Terrain sent for squares a player can partly see

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Amends:** `docs/adr/0046-terrain-tactical-movement.md` (which terrain squares reach a player) · **Extends:** `docs/adr/0059-areas-clipped-at-fog.md` (sampled "any part visible")
**Change:** `openspec/changes/terrain-area-outlines` · **Requirements:** FR-GM-17

## Context

ADR 0046 sends a player a terrain square only when "a cell must be fully visible and unfogged", and withholds any square within 1 px of a fog edge. It names the cost itself: "Conservative cell visibility can hide partly visible terrain." In play, a square the player can see most of shows as plain ground right up to the fog. A square that only touches fog along an edge is also withheld. With area outlines (same change), these missing squares also leave gaps in an area's outline next to the fog.

ADR 0059 kept terrain on the old rule ("Tokens, terrain and everything else keep ADR 0016's rule").

## Decision

**Terrain is sent for any square the player can see part of.** `terrainForViewer` keeps a square when any part of it, on the map, lies outside every fog region and, with line of sight on, inside the player's sight. This replaces ADR 0046's "a cell must be fully visible and unfogged" for the terrain projection, and ADR 0059's "terrain keeps ADR 0016's rule".

**Sampled, as ADR 0059 samples areas.** `terrainSeen` tests a 4 × 4 lattice of points at the centres of a square's quarters (the part on the map). It uses the same fog-region test as tokens and areas (which counts a point within 1 px of a fog edge as fogged) and the sight test without its 1 px edge allowance. A visible sliver narrower than a quarter of a square can be missed; the player then simply isn't sent that square. The lattice is deterministic and pure (no I/O), so `decide`/`reduce` determinism is unaffected.

**Movement knowledge stays strict.** `movementRouteKnown` keeps `terrainKnowledge`, the whole-square rule. ADR 0046 needs a player's whole route to be in known coverage before the server consults private wall geometry. Loosening it would let a red route hint at a wall in the fogged part of a square. Route feedback for partly visible squares therefore stays "unknown" as today.

**Client and server agree.** The web board uses `terrainSeen` on the player's received fog and sight to decide which area-outline sides face squares they can't see, the same test the server used to filter.

## Consequences

- **Accepted trade-off:** a square partly under fog is sent with its kind. A player learns whether the fogged part of that one square is Difficult or Blocked. That's the point of the change, and it reaches no further than the edge of the square.
- A temporary-layer marker on a partly fogged square is sent too, so the player also learns that a temporary effect covers that square (coloured by the effective kind, as ADR 0046 already does for visible squares). This also stays within the one square.
- Sight is tested strictly (no 1 px edge allowance), so on very small grids a square entirely behind a wall or past the sight range isn't counted as seen.
- Players see terrain that sits partly under fog drawn beneath the fog mask. The mask still covers the fogged part.
- No schema, command or event changes. The existing resync, which fires when a player's terrain projection changes, covers fog and sight changes. Old logs replay unchanged; only what each player is sent changes, from their next snapshot.
- The filter does up to 16 point tests per terrain square per player (bounded by the 10,000-square cap), with a bounding-box early exit per fog region.

## Alternatives considered

- **Exact intersection** (cell minus the union of fog, intersected with sight, has positive area). Needs a boolean-polygon library in shared code. Rejected for cost, as in ADR 0059.
- **Loosen movement knowledge too.** Rejected: it could reveal hidden walls through route feedback (see above).
