## Context

`walls.py` finds walls with morphological top-hats and keeps long axis-aligned runs whose edges follow an outline. An earlier attempt replaced it wholesale with a port of ThreeHats/auto-wall; it was never finished, and by then `walls.py` had gained sliders, automatic strictness and a wall colour choice.

## Evaluation

Both detectors on the same maps, at the room's grid size where known (walls found):

| Map | Kind | Current | auto-wall port | Better |
|---|---|---|---|---|
| The Broken Span | painted stone | 122 | 87 | current: traces the walls; the port misses many |
| Hollowfrost Keep | painted stone | 81 | 57 | current: more complete |
| Temple of the Green Sun | painted stone | 51 | 35 | current: the port adds lines across the plaza |
| Cavern Pit (auto-wall's sample) | inked cave | 1 | 164 | port: the whole cave outline |
| Hobblestone | inked town | 100 | 104 | port: clean building outlines; current marks trees and the shore |
| Mansion | inked rooms | 74 | 137 | port: room walls; current mostly furniture |

## Decisions

### D1. Add, don't replace
The port becomes a second pipeline in `outlines.py`, chosen by style, rather than replacing `walls.py`. Each keeps the maps it is better at. `outlines.py` imports the helpers the two share unchanged (`_axis_snap`, `_weld`, `_merge_collinear`, `_drop_stairs`, `_working_cell` and others) instead of copying them, and keeps auto-wall's own contour, scoring and preset code. Its output was checked identical to the original port's on four maps.

### D2. A style, plus a narrow automatic fallback
`style: "outlined"` runs the outline pipeline. With no style, the stone search runs as before; only when it finds under 20 cells of wall does the outline pipeline run, and its result is used only if it finds at least four times as much wall. The bundled Broken Span crop shows why: its stone search finds 15 cells of real wall and the outlines 48 cells of shadow edges, so it keeps the stone walls. On the three bundled maps the stone search finds 92 to 237 cells, so they are unaffected; the cave sample (under 3 cells) falls back. A broader automatic choice was tried in evaluation (keep whichever finds more wall) and picked wrongly on the town map, so it is not used: the GM picks "Inked outlines" there.

### D3. Attribution travels with the code
`THIRD_PARTY_NOTICES.md` holds auto-wall's MIT licence and the functions adapted; `outlines.py` names them in its header; the Dockerfile copies both into the vision image.

### D4. An unaligned grid doesn't blur the outlines away
When walls are first detected, a room's grid is often still the default or a misread one (the grid detector reads 205 px on the cave sample, whose squares are 34 px), and a cell that large leaves nothing. `detect_outlines` runs with the given cell and with one estimated from the image, and keeps the better score. On the cave sample that is 235 walls instead of 0; the town map keeps its given cell.

## Risks

- [Fallback threshold] A map whose stone search finds a little real wall, and whose outlines find four times as much, switches to outlines. The GM can still pick Light stone or Dark ink.

- [Speed] The outline presets take up to about 7 s on a large painted map; that only happens when the GM picks the style there.
