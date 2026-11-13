# Proposal

## Why

FR-TAC-04 asks for drawing overlays "for communicating tactical plans or marking locations", but today the Draw tool only draws on the drawer's own screen. Nobody else at the table sees the plan, and it is gone on reload. `docs/DESIGN.md` §7 lists shared drawings as an open decision; this change makes that decision.

## What Changes

- **Drawings become room state.** Lines, rectangles, circles and freehand strokes made with the Draw tool are saved with the scene and shown to every participant, in the drawer's chosen colour. They survive reloads, reconnects and late joins.
- **Freehand included.** The browser simplifies each freehand stroke before sending it. The server rejects a stroke over 500 points and a drawing that would take the scene past 20,000 drawing points or 300 drawings, with a translated message telling the drawer to erase some first.
- **Erasing.** The Eraser removes shared drawings: anyone can erase their own, and the GM can erase anyone's. A player's eraser passes over other people's drawings without removing them. Drawings are not undoable, and they don't appear in the GM's undo list.
- **Drawn above fog and darkness.** Drawings are drawn over fog and line-of-sight darkness, never clipped by them, and every participant sees every drawing. There are no GM-only drawings.
- **Per scene.** Each scene has its own drawings, saved and swapped with the scene like templates. A new scene starts with none, and a checkpoint restore brings back the drawings as they were at the checkpoint.
- **Activity log.** "Pat drew a line" and "GM erased Pat's circle" lines, in English and zh-TW.
- Measurements stay local.
- **Scope note:** the README's FR-TAC-04 row no longer excludes freehand.

## Capabilities

### New Capabilities
- `shared-drawings`: persisted, scene-scoped drawing overlays (line, rectangle, circle, freehand) visible to everyone, with size limits and owner-or-GM erasing.

### Modified Capabilities
<!-- None: no existing spec covers drawings. -->

## Impact

- **`packages/shared`:**
  - A new `Drawing` schema.
  - `TableState` and `RoomState` gain an optional `drawings` field. This changes an existing schema, so it needs **ADR 0064** and review by the Real-Time Architecture owner.
  - `drawing.add` and `drawing.remove` commands; `DrawingAdded` and `DrawingRemoved` events.
  - `decide`, the reducer, `tableOf`, scene and encounter tables, the activity log, catalog messages, and the visibility filters (pass-through).
  - Unit tests.
- **`apps/server`:** no new code paths; an integration test that a drawing reaches every client and survives a reconnect.
- **`apps/web`:**
  - Board: the Draw tool sends commands instead of keeping local marks, and drawings render in the mark layer above fog and sight.
  - The Eraser sends `drawing.remove`.
  - A freehand simplification helper.
  - i18n for the new strings.
- **`apps/mcp`:** AI seats see `drawings` in state through the normal filtered snapshot. No tool changes.
- **Docs:** ADR 0064; ADR 0007's "drawings stay local" line amended; README FR-TAC-04; `docs/DESIGN.md` §6 and §7.
- **Compatibility:** old event logs and checkpoints replay unchanged (the field is optional and defaults to none). Web and server deploy together, as with every new event.
