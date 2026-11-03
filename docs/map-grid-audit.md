# Shipped-map grid audit and compact demo maps

## Original art calibration (2026-11-02)

All four original WebP files were inspected at their natural dimensions and with square-grid and
stored-wall overlays. The artwork, image dimensions, URLs and traced wall coordinates are unchanged.
Floor seam centers were measured in clear floor strips, using a grayscale dark-line profile
(two pixels either side minus the center), then checked visually against the paving. Column and
row indices are counted from the catalog grid origin. Representative full-resolution anchors:

| Map | Vertical seams (column: x px) | Horizontal seams (row: y px) |
| --- | --- | --- |
| Broken Span | 6:432, 7:501, 8:571, 9:641, 10:710, 11:780; 37:2594, 38:2663, 39:2733, 40:2803 | 10:714, 11:784, 12:853, 13:926, 14:997, 15:1069, 16:1143, 17:1214 |
| Hollowfrost | 28:2025, 29:2095, 30:2163, 31:2232, 32:2301, 33:2370 | 6:462, 7:533, 8:603, 9:674, 10:744, 11:815, 12:886, 13:957, 14:1028, 15:1099, 16:1170, 17:1241 |
| Green Sun | 6:442, 7:511, 8:580 | 6:453, 7:523, 8:594, 9:666, 10:737, 11:808, 12:878, 13:949, 14:1020, 15:1090 |
| Sunken Crypt | Procedural: every vertical tile edge is a multiple of 70 | Procedural: every horizontal tile edge is a multiple of 70 |

| Map | Previous cell / offset X / offset Y | Reviewed grid | RMS seam error before → after |
| --- | --- | --- | --- |
| Broken Span | 69.4 / 10 / 31 | 70 / 8 / 18 | 9.81 → 3.84 px |
| Hollowfrost Keep | 70 / 47 / 46 | 70.3 / 54 / 43 | 9.40 → 2.09 px |
| Temple of the Green Sun | 70 / 21 / 36 | unchanged | Existing grid follows sampled seams; no clear correction warranted |
| Sunken Crypt | 70 / 0 / 0 | unchanged | Exact by construction |

The three illustrated maps have local variations and slightly rectangular paving. `GridSpec` is a
square grid, so these are calibrated square approximations. They do not promise that every drawn
seam aligns everywhere. Tests retain the measured anchors and require at least a 50% reduction in
RMS error for the two corrections. The thumbnail-generation calibration table uses the same values.

During the existing per-owner seeding transaction, only complete known old factory grids on
matching shipped object keys, URLs and dimensions are corrected. Custom grids (including line
styling), row IDs, names, saved boards and deletions are preserved. Live room grids and event
history are unchanged; reapply the library grid or calibrate in the editor for existing rooms.
New catalog slugs seed into existing accounts once. No database migration is needed.

## Original compact maps

- **Emberwatch Archive**: copper-lit reading hall, bookcases, pillared archive and locked vault;
  a narrow southern loop offers a second approach. 58 stored sight segments.
- **Moonwater Baths**: teal stone pools, glazed windows, pillars and a private southern gallery;
  two doors connect the main chambers. 56 stored sight segments.

Both are 28 × 20 squares at exactly 70 px (1960 × 1400). Each has four doors, including one locked
door, and four transparent windows. Pool surfaces and decoration do not block sight; pillars and
stone room boundaries do. Lamps are painted scenery; they do not add lighting state to a room.

`apps/web/scripts/renderCompactMaps.mjs` deterministically generates each map, its 640 px thumbnail,
and `packages/shared/src/shippedWalls/{slug}.ts` from the same layout. Walls and portals are drawn
from the actual stored sight segments. No external imagery, downloads or new dependencies.

Regenerate with `npm run render:compact -w @vtt/web`. Review PNG wall overlays are written under
`apps/web/scripts/out/` (ignored). Pink is an opaque wall; cyan is a door or window. Regenerate and
commit all four WebPs and both wall files together when changing a layout. The layout's windows
name exact boundary edges, while a door lies across the center of its one-cell passage.

Regression checks cover exact grid coordinates, bounded wall geometry, portal parsing, seeing
through an opened door and a window, blocking sight through a closed door, all six library
thumbnails, concurrent upgrade seeding, and preserving existing user edits/deletions. PostgreSQL
seeding variants require `DATABASE_URL`; memory-store variants work without external services.
