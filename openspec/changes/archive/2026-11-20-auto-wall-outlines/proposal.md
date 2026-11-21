## Why

The wall detector looks for raised stone: bands lighter or darker than their surroundings, kept only as long horizontal and vertical runs. That works on painted maps, but many battle maps are drawn in ink, with buildings, caves and rooms outlined in a dark line. On those it finds little or the wrong things: one wall on a cave map, furniture instead of room walls in a mansion, and no diagonal walls at all. The GM asked to use ThreeHats/auto-wall (MIT), whose colour and edge contour pipeline is made for exactly these maps.

Measured on six maps (three bundled painted maps, auto-wall's cave sample, and two ink-drawn town and mansion maps), neither detector wins everywhere: the current one is better on the painted maps, auto-wall's on the inked ones.

## What Changes

- **A new wall style, "Inked outlines"** (`style: "outlined"`), alongside Light stone and Dark ink. It runs auto-wall's pipeline, adapted in `services/vision/outlines.py`: colour and edge presets, hatching removal, contour merging, contours to segments, then the existing cleanup (snapping, welding, the wall cap). It follows diagonal and curved walls.
- **Automatic detection falls back to it** when the stone search finds less than 20 cells of wall and the outlines find at least four times as much, so a cave map gets walls without the GM choosing a style while a sparse stone map keeps its few walls. Elsewhere automatic detection is unchanged.
- **MIT attribution** in `services/vision/THIRD_PARTY_NOTICES.md`, shipped in the vision image.

## Non-goals

- No change to sampled detection ("Detect like this"), which keeps its colour search.
- Strictness does not apply to the outline style; the shortest-wall filter does.

## Capabilities

### Modified Capabilities
- `wall-detection` (from `auto-wall-detection`): a third wall style, and an automatic fallback.

## Impact

- `packages/shared`: `WallStyle` gains `"outlined"` (ADR 0029 amendment).
- `services/vision`: new `outlines.py` and `THIRD_PARTY_NOTICES.md`; `walls.py` routes the style and the fallback; `wall_worker.py` accepts the style; Dockerfile copies both files; tests in `test_walls.py` and `test_wall_worker.py`.
- `apps/web`: the Walls step's wall colour menu offers "Inked outlines (buildings, caves)".
