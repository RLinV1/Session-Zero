# Design

## Context

`auto-wall-detection` added walls as GM-only room state, `wall.applyDetected`, `wall.remove` and `wall.clear`, the `WallsAdded` and `WallsRemoved` events (both reversible), and a BullMQ job whose Python worker chooses between a bright and a dark wall mask. The board's Fog tool already handles clicking out shapes and clicking regions to remove them. The Walls tool follows the same pattern.

## Decisions

### D1. One tool, three modes (moved to the map editor by `map-editor` D5)

The Walls tool sits on the rail beside Fog, GM only. Its modes are Draw, Erase and Detect like this, chosen with the same segmented control as the Fog modes. Keeping all wall work in one tool means the GM finds editing where they see the walls.

### D2. Drawing commits per segment

Each segment is sent as `wall.add { walls: [one] }` as soon as its second point is clicked, rather than as one batch at the end of a chain. Every segment is then its own undo step, and an abandoned chain loses nothing already drawn. The command still accepts up to 50 walls, for future tools such as a rectangle room. `decide` checks the GM role, length above zero, both ends on the map, and the room's 1500-wall cap.

Snapping: a point goes to an existing wall end within 12 screen pixels, else to the nearest grid corner. Alt places it freely. Grid-corner walls lie on cell edges, which the 10% footprint inset of ADR 0029 already leaves walkable on both sides.

### D3. Erase hit-test in screen pixels

A click removes the nearest wall within 10 screen pixels, so the tolerance stays the same at any zoom. It uses the existing `wall.remove`.

### D4. Sampled detection

- **Request:** `POST /wall-detection` accepts `{ sample?: Point }`. zod checks it is finite, and the route refuses a point outside the map with 400.
- **Job:** `WallDetections.start(…, sample)` adds `sample` to the job data. A sampled run replaces the map's previous result like any re-run.
- **Worker:** with `sample`, the worker skips the bright/dark choice. It takes the median Lab colour of a small disc around the point (radius about 0.15 cell) in the smoothed image, and keeps pixels within a fixed ΔE tolerance of it. The rest of the pipeline is unchanged: closing, straight runs, outline check, centreline tracing, cleanup.
- **Ink walls:** a sample in a dark ink wall gives the dark mask by colour instead of by top-hat. The outline check is relaxed there, since ink walls are their own outline.
- **Rejected:** a colour picker in the panel. Picking on the board, at map zoom, is where the GM can hit a wall a few pixels wide.

### D5. Where the sample click goes

The board has no REST credential. `Board` takes an `onDetectWalls(at)` callback from `RoomPage`, which holds the seat token and calls `api.walls.detect(roomId, token, at)`. The Walls panel learns of the new job from the existing `wallDetection` notice, because `start` announces "queued" to the room's GM.

## Risks / Trade-offs

- **A fixed colour tolerance** can be too loose on textured maps or too strict on gradients. The shape filters still apply, and a slider is a follow-up.
- **Per-segment commands** make a long chain many log entries. That is the price of per-segment undo.
