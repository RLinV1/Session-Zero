## Context

`GuestTutorial.tsx` renders one non-modal card. Every 400 ms it measures the control tagged `data-tutorial="<step>"`, puts the card beside it when the control is small and on screen, and otherwise shows a bottom sheet. The only highlight is a 2px outline (`[data-tutorial-active]` in `styles.css`). Step logic is pure in `tutorialSteps.ts` (`TUTORIAL_STEPS`, `isDone`, `settle`, `countMoves`) with unit tests. The demo's facts are counted since the demo began (`moves`, `invites`) or read from state (`tokens`, `fog`, `gmRolls`).

Controls live in different places: Share and the tool rail (Fog, Terrain) are always in the room chrome; Add token is in the Tokens tab; Roll is in the Dice tab; Edit map is in the Manage tab's Battle map section (`data-tour="gm-map"`, may be folded). `RoomPage` already has `chooseMap()`, which selects the Manage tab, opens the sidebar, unfolds the Battle map section and scrolls to it.

`/start` (`StartPage.tsx`) renders each map `<img width={640} height={457}>`. The CSS sets `width: 100%; aspect-ratio: 4/3`, but the `height="457"` attribute maps to a CSS height of 457px, which wins over `aspect-ratio`. Each ~273px-wide card becomes 457px tall, and `object-fit: cover` crops it into a portrait. The shipped thumbnails are 640x360 (16:9).

## Goals / Non-Goals

**Goals:** make each step's control obvious and reachable; teach Edit map and Terrain; fix the start page thumbnails.

**Non-Goals:** no change to which actions count for existing steps; no server, schema or event change; no change to the account GM's `GuideTour`; no guided walk inside the map editor's own steps (the editor already has `EditorGuide`).

## Decisions

### D1. Spotlight is one fixed ring element with a huge box-shadow
`GuestTutorial` renders a `div.tutorial-spotlight` (`position: fixed; pointer-events: none; aria-hidden`) sized to the control's rect plus 6px padding, with `box-shadow: 0 0 0 9999px <dim>` for the dim and a 2px focus-colored border for the ring. It reuses the existing 400 ms measure loop and resize listener, plus a capture-phase `scroll` listener so it tracks sidebar scrolling.
- Why: no clip-path or SVG mask, and `pointer-events: none` keeps the room fully usable, so the demo stays non-modal as guest-gm-hosting requires.
- Alternative: an SVG mask with a hole. More code for the same look.
- The existing large-control rule (board, or over half the screen) still applies: no spotlight there, same as no "beside" placement today.
- Dim color is a token on `:root` with a dark-mode value; the ring pulses only under `prefers-reduced-motion: no-preference`.
- z-index: spotlight just under the card (card is 40), above board and panels; it does not cover modals (Modal z-index is higher), so the Edit map dialog is never dimmed.

### D2. Arrow is a CSS caret on the card
When the card is "beside", it gets `data-side="below|above"` and an `--arrow-x` custom property (control's center minus card left, clamped inside the card). A `::before` triangle points at the control. No arrow in sheet mode.

### D3. Show me is a `reveal` callback from RoomPage
`GuestTutorial` gains a prop `reveal(step)`. `RoomPage` maps steps to places: `token` → Tokens tab; `roll` → Dice tab; `map` → `chooseMap()` (Manage tab, Battle map section unfolded); `invite`, `fog`, `terrain` → open the sidebar is not needed, so `scrollIntoView` the control (on compact layouts the tool rail may be in a drawer, so open it if the layout has one). After revealing, `GuestTutorial` calls `scrollIntoView({ block: "center" })` on the anchor and the next measure spotlights it.
- The card shows Show me when the measure finds no visible anchor (the same test that today picks the sheet). This is a state flag set by the measure loop.
- Why a callback: tabs and the sidebar are `RoomPage` state; the tutorial must not click DOM buttons to drive them (chooseMap's own section-toggle click is existing code and is reused, not copied).

### D4. Map and terrain facts are change counters, like moves
`TutorialFacts` gains `mapEdits` and `terrainEdits`. `GuestTutorial` keeps a key of the map setup (`JSON.stringify(scene.grid)` + map URL + sorted wall ids and their positions hashed as one string) and of terrain (`JSON.stringify(state.terrain ?? null)`), and counts how many times each key changed since the demo began (reset on restart, like `moves`). `isDone.map = f => f.mapEdits > 0`, `isDone.terrain = f => f.terrainEdits > 0`.
- Why a key, not `terrainRevision`: terrainRevision is GM-only and documented as an edit fence, not a content signal; the terrain object itself is what the GM sees. Map setup has no revision.
- Anchors: `data-tutorial="map"` on the Edit map button in `GmPanel`; `data-tutorial="terrain"` on the Terrain rail button (`ToolRail` already maps `fog` this way).

### D5. Step order and stored progress
New order: `table, invite, map, terrain, token, move, fog, roll, done` (9 steps). Progress is stored as an index, so a saved index from the old 7-step list now names a different step. `settle` skips already-done steps, so the worst case is a guest GM mid-demo being shown one earlier step again. Accepted: guest rooms are short-lived and the demo is a convenience. The `guest-gm-hosting` change's step list in `specs/guest-hosting/spec.md` is updated in place to the new list so the two changes agree when archived.

### D6. Start page thumbnails
Set the `<img>` attributes to the real thumbnail size (`width={640} height={360}`), and in CSS `.start-map img { height: auto; aspect-ratio: 16 / 9; }`. Grid: `repeat(auto-fill, minmax(12rem, 16rem))` so cards are capped at 16rem and more fit per row; keep two columns under 760px.

## Risks / Trade-offs

- [Spotlight dims the sidebar while the GM needs it] → only the dim, never input blocking; dim alpha is light (about 0.45) so the room stays readable.
- [Measure every 400 ms + scroll listener cost] → one `getBoundingClientRect` per tick; scroll handler is passive and only sets state when the rect changes.
- [Map key misses an edit type the editor applies (e.g. sight setup only)] → the step text names grid and walls; any of those applies. Other editor changes simply do not count.
- [Old progress index shifts] → see D5.
