## 1. Step logic

- [x] 1.1 In `apps/web/src/ui/tutorialSteps.ts`, set `TUTORIAL_STEPS` to `table, invite, map, terrain, token, move, fog, roll, done`, add `mapEdits` and `terrainEdits` to `TutorialFacts`, and their `isDone` rules (D4, D5). Verify: unit tests in the existing tutorialSteps test file cover `settle` skipping map and terrain when their counters are above 0, and pass.
- [x] 1.2 Add a small pure helper that counts key changes (generalize or sit beside `countMoves`) and use it for map-setup and terrain keys. Verify: a unit test shows unchanged keys count 0 and one change counts 1.

## 2. Anchors and copy

- [x] 2.1 Add `data-tutorial="map"` to the Edit map button in `apps/web/src/pages/GmPanel.tsx` and `data-tutorial="terrain"` to the Terrain rail button in `apps/web/src/ui/ToolRail.tsx`. Verify: both attributes render in a guest room (browser check in 4.2).
- [x] 2.2 Add `tutorial.map.*`, `tutorial.terrain.*` and `tutorial.showMe` strings to en and zh-TW `panels.ts` (terms per `docs/GLOSSARY-zh-TW.md`), add both titles to the `TITLE` map. Verify: `npm run typecheck` and `npm run lint` pass (lint enforces no literal UI text).

## 3. Spotlight, arrow, Show me

- [x] 3.1 In `GuestTutorial.tsx`, track map-setup and terrain keys and their change counts (reset on restart, like `moves`), and pass them into `facts`. Verify: browser check in 4.2 advances both steps.
- [x] 3.2 Render the fixed, `pointer-events: none`, `aria-hidden` spotlight ring with box-shadow dim over the anchor's rect, following the measure loop plus a passive capture `scroll` listener; skip it for the board or controls over half the screen (D1). Add CSS tokens for the dim color in light and dark, and a pulse only under `prefers-reduced-motion: no-preference`. Verify: in the browser the Share button is ringed and clickable on "Invite players".
- [x] 3.3 Add the card arrow (`data-side`, `--arrow-x`, `::before`) when beside (D2). Verify: screenshot shows the caret pointing at the control.
- [x] 3.4 Add a `reveal(step)` prop; in `RoomPage.tsx` map `token` to the Tokens tab, `roll` to the Dice tab, `map` to `chooseMap()`, others to scrolling the control into view; show a Show me button only when the anchor is not visible (D3). Verify: from the Chat tab, Show me on "Place a token" selects Tokens and spotlights the add-token buttons without adding a token.

## 4. Start page and checks

- [x] 4.1 In `StartPage.tsx` set the map `<img>` to `width={640} height={360}`; in `styles.css` give `.start-map img` `height: auto; aspect-ratio: 16 / 9` and the grid `repeat(auto-fill, minmax(12rem, 16rem))` (D6). Verify: at 1024x768 three or more 16:9 cards show above the fold; at 390px two per row, no sideways scroll.
- [x] 4.2 Walk the whole demo in a guest room in the browser at 1280px and 390px: each step spotlights or offers Show me, Prepare the map advances after applying a grid change, Paint terrain advances after painting, Escape still skips. Verify: screenshots of the spotlit Roll button and the map step.
- [x] 4.3 Update the step list in `openspec/changes/guest-gm-hosting/specs/guest-hosting/spec.md` ("A guest room offers an interactive demo") to the new nine steps (D5). Verify: `openspec validate tutorial-spotlight-guidance --strict` passes.
- [x] 4.4 Run `npm run lint && npm run typecheck && npm test` once at the end. Verify: all three pass.
