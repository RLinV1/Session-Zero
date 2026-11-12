# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **What reaches a player.** `filterStateForViewer` sends a player `fog` (every region, as polygons), `sight` (their sight polygons, when line of sight is on), and every template not concealed by `templateConcealedFrom` (`packages/shared/src/visibility.ts:58`). Today that function tests one point:
  ```
  gm -> visible;  gmOnly -> hidden;  own -> visible;
  else hidden if isInFog(fog, origin) || outOfSight(origin)
  ```
  Its callers:
  - `filterStateForViewer` (snapshots)
  - `filterEventForViewer` (`TemplatePlaced` / `TemplateRemoved`, and `TemplateChanged` once `edit-placed-area-templates` lands)
  - `decide`'s `template.remove` (answering `notFound`)
  - the `LiveRoom` aim preview relay (`liveRoom.ts:497`)

  `Concealment` is `{ fog, sight }`. It has no grid, so it can't build an area's outline.
- **Area outline.** `areaShape` / `templateArea` live in `apps/web/src/board/tools.ts` and return a circle `{ center, radius }` or a polygon. They are pure and depend only on `GridSpec`, which is already in `packages/shared/src/geometry.ts`.
- **Fog and sight changes already resync.** `FogAdded` / `FogRemoved` resync players ("Fog can hide or reveal any number of tokens and templates; a snapshot does both"). With line of sight on, anything that moves a sight polygon resyncs too (ADR 0044). So as long as the snapshot filter uses the new rule, areas appear and disappear correctly when fog or sight change.
- **Layer order.** `world` holds, bottom to top: `mapSprite`, `grid`, `terrainGraphics`, `fogLayer`, `wallGraphics`, `portalGraphics`, `tokenLayer`, `sightLayer`, `markLayer`, `fxLayer` (`boardView.ts:576`).
  - Placed templates, pending placements and the viewer's own marks are drawn into one `marksGraphics` in `markLayer` by `redrawMarks`.
  - Other participants' aim previews are per-sender containers in `fxLayer` (`showAimPreview`).
- **View as player.** `RoomPage` passes the viewed player as `you`, and `filterStateForViewer(state, viewed)` as state. The board needs no special case.

## Goals / Non-Goals

**Goals:**
- One visibility rule for areas, used by every filter and the relay, so they can't disagree (the ADR 0016 principle).
- One area outline definition, shared by the server's test and the board's drawing.
- The client draws exactly the visible part of what it receives.
- No cost in the GM's normal view.

**Non-Goals:**
- Withholding the geometry of a partly visible area. The whole area is sent, by decision (proposal "Accepted trade-off").
- Clipping tokens, drawings, rulers or the viewer's own marks.
- An exact polygon-intersection visibility test (Decision 2).

## Decisions

**1. Move the outline into `packages/shared`.**
`areaShape`, `templateArea` and the `AreaGeometry` type move to `packages/shared/src/areas.ts`, exported from the package. `apps/web/src/board/tools.ts` re-exports them so existing imports keep working. The functions are pure and deterministic.
*Alternative:* duplicate the outline on the server. Rejected: two definitions would drift, and an area could then be sent or withheld on a shape the board doesn't draw.

**2. "Any part visible" by sampling the area.**
A new `areaVisibleTo(c, outline, grid)` in `visibility.ts` returns true when some sample point of the area is on the map, outside every fog region and inside sight (or sight is null). Off-map samples never count, so fogging a map to its edges hides areas that poke past them; `Concealment` carries the map's size for this. The samples are:
- the outline's vertices, or 16 points around a circle's rim
- the origin
- a lattice at half-cell spacing over the outline's bounding box, kept where the point is inside the outline

`templateConcealedFrom` becomes:
```
gm -> visible;  gmOnly -> hidden;  own -> visible;
else hidden unless areaVisibleTo(c, templateArea(t, c.grid), c.grid)
```
`Concealment` gains `grid` (filled by `concealmentFor` from `state.scene.grid`), so callers don't change their arguments. Cost:
- The largest common area, a 60 ft (12-cell) radius circle, has about 1,800 lattice points.
- Each point is tested against at most 100 fog regions, and the loop exits at the first visible point.
- It runs once per area per player per snapshot, and once per event.
*Alternative:* exact intersection of the outline with (sight − fog). Rejected: it needs a boolean-polygon library. A visible sliver narrower than half a cell being missed is acceptable; that player just doesn't see the sliver.

**3. Every caller gets the new rule through the same function.**
Because the rule lives in `templateConcealedFrom` itself, all of these follow with no logic change of their own:
- snapshots
- `TemplatePlaced` / `TemplateRemoved` events
- `TemplateChanged`'s `byVisibility` from `edit-placed-area-templates`
- `decide`'s `notFound`
- the preview relay

The relay already builds a template-shaped object from the preview (`{ ...preview, id: "", ownerId: sender.id }`), so a preview aimed out of fog now reaches players and one wholly in fog doesn't.

**4. A canvas alpha mask of the visible region on the board.**
`makeVisibleRegionCanvas(fog, sight, width, height)` in `apps/web/src/board/areaMask.ts` paints:
1. opaque white over the whole board, or only over the sight polygons when `sight` is set
2. then `destination-out` over each fog polygon

It returns `{ canvas, scale }`, with the longer side capped at 2048 px. A `Sprite` of it, scaled by `1/scale`, masks the clipped containers.
*Alternative:* a Pixi `Graphics` stencil mask. Rejected: sight-union-minus-fog with overlapping regions doesn't map cleanly onto `cut()` holes.

**5. Masked areas and previews get their own containers.**
- `markLayer` gains `clippedAreas` (holding `clippedGraphics`) and `fxLayer` gains `clippedAims`. Each is masked by a sprite of the shared texture.
- `redrawMarks` draws a placed template into `clippedGraphics` when `!(you.role === "gm" || t.ownerId === you.id)`, the same owner-or-GM rule as `can.removeTemplate` / `can.editTemplate`.
- `showAimPreview` adds another participant's preview to `clippedAims` unless the viewer is the GM.
- Pending placements and the viewer's own marks stay unmasked.
- The "Aiming: name" label sits at the origin, so for a preview aimed out of fog it is hidden by the mask too. The visible part of the preview is still drawn.

**6. Mask rebuilt when what you can see changes.**
`syncVisibleRegion()` runs from the same update as `syncSight`. Its cache key is the `state.fog` and `state.sight` identities, board width and height, and `you.role`. When the key changes, it builds a new canvas, swaps the texture into both sprites and destroys the old one. In the GM's normal view no mask is built.

## Risks / Trade-offs

- [The full geometry of a partly visible area, including an origin under fog, reaches the player's client] → Accepted (proposal). It isn't drawn. The new ADR records the trade-off, and the visibility-auditor review should confirm nothing else about the fogged region (tokens, terrain) is sent with it.
- [Sampling misses a visible sliver under half a cell wide] → The area isn't sent to that player; they see nothing rather than a sliver. Acceptable, and documented in the ADR.
- [Filter cost grows with area size and fog count] → `isInFog` skips a region whose bounding box (grown by its 1 px edge allowance) can't hold the point. The boxes are cached per fog object, and the answer is unchanged. The loop also exits at the first visible point, and areas are capped at 200 per room. The worst case (200 12-cell circles, 101 fog regions, all hidden) went from about 2.4 s to under 0.1 s, and a shared test guards it at 1 s.
- [The aim label is masked for previews aimed out of fog] → The visible part still shows. The label reappears once the origin is visible.
- [Mask texture memory on a very large map] → Capped at 2048 px on the longer side, one texture shared by both containers.

## Migration Plan

No data migration. Event logs are unchanged; only what each player is sent changes, and the next snapshot applies it. To roll back, revert the deploy, which restores the origin-only rule.
