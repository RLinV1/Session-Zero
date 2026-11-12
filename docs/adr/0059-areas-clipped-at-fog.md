# ADR 0059 — Areas visible in part, clipped at fog and sight

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0016-manual-fog.md` (which areas reach a player) · **Extends:** `docs/adr/0044-line-of-sight.md`, `docs/adr/0058-edit-placed-area-templates.md`
**Change:** `openspec/changes/clip-areas-at-fog` · **Requirements:** FR-GM-17, FR-TAC-06

## Context

ADR 0016 decides whether a player receives someone else's area from one point, its origin. That gets both directions wrong:
- A cone from lit ground into fog is sent and drawn whole, over the fog. Areas sit above the fog and sight layers, so the board shows the shape of unexplored ground.
- A cone from inside fog into lit ground isn't sent at all, though it covers squares the player can see.

## Decision

**Sent when any part is visible.** `templateConcealedFrom` keeps its shape:
- the GM sees everything
- GM-only areas are hidden from players
- a player always sees their own areas

For anyone else's area, the test changes from "origin under fog or out of sight" to "no part outside every fog region and inside sight". Every caller follows without changes of its own: snapshots, `TemplatePlaced` / `TemplateRemoved` / `TemplateChanged` filtering, `decide`'s `not_found`, and the aim and edit preview relay. Fog and sight changes already resync players, so areas appear and disappear with them.

**"Any part" is sampled, not intersected exactly.** `areaVisibleTo` tests:
- the outline's vertices, or 16 points around a circle's rim
- the origin
- a half-cell lattice inside the outline

It stops at the first visible point. A visible sliver narrower than half a cell can be missed; that player then simply doesn't receive the area. An exact intersection would need a boolean-polygon library for little gain.

**One outline.** `areaShape` / `templateArea` move from the web board to `packages/shared` (`areas.ts`), so the server tests the shape the board draws. `Concealment` gains the room's `grid` to build it.

**Clipped on the board.** For a viewer who may not edit an area (not its owner, not the GM), the board draws it through a mask of what that viewer can see: sight, or the whole board, minus fog. The same goes for other participants' aim and edit previews.

## Consequences

- **Accepted trade-off: a partly visible area is sent whole.** Its full geometry, including an origin under fog, reaches the player's client. It is never drawn there, but it can be read with developer tools. A GM's cone from a fogged monster therefore reveals where it starts to a determined player. We accept this for areas only. Tokens, terrain and everything else keep ADR 0016's rule.
- No schema changes shape and no event changes. Old logs replay unchanged; only what each player is sent changes, from their next snapshot.
- The filter does more work: up to a few thousand point tests for the largest common area, per area, per player, per snapshot. It exits early, and the 200-area cap bounds it.

## Alternatives considered

- **Clip on the server** and send only the visible pieces as polygons. Nothing hidden would leak, but this needs polygon clipping in shared code, a new per-viewer form of an area in state and events, and re-clipping on every fog, sight or area change. Rejected for cost.
- **Mask on the client only**, keeping the origin rule. Nothing new would be sent, but an area aimed out of fog would stay invisible to players. Rejected by the table: they want to see it.
