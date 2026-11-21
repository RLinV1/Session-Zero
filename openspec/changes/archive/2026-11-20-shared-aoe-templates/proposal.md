## Why

An area of effect exists to be seen by the whole table. The player who casts Fireball and the GM who resolves it need the same circle over the same squares. The Area tool from `board-tool-rail` (KAN-69) kept templates in the placing viewer's browser only, so nobody else saw them. FR-TAC-06 and FR-SYNC-02 both call for shared templates. This is the core of KAN-35, built on KAN-69's tool.

## What Changes

- Placed area templates (circle, cone, box) become room state that every participant sees and that survives reloads and late joins.
- **New commands:**
  - `template.place`: any participant.
  - `template.remove`: the template's owner or the GM.
- **New events:** `TemplatePlaced` and `TemplateRemoved`. The removal event carries the whole template, so undo can restore it later.
- The GM can tick **GM only** in the Area options to place templates players never receive, in state or as events. They are drawn in purple for the GM.
- **The Eraser** removes templates the viewer may remove: their own, or any of them for the GM. **Clear all** removes the viewer's own templates along with their local marks.
- The activity log describes placements and removals in the grid's units ("Pat placed a 20 ft cone").
- Measurements and drawings stay local to the viewer, as in `board-tool-rail`.
- **Contract change:** new command, new events and a new `RoomState.templates` field, recorded in ADR 0007 for review by the Real-Time Architecture owner.

## Non-goals

- Live aiming previews for other viewers (FR-SYNC-03, KAN-39).
- Undo (KAN-41), line templates, editing a placed template, and per-player visibility lists.
- Sharing drawings (KAN-33).

## Capabilities

### New Capabilities
- `area-templates`: placing, seeing, hiding and removing shared area templates, and who may do each.

### Modified Capabilities
- None in `openspec/specs`. `board-tool-rail`'s own delta (not yet archived) is updated in place so its "marks stay local" requirement covers only measurements and drawings.

## Impact

- `packages/shared`: `state.ts` (`AreaTemplate`, `RoomState.templates`), `commands.ts`, `events.ts`, `decide.ts` (`can.removeTemplate`), `reducer.ts`, `visibility.ts`, `activityLog.ts`, plus unit tests.
- `apps/server`: no code change; the command pipeline is generic. A new wire test is added.
- `apps/web`: `boardView.ts` draws templates from state and sends place and remove commands; `ToolRail.tsx` adds the GM-only option; `Board.tsx` wires the commands.
- `docs/adr/0007-shared-area-templates.md`.
