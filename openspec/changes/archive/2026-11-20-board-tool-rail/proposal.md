## Why

On the board, a player can only drag their own tokens and double-click to ping. There is nothing to reach for when they want to check a distance, sketch a plan, or see what a spell's area would cover, which are the first things players do at a table. This change adds a small tool rail on the side of the board with those tools, as a working local shell that the full tactical stories build on. Tracked as KAN-69.

The full versions are already separate stories and stay there: movement budget ruler (KAN-32, FR-TAC-03), shared drawing overlays (KAN-33, FR-TAC-04), synced AoE templates (KAN-35, FR-TAC-06), and the ephemeral channel that would carry them to other players (KAN-39, FR-SYNC-03). This change gives those stories a place to live in the UI and a first local version of each tool.

## What Changes

- A vertical **tool rail** on the left side of the board, shown to players and the GM, on desktop and phone widths. One tool is active at a time:
  - **Select** (default): the board behaves exactly as it does today.
  - **Measure**: drag from one point to another. A line and a label show the distance in the room's grid units (for example `25 ft`). Points snap to cell centres; hold Alt to measure freely.
  - **Draw**: a freehand brush (the default), or a line, rectangle, or circle dragged out on the map, in one of a few colours. FR-TAC-04 leaves freehand out of the shared overlays; these marks are local-only, and the brush was asked for directly.
  - **Area**: circle, cone, or box. Press to set the origin, then drag to size and aim it, with the size shown beside the pointer (snapped to whole cells). A click without a drag places a preset size.
  - **Eraser**: click or drag over marks to remove just those.
  - **Clear all**: removes every mark the viewer has made.
- Measure, Draw, Area, and Eraser each show their own cursor over the board (ruler, brush, area ring, eraser).
- While a tool other than Select is active, a left-button or one-finger drag uses the tool instead of panning or moving a token. Other mouse buttons still pan, two fingers still pinch and pan, the wheel still zooms, double-click still pings. Escape returns to Select.
- **All marks are local to the viewer.** Nobody else sees them, they are gone on reload, and they are never sent to the server. They are drawn in board coordinates, so they stay on the map under pan and zoom.
- The board hint line under the map describes the active tool.

## Non-goals

- Showing marks to other players, live or persisted (KAN-33, KAN-35, KAN-39).
- Movement budget thresholds, configurable diagonal rules, or measuring a token's drag path (KAN-32).
- GM-only marks, undo, editing or moving a placed mark, lines as an area shape.
- Any change to `packages/shared` schemas, the server, or the event log.

## Capabilities

### New Capabilities
- `board-tools`: the board's tool rail and the local Measure, Draw, Area, and Eraser tools and Clear all: how each is used, how distances and sizes are expressed in grid units, and the guarantee that marks stay on the viewer's own client.

### Modified Capabilities
- None. Select mode keeps today's board behaviour unchanged, and the existing `client-render-performance` requirement (draw only when the picture changes) applies to marks as written.

## Impact

- `apps/web/src/board/boardView.ts`: active tool state, pointer routing by tool, a marks layer above tokens.
- `apps/web/src/board/tools.ts` (new): pure geometry for distances, snapping, and area shapes, with unit tests in `apps/web/test`.
- `apps/web/src/board/Board.tsx` and a new `apps/web/src/ui/ToolRail.tsx`: the rail, its options (shape, colour, size), and the per-tool hint.
- `apps/web/src/styles.css`: rail styles, including phone widths.
- Tool cursors are inline SVG data URLs in `boardView.ts`; no new assets or dependencies.
- No server, shared contract, persistence, or protocol change, so no ADR is needed.
