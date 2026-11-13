# ADR 0064: Shared drawings

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0003-tactical-state.md` · **Amends:** `docs/adr/0007-shared-area-templates.md` ("Drawings and measurements stay local")
**Change:** `openspec/changes/shared-drawings` · **Requirements:** FR-TAC-04

## Context

FR-TAC-04 asks for drawing overlays "for communicating tactical plans or marking locations". The Draw tool (KAN-69) drew lines, rectangles, circles and freehand strokes on the drawer's screen only, and ADR 0007 left sharing them to a later ADR. `docs/DESIGN.md` §7 listed it as open: a committed overlay type, a new event, and whether drawings are undoable.

Decisions made with the user in `shared-drawings`:
- drawings persist with the scene;
- everyone sees every drawing, drawn above fog and darkness;
- the drawer or the GM erases them, and they are not undoable;
- freehand is included, simplified in the browser, with server limits.

## Decision

Drawings become room state, following ADR 0007's pattern.

- **State.** `Drawing` is one of:
  - `{ id, ownerId, color, kind: "line" | "rect" | "circle", from, to }`: a circle is centred on `from` with radius `|to - from|`;
  - `{ id, ownerId, color, kind: "stroke", points }`: `points` is a flat `[x0, y0, x1, y1, …]` list, 2 to 500 points.

  `color` is a `DrawColor` name (`red`, `yellow`, `green`, `blue`, `white`), as ADR 0040 does for areas. Every coordinate is a whole map pixel (invariant 8).

  `TableState` and `RoomState` gain `drawings`: optional in `TableState`, so older events, scenes and checkpoints parse, and always set in `RoomState`. Every place a saved table is spread into state sets `drawings: table.drawings ?? {}`, as for `walls`.
- **Commands.**
  - `drawing.add { drawing }`, where `drawing` is `{ kind, color, from, to }` or `{ kind: "stroke", color, points }`: any active participant. Rejected as `invalid` when:
    - the scene has no map, or a point lies outside it;
    - the scene would pass `MAX_DRAWINGS` (300) drawings or `MAX_DRAWING_POINTS` (20,000) points, counting a line, rectangle or circle as 2.
  - `drawing.remove { drawingId }`: the drawer or the GM (`can.removeDrawing`). Anyone else is `forbidden`; a missing drawing is `not_found`.
- **Events.**
  - `DrawingAdded { drawing }`.
  - `DrawingRemoved { drawing }`, which carries the whole drawing (invariant 6).
- **Undo.** Neither event is reversible: they are not in `REVERSIBLE_EVENT_TYPES` and never appear in the GM's undo list. A checkpoint restore or encounter apply still swaps the whole table, drawings included, and its undo swaps it back. Its existing conflict check refuses that undo once anyone has drawn or erased since, so no newer drawing is lost.
- **Visibility (invariant 3).** Drawings are public. `filterStateForViewer` copies them and `filterEventForViewer` passes both events through, so they take the filter path without being redacted. They are drawn above fog and line-of-sight darkness and are never clipped.
- **Activity log.** "Pat drew a line", "Pat erased their circle", "GM erased Pat's freehand drawing", in English and zh-TW.
- **Client.** The browser simplifies a freehand stroke (Ramer–Douglas–Peucker) and rounds it to whole pixels before sending. The server only validates.

## Consequences

- **Schema change.** `TableState` and `RoomState` gain a field. It is optional in `TableState`, so old event logs, saved scenes and checkpoints replay unchanged, and there is no migration. Web and server deploy together, as for every new event.
- **Size.** At most 20,000 points per scene, about 150–200 KB of JSON in the worst case. That bounds the full snapshots a player receives on each of their token's moves while line of sight is on (ADR 0044).
- **Moderation.** The GM can erase anything, and the log names the drawer.
- **Not covered.**
  - Private or GM-only drawings.
  - Editing or moving a drawing.
  - Live previews of a drawing in progress for other viewers.
  - A "clear all" control.
  - Rulers stay local.

## Alternatives considered

- **Ephemeral drawings.** Rejected: they would vanish on reload and miss late joiners, and the user wanted them to persist.
- **GM-only drawings like templates.** Rejected by the user: every drawing is visible to everyone.
- **Undoable drawings.** Rejected by the user. The eraser is the way to remove one.
- **Points as `{x, y}` objects.** Rejected: about twice the bytes on the snapshot hot path.
- **Server-side simplification.** Rejected: geometry work in `decide`, and raw strokes of up to 2000 points on the wire.
