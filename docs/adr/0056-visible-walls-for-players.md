# ADR 0056 — Visible walls for players

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0029-walls-and-wall-detection.md` (plain walls are GM-only) · **Extends:** `docs/adr/0055-path-movement.md` (`visibleStretches`), `docs/adr/0030-portals.md`, `docs/adr/0044-line-of-sight.md`
**Change:** `openspec/changes/visible-walls-for-players` · **Requirements:** FR-GM-23, FR-TAC-02

## Context

ADR 0029 made plain walls GM-only: walls under fog would outline rooms players haven't explored. Path movement (ADR 0055) computes a drag's cheapest path on the mover's client from the walls that client holds, so a player's paths ignore every plain wall and the server refuses the straight move through one. The walls a player can already see on the map image, or within their sight, are no secret.

## Decision

**1. Players receive the visible pieces of plain walls.** `wallPiecesForViewer(state, viewer, c)` (`visibility.ts`) runs `visibleStretches([a, b], c)` for every plain wall that blocks movement and keeps every stretch not listed in its gaps. Visible means outside every fog region and, with line of sight on, inside the player's sight polygons (the 1 px `inSight` tolerance keeps the faces on a sight edge). A partly visible wall arrives as its visible pieces only; the unseen parts never leave the server. Walls that don't block movement (an open imported portal) are not sent. Doors and windows are sent whole when any part of them is visible (Decision 6). `filterStateForViewer` builds a player's `walls` from the portal projection plus these pieces. The GM's state is unchanged.

**2. Piece ids are opaque and per snapshot.** Each piece is `{ id: "seen:n", a, b }`, numbered in geometric order (sorted by `a.x, a.y, b.x, b.y`), so snapshots of an unchanged room agree and re-creating a wall out of view does not reorder them. No id names its source wall or links two pieces of one wall, so the number of hidden breaks in a wall is not revealed. Pieces carry no `portal`, `uvttPortal` or `source` (ADR 0041), and count as blocking in `blocksMovement` as they stand.

**3. Wall events resync when they touch what a player can see.** `wallSeen(c, wall, viewer)` is true for a plain blocking wall or a portal with at least one visible stretch, under `before`'s concealment. A seen change resyncs only when the player's projected walls differ before and after the event; otherwise it is redacted.

| Event | Player receives |
|---|---|
| `WallsAdded` / `WallsRemoved` | resync if any listed wall is seen and the player's walls change, otherwise redacted |
| `WallUpdated` | resync if `previous` or `wall` is seen and the player's walls change, otherwise redacted |
| `PortalChanged` | the live event if the portal is visible before and after; otherwise resync if the wall is seen (as a portal or a plain wall) on either side, otherwise redacted |

With line of sight on, every wall event already resyncs (ADR 0044).

**4. Pieces only ever arrive in snapshots.** Every event that can change which pieces a player holds resyncs them: fog changes, sight changes, the wall events above, scene and map changes, checkpoint restores and encounter applies. A player's local reduce of a redacted wall step leaves their pieces as the snapshot made them, which is still right because the change was invisible to them. Replays use the same filters.

**5. Players' boards never draw plain walls.** `BoardView` draws plain walls only when the viewer is the GM; pieces are used only for path search and movement previews. The GM previewing as a player is shown as that player, with no walls drawn.

**6. Portals are sent whole when any part is visible.** Amends ADR 0030: `portalConcealedFrom` uses the same clipping as plain walls, so a door or window is concealed only when all of it is under fog or out of sight. A partly visible portal is sent whole with its real id, and the player may operate it (`portal.setState` uses the same rule).

**7. Event side channels are accepted.** Events reach players one at a time, with a snapshot per resync. A command that re-splits a partly visible wall (moving or retyping a door under fog on its line, `wall.update`) shows the player that wall's pieces vanish and return, and so reveals that the GM edited it. This is accepted: players never receive unseen wall geometry, only the fact of an edit.

## Consequences

- The accepted disclosure: the segments of walls a player can already see on the map image or within their sight; the whole of any door or window with a visible part, including its hidden part; and the fact (not the geometry) of GM wall edits that touch walls they can partly see (Decision 7).
- A piece of plain wall ends at a fog or sight edge, or at a portal. Since a portal with any visible part is sent, a piece ending in open ground next to a withheld door no longer happens.
- AI seats (`apps/mcp`, ADR 0052) receive the same pieces through the same filter.
- More resyncs when the GM edits walls in a player's view; wall edits are preparation work, rare in play.
- Clipping costs under 0.3 ms per snapshot on typical shipped maps and about 5 ms on Broken Span (627 walls, four sight origins). No edge index unless `npm run test:bench` shows one is needed.
- Older clients would draw pieces as wall lines; the web client ships with the server.
- No schema change and no data migration: pieces are ordinary `Wall` values.
