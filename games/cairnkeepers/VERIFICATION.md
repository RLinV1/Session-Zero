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

## Ready for an AI build (2026-11-11)

Two AI builds of this folder (Session Zero's `/mcp/build`) left the same gaps. Every fact below was
copied from `scripts/cairnkeepers/setup-library.mjs` (`SCENES`, `GUIDES`, `PREGEN_TOKENS`,
`BOARD_PIECES`) or from `art/maps/*.board.json`; nothing new was decided. The script and the text
didn't disagree anywhere. Work was done on the branch `feat/cairnkeepers-build-ready`, in a worktree
off `origin/main`.

What changed:

- **adventure.md**
  - Each scene's *On the board* has a **Board setup** table. It has a row for every token the
    script places, in its order: the four Guides (Sela, Tor, Wren, Mira), the foes, the survivors
    by name, Brother Aldric, the numbered cairns, Warmth at (0, 0), and the Storm Clock at (1, 0),
    hidden. Columns are Token, Square, Hidden and Art. *Hidden* is the script's flag, and *no*
    where it has none.
  - Scene 4 now says the Guides come down the stairs at (1–2, 1) and stand at their foot,
    (1–2, 2–3), with Aldric beside them at (3, 2). These are the script's squares.
  - *Before you play* lists every opening by square, from board.json:
    - the Switchbacks has none;
    - Greywater Tarn has 18 and the Ice Caves 20, all ice (locked windows);
    - the Hospice has 10 doors and 8 windows, all closed except the chapel door (21, 4), which is
      locked.

    It also says how to read the board-setup tables.
- **Warmth is 12/12** in step 5, because the pregens' party has a Hauler (rules §7, Packhorse). The
  bestiary's board-piece table and `setup-library.mjs` now say 12 too; the script said 10.
  - Rules §7 still gives 10 as the base and 12 with a Hauler, as before.
- **bestiary.md** board pieces gained a Guard (AC) column, plus a line saying plainly that:
  - a cairn has no HP and no Guard;
  - Warmth and the Storm Clock have no Guard.
- **pregens.json**: each Guide has `"size": 1` and `"art"` from the script's `PREGEN_TOKENS`:
  `pathfinder-a`, `hauler-a`, `hunter-b`, `stonespeaker-b`.
  - The sheet's *On the table* card (`sheet.html`, filled by `render-sheets.mjs`) gained **Size**
    and **Token art** boxes, and `fillSheet` fills them.
- The PDFs were regenerated with `node scripts/cairnkeepers/render-sheets.mjs`:
  - the rulebook is 16 pages;
  - the adventure went from 10 to 12 pages;
  - the sheet and pregens are 2 pages each.

  Maps and tokens weren't re-rendered.

How it was checked:

- **A check script in the scratchpad (187 checks, 0 failed)** compared the text against its
  sources, not by eye. It evaluated the script's own tables from its source, and read the
  bestiary's *Token art* rows through `names.mjs`.
  - Every board-setup row (name, square, hidden, art, in order) matched what the script places.
  - The survivors' prose names were paired with the script's squares, and so were Scene 4's
    arrival squares.
  - Every hospice door and window square was checked against board.json by kind. The only locked
    opening is (21, 4).
  - The Tarn has 18 and the Caves 20 openings, all locked windows; the Switchbacks has none.
  - The named doors match Scene 3's text.
  - The pregens' art and size were checked, and so was Warmth 12 in all three places.
  - The bestiary's board-piece HP, Guard and Hidden cells were checked against `BOARD_PIECES`.
- **Mutation test.** A copy with three planted errors failed exactly those three checks: a moved
  White-coat, a moved hospice door, and Hesk shown as not hidden.
- **PDF text**, read with PDFKit:
  - no line in any of the 7 PDFs has an asterisk;
  - no line has a repo path (`scripts/`, `games/`, `art/`, `/Users/`, `.md`, `.board.json`, URLs);
  - every board-setup row, the openings list, Warmth 12/12, the bestiary's new line and each
    pregen's art are all in the PDFs.

  The only script name in any PDF is the existing mention of `setup-library.mjs` in the
  adventure's step 2, a file name rather than a path.
- **Pages read**:
  - the adventure's *Before you play* page and its scene tables, which split cleanly across pages
    with the header repeated;
  - the bestiary's board-piece page;
  - a pregen sheet, whose card shows Size 1 and the token art and still fits.
- `npm run lint`, `npm run typecheck` and `npm test` pass on the branch: 3,630 tests passed and 54
  were skipped.

Not changed: the test account. Its library and room were made before this, so its Warmth creature
and templates are still 10/10. Re-running `setup-library.mjs` leaves things that already exist as
they are. No AI build was run.
