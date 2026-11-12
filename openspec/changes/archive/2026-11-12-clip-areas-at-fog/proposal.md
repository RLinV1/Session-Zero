# Proposal

## Why

An area is shown or hidden as a whole, depending only on its origin (ADR 0016):
- When someone else's cone starts in lit ground and points into fog, a player sees the whole cone drawn over the fog. That reveals the shape of ground they haven't explored.
- When a cone starts in fog and reaches into lit ground, the player sees none of it, even though it covers squares they can see. A dragon's breath from the dark simply doesn't appear.

Areas are drawn above the fog and the line-of-sight darkness (the marks layer sits above both), so the client can't trim them either.

## What Changes

- **Sent when any part is visible:** a player receives an area another participant placed when any part of it is outside fog and, with line of sight on, inside their sight. The test is no longer whether its origin is visible. An area with no visible part is still never sent. GM-only areas still never reach players. This applies everywhere areas are filtered: snapshots, live events, the aim and edit preview relay, and the "not found" answer for areas the sender can't see.
- **Clipped drawing:** an area the viewer may not edit (for a player, everyone else's areas) is drawn only where it lies outside every fog region and inside the viewer's sight. The part under fog or out of sight has no fill and no outline.
- **Whole for those who may edit:** the area's owner and the GM see it in full, as today. A GM viewing as a player sees what that player sees, clipped.
- **Previews too:** another participant's live aim preview, and the edit preview from `edit-placed-area-templates` once that change lands, are sent and clipped by the same rule.
- **Live:** when fog is added or removed, or the viewer's sight changes, which areas are sent and the visible parts both update without a reload.
- **Accepted trade-off:** an area sent because part of it is visible carries its full geometry, including an origin under fog. A player inspecting their browser could read where an area aimed out of fog starts. It is never drawn, but it is in their client.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `fog-of-war`:
  - "Content under fog is not sent to players" changes for areas: an area is withheld only when none of it is visible to the player, instead of when its origin is under fog.
  - Adds a requirement that areas a viewer may not edit are drawn clipped to what the viewer can see.

## Impact

- `packages/shared`:
  - `visibility.ts`: `templateConcealedFrom` tests whether any part of the area is visible, and needs the room's grid to build the outline.
  - The area outline (`areaShape` / `templateArea`, today in `apps/web/src/board/tools.ts`) moves into `packages/shared` so the server and the board share one definition.
  - Callers to update: `filterStateForViewer`, `filterEventForViewer`, `decide`'s `template.remove`, and the `LiveRoom` preview relay.
- `apps/server/src/domain/liveRoom.ts`: the aim preview relay calls the new signature.
- `apps/web/src/board/boardView.ts`:
  - `redrawMarks` draws areas the viewer may not edit behind a visibility mask.
  - `showAimPreview` puts other participants' previews behind the same mask.
  - The mask is rebuilt when fog, sight or the board size changes.
- `apps/web/src/board/areaMask.ts` (new): the visible-region mask canvas.
- Tests:
  - shared visibility tests (an area aimed out of fog is sent, an area wholly in fog isn't, sight)
  - server integration tests (snapshot, live event and preview relay)
  - web mask and `BoardView` tests
  - a browser check
- Docs: a new ADR amending ADR 0016's rule for areas and recording the trade-off above, for review by the Real-Time Architecture owner. No shared schema changes shape.
