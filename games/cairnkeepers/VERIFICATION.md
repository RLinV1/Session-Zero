# Cairnkeepers verification log

What was checked while building the game, and how (2026-11-10).

## Environment touched

- New files only: `games/cairnkeepers/` and `scripts/cairnkeepers/`. Nothing in `packages/`,
  `apps/` or `docs/` changed; there's no game mode, and Lanternfall's files are untouched.
  `setup-library.mjs` reuses `Seat` from `scripts/lanternfall/playtest-table.mjs`.
- A throwaway isolated server (`server-isolated-2`, :3201, in memory, dev account) for every
  check that changes a room. It was stopped afterwards, which removed everything on it.
- Temporary helpers (PDF page and text readers, the check scripts) in the session's scratchpad,
  not in the repo.

## Maps

`render-maps.mjs` builds each map's art, walls, ice, doors, terrain and fog from one layout.

| Map | Walls | Doors | Windows | Ice faces (locked windows) | Difficult | Blocked | Fog |
|---|---|---|---|---|---|---|---|
| The Switchbacks | 66 | — | — | — | 324 | 36 | 4 pine stands |
| Greywater Tarn | 15 | — | — | 18 | 455 | 26 | 1 pine stand |
| The Hospice of St. Brenn | 103 | 9 + 1 locked | 8 | — | 138 | 11 | — |
| The Ice Caves | 71 | — | — | 20 | 19 | 18 | 2 steam vents |

- Each layout was printed as text and read before drawing. Every area is reachable. The ice
  caves' den is reached only over the ice bridge, and the Switchbacks' gorge has a long way round
  as well as the bridge. Fixed along the way: a dead-end bridge into an ice wall, a chapel door
  that went round the locked door, a walled-in road exit, and boulders the trail had paved over.
- Each map was looked at as art, and as a check image with the rock walls, ice, doors, terrain and
  fog drawn over it. The walls follow the drawn rock, Difficult covers the deep snow and scree
  but not the trail, Blocked covers the gorge but not the bridge, and the fog sits on the pines.
- Three rounds of fixes to the drawing: ground edges warped by noise instead of squares, rock,
  crevasses and open water cut with rough outlines, ice drawn as one clear sheet instead of
  tiles, and pillars on the floor instead of on dark squares.

## Tokens

20 tokens rendered and looked at together on the token sheet. The ice-crawlers were redrawn
bolder after the first look.

## Rules, adventure and PDFs

- Every coordinate in `adventure.md` was checked against the layouts: each token stands on
  open ground of the kind the text says, and each temporary-terrain square is one that can
  change. Fixed: Kettle Varga stood on the long table, and the cave rockfall named ice squares.
- `render-sheets.mjs` carries Lanternfall's two renderer fixes (numbered lists that continue after
  a table; bold or italics that wrap onto the next line). The rulebook is 16 pages and the
  adventure 10. Neither has stray asterisks or repo paths in its text. The pregen sheets were
  looked at; overflowing gear and arts text was shortened.

## On the platform (throwaway server)

`setup-library.mjs` ran on the throwaway server. It made the four maps with their whole boards,
20 token art, 15 creatures and 4 encounter templates. It also made the room **Cairnkeepers · The
Winter Road** with 4 scenes, each with line of sight, its sight range (60, 30, 40, 30 ft) and its
token groups; every token is in a group. A second run changed nothing.

The first run grouped only one cairn per scene: the server numbers repeated token names. The
cairns are now numbered, and matching falls back to the name without its number.

A player joined the room through its invite, was given a Guide, and tried the rules:

| Check | Result |
|---|---|
| A move along the trail | accepted |
| A move into the gorge (Blocked) | refused: "That move is unavailable." |
| The ruler on the trail | 5 squares, 25 ft |
| The ruler through deep snow | 1 pine square + 2 deep snow = 25 ft, 2 squares Difficult |
| A token behind a boulder | not sent to the player: rock blocks sight |
| A token on the open trail | sent |
| A token in the pines (fog), seen from outside | not sent |
| On the tarn, a Rimehand behind the pressure ridge | sent: the player sees through the ice |
| A move through the ridge | refused |
| An **Avalanche** effect painted across the shore trail | the move through it refused; with the effect removed, the same move accepted |
| Switching to the tarn scene | its own 4 groups (Guides, Rimehands, Survivors, Board pieces) came with it |

## Checks

`npm run lint`, `npm run typecheck` and `npm test` pass (2,968 tests passed, 53 skipped).

## The test account (local dev server)

The dev server was stopped, so it was started the way `npm run dev:db` runs it. A new launch config
does this: `dev-db` in `.claude/launch.json`. The logs confirmed the Postgres event store, uploads on
local disk and no pending migrations.

`setup-library.mjs` then ran as test@test.com. It made the 4 maps with their whole boards, 20
token art, 15 creatures, 4 encounter templates and the room **Cairnkeepers · The Winter Road**. A
read of the room afterwards:

| Scene | Tokens | Grouped | Groups | Sight |
|---|---|---|---|---|
| 1 · The Switchbacks (live) | 14 | 14 | Guides 4, Board pieces 5, White-coats 4, Scree Goat 1 | 60 ft |
| 2 · Greywater Tarn | 16 | 16 | Guides 4, Rimehands 4, Survivors 3, Board pieces 5 | 30 ft |
| 3 · The Hospice of St. Brenn | 11 | 11 | Guides 4, Rimehands 3, Allies 1, Survivors 1, Board pieces 2 | 40 ft |
| 4 · The Ice Caves | 14 | 14 | Guides 4, Allies 1, Ice-crawlers 2, The Cairn-Taker 1, Board pieces 6 | 30 ft |

All four scenes have line of sight on.

Checked in the app, in the browser pane, signed in on 127.0.0.1:5173:

- The room opens on Scene 1, live, with the pines fogged.
- The scene switcher lists all four scenes.
- The **Terrain** filter shows deep snow and scree as Difficult, and the gorge as Blocked.
- The Tokens panel lists Scene 1's four groups.
- A private GM preview of Scene 4 showed the ice as locked windows, the Cairn-Taker and the
  cairns, and its groups. The view went back to the live scene; nothing was activated.
