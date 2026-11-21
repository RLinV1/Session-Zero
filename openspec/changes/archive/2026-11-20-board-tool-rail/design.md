## Context

See proposal.md for why. The board is split in two, per the project rule that React never touches Pixi objects:

- `Board.tsx` (React) owns the toolbar, notices, and hint line, and creates one `BoardView`.
- `BoardView` (Pixi) owns the canvas. Its layers are `mapSprite`, `grid`, `tokenLayer`, `fxLayer` inside a `world` container whose transform is the viewer's pan and zoom. Input goes through stage pointer events (`onBackgroundDown`, `onTokenDown`, `onPointerMove`, `onPointerUp`), plus DOM listeners for wheel, double-click, and two-finger touch.
- Rendering is on demand (`client-render-performance`): anything that changes the picture calls `invalidate()`.
- `GridSpec` already carries `cellSize`, `offsetX/Y`, `unitsPerCell`, and `unitLabel`, whose doc comment says "Used by rulers/AoE later". `snapTokenCenter` in shared snaps a footprint to cells.

Nothing in this change crosses the wire, so invariants 1–6 are untouched. Invariant 8 (board coordinates) governs how marks are stored.

## Goals / Non-Goals

**Goals:**
- A tool API on `BoardView` narrow enough that KAN-32/33/35 can later add syncing without reshaping it.
- Pure, unit-tested geometry for distance and area shapes.

**Non-Goals:**
- A mark model that is ready to be a shared schema. Marks here are a local view type. When KAN-33/35 make them persistent, the zod schema they add in `packages/shared` becomes the source and this type follows it.

## Decisions

### 1. React owns tool choice; `BoardView` owns marks
`Board.tsx` holds the active tool and its options (draw shape and colour, area shape and size) in React state, renders `ToolRail`, and pushes the choice to the view with `view.setTool(tool)`. `BoardView` holds the marks, the in-progress gesture, and all drawing. React never sees a mark, and Pixi never renders a button.

*Alternative:* keep the marks in React and pass them down on every change. Rejected. Marks change on every pointer move while dragging, and routing that through React re-renders for no benefit.

Clear all is `view.clearMarks()`. Escape is handled in `Board.tsx` with a `window` keydown listener. It ignores events from inputs, textareas, selects, and contenteditable elements, so typing in the dice box or a token name never changes the tool. It also ignores Escape while a `<dialog>` is open, because that Escape belongs to the dialog.

### 2. Tool type
```ts
type BoardTool =
  | { kind: "select" }
  | { kind: "measure" }
  | { kind: "draw"; shape: "brush" | "line" | "rect" | "circle"; color: number }
  | { kind: "area"; shape: "circle" | "cone" | "box"; size: number /* grid units: the size for a click */ }
  | { kind: "erase" };
```
Area size is stored in grid units rather than cells so the picker reads naturally ("20 ft"). It is converted with `unitsPerCell` when the shape is drawn, so a later grid change resizes existing areas consistently.

### 3. Pointer routing
- `onTokenDown`: if the tool is not Select, return without `stopPropagation`. The event then bubbles to the stage, so a measurement can start on a token. Token containers keep their `eventMode`, so hover cursors still work in Select.
- `onBackgroundDown`: if the tool is not Select and `e.button === 0`, start a tool gesture `{ start: Point, current: Point, alt: boolean }` in board coordinates. Otherwise, pan as today. Today's code pans on any button, so right- and middle-drag panning already works and stays.
- `onPointerMove` / `onPointerUp`: an active gesture takes precedence over drag and pan. It updates `current`, redraws the preview, and on release commits the mark.
- Two-finger touch start already cancels drag and pan. It will also cancel a tool gesture, so a pinch never leaves half a drawing behind.
- Wheel and double-click are unchanged in every tool.

### 4. Marks layer and drawing
A new `markLayer` container sits between `tokenLayer` and `fxLayer`, so marks draw over tokens and pings draw over marks. Each mark is one `Graphics`. The in-progress preview is one reused `Graphics`. Stroke widths are divided by `world.scale.x` so lines stay readable at any zoom. Marks are redrawn when the zoom changes (wheel or pinch) and when the grid changes, because areas depend on `cellSize`. There are few marks, so redrawing all of them is cheap and keeps the code simple.

The measure label is a Pixi `Text` in the marks layer, counter-scaled by `1 / world.scale.x` so it stays a constant size on screen.

Marks are capped at 100. The oldest is dropped past that, so a long session cannot grow the scene without bound.

### 5. Geometry in `board/tools.ts` (pure)
- `snapToCellCenter(p, grid)` and `snapToIntersection(p, grid)`, both honouring `offsetX/Y`.
- `measure(a, b, grid, free)` → `{ from, to, cells, label }`. Snapped: Chebyshev distance in cells (`max(|dx|, |dy|)`, which is 5e's default diagonal rule). Free: Euclidean length / `cellSize`, rounded to 0.1. The label uses `unitsPerCell` and `unitLabel`, with trailing `.0` trimmed.
- `areaShape(shape, origin, toward, sizeUnits, grid)` → circle `{ center, radius }` or polygon points. A cone is an isosceles triangle with length L and far-edge width L (about 53°, as in 5e). A box is a square of side L centred on the origin, rotated by the aim angle. With no aim (zero-length drag) the angle defaults to 0, pointing right.

Everything is in board coordinates, which keeps it testable with no Pixi and meets invariant 8.

*Alternative for the diagonal rule:* Euclidean or 5-10-5. Deferred to KAN-32, which asks for configurable diagonals. Chebyshev is the rule most tables expect from a first-cut ruler.

### 6. Rail UI
`ui/ToolRail.tsx` is a `role="toolbar"` with `aria-orientation="vertical"`. It contains five tool buttons with `aria-pressed`, then Clear all. The buttons show icons only, with the tool's name as the accessible name and tooltip, at every width. The icons are Phosphor icons, which the room page already uses, so there is no new dependency. The options for the active tool (shape segmented control, colour swatches or size select) sit in a small flyout beside the rail while Draw or Area is active, so the rail itself stays narrow. The rail is on the left edge, directly under the existing top-left toolbar. Below 640px wide its targets grow to 40px. It reuses the `.tool-button` look, has no backdrop filter (per `client-render-performance`), and sets `user-select: none` so a drag that starts on it doesn't select the toolbar's text. The wrapper around the rail and its flyout sets `pointer-events: none` (its children set `auto`), because its box is larger than the rail and was swallowing drags that started on the board beside it.

### 7. Brush, drag-to-size areas, eraser, cursors

- **Brush** strokes are their own mark kind, `{ kind: "stroke", color, points }`. A point is added once the pointer has moved 2 screen pixels, capped at 2000 points per stroke.
- **Area size from a drag** is the distance from the (snapped) origin to the pointer, so the pointer sits on the far edge. It snaps to whole cells, at least one, unless Alt is held (`areaSizeFromDrag`). The box now starts at the origin and extends toward the pointer, like a 5e cube, so dragging reads the same for all three shapes. A click keeps the preset size, which is why the size select stays.
- **Eraser** hit-tests each mark with `hitMark`: within 12 screen pixels of a line, stroke, or measurement, or on or inside a rectangle, circle, or area. It runs on press and on every move, so a drag sweeps.
- **Cursors** are small inline SVGs as data URLs, with hotspots at the point the tool acts on. They are set on the stage and on tokens while a tool is active. The rail's own button icons stay the standard Phosphor set.

Area sizes offered: 5, 10, 15, 20, 30, 40, 60 in the grid's units. This is the common 5e set. It is scaled by nothing else, so on a non-foot grid the numbers are still read as grid units.

## Risks / Trade-offs

- [A player expects others to see their drawing] → The hint line in Draw and Area says "Only you can see these marks". The KAN-33/35 stories remove the caveat.
- [Tool gestures conflict with one-finger pan on phones] → In a non-Select tool, one finger operates the tool and two fingers pan. That matches drawing apps, and Escape or the Select button returns to one-finger pan.
- [Coupling to board internals that Antonio owns (KAN-32/33/35)] → The change is additive: a new layer, a tool gate at the start of each handler, and geometry in its own file. Select-mode paths are left as they are, so Antonio's work can extend the tool API instead of replacing it.
- [Frame cost on many marks] → The 100-mark cap, and redraws happen only on gesture, zoom, or grid change.

## Migration Plan

Web-only and additive. There is nothing to migrate, and rollback is a revert.
