## Why

Automatic wall detection now uses a learned model (`learned-wall-detection`). About 40% of maps pass 90% recall and precision, so the GM must review most results. Today every detected wall looks the same in the preview, so the GM has to inspect all of them to find the few wrong ones.

## What Changes

- The vision worker reports a per-wall **confidence** (0 to 1): the mean model probability along the traced segment. Only the learned model produces it; other pipelines omit it.
- `DetectedWall` gains an optional `confidence`. It is backward compatible: a result without it parses and behaves as before. Recorded as a new ADR (`0038`) amending ADR 0029, for review by the Real-Time Architecture owner.
- The Walls step preview draws **doubtful** walls (confidence below `DOUBTFUL_WALL_CONFIDENCE`, 0.6) amber and dashed, with a legend and a count.
- A **Review doubtful walls** step cycles through the doubtful walls one by one: the canvas highlights the current wall, and the GM keeps it or erases it.
- An **Apply confident walls only** button next to Apply leaves out every doubtful wall (and anything already erased).
- No new command or event. "Confident only" is sent as the existing `wall.applyDetected` `exclude.indices`. Applied walls carry no confidence.

## Capabilities

### New Capabilities
- `wall-review`: flagging doubtful detected walls and reviewing them before apply.

### Modified Capabilities
- None. `wall-detection` is not in `openspec/specs` yet; this adds an optional field to its result.

## Impact

- `packages/shared`: `wallDetection.ts` (`confidence`, threshold constant, helper), unit tests.
- `services/vision`: `walls.py` (`detect_model` confidence only), pytest.
- `apps/web`: `WallSetup.tsx`, `WallCanvas.tsx`, styles, component tests.
- `apps/server`: no code change; integration test that confidence survives validation and `GET detected`.
- `docs/adr/0038-wall-confidence.md`.
