# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **Players get portals only.** `filterStateForViewer` (`visibility.ts`) builds a player's `walls` from walls that pass `portalConcealedFrom`. That function returns concealed for any plain wall, and for a portal whose midpoint is in fog or out of sight. Each kept wall is projected to `{ id, a, b, portal }`, dropping `uvttPortal` and `source` (ADR 0041).
- **Wall events are mostly redacted for players.** `WallsAdded`/`WallsRemoved` resync a player only if a visible portal is involved, and are redacted otherwise. `WallUpdated` resyncs if the portal was or becomes visible. `PortalChanged` is delivered live when the portal is visible before and after, and otherwise resyncs or is redacted. With line of sight on, every wall event resyncs players already (the sight block).
- **Fog and sight changes already resync players.** `FogAdded`/`FogRemoved` and every sight-changing event resync, so the walls in a snapshot follow automatically.
- **Path movement's leaks are already solved.** `visibleStretches(path, concealment)` (`visibility.ts`, from `path-movement`) cuts a polyline at fog and sight edges and returns the visible points and the hidden gaps, the same clipping this change needs.
- **The cost is measured.** Clipping every wall to a player's sight on the shipped maps took under 0.3 ms per snapshot on typical maps and about 5 ms on Broken Span (627 walls, four sight origins).
- **The board draws whatever plain walls the state holds.** `BoardView.syncWalls` draws every wall without `portal`, regardless of role. Players are only safe today because they receive none. The walls filter in the Show menu is GM-only.
- **Paths use state walls.** The player's path search (`dragPlan` → `cheapestPath`) and their straight-drag preview (`movementPreview`) already read `Object.values(state.walls).filter(blocksMovement)`. A projected piece has no `portal` and no `uvttPortal`, so it counts as blocking with no change there.

## Goals / Non-Goals

**Goals:**
- One clipping function, shared with path movement, decides every wall piece a player receives.
- Pieces carry nothing that links them to the hidden rest of a wall.
- No change to what the GM receives or draws.

**Non-Goals:**
- Drawing walls for players.
- Remembering explored areas: walls leave a player's state when they leave their sight.
- Hiding every hint of wall edits from players: event-level side channels are accepted (Decision 7).
- An edge index for clipping, unless the benchmark calls for one.

## Decisions

**1. `wallPiecesForViewer(state, viewer, c)` in `visibility.ts`.**
For each wall that is not a portal and `blocksMovement`, run `visibleStretches([a, b], c)` and keep every stretch not listed in its gaps. Each kept stretch becomes `{ id, a, b }`. The GM's state is returned unchanged, as today. `filterStateForViewer` builds `walls` from the existing portal projection plus these pieces.
*Alternative:* the whole wall if any part is visible. Rejected in exploration: it sends the unseen part.

**2. Piece ids are opaque and per snapshot.**
Pieces get ids `seen:0`, `seen:1`, … in geometric order (sorted by `a.x, a.y, b.x, b.y`), not storage order, so snapshots of an unchanged room agree and re-creating a wall out of view doesn't reorder them. The ids name no source wall and don't reveal that two pieces belong to the same wall. Pieces only ever arrive in snapshots (Decision 4), so nothing needs to address them across events. Real ids stay on portals.
*Alternative:* `${wallId}:${n}`. Rejected: it links pieces across a hidden gap and reveals how many hidden breaks a wall has.

**3. Wall events resync when they touch what a player can see.**
A helper `wallSeen(c, wall, viewer)` is true when a plain blocking wall or a portal has at least one visible stretch. A seen change resyncs only if the player's projected walls differ before and after the event; otherwise it is redacted. The arms change as follows:

| Event | Player receives |
|---|---|
| `WallsAdded` / `WallsRemoved` | resync if any listed wall is seen (`before`'s concealment), otherwise redacted |
| `WallUpdated` | resync if `previous` or `wall` is seen, otherwise redacted |
| `PortalChanged` | live event if the portal is visible before and after (unchanged). Otherwise resync if the wall is seen as a portal or as a plain wall on either side, otherwise redacted |

A resync carries the freshly clipped pieces. Line of sight on still resyncs every wall event through the existing sight block.

**4. Snapshots only, so pieces never go stale.**
Every event that can change which pieces a player holds already resyncs them: fog changes, sight changes, the wall events above, scene and map changes, checkpoint restores and encounter applies. So pieces never need patching. A player's local reduce of a redacted wall step leaves their pieces as the snapshot made them, which is still correct because the change was invisible to them.

**5. Only the GM's board draws plain walls.**
`BoardView.syncWalls` draws plain walls only when the shown viewer is the GM. The GM previewing as a player is shown as that player, so nothing is drawn there either. Doors and windows keep drawing for everyone (`portalGraphics`).

**5b. Doors and windows are sent whole when any part is visible.** `portalConcealedFrom` uses the same clipping as plain walls: a portal is concealed only when no stretch of it is visible. The whole portal is sent, with its real id, so the hidden part of a partly visible door is disclosed. This replaces the ADR 0030 midpoint rule, and `decide` uses the same rule for `portal.setState`.

**7. Event side channels are accepted.** Events are broadcast one at a time with a snapshot per resync, so a command that re-splits a partly visible wall (e.g. moving a door under fog on its line) shows the player that wall's pieces vanish and return. Players may learn that the GM edited walls they can partly see; they never receive unseen geometry.

**6. A new ADR, 0056 "Visible walls for players"** ([`docs/adr/0056-visible-walls-for-players.md`](../../../docs/adr/0056-visible-walls-for-players.md)), amending ADR 0029. It records Decisions 1–4, the accepted disclosure (walls players can already see on the map image or within their sight), and that AI seats (`apps/mcp`) now receive those pieces too through the same filter.

## Risks / Trade-offs

- [Clipping cost on large maps] → Measured at about 5 ms per player snapshot on the busiest shipped map. Rerun `npm run test:bench`; add an edge index only if latency budgets slip.
- [More resyncs when walls change in view] → Wall edits are GM preparation work, rare during play. Line of sight already resyncs every wall event.
- [Sight polygon edges run along walls] → A wall the player looks at lies on their sight boundary. Midpoints on the boundary count as in sight (the existing 1 px tolerance in `inSight`), so the faces they see arrive.
- [A detail of hidden geometry slips through a piece's shape] → A piece ends exactly at the fog or sight edge, which the player already holds. The visibility auditor reviews the diff.

## Migration Plan

No data migration is needed. Older clients would draw the pieces as wall lines, because they don't know to skip them. Players should refresh after deploy, and the web client ships with the server.
