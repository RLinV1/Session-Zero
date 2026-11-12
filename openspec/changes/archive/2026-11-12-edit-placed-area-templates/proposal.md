# Proposal

## Why

A placed area can't be changed. Moving a spell's area a square to the left, growing it, or turning a cone means erasing it and aiming it again (ADR 0007: "Editing a placed template: remove and place again"). At the table, areas get nudged all the time: a misplaced click, a creature that moved, a spell that lingers. Having to redo the aim each time is slow and noisy in the activity log. The Area tool's size picker also slows down the common case: most areas are sized by dragging anyway, and a click on the wrong preset leaves an area of the wrong size that can't be fixed.

## What Changes

- **Select and drag a placed area:** with the Select tool, pressing on a placed area its owner (or the GM) may edit selects it. Dragging its body moves it. A token under the pointer still takes the press. A participant who can't edit the area gets today's behavior (the press pans).
- **Edit without leaving the Area tool:**
  - In the Area tool, a press inside an area the viewer may edit (their own, or any area for the GM) grabs it: a click selects it, and a drag moves it.
  - A press anywhere else places a new area as before, including a player's press inside another participant's area.
  - An area the viewer just placed is selected, so a click-placed 2-cell area can be stretched or turned straight away.
- **Handles on a selected area:**
  - circle: a rim handle sets the radius
  - cone, line and square: one handle at the far end or corner sets size and direction together, exactly as a placement drag does
  - line: also a width handle on each long edge, which sets the width in whole cells from 1 to 10
  - snapping matches placement (half cells for the origin, whole cells for size, Alt to place freely); Escape cancels an edit in progress
- **Edits are shared live:** while an area is being moved or resized, other viewers who may see it see the edit preview in place of the original. Only the final release is committed.
- **New command and event:** `template.update` with the area's new origin, aim, size and width. The owner or the GM may send it. It commits `TemplateChanged`, which carries the area's old and new geometry. Moving an area into or out of fog shows or hides it for other players, the same way tokens move.
- **Activity log:** "Pat moved a red 20 ft circle", "Pat changed a cone to 30 ft".
- **No size field in the Area tool:** **BREAKING (UI)**. The size picker is removed. A click places an area 2 cells in size: on a 5 ft grid, a 10 ft circle radius, cone, line or square. A drag still sets the size. Lines keep their width field, which sets the width of the next line placed.
- **Unchanged:** an area's color and GM-only flag can't be edited. Area edits are not undoable, the same as placing and removing areas today.

## Capabilities

### New Capabilities
- `area-template-editing`: moving, resizing, turning and widening a placed area, from the Select tool or the Area tool. Covers who may edit it, which press grabs an area rather than placing one, the handles per shape, snapping, the live edit preview, the committed change, fog and GM-only visibility of an edit, and its activity log line.

### Modified Capabilities
- `area-templates`:
  - Adds "A click places a 2-cell area", replacing the chosen size.
  - "Square areas are placed by their centre" changes its click scenario to match.
  - The aim requirements stay as they are. Edit previews follow the same rules and are specified in `area-template-editing`.

## Impact

- `packages/shared`:
  - `commands.ts`: `template.update`
  - `events.ts`: `TemplateChanged`
  - `protocol.ts`: optional `templateId` on `templatePreview`
  - `decide.ts`, `reducer.ts`, `visibility.ts` (`filterEventForViewer`), `activityLog.ts` and the zh-TW sentences, rejection catalog ids
- `apps/server/src/domain/liveRoom.ts`: the edit preview relay checks that the sender may edit the template it names.
- `apps/web`:
  - `board/boardView.ts`: selecting a template in the Select and Area tools, Area tool press routing (an editable area before placing), selecting a just-placed area, handles, the edit drag, hiding an area while someone else edits it
  - `board/tools.ts`: handle geometry and the drag-to-geometry functions
  - `board/Board.tsx`: an `updateTemplate` callback and the preview relay
  - `ui/ToolRail.tsx`: the size picker is removed, along with `AREA_SIZES`
  - i18n catalogs
- Tests:
  - `packages/shared/test/areaTemplates.test.ts`
  - `apps/server/test/areaTemplates.test.ts` (wire and fog filtering)
  - `apps/web/test` (handle geometry, edit drag)
- Docs: a new ADR amending 0007, 0021 and 0040. Adding `templateId` to `templatePreview` changes an existing shared schema, so it needs review by the Real-Time Architecture owner.
