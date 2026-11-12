# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- **Contract.** `AreaTemplate` (`packages/shared/src/state.ts`) is `{ id, shape, origin, toward, size, width?, color?, ownerId, gmOnly }`. The outline is derived by `areaShape` in `apps/web/src/board/tools.ts` and never stored. Only `template.place` → `TemplatePlaced` and `template.remove` → `TemplateRemoved` exist. `can.removeTemplate` (owner or GM) authorizes removal, and `decide` answers a template the actor can't see (`templateConcealedFrom`) with `notFound`.
- **Visibility.** `templateConcealedFrom` hides GM-only templates from players, and also other people's templates whose `origin` is under fog or out of sight. `filterEventForViewer` decides `TemplatePlaced`/`TemplateRemoved` from the event's template alone. For moves, `TokenMoved` uses `byVisibility(wasConcealed, isConcealed)`: a transition resyncs the viewer, a hidden-to-hidden move is redacted, and a visible-to-visible move passes.
- **Stale moves.** `token.move` carries `expectedOrigin`. `decide` rejects a mismatch with `reject.moveStale`.
- **Aim previews.** The ephemeral `templatePreview { preview | null, gmOnly? }` is relayed by `LiveRoom` (`apps/server/src/domain/liveRoom.ts`). The relay drops a GM-only aim from a player and an aim whose origin is off the map. It filters each recipient with `templateConcealedFrom` on the preview. `BoardView.showAimPreview(from, preview, name)` draws a dashed, labelled area and expires it after 1 s.
- **Board input.** Placed templates are drawn in the marks layer and take no pointer input. The eraser and From template hit-test them with `templateAt` / `hitMark`. In the Select tool, a press on the stage (`onBackgroundDown`) pans or toggles portals. Tokens are their own interactive objects, so they get the press before the stage does.
- **Sizing.** `areaFromGesture` uses `areaSizeFromDrag(origin, to, grid, free, shape)` for a drag and `tool.size` (from `ToolRail`'s picker, `AREA_SIZES`) for a click.

## Goals / Non-Goals

**Goals:**
- One committed event per edit, carrying everything undo or a replay would need.
- Handles reuse placement's drag-to-geometry math, so a handle drag and a placement drag behave identically.
- No new visibility rule. Edits reuse the template and token-move rules.

**Non-Goals:**
- Undo of edits. Templates aren't reversible today, so this would have to come with undo for placing and removing too.
- Editing color or GM-only.
- Selecting several areas at once, or areas together with tokens.
- Keyboard nudging.

## Decisions

**1. One command for all geometry: `template.update`.**
```
template.update { templateId, origin, toward, size, width?, expected: { origin, toward, size, width? } }
  -> TemplateChanged { templateId, from: { origin, toward, size, width? }, to: { origin, toward, size, width? } }
```
The command always sends the full geometry, not a patch, so `reduce` writes `to` over `from` and nothing else. `decide` runs these checks in order:
1. A missing or concealed template answers `notFound("template")`.
2. `can.editTemplate(actor, template)` (owner or GM, the same rule as remove) fails with `forbidden`.
3. `expected` differs from the current geometry (compared with `sameValue`): `reject("invalid", "reject.templateStale")`.
4. A line's width above `MAX_LINE_WIDTH_CELLS * unitsPerCell`: `reject.lineTooWide`, the same as placement.

`width` is dropped for shapes other than lines, as `template.place` does. `from` is the stored geometry, so the event satisfies invariant 6.
*Alternative:* separate `template.move` / `template.resize` commands. Rejected: a handle drag changes size and direction together, and two event types would double the visibility and log code for no gain.

**2. Visibility of `TemplateChanged`.**
In `filterEventForViewer`, look the template up in `before` (missing → redacted) and return `byVisibility(templateConcealedFrom(c, t, viewer), templateConcealedFrom(c, { ...t, ...e.to }, viewer))`, the same pattern as `TokenMoved`.
- A move into fog resyncs the other players, so their snapshot drops the area.
- A move out of fog resyncs them too, so their snapshot adds it.
- A GM-only template is concealed both before and after, so players get a bare seq.

The event never carries `ownerId` or `gmOnly`, so the redacted form leaks nothing.
*Alternative:* translate transitions into synthetic `TemplatePlaced` / `TemplateRemoved` events. Rejected: the resync path already exists, is tested, and keeps the event log and what each viewer sees in step.

**3. Edit previews reuse `templatePreview` with an optional `templateId`.**
`templatePreview` gains `templateId?: Id`. When it is present, the relay in `LiveRoom` runs these checks:
- It looks up the stored template and drops the message if it's missing, if the sender can't see it, or if the sender fails `can.editTemplate`.
- It takes `gmOnly` from the stored template, never from the payload.
- It applies today's off-map and per-recipient `templateConcealedFrom` checks to the preview geometry.

On the receiving board, `showAimPreview` keys previews by sender as now. While a preview with a `templateId` is live, that template is left out of `redrawMarks`. When the preview clears or expires (1 s), the template is drawn again.

This changes the shape of an existing schema (an additive, optional field), which needs an ADR and review by the Real-Time Architecture owner.
*Alternative:* a new `templateEditPreview` message. Rejected: same geometry, same filtering and same rendering. A second message type would duplicate the relay rules.

**4a. Hit-testing and selection in the Select tool.**
`onBackgroundDown` in the Select tool first checks for a press on a handle of the selected template. It then checks `templateAt(p)`, restricted to templates where `can.editTemplate(you, t)`. If neither applies, it pans as today. Tokens are interactive objects and get the press first, so "token wins" needs no extra code. `BoardView` keeps `selectedTemplateId`. Board-local selection state stays in `BoardView`, the same as token drag state, and React never touches it.

The selection clears in these cases:
- a press on the map
- a change to a tool other than Select or Area
- Escape
- `syncTemplates` no longer finding the template

`Board.tsx` gains an `updateTemplate` callback that sends `template.update` through `RoomConnection.command`.

**4b. Area tool: a press on an area you may edit grabs it, and anywhere else places.**
In the Area tool, the press handler checks these in order, before `areaFromGesture` starts a gesture:
1. A handle of the selected area: a handle drag.
2. Inside the outline of an area in the viewer's state for which `can.editTemplate(you, t)` holds (newest first, as `templateAt` orders them, but without the eraser's edge reach): grab it. A press that stays under the pan threshold selects it, and one past the threshold moves it.
3. Otherwise: place, as today.

The Area tool and the Select tool use the same permission, so a player grabs their own areas and the GM grabs any area. Areas concealed from a player are not in their filtered state, so they never block placing and nothing about them is revealed.

When the viewer places an area, the board waits for the `TemplatePlaced` event at the command's returned `seq` (through `onCommitted`, the moment `pendingAreas` already waits for) and selects its `template.id`. The command result carries no id, so no contract change is needed. The selection is kept when switching between Select and Area (`setTool`), and cleared for any other tool. Escape first cancels an edit or aim in progress, then clears the selection, and only then leaves the tool.
*Alternative:* in the Area tool, grab only areas the viewer placed (`ownerId`). Rejected: the GM would need the Select tool to adjust a player's area, and the two tools would disagree about what can be grabbed.

**5. Handle geometry is pure and shared with placement.**
`tools.ts` gains:
- `templateHandles(t, grid)`: board points and the kind of each handle (`aim`, `width`).
- `editedGeometry(t, handle, pointer, grid, free)`: the new `{ origin, toward, size, width }`.

The `aim` handle reuses `areaSizeFromDrag(t.origin, pointer, grid, free, t.shape)`, with `toward = pointer`. For a circle, `toward` is kept. Size is clamped to at least one cell when snapped. Handle positions:
- circle: on the rim, on the side facing `toward`
- cone: the middle of its far edge
- line: its far end
- square: the corner in front and to the right

A body drag translates `origin` and `toward` by the same snapped delta: `areaOrigin` snaps the new origin, and `toward` is moved by the same offset, so the facing is kept.

The `width` handles sit at the middle of each long edge. A width drag projects the pointer onto the line's normal, so `width = round(2·|d| / cellSize)` cells, clamped to 1..10, then times `unitsPerCell`. Alt doesn't free it.

All of these are pure functions, unit-tested without Pixi.

**6. The drag on the editor's board.**
- **During the drag:** `BoardView` draws the edited geometry in place of the stored template, sending `templatePreview` with `templateId` (throttled as aiming is).
- **On release:** it sends `template.update` with `expected` set to the geometry it started from, and holds the edited geometry in a `pendingEdits` map, the same as `pendingAreas`, so the area doesn't blink back.
- **On acceptance:** it clears the entry when state arrives with matching geometry.
- **On refusal (stale or forbidden):** it clears the entry, so the board shows the area as state has it.
- **Escape:** sends `templatePreview { preview: null, templateId }` and restores the area.
- **A release with no change:** sends nothing.

**7. The Area tool loses its size field.**
- `ToolRail`: the size picker, `AREA_SIZES` and `area.size` in the rail state go.
- `areaFromGesture`: a click uses `DEFAULT_AREA_CELLS * grid.unitsPerCell`, with `DEFAULT_AREA_CELLS = 2` in `tools.ts`.

The server is unchanged here: `template.place` still takes any valid size.

**8. Activity log.**
`activityLog.ts` and `sentences.zh-TW.ts` gain a `TemplateChanged` case. The verb depends on what changed:
- "moved": `size` and `width` are equal and `to.toward − to.origin` equals `from.toward − from.origin`.
- "turned": only the direction changed.
- "changed X to Y" otherwise, with `templateLabel` for both. The template's color, shape and `gmOnly` come from `before.templates`.

zh-TW terms follow `docs/GLOSSARY-zh-TW.md`.

## Risks / Trade-offs

- [A template under a token can't be grabbed where the token covers it] → The rest of the template can still be grabbed. A template fully covered by one token is a small area, which can be erased and placed again.
- [In the Area tool you can't start a new area inside one you may edit, and for the GM that is every visible area] → Start it beside the area and move it in, or overlap it by dragging out from outside. For a player, other people's areas don't block placing.
- [Resync on each fog transition] → Only for players whose visibility of that area changes, at most once per release. Same cost as a token crossing fog.
- [A forged edit preview could hide an area on other boards] → The relay drops a preview whose sender can't edit the named template (Decision 3). A permitted editor can only hide an area for at most 1 s past their last update.
- [Two editors race] → `expected` makes the second release fail cleanly. The loser's board shows the winner's result rather than a merge.
- [A client built before this change receives `TemplateChanged`] → Its reducer's `assertNever` throws. This is acceptable for a coordinated web + server deploy, as with every earlier event addition (ADR 0007).

## Migration Plan

Additive only: a new command, a new event and an optional field on an ephemeral message. Old logs replay unchanged, and there is no data migration. To roll back, revert the deploy. A room that has `TemplateChanged` events in its log needs the new reducer to load, so a rollback after edits have been made needs the event handled (or the deploy rolled forward).

## Open Questions

- Should handles get larger hit targets on touch screens? This depends on what `mobile-view-fixes` settles on for touch targets, and can follow without changing the approach.
