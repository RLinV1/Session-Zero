# Design

## Context

- **Drawing today.** The Draw tool (`board/tools.ts`, `boardView.ts`) records `Mark`s of kind `draw` (`line`/`rect`/`circle` as `from`/`to`; a circle is centred on `from` with radius `|to - from|`) and `stroke` (brush points every 2 screen px, up to 2000 points) in `BoardView.marks`. These are local, capped at 100, and erased by `eraseAt` with `hitMark`. Colours are `DRAW_COLORS` (red, yellow, green, blue, white) as numbers.
- **Shared area templates (ADR 0007)** are the model to follow: `RoomState.templates`, `template.place`/`template.remove`, `TemplatePlaced`/`TemplateRemoved` carrying the whole template, `can.removeTemplate = GM || owner`, a count cap, part of `TableState` so scenes, encounters and checkpoints carry them.
- **Layers.** `markLayer` already sits above `fogLayer` and `sightLayer` (`boardView.ts:647`). Templates are clipped by going into `clippedAreas`; plain marks are not.
- **Snapshots.** With line of sight on, a player gets a full snapshot on each of their token's moves (ADR 0044), so state size matters.

## Goals / Non-Goals

**Goals:**
- Follow the standard command → event → reduce pattern with no new mechanism.
- Bound per-scene drawing data so snapshots stay small.

**Non-Goals:**
- GM-only or per-player drawings, editing or moving a drawing, live drawing previews for others (ephemeral), undo, a "clear all" button, and sharing rulers.

## Decisions

### 1. Schema (ADR 0064)
```
DrawColor   = enum ["red", "yellow", "green", "blue", "white"]   // state names the colour, board picks the shade (as ADR 0040)
DrawingBase = { id, ownerId, color: DrawColor }
Drawing     = DrawingBase & { kind: "line" | "rect" | "circle", from: IntPoint, to: IntPoint }
            | DrawingBase & { kind: "stroke", points: int[] }   // flat [x0, y0, x1, y1, ...], even length, 4..1000
TableState.drawings?: Record<Id, Drawing>   // optional, so old events, scenes and checkpoints parse
```
- A named colour rather than a number keeps forged values out and matches area colours.
- A flat integer array roughly halves the JSON of `{x, y}` objects.
- *Alternative: `{x, y}[]` like other geometry.* About twice the bytes on the snapshot hot path. Rejected.

### 2. Commands and events
- **Commands:**
  - `drawing.add { drawing }`, where `drawing` is `{ kind, color, from, to }` or `{ kind: "stroke", color, points }`: any active participant. The id comes from `ctx.newId()`; `ownerId` is the actor.
  - `drawing.remove { drawingId }`: `can.removeDrawing = actor is GM || drawing.ownerId === actor.id`. A missing drawing is `not_found`; one the actor may not remove is `forbidden`.
- **Events:**
  - `DrawingAdded { drawing }`.
  - `DrawingRemoved { drawing }`, carrying the whole drawing (invariant 6).
- **Not undoable:** neither event type joins `REVERSIBLE_EVENT_TYPES`, so `reduce` never records an undo entry.
- **Whole-board undo:** checkpoint restores and encounter applies swap the whole `TableState`, drawings included, and their undo swaps it back. Their existing conflict check (`tableOf(state)` must equal what the restore made) then also refuses the undo once anyone has drawn or erased since, so a newer drawing is never silently discarded.

### 3. Limits, checked in zod and `decide`
- **zod (shape, at the trust boundary):** integer coordinates, `points` length even and between 4 and 1000 (2–500 points).
- **`decide` (state-dependent):**
  - Every point lies within `0..map.width` × `0..map.height`; with no map, the command is rejected as `invalid`.
  - The scene stays at or under `MAX_DRAWINGS = 300` and `MAX_DRAWING_POINTS = 20_000`, where a line, rectangle or circle counts as 2 points.
  - Rejections use catalog ids (`reject.tooManyDrawings`, `reject.drawingOffMap`) in English and zh-TW (ADR 0054).
- *Alternative: only a drawing-count cap.* It doesn't bound bytes: 300 strokes × 500 points is 150k points. Rejected.

### 4. Client simplification
A pure `simplifyStroke(points, tolerance)` (Ramer–Douglas–Peucker) in `board/` or `packages/shared`:
- Tolerance about 1.5 screen px converted to board px at the current zoom.
- Points rounded to whole map pixels.
- If the result is still over 500 points, re-run with the tolerance doubled until it fits.

The local preview while drawing stays as today. The stroke is simplified once, on release.
- *Alternative: simplify on the server.* That makes `decide` do geometry work, and the client would still send up to 2000 raw points. Rejected: the server only validates.

### 5. Rendering and eraser
- **Rendering:** shared drawings render in `markLayer` (above fog and sight, not in `clippedAreas`), from `state.drawings`. Local `draw`/`stroke` marks go away; measure and route marks stay local.
- **Drawing in progress:** the board shows the in-progress shape locally until the `DrawingAdded` arrives, then drops the pending copy. If the server rejects it, the copy is dropped and the rejection is shown.
- **Eraser:** `eraseAt` hit-tests shared drawings with the existing `hitMark`. For each drawing hit that `can.removeDrawing` allows (a UI hint), it sends `drawing.remove` once per sweep, using a "requested" set like the existing template-removal set.

### 6. Visibility
Drawings are public. `filterStateForViewer` copies `drawings` unchanged, and `filterEventForViewer` passes `DrawingAdded`/`DrawingRemoved` through, so invariant 3's path is still taken explicitly. No resync triggers are needed.

### 7. Scenes, encounters, checkpoints, map changes
- **Scenes and checkpoints:** `tableOf` and the scene save/restore include `drawings`. Every place that spreads a saved table into state (scene switch, `SceneCreated`, checkpoint restore, encounter apply, replay frames, the checkpoint preview) sets `drawings: table.drawings ?? {}`, as it already does for `walls`, so an older table never leaves the previous scene's drawings behind. `SceneCreated` and `SceneDraftCreated` tables and `tableFromEncounter` start with `{}`. Checkpoints carry `TableState`, so a restore brings drawings back as they were.
- **Map changes:** a `MapSet` leaves drawings in place (as templates). Bounds are only checked when a drawing is added.

### 8. Activity log
- English: "Pat drew a line", "Pat erased their circle", "GM erased Pat's freehand drawing".
- zh-TW in `sentences.zh-TW`, with terms from `docs/GLOSSARY-zh-TW.md`.

## Risks / Trade-offs

- **[Snapshot size with line of sight on]** → The 20,000-point budget caps drawings at about 150–200 KB of JSON per scene in the worst case. Typical tables stay far below it.
- **[Inappropriate drawings over the whole board]** → The GM can erase any drawing, and the activity log names the drawer.
- **[Changing `TableState` and `RoomState`]** → The field is optional, so replays and old checkpoints parse unchanged. Needs ADR 0064 and the Real-Time Architecture owner's review before merge.
- **[Old clients receiving new events]** → As in ADR 0007, web and server deploy together.

## Migration Plan

None. Rooms load with no drawings. Rollback means removing the events; any room that has drawing events in its log would then fail to replay, so roll back only before drawings are used in production.
