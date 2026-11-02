# Verification log: product-design-language

A trace of every test step taken while applying this change: what was touched, what was run, what it showed, and what was fixed because of it.

## Environment

- **Servers.** The isolated pair from `.claude/launch.json`: `server-isolated` on :3101 (in-memory store, `SEED_DEV_ACCOUNT=1`) and `web-isolated` on :5273. The user's own dev servers on :3001 and :5173 were never touched.
- **Account.** The seeded dev account `t@gmail.com` (from `apps/server/src/identity/devAccount.ts`); no other account was created. The in-memory store discards everything on restart, so nothing persists.
- **Rooms.** Before apply started, the design audit opened one room, "Style audit", on an earlier run of the isolated server. It was lost when that server stopped.
- **Screenshot tooling.** Two scripts kept outside the repo, in the session scratchpad:
  - `capture.mjs` drives the repo's Playwright Chromium with reduced motion emulated, so captures are settled and deterministic. It takes full-page shots of the given routes at 1440×900 and 390×844, sets the theme choice in `localStorage`, and signs in with the dev account when `LOGIN=1`.
  - `diff.mjs` compares same-named PNGs pixel by pixel with `sharp`, counting a pixel as changed when its RGB channels differ by more than 6 in total.
- **Determinism check.** Two captures of the unchanged home page differed by 0.000% in all four shots.

## Baseline (before any change, commit 7d25cfa)

- Home: dark and light, 1440 and 390.
- Entry (`/signin`, `/signup`, `/nope`): dark, 1440 and 390.
- Hub (`/gm-dashboard`, `/library`, signed in): dark, 1440 and 390.

## 1.1 Tokens on `:root`

- **Change.** Moved every shared token out of `.home-page` into `:root`: fonts, mono, the two radii, spacing 32/48/64, easing and durations, control border, hover, rule, and the ambient lighting values. The light palette moved from `:root[data-theme="light"] .home-page` to `:root[data-theme="light"]`.
- **Home page.** Diffed against the baseline at 0.000% in all four shots (dark and light, 1440 and 390).
- **Entry pages.** 0.000% changed.
- **Hub pages.** The dashboard changed 0.000%. The library changed 0.134% at 1440 and 0.230% at 390: the icon buttons on its map cards now show their border.
  - **Cause.** `.icon-button` is a global rule that read `var(--control-border)` and `var(--hover)`, which were only defined inside `.home-page`, so outside the home page the declaration was invalid and drew no border. That is the audit's "icon buttons `border: 0px none`" finding, now fixed everywhere as a side effect.
  - **Accepted.** The change is intended.

## 1.2 Theme and layer by route

- **Web test.** `routeTheme.test.tsx` covers five cases:
  - every route maps to its layer
  - a stored light choice gives `/gm-dashboard` `data-theme="light"` and `data-layer="hub"`
  - a room is dark, and returning to the dashboard is light again
  - a throwing `localStorage.getItem` falls back to the system preference (light in the test)
  - `applyStoredLayer` sets both attributes before any render

  All pass, and the existing `appLoading.test.tsx` still passes.
- **Runtime check** (built-in browser, :5273, signed in as the dev account, `vtt.theme=light`):
  - `/gm-dashboard` → `data-layer="hub"`, `data-theme="light"`
  - created room "Theme check" → `/r/370a8c3f-…` reports `table`, `dark`, body background `rgb(18, 20, 23)`
  - Back → `/gm-dashboard` reports `hub`, `light` again
- **Home page.** Diffed 0.000% against the baseline in all four shots.
- **Entry and hub pages in light.** Captured once: they render correctly on light tokens. Sign-in is still in Alegreya until group 2.

## 1.3 One reduced-motion switch

- **Web test.** `motionAttribute.test.ts` covers three cases:
  - the in-app setting flips `data-motion` on and off
  - a system preference change flips it on and off
  - the stop function ends syncing

  All pass.
- **Runtime check.** Headless Playwright script `motion-check.mjs` against :5273. It signs in as the dev account, creates the room "Motion check", rolls 1d20 from the Dice tab, and samples `document.getAnimations()` every 20ms for 2.5s:
  - Reduced animations **off**, `data-motion` none: saw the Die3D Web Animation, `roll-card` and `roll-total-in`.
  - Reduced animations **on**, `data-motion="reduced"`: saw no animations.
- **Why headless.** The same check in the built-in browser saw nothing even with motion on. That pane runs as a background page, so its animations don't advance and the sampler can't prove anything there. Headless Playwright has no such throttling.
- **Related fix.** Three script paths checked only the system query; they now use `motionReduced()`:
  - the nuke screen shake in the animation preview
  - the map editor's player-fog drift
  - the room's wait for the sidebar transition

## 1.4 Board colours from the tokens

- **Unit test.** `palette.test.ts` covers five cases:
  - colour parsing of `#rgb`, `#rrggbb`, `rgb()` and `rgba()`
  - rejection of unreadable values
  - reading `:root` with a fallback per missing property
  - thresholds at exactly 0.5 and 0.25
  - a 20% token in the danger colour on the board and in the DOM

  All pass.
- **Runtime check.** Headless script `hp-check.mjs` signs in, creates the room "HP check", and adds "Goblin" at 4/20 HP (20%) in the middle of the board:
  - The roster bar is `data-level="critical"` with background `rgb(224, 104, 92)` (`--danger`).
  - The board bar's pixels match `#e0685c`, and none match the old `#dc2626`. A crop of the capture confirms a short red bar over the token.
- **Script fix.** The script's first two runs placed no token, because Escape cancelled placement before the click registered. A 1s wait between the click and Escape fixed it.

## 1.5 Docs

- **INTERFACE.md §11.9.** The token table gains `--control-border`, `--hover`, `--rule`, `--ground` and the board-palette note. New sections cover the light theme and layers (with the light value table), the corner and spacing scale, and the motion tokens and single reduced-motion switch. The font block now carries the real `:root` values.
- **FRONTEND-CONTRACT §13.8.** Records the light theme scope outside the table, and that the in-app Reduced animations setting counts the same as the system preference.
- **Check.** A script compared all 31 documented values with `:root` and the light block: 0 mismatches.

## 1.6 Full check

- `npm run lint` and `npm run typecheck` are clean.
- `npm test` passes:
  - shared: 53 files, 841 tests
  - server: 64 files, 523 tests passed, 48 skipped (Postgres tests, no `DATABASE_URL`)
  - web: 115 files, 1073 tests
  - bench: 2 tests

## 2.1 Board owner sign-off

Not done. This is a people step: Antonio's agreement to set the table in Geist (INTERFACE.md §11.1) has to be linked in the PR before merge. The code for group 2 is in place regardless, and reverting the font is a one-line change to `--font-ui` plus re-adding the font link.

## 2.2 and 2.3 One typeface, the board included

- **Code changes:**
  - Removed the Google Fonts `<link>` and its preconnects from `index.html`.
  - Removed `--font-body` and `--font-label`; every use now reads `--font-ui`.
  - Panel headings (`h2`, `.section-toggle`) are 14px semibold muted Geist, with no letter-spaced small caps.
  - `main.tsx` also self-hosts Geist Mono 400.
  - `board/boardFont.ts` waits up to 1.5s for Geist 400/600/700 and Geist Mono 600, alongside Pixi's own start-up. If it times out, it relabels once when `document.fonts.ready` resolves, using a second spelling of the font stack, because Pixi caches a label's texture by text and style.
  - The animation preview's name tags use Geist.
- **Web test.** `boardFont.test.ts` covers four cases:
  - loads every face
  - a hung load resolves false at the timeout (fake timers)
  - a rejected or empty load, or no font API, counts as not ready
  - the relabel runs once on `fonts.ready`, switches to the loaded spelling, and keeps mono labels mono

  All pass.
- **Runtime check** (headless, :5273, room "HP check"):
  - No request goes to any host other than localhost; the only non-local URL was a `data:`/`blob:` with an empty hostname.
  - `document.fonts.check('600 14px "Geist Sans"')` is true.
  - A capture of the board shows the token label in Geist.
- **Grep.** `grep -rli alegreya apps/web --exclude-dir=node_modules` finds nothing after `npm run build` regenerated the ignored `dist/`.

## 2.4 Numbers in Geist Mono

- **Change.** One grouped rule sets Geist Mono with tabular figures on every numeric readout:
  - a `.num` utility
  - `input[type="number"]`
  - the four dice-expression fields
  - the existing `tabular-nums` readouts: roll total and breakdown, `.hp`, initiative, ruling totals, counts, replay and guide counts, resolve values, and the rest
- **Markup.** TokenCard HP, AC and initiative, the roster's and My Tokens' `AC n`, and the activity log's time and `#seq` line now carry `num` or `activity-meta`.
- **Board.** The ruler and template-aim labels use Geist Mono.
- **Correction found while checking.** `.dice-row input` first matched every field in that layout row, including the group-roll label and the chat message box, so I replaced it with the expression fields' ids.
- **Runtime check.** Headless script `room-fonts.mjs`, room "Font check", token "Goblin" at 7/12 HP, AC 13. These all report `"Geist Mono" | tabular-nums`:
  - the New Token number field
  - `.hp` ("7/12 HP")
  - `.token-card dd.num` ("7 / 12")
  - `.roll-total` and `.roll-breakdown` after a 1d20
  - `.activity-meta` in the activity log

  `h2`, `.section-toggle`, `.tabbar .tab`, `body` and `.modal-title` report `"Geist Sans"`.
- **Artifact fixes.**
  - The task text cited the audit's UI-033 for numerals; the numerals finding is UI-034. Corrected here and in 6.3.
  - The design-language spec now says the 3D dice faces are dice art and keep the dice look's figures.

## 2.5 One corner scale

- **Change.** All 62 `var(--radius)` uses and every literal radius were mapped rule by rule:
  - Surfaces take 12px: dialogs, popovers, menus, toasts, cards, notices, map frames, the tool rail and the board banners.
  - Controls, and boxes nested in a surface, take 6px.
  - Swatches and slider thumbs are 50%.
  - Bars and tracks are 999px.
  - Edges flush with their container keep 0.

  `--radius` is deleted.
- **Exceptions.** Recorded next to the tokens:
  - attack-effect art
  - the dropped die chip (18%), which is dice art
  - the home page's blurred bloom (24px), which group 5 replaces
- **Runtime check.** Tool button, input and panel button are `6px`; the open dialog is `12px`, and its input and Save are `6px`.

## 2.6 Neutral buttons, rust for one action

- **Before**, on the GM's tabs in a new room:
  - every tab's own button was rust
  - the selected tool, Select, was rust
  - Tokens panel: New Token **and** Saved Creatures (2)
  - Dice panel: Roll **and** the group Roll (2)
  - Manage: Upload map
  - New Token dialog: Choose a square
  - the chat launcher was rust
- **Change in CSS:**
  - The base `button` is neutral.
  - `button.primary` is rust.
  - The neutral hover is `button:where(:hover:not(:disabled))`, so any component's own background wins.
  - Fourteen component classes that paint their own fill and had no hover now get the darken-on-hover explicitly.
  - The chat launcher is a raised neutral control.
- **Change in markup.** 89 buttons had relied on the rust default:
  - Each form, dialog, notice or tab's main action got `primary`: about 75 of them, matched by unique text and asserted unique.
  - Second actions in the same region, ruling-row actions, "Load older", "Play" in the animation preview, and dismiss-only "Done" buttons stay neutral.
  - The resolve dialog's "Next" is primary until the last target, then "Confirm resolution" is.
- **Spec wording clarified.** A "table panel" now reads "a collapsible section of the table's side panel", with a New Token / Saved Creatures scenario.
- **After**, from the headless walk `steps-dialogs.mjs`, with a token present. No region shows more than one rust fill:
  - Play: Area Effect "Start", Initiative "Start encounter"
  - Tokens: New Token
  - Dice: Roll
  - Manage: Upload map
  - New Token dialog: Choose a square
  - Edit Goblin dialog: Save
  - Saved Creatures, Activity log, Settings, Participants, Invite link options and More: none
- **Not walked.** The map editor's dialogs need a map in the room; they're in the 6.1 walkthrough.

## 2.7 Selected states are neutral

- **Change.** One rule at the end of the stylesheet covers the top bar tabs, library tabs, tool rail, grid toolbar, sight add, map editor steps, modes and options, attack chips, the home page's segmented control and the stage buttons. Each is a raised surface with a 2px rust inset underline and semibold text. Their old rust and rust-tinted fills are deleted, as is the special collapsed-sidebar variant.
- **Runtime check.**
  - The Play tab reports `aria-selected="true"`, `rgb(227,230,234)` on `rgb(32,36,42)`: **12.45:1**.
  - After choosing Fog, the Fog tool reports `aria-pressed="true"` (12.45:1) and Select reports `false`.
  - A capture shows the underline on the Play tab, the Fog tool and the first fog sub-tool.

## 2.8 Widths and 200% text

- **Captures.** The Tokens, Play and Dice tabs at 720, 1024 and 1440 wide, with a 35-character token name. A script lists every element whose text is clipped by overflow or an ellipsis.
- **Found and fixed.** At 1024 and 1440 the roster cut "Bugbear Stalker of the Sunken Crypt" to "Bugbear Stal…", because Geist sets wider than the old face. `.token-name` now wraps instead of ellipsizing; the rerun at 1024 shows the full name on three lines.
- **True 200% page zoom.** A 720×450 viewport (a 1440 window at 200%) shows:
  - the room title
  - the two-row top bar from the 960px breakpoint
  - wrapped token names
  - no clipped text except `.sr-only`
- **Limitation, not introduced here.** With the root font size doubled at a 1440px viewport (text-only enlargement), the room title collapses to zero width. The top bar's breakpoint is in px, so it doesn't respond to text-only scaling; real page zoom does trigger it.

## 2.9 Docs and full check

- **INTERFACE.md §11.9.** Adds the "Rust marks one action" section. Typography now states Geist as the only face, notes audit conflict C5 as resolved, describes the Geist Mono numerals and the board's wait for its fonts, and says names wrap.
- `npm run lint` and `npm run typecheck` are clean.
- `npm test` passes: shared 841, server 523 with 48 skipped, web 116 files and 1077 tests, bench 2.
- `npm run build --workspace=@vtt/web` succeeds. Its warning about chunks over 500 kB was already there (Pixi).

## 3.1 Imagery brief and prompts

- **Change.** `apps/web/public/img/ambient/CREDITS.md` holds:
  - the shared lighting brief, word for word as in the task
  - one prompt per image
  - each file's size, size budget and where it is used
  - how to add or replace an image
  - a review list (no text, screens, paper, interface or logos; the empty space really empty)

  It follows the convention of `public/img/preview/CREDITS.md`.
- **Fix while writing.** The closing prompt's "printed battle map" contradicted the brief's "no paper", so it now asks for a vinyl battle mat printed with terrain.

## 3.2 Generating the images

Not done. The team generates them in ChatGPT from 3.1's prompts and saves them to `apps/web/scripts/ambient-src/`.

## 3.3 Conversion script

- **Change.** `apps/web/scripts/ambient-images.mjs` runs as `npm run images:ambient -w @vtt/web`. `apps/web/scripts/ambient-src/` is git-ignored. For each image the script:
  - crops it to shape (cover, centred) without enlarging
  - steps WebP quality down from 82 to 40 until it fits the budget, and fails the run if it never does
  - writes `table-*-blur.webp` (1280×720, blur sigma 18) for the entry pages
- **Smoke test.** Stand-in sources (the shipped maps, converted to PNG and JPEG) went in a scratchpad folder, and the output went to another scratchpad folder via `AMBIENT_SRC` and `AMBIENT_OUT`, so nothing was written to the repo:

  | File | Size | Quality |
  | --- | --- | --- |
  | `table-dark` | 2560×1440, 299 KB | q52 |
  | `table-dark-blur` | 15 KB | q82 |
  | `table-light` | 298 KB | q40 |
  | `table-light-blur` | 17 KB | q82 |
  | `closing` | 2400×1000, 290 KB | q52 |
  | `empty-rooms` | 800×600, 72 KB | q70 |

  The three images with no stand-in were reported as missing.
- **Still open.** The task's check on the real outputs waits for 3.2.

## 4.1 One header

- **Change.**
  - `ui/SiteHeader.tsx` holds `PRODUCT_NAME`, `Brand` (mark and name), `ThemeToggle` (moved from the home page), `SiteHeader`, `EntryHeader`, `EntryPage` and `HubNav` ("Your rooms" and "Library", the current one marked with `aria-current="page"` and the selected treatment).
  - The home page, the dashboard and both library views (signed in, and dice-only) use `SiteHeader` inside a shared `.page-shell` width; the entry pages use `EntryPage`.
  - The mark is the existing d20 favicon art, moved to `public/brand-mark.svg` in the current rust; the favicon points at it too.
  - The nav controls are scoped to `.site-header`, so the home page's `.home-page a` can't recolour them.
- **Web test.** `siteHeader.test.tsx` renders the real `HomePage`, `GmDashboardPage` and `LibraryPage`. On each page there is exactly one header, the brand comes first and links home, and the theme toggle comes last. On hub pages the right link is `aria-current`. All four tests pass.
- **Runtime check** (`header-pos.mjs`, signed in, both themes):
  - At 1440, the brand is at 144,30 and the toggle at 1262,27 on `/`, `/gm-dashboard` and `/library`.
  - At 390, the hub nav first wrapped and pushed the toggle onto the second row. A phone rule now keeps the account control and toggle on row one and gives the nav a row of its own; the toggle then sits at x=336 on all three pages, y within 1px.

## 4.2 Ambient layers for entry and hub

- **Change.** `ui/Ambient.tsx` is rendered by `App` for the entry and hub layers. Entry gets the plate, half-strength lamp and grain; hub gets a top glow and grain. The layer is fixed, ignores the pointer, sits at z-index 0, and the page content after it is lifted to z-index 1. The plate reads `/img/ambient/table-*-blur.webp`, which doesn't exist until 3.2, so for now that request 404s and the plate is empty.
- **Runtime check** (`ambient-check.mjs`, 390 and 1440):
  - every entry and hub route reports `fixed/none` with no sideways scroll
  - on `/signin` the topmost element under "Create an account" is the link itself, and clicking it goes to `/signup`

## 4.3 Entry pages

- **Change.** Sign in, sign up, every state of join, and not found render in `EntryPage`: the mark and name, then one centred 12px card with the overlay shadow. Not found gained one plain line of text.
- **Captures.** Both themes at 1440 and 390 look right. All existing account and join tests pass in the full web run.

## 4.4 Dashboard

- **Change.**
  - Create a room is a card on the left; Hosting and Playing are sections of room cards on the right, so there are no cards inside cards.
  - Each room card shows its full name (wrapped), its preset and last activity, and neutral Open and Delete buttons.
  - While loading, three still placeholder cards show, with `aria-busy` on the section.
  - With no rooms there is an `EmptyState` with `empty-rooms`, whose "Create a room" action focuses the form's Room name field.
- **Web test.** `dashboardEmptyState.test.tsx` covers three cases:
  - picture source, empty alt text, one action, and focus moving to Room name
  - a picture that fails to load leaves the text and the action
  - room cards show the full name with a non-primary Open

  All pass, as does `createRoomForm.test.tsx`.
- **Capture.** In light, 1440: the form on the left and a three-column grid of room cards.

## 4.5 Map thumbnails

- **Change.**
  - `SHIPPED_MAP_THUMBS` (by slug) and `mapThumbnailFor(url)` live in `net/builtinAssets.ts`. Seeded library rows carry the shipped map's URL under their own id, so the URL decides.
  - `ui/MapGrid.tsx` (moved from the home page) gained `fit="cover"`.
  - `ui/MapThumbnail.tsx` adds the lighter grid and an `aria-hidden` placeholder until the image loads; library map cards use it.
- **Web test.** `mapThumbnail.test.tsx` covers four cases:
  - each shipped URL maps to its thumbnail, and an upload maps to none
  - the library with four seeded rows and one upload requests the thumbnails and never the full shipped maps
  - the placeholder is hidden from assistive technology and replaced on load by a `slice`-fitted grid
  - a failed load keeps the placeholder

  All pass.
- **Runtime check** (`library-net.mjs`): the Maps tab downloads `broken-span-thumb` (66,990 B), `hollowfrost-keep-thumb` (77,256 B), `temple-green-sun-thumb` (83,778 B) and `sunken-crypt-thumb` (7,624 B), and **no** full-size map. The full maps total about 1.9 MB.
- **Found while looking.** Library asset names ellipsized ("Temple of the Gre…"). `.asset-name` now wraps, like token names.

## 4.6 One token drawing

- **Change.** `ui/TokenDisc.tsx` draws the disc, the art clipped to it, the ring, an HP bar in the status colours (via `hpLevel`) and the initial as fallback. The home page's `TokenChip` now wraps it, and library creature cards, roster rows and My Tokens rows use it.
- **Web test.** `tokenDisc.test.tsx` covers four cases:
  - a creature's art clipped over its colour
  - art that errors falls back to the colour and the initial "B"
  - a creature with no art shows the initial
  - a 20% HP bar uses `var(--danger)`, and there's no bar without HP

  All pass, as do `rosterGroupMove.test.tsx` (10) and `tokenRosterActions.test.tsx` (2).

## 4.7 Empty states

- **Change.**
  - The library's empty Maps, Token Art, Creatures, Encounters and Animations tabs show `EmptyState` with `empty-library` and their existing sentence.
  - The room with no map shows `BoardEmptyState` over the board. The GM gets "There is no map on the table yet." with "Choose a map", which opens the Manage tab, unfolds Battle map if folded, scrolls to it and focuses its first control. Players get "The GM hasn't set a map yet."
- **Correction found by the tests.** The first version gave library tabs their own action button, which duplicated the toolbar's: two "New animation" buttons broke seven animation tests, and a shortened encounter sentence broke the encounter test. Library empty states now add no second copy of the toolbar action and keep their original wording. The spec now reads "unless that same action already sits beside it", with a library scenario.
- **Web test.** `emptyStates.test.tsx` covers three cases:
  - an empty Maps tab shows its picture and text, has no button, and "Upload map" appears once, in the toolbar
  - the GM's board empty state calls `onChooseMap`
  - a player's board empty state has no button

  All pass.
- **Runtime check** (`nomap-check.mjs`):
  - The GM in the new room "No map yet" sees the text and "Choose a map". After clicking, the Manage tab is selected and focus is on "Upload battle map", inside the Battle map section.
  - A guest who joined on a 390px phone through the room's invite (read with the GM's credential) sees "The GM hasn't set a map yet." with zero buttons.

## 4.8 Contrast on entry and hub pages

- **Method.** `contrast.mjs`, the audit's page-context method:
  - each text element's colour is composited over its ancestors' backgrounds down to the ground, and must reach 4.5:1, or 3:1 for large text
  - each bordered or filled control must have a boundary of 3:1 against what it sits on
  - Tab is pressed through every control, measuring each focus outline against the ground
- **Found and fixed.** The light theme's focus ring was **2.26:1**, because `--focus` kept the dark theme's `#e08a62`. Light now sets `--focus: #a04a28` (ring 5.15:1 measured) and `--accent-text: #9c4726` (6.12:1 on the panel).
- **Results after the fix**, both themes:

  | Pages | Texts | Controls | Text failures | Boundary failures | Weakest ring |
  | --- | --- | --- | --- | --- | --- |
  | `/signin`, `/signup`, `/nope`, `/join/abc123` | 4–10 each | | 0 | 0 | 7.14 dark, 5.15 light |
  | `/gm-dashboard` | 123 | 63 | 0 | 0 | |
  | `/library` | 21 | 24 | 0 | 1 flag | |
- **The one flag, judged a pass.** The library's selected "Maps" tab has a raised fill measuring 1.18 (dark) and 1.07 (light) against the page. Library tabs are text-only controls, identified by their label (which passes), and selection is carried by the 2px rust underline: 3.16–3.80:1 dark, 4.25–4.56:1 light, both above 3:1. It is also carried by the semibold label and `aria-selected`. The fill is decoration, not the boundary WCAG 1.4.11 asks about.

## 4.9 Docs and full check

- **INTERFACE.md §11.9.** Adds the light-theme focus and rust-text values with C12 noted as resolved, a "Background by layer" table, and "Shared components" (`SiteHeader`, `TokenDisc`, `MapThumbnail` with `MapGrid`, `EmptyState`).
- `npm run lint` and `npm run typecheck` are clean.
- `npm test` passes: shared 841, server 523 with 48 skipped, web 121 files and 1095 tests, bench 2.

## 5.1 Home page split

- **Change.** `HomePage.tsx` now only composes the page. Each section has its own file under `pages/home/`, and `MapGrid` moved to `ui/`. 5.4 and 5.5 later replaced the visibility chapter and the hero paths with new sections.
- **Check.** `npm run typecheck` is clean. Captures taken before and after the split (`capture.mjs` into `presplit/` and `postsplit/`, compared by `diff.mjs`) differ by **0.000%** of pixels, at 1440px and 390px in both themes.

## 5.2 Home lighting and fog dividers

- **Change.**
  - The `.home-page::before`/`::after` lighting is gone. `Ambient`'s home layer draws the full lamp and the grain.
  - The battle-grid pattern sits behind the hero only (`.hero-grid`).
  - `FogDivider` puts the board's fog puff art between sections. It drifts with `transform` only, and only at 720px and wider with motion allowed.
- **Found and fixed.** The first divider rendered as a black rectangle. The fog art is grey on black with no alpha, and `mix-blend-mode: screen` can't reach the ground across the page's stacking context. The dividers, and later the sight fog, now use the art as a luminance mask, so its black is transparent. The divider spans the full width and fades on every side through two intersected masks.
- **Runtime check** (`home-checks.mjs`, rerun after 5.5). For each divider, a link is placed in the page just before it, so the fog paints over the link, and a click is aimed at the divider's centre.

  | Width | Motion | Fog animations running | Horizontal scroll | Divider `pointer-events` | Probe link gets the click |
  | --- | --- | --- | --- | --- | --- |
  | 1440 | allowed | 4 (2 dividers × 2 wisps) | no | none | 2 of 2 |
  | 1440 | reduced | 0 | no | none | 2 of 2 |
  | 390 | allowed | 0 | no | none | 1 of 2 |

  The one miss at 390px is the next section's heading, which overlaps the first divider's lower half there by design. It is page content, not fog. No click in any run landed on a divider.

## 5.3 One crop table

- **Change.** The crop table now lives in `pages/home/homeCrops.json`: each shipped map's grid cell and offset, and the crop's origin in squares. `scripts/home-maps.mjs` imports it with `{ type: "json" }`. `crops.ts` wraps it for the page (`CROP`, `cropTransform`, `toCrop`, `cropWalls`).
- **Deviation.** The task asked for a TS module. The script runs under plain Node, which can't import TypeScript, so the table is JSON with a typed wrapper. Both sides read the same file.
- **Check.**
  - The committed crops' `shasum`s were recorded.
  - The original script reproduced them byte for byte.
  - The shared-table script's output is **byte-identical**, and `git status` shows no change under `public/img/home/`.
  - The script reports these crop origins: broken-span (150, 381) ×1.0086, hollowfrost-keep (1657, 536) ×1.0000, temple-green-sun (1281, 386) ×1.0000.

## 5.4 Line-of-sight demo

- **Change.**
  - **Walls.** `cropWalls` reads a shipped map's walls through `storedWallsFor` and moves them into crop pixels with the script's own arithmetic. Open doors and windows let sight through, as at the table.
  - **Lit area.** `litArea` is `sightPolygon` with a six-square torch. It is drawn as an SVG mask: lit inside, fog art outside, with a 9px blur on the edge.
  - **Moves.** A move snaps with `snapTokenCenter` and is refused the way `decide` refuses a player's move: `footprintCrossesWall` for the target square, then `pathCrossesWall` against the walls the token isn't already touching. The map's edge refuses too. A refused move says why in the status line.
  - **Views.** A Player view / GM view toggle. The GM view adds the hidden monster in the side chamber and outlines the lit area.
- **Correction.** The first start square, (9, 5), was in the lily pond. The torch bearer now starts at (11, 4), on the path against the side chamber's wall, so the first key press meets a wall.
- **Unit and component tests.** `homeSight.test.tsx` has 7 tests:
  - a crop lands where the script cut it
  - a known wall endpoint lands on its expected crop pixel
  - a square behind a wall stays unlit while the open plaza is lit
  - a move onto a wall is refused
  - an arrow key moves the token one square
  - a wall stops a move, which the status line reports
  - the GM sees the hidden monster and the player view has none

  All pass. One fix along the way: the position asserts compared floating-point percentages ("57.49999999999999%") and now use `toBeCloseTo`.
- **Captures.** `sight-player.png` and `sight-gm.png` (1440px, dark), the GM capture taken after a key press.

## 5.5 Hero

- **Change.**
  - **Scene.** The broken-span crop as an `<img fetchPriority="high">`, the faint grid, and drifting fog over the sight of Brenna and Toma (both on the map's stored walls). One 15 ft cone is built with `areaShape`, and three token discs.
  - **Actions.** "Start a room" is the primary action, into `/gm-dashboard`. "Join a game" opens the page's only join form in place (`aria-expanded`) and focuses its field. A browser that has joined rooms opens with the form showing and its rooms listed above the field.
  - **Headline.** "Your battle map, ready to play tonight."
- **Found and fixed.** At 1366px, Join left focus nowhere. The field was focused in a `requestAnimationFrame` before React had rendered the panel. A `focusRequest` counter now drives an effect that runs after the panel is on screen. `scrollIntoView` is called only where it exists, since jsdom lacks it.
- **Web tests.** `homeHero.test.tsx` has 5 tests:
  - Start is the `cta` link to `/gm-dashboard`
  - Join focuses the field without navigating
  - a browser with joined rooms opens expanded, with the list before the field
  - `openHeroJoin()` reaches the same single form
  - the field takes a link or a bare code and reports anything else beside it

  All pass.
- **Runtime check** (`hero-check.mjs`, reduced motion, dark):

  | Viewport | Visit | Both actions on the first screen | After Join |
  | --- | --- | --- | --- |
  | 1366×768 | first | yes | focus on `join-invite`, expanded, still on `/` |
  | 1366×768 | returning | yes | form open, "Goblin Caves" listed |
  | 390×844 | first | yes, above the scene | focus on `join-invite`, expanded, still on `/` |
  | 390×844 | returning | yes | form open, "Goblin Caves" listed |
- **Settled under reduced motion** (`settled.mjs`): with `reduce`, `document.getAnimations()` is empty and the hero's tokens are fully opaque. With `no-preference` it lists `enter`, `fog-pan`, `token-land` and `fog-drift`.

## 5.6 Facts row

- **Change.** `FactsRow.tsx` sits under the hero:
  - **No account** for players. They join from a link, in any browser.
  - **Up to 32** players in one room. The figure is `MAX_PLAYERS_PER_ROOM`, imported from `@vtt/shared`.
  - **Under 150 ms** for a ping to reach everyone at the table. The figure is `PING_TARGET_MS`, the latency benchmark's `TARGET_P95_MS`.
  - **Undo** for moves, fog, walls and hit points.
- **Deviation.** The plan's fourth fact was "every action can be undone". That isn't true at the table: `history.undo` covers `REVERSIBLE_EVENT_TYPES` only, so a deleted token, a chat message, a roll or a grid change stays. The row now names what undo covers, and tasks.md 5.6 says so.
- **Web test.** `homeFacts.test.tsx` has 4 tests, all passing:
  - the four facts read as above
  - with `MAX_PLAYERS_PER_ROOM` mocked to 7, the row says "Up to 7", so the figure is the constant, not a typed number
  - the benchmark file's `TARGET_P95_MS` equals `PING_TARGET_MS`, read from `apps/server/test/ephemeralLatency.test.ts`
  - moves, fog, walls and stats changes are all in `REVERSIBLE_EVENT_TYPES`

## 5.7 Prepare section

- **Change.** `PrepareSection.tsx` has three steps:
  - **Upload or import.** The file types come from `net/mapFileTypes.ts`. `LibraryPage` now builds its `accept` list from the same file, so the home page can't promise a file the library would refuse.
  - **Line up the grid.** The grid demo from 5.1 (`GridPanel.tsx`). "5 ft" now comes from `DEFAULT_GRID`.
  - **Walls, doors and windows.** The Sunken Crypt's stored walls over a new crypt crop, drawn in the board's colours: amber walls, wooden doors, glass windows, and a red mark on the locked door. A key names each kind.
- **New crop.** The crypt is in `homeCrops.json` (column 3, row 8). Running `npm run maps:home` cut `sunken-crypt.webp` (18 KB) and left the other six outputs byte-identical. The crypt's thumbnail comes from `renderCryptMap.mjs`, so its entry has `"thumb": false` and the crop script leaves that file alone. The first run did overwrite it; it was restored from git.
- **Found and fixed (affects 5.4 and 5.5).** At the table, `blocksSight` lets sight through windows, while `blocksMovement` stops a token at them. The home page's `cropWalls` had treated a closed window as blocking sight.
  - `cropWalls(slug, "sight" | "movement")` now uses the table's own two predicates.
  - The sight demo takes the sight set for the lit area and the movement set for moves.
  - The hero's and the sight demo's maps have no windows, so nothing they drew changes. The crypt has two window segments.
- **Copy deviation.** The first walls text described the counts as walls, doors and windows, but they were counting line segments: one window is drawn as two lines. The counts became a key.
- **Web test.** `homePrepare.test.tsx` has 5 tests, all passing:
  - every listed file type is in the library's `MAP_ACCEPT`
  - the grid slider and the walls step are present
  - the panel draws exactly the segments `toCrop` produces for each stored wall on the crop
  - those segments equal `cropWalls(…, "movement")`, and the sight set is the same less the window segments
  - the key names each kind drawn, and a lock mark is drawn

## 5.8 Play grid

- **Change.** `PlaySection.tsx` holds the 5.4 sight stage, now a sub-step under "Run the fight at the table.", then exactly five tiles:
  - **Area templates** (`TemplateTile.tsx`). A sphere centred on a grid intersection of Hollowfrost Keep's courtyard, at 10, 15 or 20 ft. The status line lists the tokens `tokensTouchingArea` counts, and the chips of the caught tokens get a ring. It is aimed with the pointer, or focused and moved with the arrow keys.
  - **Dice** (`DiceTile.tsx`). It opens on 2d6+3, rolled by `rollDice` with a seeded generator and shown at rest. Rolling, and the parser's error, work as before.
  - **Attacks** (`AttackTile.tsx`). `AttackStage` (the editor's `AnimationPreviewStage` with Fireball, Melee slash or Arrow volley) is a lazy import that waits for `useNearViewport`, which fires within one viewport of the tile. Under reduced motion the tile shows `attack-still.webp` and never imports the stage. The still is a real capture of this tile playing Fireball, 550 ms in.
  - **Turn order** (`TurnTile.tsx`, lazy). A fight that `decide` started (`initiative.start`), advanced by Next turn (`initiative.advance`) and folded by `reduce`. The active turn is marked with rust, one of the two places rust is allowed. The table's `TurnNotice` shows what Brenna's player sees when Brenna's turn comes up.
  - **Conditions.** `ConditionMarker`s on Toma, switched on and off with pressed buttons.
- **Web test.** `homePlay.test.tsx` has 7 tests, all passing:
  - five tiles, in order, under the sight stage
  - the caught list equals `tokensTouchingArea`'s output at the start, after four arrow keys, and at 20 ft and 10 ft; the ringed chips match
  - the dice open on `openingRoll()`'s total with no "Rolling…", and a bad expression shows the parser's own message
  - with a hand-fired observer, the module behind `AnimationPreviewStage` isn't loaded until the tile is scrolled near; then it loads once
  - under reduced motion the still is shown and the stage module never loads
  - Next turn moves Goblin boss → Brenna and shows "It's Brenna's turn."; four presses reach round 2
  - turning on Stunned adds its marker
- **Runtime check** (`demo-checks.mjs`, 1440px, with motion allowed and with reduced motion):
  - the template starts on "Goblin, Goblin archer, Wolf", reads "Toma, Brenna" under the pointer, and returns after six arrow keys
  - the attack tile has the live stage with motion, and the loaded still (`complete`, width > 0) without it
  - Next turn shows the table's notice and hides the hint
- **Found and fixed.** The first runtime pass blanked the whole page as it scrolled near the play section. The dev server had cached `./RecoverDemo` against the old `recoverDemo.ts`, two names that differ only in case, and that import then failed with a 404. The logic module is now `recoverRoom.ts`, and the isolated web server was restarted.

## 5.9 Recover section

- **Change.** `recoverRoom.ts` builds the demo room as a log of `CommittedEvent`s:
  - The setup batch is the GM joining and three tokens being created.
  - Each GM command goes through `decide` and is committed with the next seqs and one `commandId`. `reduceCommitted` folds it, so `state.undo` is kept exactly as at the table.
  - `logLines` is the GM's `activityHistory` after setup, laid out as `ActivityLog` lays it out: Undo on the newest entry of an undoable action, and "Undone" on an action that was undone.
- **The demo.** `RecoverDemo.tsx` is lazy-loaded near the viewport. It opens with one move already made, so there is something to undo. Tokens on the crypt's pillared hall move with the arrow keys or by dragging, one `token.move` per drop.
- **Unit and component tests.** `homeRecover.test.tsx` has 3 tests, all passing:
  - Moving Brenna, then Undo, restores the position. The log then reads, newest first: "GM undid the move of Brenna", the inverse move, and the original move, marked Undone, with no Undo left on any line (no redo).
  - Undoing a move after a later move has overtaken it is refused by `undoConflict`, and the room is unchanged.
  - On the page, Undo puts Brenna back, marks the entry, shows three entries, and an arrow key adds a fourth.
- **Found and fixed (runtime).** Dragging a token did nothing.
  - Pressing on token art started the browser's own image drag, which cancels the pointer. With reduced motion the drag started from the map picture under the token instead.
  - `TokenDisc` art, the crop window's picture and the sight demo's map are now `draggable={false}`.
  - `drag-debug.mjs` now records a move in both motion modes. `sight-drag.mjs` drags the torch bearer two squares west (57.5% → 47.5%) in both modes.

## 5.10 Players section

- **Change.** A second part head, "Joining a game", is the only place "you" means the player. `PlayersSection.tsx` has the copy, a Join a game button that calls `openHeroJoin()`, and `player-phone.webp`.
- **The capture.** It is a real capture, made on the isolated server (:3101 and :5273) with the dev account, on loopback only:
  - The GM made a room on Temple of the Green Sun, added the map's stored walls (`wall.add` in batches of 50), and turned line of sight on with a 30 ft range.
  - A guest named Nalani joined at 390×844 (2× pixels). The GM placed Nalani (owned by the guest), Kaveh, and a hidden Serpent.
  - The guest's board was zoomed and panned toward Nalani, then captured. The Serpent is not in the player's view.
  - The image is 600×1298, 38 KB. `public/img/home/CREDITS.md` records how it was made.
- **Web test.** `homePage.test.tsx` (players part, 2 tests, passing): the section sits under the "Joining a game" heading; before any click there is no join form; the section's button opens exactly one `form.join-form`, in the hero, with focus on its field; the capture is shown.
- **Runtime check** (`demo-checks.mjs`): in both motion modes, the section's Join leaves `join-invite` focused, one form on the page, and the field on screen.

## 5.11 Library strip

- **Change.** `LibraryStrip.tsx` replaces the library chapter:
  - The four built-in maps, whole, with the light grid, their names, and their catalogue size and grid.
  - The list is rendered twice for a seamless loop; the copy is `aria-hidden` with empty alts.
  - With motion allowed, `marquee` runs (70 s, paused on hover). Under reduced motion, the copies are hidden and the row scrolls with `scroll-snap-type: x mandatory`.
  - The wording: "kept on your account, so they're there on any device you sign in on". No link to `/library`.
- **Web test.** `homePage.test.tsx` (library part, 2 tests, passing): no anchor on the page starts with `/library`; the text says "kept on your account" and "any device you sign in on"; each map shows once to assistive technology with "W × H · cell px grid" from `BUILTIN_ASSETS`, and the copies are hidden.
- **Runtime check:**
  - with motion allowed, `marquee` is running, snap is off, and all four copies show
  - under reduced motion there are no animations, snap is `x mandatory`, and no copy shows
  - in both modes there are no `/library` links and no sideways scroll

## 5.12 Closing band

- **Change.** `ClosingBand.tsx`: "Ready to run a game?", a line, and the hero's own Start a room, over `/img/ambient/closing.webp` behind a gradient. The old closing's "Set up a room" is gone.
- **Not yet verifiable.** `closing.webp` comes with the generated images (3.2 and 3.3, waiting on the team). Until then the band shows its lamp-lit ground, as in the screenshot.
- **Web test.** `homePage.test.tsx` (calls to action, passing): in `main`, both links to `/gm-dashboard` read "Start a room" and are the only two `.cta`s; both join buttons read "Join a game"; "Set up a room" appears nowhere.

## 5.13 Copy check

- **Test.** `homeCopy.test.tsx` renders the whole page with no IntersectionObserver, so every lazy demo loads and is checked. It reads every text node plus every `aria-label`, `alt`, `title` and `placeholder`. It checks four states: the player view, the GM view, after rolling 1d20+5, and after rolling "roll a d20" (the parser's message). It fails on:
  - implementation words
  - code identifiers: camelCase, snake_case, calls, and dotted names such as `token.move`
  - the partial features
  - an em dash

  A second test proves each rule catches its own example.
- **Found while writing it.** Reading `textContent` ran adjacent elements together ("Start a roomJoin a game" matched camelCase), so the test walks text nodes.
- **Result.** Both tests pass.

## 5.14 Landing chunk, Pixi and LCP

- **Method** (`bundle-check.mjs`).
  - **Before:** a production build of `7d25cfa`, from a temporary detached worktree in the scratchpad that reuses `node_modules`, removed afterwards.
  - **After:** a build of the working tree.
  - Both builds went to the scratchpad, never into the repo's `dist`. Each was served to headless Chromium from disk through request interception, with no server, and `/` was loaded without scrolling.

  | | Before | After |
  | --- | --- | --- |
  | Entry chunk | 527.1 KB (156.6 KB gzip) | 567.8 KB (172.0 KB gzip) |
  | JS fetched on load | 1 file | 1 file |
  | CSS | 158.2 KB (50.0 KB gzip) | 195.4 KB (66.2 KB gzip) |
  | Pixi chunks fetched on load | 0 | 0 |
  | LCP | `div.hero-art`, `broken-span.webp`, 352 ms | `div.hero-art`, `broken-span.webp`, 252 ms |

  The CSS growth is the whole change: `styles.css` grew by 26 KB across groups 1–5, and Geist Mono added six font faces.
- **Pixi after scrolling.** Scrolling to the attack tile fetches `AttackStage`, `AnimationPreviewStage` and four Pixi chunks, along with `TurnTile`, `decide` and `RecoverDemo`. `decide` is its own chunk, not in the entry.
- **LCP.** The LCP resource is the hero crop, `broken-span.webp`, which the `<img fetchpriority="high">` downloads. Chrome reports it on `div.hero-art` because the map's bloom (`::before`) paints the same picture slightly larger behind the image. It is one download, and it was the same before this change.

## 5.15 Docs and full check

- **INTERFACE.md §11.5** is rewritten as built:
  - the hero's two actions and where each goes
  - the facts row and where its figures come from
  - "Running a game" (prepare, play with its five tiles, recover, the library) and "Joining a game"
  - the closing band
  - page-wide rules: one label per intent, demos on the table's code with the renderer and `decide` loaded near the viewport, one map per section, and the copy rules the copy check enforces
- **INTERFACE.md §11.9** gains:
  - **Imagery:** product pictures are the product or a capture of it; generated ones are atmosphere under the one lighting brief, quoted.
  - **Icons:** Phosphor at its regular weight, with the fill weight only for a selected tool.
  - **Motion:** the home page's fog and library strip join the table's two continuous motions, only when motion is welcome.
- **Also done for the spec's "One icon family".** Every icon in `apps/web/src` was at the regular weight except 18 `bold`, 3 `duotone` and 1 `fill` (the chat button, which isn't a selected tool). All 22 are now regular.
- **Cleanup.** Landing CSS that nothing renders any more is removed: `.chapter`, `.view-pair`, `.view-frame`, `.token-dot`, `.dice-chapter`, `.dice-empty`, `.shelf`, `.shelf-foot`, the old `.closing` and `.landing-bar`. `DiceChapter.tsx` and `LibraryChapter.tsx` are gone. `siteHeader.test.tsx` now stubs an observer that never fires, so the home page it renders stays unscrolled and loads no demo code.
- **Checks.** `npm run lint` and `npm run typecheck` are clean. `npm test` passes: shared 841, server 523 with 48 skipped, web 129 files and 1133 tests, bench 2.

## 6.1 Every surface

- **Method** (`walk/walk.mjs`, isolated servers, dev account, loopback only).
  - The GM signs in and makes a room on Hollowfrost Keep through the app's own socket protocol, a guest joins as Brenna, and the GM places two tokens.
  - The GM opens a new encounter from the library on Hollowfrost Keep.
  - Each surface is captured: home, sign-in, sign-up, join (with a real invite), not-found, dashboard, library, the room as GM, the room as player, and the encounter editor. The table and the editor are dark only; the rest are captured in both themes. Every surface is captured at 1440 and 390.
  - On each capture the walk records:
    - the typeface of every text element
    - the corner radius of every control and surface
    - every rust fill
    - the header's mark and theme toggle positions
- **Type.** Geist Sans everywhere, with Geist Mono on numbers. No other face on any surface.
- **Corners.**
  - Controls are 6px and surfaces 12px.
  - Square controls are intended: the share button's caret half, the panel's section toggles, the library's underline tabs.
  - Circles are the avatar stack. The square surface is the room's docked panel.
- **Accent.**
  - One rust fill per region on the home, entry and hub pages.
  - The GM's Play tab has "Start encounter" (Initiative) and a disabled "Start" (Area Effect), in two sections.
  - The encounter editor has Save (top bar) and New Token (panel).
  - The player's view has none.
- **Found and fixed.**
  - **The GM's avatar was filled with `var(--accent)`.** That is a third use of rust, which the accent rule doesn't allow, and its "GM" initials already say who it is. It is now a raised neutral disc with a hairline.
  - **On a 390px phone, a signed-out visitor's header wrapped differently.** Sign in, Create account and the theme toggle went to a second row together, so the toggle sat at (249, 66) on the home page but (336, 26) on the hub pages. The pair is now one group (`.account-pair`) that takes the second row on phones, like the hub's navigation, so the toggle stays top right.
- **Header positions after the fixes**, rerun in full:

  | Width | Mark | Theme toggle |
  | --- | --- | --- |
  | 1440 | (144, 30) | (1262, 27) |
  | 390 | (20, 29) | (336, 26) |

  These are the same on home, dashboard and library, in both themes. There is no sideways scroll anywhere.
- **Screenshots.** 36 captures are in the scratchpad's `walk/` folder, named `<surface>-<theme>-<width>.png`, ready to attach when the final PR is opened.

## 6.2 Reduced motion everywhere

- **Method** (`walk/reduced-check.mjs`). Three runs:
  - the in-app Reduced animations setting on, with the system allowing motion
  - the system asking for reduced motion, with the setting off
  - a control with neither

  Each run first scrolls the whole home page, sampling every 50 ms. It then opens a dialog at the table (New Token) and samples for 600 ms. Finally it rolls 1d20 in the Dice tab and samples for 1.5 s.
- **Results.**

  | Run | `data-motion` | Home page | Dialog | Dice roll |
  | --- | --- | --- | --- | --- |
  | In-app setting | `reduced` | nothing runs; the attack tile shows its still | nothing | nothing |
  | System setting | `reduced` | nothing runs; still shown | nothing | nothing |
  | Neither (control) | none | `enter`, `fog-pan`, `token-land`, `fog-drift`, `total-in`, `marquee` | `modal-in` and the tab indicator | the die tumble, flight and shadow, `roll-card`, `roll-total-in` |

  The control shows the check would catch any of them.

## 6.3 Audit note (open: waits on the merged PRs)

- **Change.** `docs/audits/ui-design-audit-2026-10-29.md` has a dated "Status update — design language" listing what this change addressed:
  - P2 and UI-009
  - P3 and UI-032, for its radius half only; the off-scale spacing remains
  - P4 and UI-034
  - C5 and C12

  It also says plainly that UI-031 and UI-033 are not addressed and that nothing is merged yet.
- **Why the box stays unticked.** The task's check, "each listed item matches a merged PR", can't be done until the PRs exist and merge.

## Final check after 6.1's fixes

- `openspec validate product-design-language --strict` passes. 41 of 45 tasks are done.
- The four open tasks wait on people or merges:
  - 2.1: the Board owner's sign-off
  - 3.2: the team's generated images
  - 3.3: checking the script's real output once those images exist
  - 6.3: merged PRs
- `npm run lint` is clean and `npm run typecheck` reports 0 errors.
- `npm test` passes: shared 841, server 523 with 48 skipped, web 129 files and 1133 tests, bench 2.
- Nothing is committed.

## 7. Home page art (review: "map and tokens in the same theme, no library art, not generated-looking")

- **Generation.** Everything was generated with ChatGPT image generation in the built-in browser pane, signed in to the user's ChatGPT, one chat per scene: the map first, then its tokens "in exactly the same style as this map". The maps are 1536×1024.

  | Map | Scene | Style |
  | --- | --- | --- |
  | canal-market | Canal night market (hero) | Ink and watercolour |
  | sun-tomb | Sandstone tomb (sight) | Gouache |
  | forge-hall | Dwarven forge (grid) | Graphite and coloured pencil |
  | moor-inn | Coaching inn (walls) | Technical-pen plan |
  | goblin-camp | Goblin ruin (templates) | Linocut |
  | merchant-deck | Ship's deck (recovery) | Risograph |

  The prompts are in `public/img/home/CREDITS.md`.
- **Two maps were redone:**
  - **The tomb.** The first was flat, with large blank areas, so it was repainted with the same layout and more texture.
  - **The goblin camp.** The first had one big empty clearing, and the user turned it down ("it has nothing"). It was replaced in the same chat with a busier ruined watchtower in the same linocut style, so the camp's tokens still match.
- **Getting the files out.** The pane's Download writes no file, a fetch to localhost is blocked by the page's policy, and so is a clipboard write. Instead, each image was read from the pane's own HTTP cache, matched by the exact byte size the page reported for it (`extract.py`). A temporary loopback receiver used along the way is stopped. Twice during clicks the ChatGPT page wrote text to the system clipboard; the app warned about it.
- **Grids.** Each grid was measured from the thin strokes on the art (`grid.py`, and a bare-paper profile for the linocut). Three maps are exactly 64 px. The other three:
  - the forge: 56.4 × 57.5
  - the inn: 61.65 × 62.1
  - the ruin: 54.85 × 52.75

  `home-maps.mjs` now scales x and y separately. On the check images, the forge's flagstone joints, the camp's printed grid and the inn's grid sit on the 70 px lines in the far corner. Rerunning the script left the four library thumbnails byte-identical.
- **Walls.**
  - **The tomb:** wall bands measured along scanlines, written as 14 blocks plus the 8 pillars. An automatic trace overlay agreed with the bands.
  - **The quay:** two house fronts with their closed doors.
  - **The inn:** wall centre lines with 10 windows and 7 doors, measured on a 100 px ruler. Six doors are open, including the front double door; the barred one is locked.

  The screenshot of the walls panel shows each line on its drawn wall.
- **Placement.** Tokens stand on squares that a per-square open-ground score shows to be clear (`open.py`).
  - **Hero:** Brenna, Toma and Ash on the quay.
  - **Sight:** Nalani under the side chamber's doorway, Kaveh in the hall. The hidden guardian in the chamber is shown in the GM view with its art and a dashed ring.
  - **Templates:** the goblins at the cauldron, Mara and Pell across the ruin. The default sphere still catches "Goblin, Goblin archer, Wolf".
  - **Recovery:** Sela, Dunn and a cutthroat on the deck.
  - **Turn order and conditions:** the ruin's cast.
  - **Library strip:** the page's six maps with their pixel size and squares, captioned "The maps on this page, as a library keeps them."
- **Phone capture.** The tomb was uploaded to the dev account's library on the isolated server and set in a room. The traced walls were added, line of sight was turned on, and a guest joined as Nalani on a 390×844 phone. The hidden guardian is not in the player's view.
- **Removed.** The old home crops of the built-in maps and the old `hero-*` and `jungle-*` portraits; nothing else used them. The library's built-in thumbnails stay.
- **Tests.** The updated home tests pass, 42 in total:
  - `homeSight`: crop transform per axis, the round trip, the dark chamber, the north wall, the arrow keys, the guardian
  - `homePrepare`: the inn's segments; sight and movement with open doors and windows
  - `homePlay`, `homeRecover`, `homePage` (the library strip), `homeCopy`, `homeHero`, `homeFacts`, `siteHeader`
- **Runtime** (`demo-checks.mjs`, both motion modes): the template aims, the turn notice reaches Mara's player, Undo and a drag on the deck work, and the strip drifts or snaps.
- **Weight.** The textured styles compress worse, so the crops are heavier: the hero (the LCP image) is 236 KB against 111 KB before, and the deck is 405 KB. Lowering WebP quality saved little, because the grain is the style, so quality stays at 82. The 15 token portraits total 260 KB.
- **Final check (7.7).**
  - `openspec validate --strict` passes.
  - `npm run lint` is clean and `npm run typecheck` reports 0 errors.
  - `npm test` passes: shared 841, server 523 with 48 skipped, web 129 files and 1133 tests, bench 2.
  - The home page loads in the pane with no console errors.

## 7. Follow-up: thinner hero fog, tokens in proportion (review)

- **Fog.** The hero's fog was too thick. `SightFog` takes `light`, and the hero passes it: the fog body drops to 0.6 opacity and the texture to 0.28, so the quay shows through. The sight demo's player view keeps the full fog, because there it stands for what a player can't see.
- **Token size.** In the template tile, tokens were about half a square, because discs had a fixed rem size. Now every map token is sized from its own map's squares, as the board sizes them: diameter = square less 4 px of 70 (`boardView`: radius = cell / 2 − 2).
  - Map frames are CSS containers that know how many squares wide they are (`--cols`), so `--disc: calc(100cqw / var(--cols) * 66 / 70)`.
  - Labels scale with the disc, between 0.5 and 0.7 rem.
  - A token that is a control (the torch bearer, the deck's tokens) passes its size to the disc inside it.
  - The fixed sizes for tiles and phones are gone.
- **Zoomed out.** The template tile and the recovery board now show 16 × 9 squares instead of 12 × 6.75. Every token still stands in the view, and the default sphere still catches "Goblin, Goblin archer, Wolf".
- **Checked.**
  - Screenshots at 1440 and 390: hero, sight, templates, recovery.
  - `npm run lint` is clean and `npm run typecheck` reports 0 errors.
  - `npm test` passes: shared 841, server 523 with 48 skipped, web 129 files and 1133 tests, bench 2.

## 7.8–7.9 Outside sight as a dimmed map; place the AoE (review)

- **The question.** The review asked whether the line-of-sight demo should be black instead of fog. It should not be fog: at the table, line of sight is darkness, tinted near-black to the map's colour with a soft inner edge (`board/sightMask.ts`). Fog is a separate layer that the GM paints.
- **Options.** Four options were rendered on the tomb demo, three of them with the board's own mask code (`shots/dark-options.mjs`):
  - A: the table's darkness
  - B: darkness with a faint smoke texture
  - C: the dimmed map
  - D: pure black

  The user picked C for the demo and kept the hero as a thin layer of fog.
- **The sight demo (C).**
  - `SightFog` draws the player view as the dimmed map: `sightColor` of the map's average colour, at `DIMMED_ALPHA` (0.62).
  - Each map's average colour was measured once in the browser with the board's own `averageColor` and recorded in `crops.ts`. For the tomb it is (151, 90, 54), giving darkness rgb (17, 15, 13).
  - The GM view has no dimming, only the outline and the hidden guardian.
  - The caption now says the tomb is "in shadow and empty" past what the tokens see.
  - `DIMMED_ALPHA` replaces `NO_SIGHT_ALPHA` (0.55), so a player with no token at the table gets the same dim.
- **The hero.** It is back to the thin drifting fog (`look="fog"`: body 0.6, texture 0.28, `fog-pan`).
- **Gap to the table.** The table still draws opaque darkness for a player who has a token. Offering the dimmed map per room needs a scene field, which means an ADR and the Real-Time Architecture owner's review. It is listed under the workflow follow-ups.
- **AoE placement.** The template tile no longer follows the pointer. A pointer down places the sphere, with pointer capture, and a move with a button held drags it. A move with no button does nothing; the arrow keys still step it. The copy reads "Click the map to place a sphere, or drag it." The goblin archer moved from (6, 3) to (7, 4), so its name no longer runs into the goblin's disc. The default sphere still catches "Goblin, Goblin archer, Wolf".
- **Tests.**
  - `homeSight` has 8 tests. The new one checks that the dim layer is `sightColor(average)` at `DIMMED_ALPHA`, and only in the player view.
  - `homePlay` has 8 tests. The new one checks that a pointer passing over leaves the sphere, a click places it on the nearest intersection, a drag moves it, and a pass after release leaves it.
  - `sightMask` has 3 tests.
- **Runtime** (`demo-checks.mjs`, both motion modes):

  | Pointer action | Caught |
  | --- | --- |
  | Hovering | stays "Goblin, Goblin archer, Wolf" |
  | Click | "Goblin, Wolf" |
  | Moving away afterwards | still "Goblin, Wolf" |
- **Settled check.** With reduced motion nothing animates. With motion allowed, `fog-pan` runs on the hero again.
- **Landing bundle.** Still one script on load and no Pixi chunk. The entry is 568.7 KB (173.0 KB gzip), against 567.8 KB (172.0 KB gzip) before.
- **Checks.**
  - `openspec validate --strict` passes.
  - `npm run lint` is clean and `npm run typecheck` reports 0 errors.
  - Shared 841 pass, and web 129 files and 1136 tests pass.
  - The server's full run, under a 15-minute load average of about 9, timed out 8 tests (seven 5 s or 15 s timeouts and one 1.5 s timing check). The failing tests differed from the run before. Rerun alone once the machine was quieter, the server suite passed: 523, with 48 skipped. The bench passed (2). The server code is untouched.

## 7.10 No template in the hero (review)

- **Change.** The hero no longer draws the 15 ft cone: removed from `Hero.tsx` along with its `.hero-template` styles. The play section's tile still demonstrates templates. The gm-home hero requirement and its scenario now say the hero shows no area template. design.md Decision 9 and INTERFACE §11.5 now match.
- **Checks.**
  - A 1440px screenshot shows the quay, the three tokens and the thin fog, with no cone.
  - `openspec validate --strict` passes.
  - `npm run lint` is clean and `npm run typecheck` reports 0 errors.
  - The web suite passes. The server code is untouched.

## Grid demo opens at 70 (review)

- **Change.** The grid step's slider now starts at the map's own square size: `CROP.cell`, which is 70. The demo opens lined up and reads "Lined up with the map's squares."; dragging shows a mismatch.
- **Checks.**
  - `homePrepare.test.tsx` asserts that the slider starts at 70 and that the lined-up message shows. Its tests and the copy check pass, 7 in total.
  - A 1440px screenshot shows the app's grid on the forge's flagstones.
  - `npm run lint` is clean and `npm run typecheck` reports 0 errors.
