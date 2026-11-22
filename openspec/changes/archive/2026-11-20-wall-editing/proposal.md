## Why

Automatic wall detection (`auto-wall-detection`) gets some walls wrong on painted maps. It finds snowy cliff ridges, misses walls about as bright as the floor, and skips diagonals. Today the GM can only take every detected wall or clear them all, which makes one bad segment a reason to throw the whole result away. Both tools named as prior art in DESIGN.md §7 solve this the same way: the GM shows the detector which colour the walls are, and edits walls by hand. FR-GM-09 asks for editable walls.

## What Changes

- **Wall tools** (GM only), with three modes. First built on the board's tool rail; moved into the full-screen map editor's Walls step by `map-editor`:
  - **Draw:** click points to chain wall segments. Ends snap to grid corners, or to an existing wall's end; hold Alt to place freely. Esc, right-click or Enter ends the chain.
  - **Erase:** click a wall to remove it.
  - **Detect like this:** click on a wall in the map image. Detection then looks for walls of that colour and shape across the map, and the result arrives in the Walls panel for review, as detection does today.
- **New command:** `wall.add { walls }` (GM only, at most 50 per command), committed as the existing `WallsAdded` event, so it is undoable and GM-only like detected walls.
- **Sampled detection:** `POST /api/rooms/:roomId/wall-detection` accepts an optional `sample` point in board coordinates. The job carries it to the vision worker, which builds its wall mask from the colour around that point instead of guessing between bright and dark walls.
- **Contract change:** a new command, and an optional field on the detection request and the job. Recorded as an amendment to ADR 0029.

## Non-goals

- Moving or reshaping an existing wall. Erase it and draw it again.
- Doors and windows (FR-GM-18).
- A tunable colour tolerance. The worker uses one fixed tolerance; a slider is a follow-up if needed.

## Capabilities

### New Capabilities
- `wall-editing`: drawing and erasing walls by hand, and guiding detection with a sampled wall.

### Modified Capabilities
- None in `openspec/specs`. `auto-wall-detection` is not archived yet; this change builds on its `map-walls` and `wall-detection` behaviour without changing it.

## Impact

- `packages/shared`: `commands.ts` (`wall.add`), `decide.ts`, `wallDetection.ts` (`WallDetectionRequest`), plus unit tests.
- `apps/server`: the detection route reads `sample`; `WallDetections.start` passes it in the job data; integration tests.
- `services/vision`: `walls.py` gains a sampled-colour mask; `wall_worker.py` reads `sample`; pytest.
- `apps/web`: `tools.ts` (Walls tool and its modes), `ToolRail.tsx`, `boardView.ts` (chain drawing, wall hit-testing, sample click), `Board.tsx` and `RoomPage.tsx` wiring, `api.walls.detect(sample)`, and hint text in the Walls panel.
- `docs/adr/0029-walls-and-wall-detection.md` amendment, `docs/WALL-DETECTION.md`.
