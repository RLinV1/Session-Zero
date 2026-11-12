# Tasks

## 1. ADR

- [x] 1.1 Write `docs/adr/0058-edit-placed-area-templates.md` amending ADRs 0007, 0021 and 0040. It covers `template.update` / `TemplateChanged`, the `expected` check, `byVisibility` for fog, the optional `templateId` on `templatePreview`, and the removal of the Area tool's size field. Add "Amended by" lines to 0007, 0021 and 0040. Verify the ADR is present and asks the Real-Time Architecture owner for review (design Decisions 1–3).

## 2. Shared contract

- [x] 2.1 Add `template.update { templateId, origin, toward, size, width?, expected }` to `commands.ts` and `TemplateChanged { templateId, from, to }` to `events.ts`, with geometry as a shared zod object. Add `can.editTemplate` (owner or GM). Verify `npm run typecheck` passes.
- [x] 2.2 Handle `template.update` in `decide`: not found / concealed, then forbidden, then stale (`reject.templateStale`, with en and zh-TW catalog entries), then line too wide, dropping width for shapes other than lines. Handle `TemplateChanged` in `reduce`. Verify with tests in `packages/shared/test/areaTemplates.test.ts` (`describe("... (FR-TAC-06)")`):
  - the owner moves their area
  - the GM edits a player's area
  - another player is forbidden
  - a GM-only area answers not found to a player
  - an 11-cell width is rejected
  - stale `expected` is rejected
  - id, owner, color and gmOnly are unchanged
  - the event carries `from`
- [x] 2.3 Filter `TemplateChanged` in `filterEventForViewer` with `byVisibility` (design Decision 2). Verify with shared tests:
  - a GM-only edit is redacted for players
  - a move into fog resyncs other players and passes for the owner and the GM
  - a move out of fog resyncs
  - a move between two visible places passes
- [x] 2.4 Add the `TemplateChanged` activity log lines ("moved" / "turned" / "changed X to Y", "(GM only)") in `activityLog.ts` and `sentences.zh-TW.ts`, following `docs/GLOSSARY-zh-TW.md`. Verify with activity-log tests for each verb in both locales.
- [x] 2.5 Add optional `templateId` to the `templatePreview` payload in `protocol.ts`. Verify that an existing aim preview still parses and one with `templateId` parses.

## 3. Server

- [x] 3.1 In `LiveRoom`'s ephemeral relay, for a `templatePreview` with `templateId`: drop the message if the template is missing, not visible to the sender, or not editable by them. Take `gmOnly` from the stored template, and filter recipients on the preview geometry (design Decision 3). Verify with integration tests in `apps/server/test/areaTemplates.test.ts`:
  - a GM-only edit preview reaches GMs only
  - a player's preview naming another player's area reaches no one
  - a preview dragged into fog reaches no other player
  - nothing is persisted or sequenced
- [x] 3.2 Add a multi-client integration test for `template.update` over the wire: two players and the GM see the edit, and a move into fog removes the area from another player's resynced state while the GM keeps it. Verify `npm test --workspace=@vtt/server -- -t "FR-TAC-06"` passes.

## 4. Board geometry

- [x] 4.1 Add `DEFAULT_AREA_CELLS = 2`, `templateHandles(t, grid)` and `editedGeometry(t, handle, pointer, grid, free)` to `apps/web/src/board/tools.ts`, reusing `areaSizeFromDrag` and `areaOrigin` (design Decision 5). Verify with unit tests in `apps/web/test/templateHandles.test.ts`:
  - handle positions for each shape
  - a circle's rim drag to 4 cells gives 20 ft with the same centre
  - a cone's tip drag 6 cells east gives 30 ft pointing east
  - a square's corner turns around its centre
  - a line's width drag of 1.5 cells gives 3 cells, and 8 cells clamps to 10
  - a body drag keeps the facing and snaps to half cells, and Alt frees it
  - the size never goes under one snapped cell

## 5. Board interaction

- [x] 5.1 In `BoardView`, select a template the viewer may edit on a Select-tool press, unless a token takes the press. Draw its handles, and clear the selection on a map press, a change to a tool other than Select or Area, Escape, or when the template leaves state (design Decision 4a). Verify with `BoardView` unit tests built as in `apps/web/test/movementPreview.test.ts`:
  - pressing your own area selects it
  - pressing a token inside it doesn't
  - pressing another player's area pans
  - the selection clears in each case
- [x] 5.2 Implement the body, aim and width drags: live drawing, a throttled `templatePreview` with `templateId`, `template.update` on release with `expected`, `pendingEdits` until state matches, snapping back on refusal, Escape cancelling with a cleared preview, and nothing sent for a press without movement (design Decision 6). Add `updateTemplate` to `Board.tsx`. Verify with `BoardView` tests for each step, using a mocked callback.
- [x] 5.3 On receiving a `templatePreview` with `templateId`, hide that template while the preview is live, and draw it again when the preview clears or expires after 1 s. Verify with a `BoardView` test: the original is hidden while a preview is live and is back 1 s after the last update.

- [x] 5.4 Route Area tool presses as in design Decision 4b: a handle of the selected area, then an area the viewer may edit (`can.editTemplate`; a click selects, a drag moves), then placing. Select the area the viewer just placed when its `TemplatePlaced` arrives, keep the selection between Select and Area, and make Escape cancel an edit, then clear the selection, then leave the tool. Verify with `BoardView` tests:
  - a handle drag edits without placing
  - a click inside your own area selects it without placing
  - a drag inside your own area moves it
  - a click inside another player's area places a new one for a player
  - a GM's drag inside a player's area moves it without placing
  - a player's click inside a GM-only area's footprint places
  - a click on an empty spot places, and the new area is selected
  - the selection is kept from Area to Select and back, and cleared for another tool

## 6. Area tool size field

- [x] 6.1 Remove the size picker, `AREA_SIZES` and `area.size` from `ToolRail.tsx` and the rail state, and make a click in `areaFromGesture` use `DEFAULT_AREA_CELLS * unitsPerCell`. Remove the now-unused i18n strings. Verify with tests:
  - the rail renders no size control
  - a click places a 10 ft circle on a 5 ft grid and a 3 m cone on a 1.5 m grid
  - a click-placed line uses the width field
  - `npm run lint` passes (no literal UI text)

## 7. Finish

- [x] 7.1 Run `npm run lint && npm run typecheck && npm test`, and verify all pass.
- [x] 7.2 Verify in the browser with two tabs (a GM and a player):
  - the player selects, moves, resizes and turns their cone, and widens a line, and the GM sees a dashed preview in place of the original, then the result
  - the player can't grab the GM's area
  - a GM-only area's edit never shows on the player's tab
  - a move into fog removes the area from a second player's board
  - the Area tool has no size field, and a click makes a 2-cell area
  - in the Area tool, a click-placed circle is selected and its rim handle stretches it without switching tools
  - clicking inside your own area grabs it, and clicking inside another player's area places a new one; the GM grabs a player's area from the Area tool
