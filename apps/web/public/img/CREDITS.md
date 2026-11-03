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

**Not recorded:** which image tool made them and the exact prompts. The proposal says the sources
are in `assets/default-maps/`, but that folder was never committed. Whoever made them should add
the tool and prompts here, as `home/CREDITS.md` and `preview/CREDITS.md` do.

The crypt is the project's own work: its floor, walls, pillars and doors are drawn in a headless
browser from the script's `LAYOUT`, with no source image.
