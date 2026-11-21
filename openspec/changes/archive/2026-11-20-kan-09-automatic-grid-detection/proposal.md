# Proposal

## Why

Manually measuring a battle map's printed squares slows room setup. Automatic detection can offer a starting alignment while leaving the GM in control of the saved and active grid.

## What Changes

- Analyze each newly uploaded map once in the background, for both library and direct room uploads. Token uploads and library placements do not start analysis.
- Show the candidate size, image-pixel offsets, and confidence only inside the relevant GM grid editor. Low-confidence candidates remain available with a warning; unavailable detection quietly leaves the manual editor available without failure notices or a retry button.
- Require Use suggestion followed by the existing Save grid or Apply grid action. Detection never changes room state or a saved library grid on its own.
- Persist private analysis status, recover queued work, and add a bounded Python/OpenCV vision service.

## Capabilities

### New Capabilities

- `grid-detection`: Upload analysis, private status, retry, suggestion review, and explicit application.

### Modified Capabilities

- `asset-library`: Preserve the default saved grid and explicit save and placement semantics while suggestions are pending or available.

## Impact

Shared HTTP contracts, Express upload and status routes, memory and Prisma stores, a BullMQ worker, private vision service, both React grid editors, local Compose, CI, and deployment documentation.
