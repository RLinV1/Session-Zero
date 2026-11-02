# Tasks

## 1. Tokens and theme plumbing (PR 1)

- [x] 1.1 Move every shared token to `:root` in `styles.css`: `--font-ui`, `--font-mono`, `--radius-control` (6px), `--radius-surface` (12px), the 4–64px spacing scale, the shared easing curve and the 120/240/480ms durations, and the home page's light palette under `:root[data-theme="light"]`. Keep `.home-page` rendering as it does today. Verify by screenshotting the home page in both themes at 1440px and 390px before and after, and seeing no visible difference.
- [x] 1.2 Add the route-to-layer map and a `useRouteLayer` hook in `App.tsx` that sets `data-layer`. It also sets `data-theme` from `vtt.theme` on the home, entry and hub layers, and forces dark on `room` and `encounterEdit`. Apply the stored theme in `main.tsx` before `createRoot`. Verify with a web test: a stored light choice gives `/gm-dashboard` `data-theme="light"` and `/r/x` dark, and a throwing `localStorage` falls back to the system preference.
- [x] 1.3 Keep a `data-motion="reduced"` attribute on `<html>` in sync with the OS query and the in-app `reducedAnimations` setting, and gate every CSS animation and transition on it. Verify with a web test that toggling the setting flips the attribute. Then, at the table with the setting on, roll 1d20 and confirm with `document.getAnimations()` that no `roll-card` or total keyframes run (the audit's step 35 method).
- [x] 1.4 Add `ui/palette.ts`, which reads `--ok`, `--warn`, `--danger` and `--focus` with fallbacks, and one HP colour helper with the 50% and 25% thresholds. Switch the board's HP bars and selection ring to them. Verify with unit tests for colour parsing, fallback and thresholds, and a screenshot of a token at 20% HP whose board bar matches its roster bar.
- [x] 1.5 Update INTERFACE.md §11.9 (token table, light values, theme scope by layer, motion timing) and FRONTEND-CONTRACT §13.8 (light theme outside the table). Verify every value in the docs matches `:root`.
- [x] 1.6 Run `npm run lint && npm run typecheck && npm test` and verify all pass.

## 2. The table (PR 2)

- [ ] 2.1 Get the Board owner's agreement to set the table in Geist (INTERFACE.md §11.1), and link it in the PR description. Verify the PR links the approval before merge.
- [x] 2.2 Remove the Google Fonts `<link>` from `index.html`, point `--font-body` and `--font-label` at `--font-ui`, then delete them. Panel headings become sentence-case 14px semibold muted text. Verify that `grep -ri alegreya apps/web` finds nothing, and that loading a room makes no request to `fonts.googleapis.com` (network log).
- [x] 2.3 Set `BOARD_FONT` and the animation preview's label face to `"Geist Sans"`. Await `document.fonts.load` before the first label draw, with a timeout, and redraw labels once on `document.fonts.ready`. Verify with a web test that stubs `document.fonts`, and confirm a token label renders in Geist at runtime.
- [x] 2.4 Set every numeric readout in `--font-mono` with tabular figures, including the audit's UI-034 locations: `.hp`, the TokenCard HP and initiative, the ActivityLog sequence and time, roll totals, the ruler and grid readouts. Verify at runtime that each computed `font-family` is Geist Mono with `tabular-nums`.
- [x] 2.5 Replace `--radius` and literal radii with `--radius-control` and `--radius-surface`; tokens and swatches stay circular. Verify that `grep -n "border-radius" apps/web/src/styles.css` shows only the two tokens, `50%` and the listed exceptions, and that runtime checks show 6px on a button and 12px on a dialog.
- [x] 2.6 List every rust-filled button in the PR description before the change. Then make the base `button` neutral and add the `primary` variant, applied to one action per page section, dialog or panel. Verify with a runtime walk of the GM's Play, Tokens, Dice and Manage tabs and each dialog that no region shows more than one rust fill.
- [x] 2.7 Apply the shared selected treatment to tabs, tool rail buttons and segmented controls: raised neutral surface, 2px rust indicator, `aria-selected` or `aria-pressed`. Verify that the selected Play tab's label is at least 4.5:1 on its background, and that the Fog tool reports itself as pressed.
- [x] 2.8 Check the table at 720, 1024 and 1440px wide and at 200% text zoom with the new font. Verify from screenshots that essential text wraps rather than truncating.
- [x] 2.9 Update INTERFACE.md §11.9's typography and accent rule, and note audit conflict C5 as resolved. Verify the doc matches the shipped rules. Then run `npm run lint && npm run typecheck && npm test` and verify all pass.

## 3. Generated imagery

- [x] 3.1 Write `public/img/ambient/CREDITS.md` with the shared lighting brief and one prompt per image. Verify it lists each image's filename, size and prompt. The brief:

  > Photographic. One warm tungsten lamp from the upper right, deep slate-blue shadows, low saturation, walnut wood and dark slate stone, shallow depth of field. No text, screens, paper, interface or logos.

  The images:
  - `table-dark` (2560×1440): a top-down walnut gaming table at night, with resin dice and painted miniatures out of focus along the right and bottom edges, and the left 45% empty
  - `table-light`: the same scene in cool window light from the upper left, on grey stone
  - `closing` (2400×1000): a hand releasing two dice over a printed battle map, with motion blur on the dice and the left third empty
  - `empty-rooms`, `empty-library`, `empty-map` (800×600): a closed map case, a lone die, and an empty battle mat with one token
  - `wood-tile` (1024×1024): seamless, very low-contrast dark wood grain
- [ ] 3.2 Generate the images with ChatGPT from 3.1 (done by the team). Verify each against a review checklist: it follows the brief and shows no text, screens or interface.
- [ ] 3.3 Add a `sharp` script that converts the sources to WebP and writes the pre-blurred entry variant of `table-dark` and `table-light`. Verify the script's output: `table-*` under 300 KB and each empty-state image under 80 KB.

## 4. Entry and hub pages (PR 3)

- [x] 4.1 Add the shared header: logo, wordmark from one constant, navigation, account control and theme toggle. Use it on the home page (replacing `HomeBar`), the dashboard and the library; entry pages show the logo only. Verify with a web test that each page renders the header, and screenshots showing the logo and toggle in the same place on all three.
- [x] 4.2 Add `ui/Ambient.tsx` with the entry layer (pre-blurred plate, lamp at half strength, grain) and the hub layer (top glow, grain), all fixed and non-interactive. Verify that a link over a layer receives clicks, and that 390px pages have no horizontal scroll.
- [x] 4.3 Restyle sign-in, sign-up, join (all its states) and not-found as a 12px card on the entry layer. Verify `accountEntry.test.ts`, `joinedRooms.test.ts` and the join tests still pass, and take screenshots in both themes at 1440px and 390px.
- [x] 4.4 Restyle the dashboard: room rows as surface cards (name, preset, last active, Open) and the no-rooms empty state with `empty-rooms`. Verify the existing `gm-dashboard` behaviour tests pass, plus a new empty-state test.
- [x] 4.5 Move `THUMBS` next to `BUILTIN_ASSETS` and add `ui/MapThumbnail`, with a lighter grid, prepared thumbnails for built-ins, and an `aria-hidden` placeholder of the card's shape for uploads. Use it on the library Maps tab. Verify with a web test that built-in cards use the thumbnail source, and that opening the Maps tab requests no full-size built-in map (network log).
- [x] 4.6 Add `ui/TokenDisc` (moved from the home page's `TokenChip`) and use it on library creature cards and roster rows. Verify with a test that art failing to load shows the coloured disc and initial on a creature card, and that `rosterGroupMove.test.tsx` and `tokenRosterActions.test.tsx` still pass.
- [x] 4.7 Add the library's empty tab state with `empty-library`, and the room's no-map empty state with `empty-map`: picture and sentence for players, plus "Choose a map" for the GM. Verify with web tests on an empty Maps tab and on a map-less room as each role.
- [x] 4.8 Measure contrast on entry and hub pages in both themes (text 4.5:1, boundaries and focus 3:1) using the audit's page-context walker. Verify every pair passes and attach the results to the PR.
- [x] 4.9 Update INTERFACE.md §11.9 with the layers and shared components, and note audit conflict C12 as resolved. Verify the doc matches the shipped components. Then run `npm run lint && npm run typecheck && npm test` and verify all pass.

## 5. Home page (PR 4)

- [x] 5.1 Split `HomePage.tsx` into `pages/home/`, one file per section, with `HomePage.tsx` composing them, and move `MapGrid` into `ui/`. Verify with typecheck, and confirm the page renders the same before any section changes.
- [x] 5.2 Move the home page's lighting from `.home-page::before`/`::after` into `Ambient`'s home layer: full lamp, grain, the battle-grid pattern behind the hero only, and fog dividers between sections from the board's fog puff art, all drifting with transform only. Verify that 390px pages have no horizontal scroll, that fog stays still under reduced motion and below 720px, and that a link over a fog divider receives clicks.
- [x] 5.3 Move the crop table (each shipped map's origin in squares and its scale) into a TS module that `scripts/home-maps.mjs` imports. Verify that rerunning `npm run maps:home -w @vtt/web` produces byte-identical crops.
- [x] 5.4 Build the line-of-sight demo:
  - walls from `storedWallsFor`, moved into crop pixels
  - `sightPolygon` drawn as an SVG mask, lit inside and fog art outside
  - drag and arrow-key movement, snapped with `snapTokenCenter` and blocked by `pathCrossesWall`
  - the GM/player toggle with a hidden token

  Verify with unit tests that a known wall endpoint lands on its expected crop pixel and that a square behind a wall is not lit. Add component tests that an arrow key moves the token one square and that the player view has no hidden token.
- [x] 5.5 Build the hero:
  - the crop `<img>` as the LCP element, the faint grid, token discs, the sight mask at a fixed position, drifting fog and one cone template
  - "Start a room" as the primary action, "Join a game" opening the form in place with focus, already open when this browser has joined rooms, with the joined list above the field
  - the headline, chosen from "Your battle map, ready to play tonight." and "Run the table. Hide the ambush."

  Verify at 1366×768 and 390×844 that both actions are visible without scrolling. Add web tests that Join moves focus to the field and that a browser with joined rooms opens with the form expanded. Under reduced motion, verify the scene is shown settled.
- [x] 5.6 Add the facts row: no account for players; up to `MAX_PLAYERS_PER_ROOM` players a room (imported, not typed); pings arrive in under 150 ms (the ephemeral benchmark's target); undo for moves, fog, walls and hit points. (The plan said "every action can be undone", but the table can't undo a deleted token, a chat message or a roll, so the row names what undo covers.) Verify with a test that the player figure comes from the constant.
- [x] 5.7 Add the prepare section: upload or UVTT import (stating the accepted file types the library states), the existing grid demo, and a walls panel drawing a shipped map's stored walls over its crop. Verify the walls panel draws the same segments that the 5.4 transform produces.
- [x] 5.8 Add the play grid, exactly five tiles:
  - area templates via `areaShape` and `tokensTouchingArea`, aimed by pointer or keys
  - dice, opening on a seeded settled roll
  - attacks, with `AnimationPreviewStage` imported on intersection and a real still under reduced motion
  - turn order via `TurnNotice` with a local state
  - conditions via `ConditionMarker`

  Verify with a test that caught tokens equal `tokensTouchingArea`'s output, and that the board renderer is not requested until the attack tile nears the viewport (network log without scrolling).
- [x] 5.9 Add the recover section: a local room built with `reduce`, a visitor's move through `decide` (`token.move`), Undo through `history.undo`, and log lines from `formatActivity`. Verify with a unit test that a move followed by Undo restores the position, and that the log holds the move and a separate undo entry.
- [x] 5.10 Add the players section, under a "joining a game" heading: a real capture of the player board in a phone frame, and a join action that scrolls to and opens the hero form. Verify with a test that the page contains exactly one join form, and that the action focuses its field.
- [x] 5.11 Add the library strip: whole built-in maps with a lighter grid and their catalogue size and grid, account-based wording, and no link to `/library`. Make it a marquee that becomes a static scroll-snap row under reduced motion. Verify with a test that no anchor targets `/library` and the wording mentions the account.
- [x] 5.12 Add the closing band with `closing`, a single "Start a room" action reusing the hero's label, and the footer. Verify no two CTAs on the page share an intent under different labels.
- [x] 5.13 Add a copy check test over the rendered page in both visibility views and after a valid and an invalid roll. It fails on implementation vocabulary (server, client, filter, snapshot, update stream, parser, overlay, code identifiers), partial features (movement budget, shared drawing, door or window detection) and em dashes. Verify the test passes.
- [x] 5.14 Record the landing chunk size before and after in the PR. Verify that loading `/` without scrolling downloads no Pixi chunk, and that LCP is the hero map crop.
- [x] 5.15 Update INTERFACE.md §11.5 (the home page sections) and add the imagery brief to §11.9. Verify the doc lists the sections as built. Then run `npm run lint && npm run typecheck && npm test` and verify all pass.

## 6. Integration

- [x] 6.1 Walk every surface (home, sign-in, sign-up, join, not-found, dashboard, library, a room as GM and as player, the encounter editor) in both themes where supported, at 1440px and 390px. Verify they share type, corners, accent use and header, and attach the screenshots to the final PR.
- [x] 6.2 With the in-app Reduced animations setting on, and separately with a `matchMedia` override reporting reduced motion, check the home page, a dialog and a dice roll. Verify no decorative animation runs on any of them.
- [ ] 6.3 Add a dated note to `docs/audits/ui-design-audit-2026-10-29.md` marking principles 2–4, UI-032, UI-034, C5 and C12 as addressed by this change. Verify each listed item matches a merged PR.

## 7. Home page art

- [x] 7.1 Generate a map for each home scene with ChatGPT: hero, sight, grid demo, walls panel, template tile and recovery board. Use no asset-library art; the attack preview's stage is the one exception. Give each scene its own theme and drawing style, draw it top-down to a square grid with room to move, and leave out text, creatures and frames. Verify each map against those rules. The first goblin camp was too empty, so replace it with a busier ruin in the same style.
- [x] 7.2 In each scene's own chat, generate its tokens in its map's style, and cut 192 px portraits for the board's round token. Verify on a contact sheet that each face fills its disc and that every scene's tokens match its map.
- [x] 7.3 Measure each map's drawn grid and add it to `homeCrops.json`, with `cellY` for grids that aren't square. Make the crop script scale each axis separately, and keep it producing the library's built-in thumbnails. Verify on the check images that the drawn grid sits on the 70 px lines in the far corner of each crop, and that the library thumbnails are byte-identical.
- [x] 7.4 Trace the walls of the tomb, the quay and the inn into `homeWalls.ts`, including the inn's doors and windows. Verify with overlays on the maps, and with tests: the walls panel draws exactly the transformed segments, and sight and movement follow the table's rules.
- [x] 7.5 Put the art into the hero, the sight demo, the grid and walls steps, the template, turn-order and conditions tiles, the recovery board and the library strip, and remove the old home art. Retake the phone capture on the tomb in the real app. Verify with the home tests, screenshots and the runtime demo checks.
- [x] 7.6 Update the gm-home and design-language specs, design.md Decision 11, INTERFACE.md §11.5 and §11.9, and the credits with every prompt. Verify with `openspec validate --strict`.
- [x] 7.7 Run `npm run lint && npm run typecheck && npm test` and verify all pass.

- [x] 7.8 Draw the line-of-sight demo's player view as the dimmed map: the board's own darkness colour for the map (`sightColor` of its measured average) at one shared `DIMMED_ALPHA`, also used for a player with no token. The hero keeps a thin drifting fog. Verify with a test that the dim layer uses the board's colour and strength and appears only in the player view, and with screenshots.
- [x] 7.9 Make the area-template tile place the sphere on a click or a drag, not follow the pointer. Move the goblin archer a square so its name clears the goblin. Verify with a component test (passing over, click, drag, leaving) and in a real browser.
- [x] 7.10 Take the area template out of the hero (review: "don't include aoe in the top pic"); the play section's tile still shows templates. Verify with a screenshot and the hero tests.

## Workflow follow-up

- Propose a separate change to add the room's current map to `GmRoomSummary` so dashboard cards can show it. It changes a shared schema, so it needs an ADR and the Real-Time Architecture owner's review.
- The group picks the product name and logo; update the wordmark constant and the logo asset.
- Archive this change after its PRs merge and the team's review is done.
- Offer the dimmed map at the table as a GM setting per room (the home demo's look). It needs a scene field, so an ADR and the Real-Time Architecture owner's review. Until then the table draws opaque darkness outside sight, except for a player with no token.
