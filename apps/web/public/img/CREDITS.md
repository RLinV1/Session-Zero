# Built-in maps

The four maps that ship with the app (`packages/shared/src/shippedMaps.ts`), seeded into every
GM's library and also cut for the home page's library shelf.

| File | Map | Origin |
| --- | --- | --- |
| `hero-map.webp` | The Broken Span | AI-generated for this project (`038b6d54`, top-down-default-maps) |
| `map-ice.webp` | Hollowfrost Keep | AI-generated for this project (`038b6d54`, top-down-default-maps) |
| `map-jungle.webp` | Temple of the Green Sun | AI-generated for this project (`038b6d54`, top-down-default-maps) |
| `map-crypt.webp` | Sunken Crypt | Drawn by code: `apps/web/scripts/renderCryptMap.mjs` renders it from the same layout as its walls (`3f085415`, shipped-maps-line-of-sight) |

The three generated maps replaced earlier angled maps in place, keeping their file names. The
proposal (`openspec/changes/archive/2026-09-25-top-down-default-maps/proposal.md`) asked for maps
viewed from directly overhead, with no creatures or creature-shaped statues, at about 70 px per
square. These are generated illustrations, not works attributed to a human artist, and no
third-party map art is included.

**What is known:** the three generated maps are AI-generated illustrations made for this project (generation ids and the OpenSpec change above). The image tool and exact prompts were not recorded, and the proposal's `assets/default-maps/` folder was never committed.

The crypt is the project's own work: its floor, walls, pillars and doors are drawn in a headless
browser from the script's `LAYOUT`, with no source image.

## Takedown safety

Every image the app ships was either generated for this project or drawn by code in this repository. None is taken from a third party, a stock site or a game, and none is hotlinked at runtime. Each folder's `CREDITS.md` records how its images were made.
