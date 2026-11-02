# Design

## Context

See proposal.md for the motivation. The state of the code that shapes the approach:

- **Tokens are split by page.** `styles.css` `:root` holds the slate-and-rust tokens, `--radius: 4px` and three font variables:
  - `--font-body: "Alegreya Sans"`
  - `--font-label: "Alegreya Sans SC"`
  - `--font-ui: "Geist Sans"`, used only by `.home-page` and `.gm-page`

  The home page's lighting, `--font-mono` and the whole light palette live under `.home-page` and `:root[data-theme="light"] .home-page`. Alegreya comes from a Google Fonts `<link>` in `index.html`. Geist and Geist Mono are self-hosted through `@fontsource` in `main.tsx`.
- **The theme is set per page.** `theme.ts` `useGroundTheme` is called only by `HomePage`. It sets `data-theme` on `<html>` in an effect and removes it on unmount, with the choice stored under `vtt.theme`.
- **The base `button` is rust.** The audit found that rust therefore marks most buttons and every selected state (principle 2).
- **The board uses its own font and colours.** `boardView.ts` draws labels in `BOARD_FONT = '"Helvetica Neue", Arial, sans-serif'` and HP bars in its own hex values. `animationPreview.ts` labels use Alegreya.
- **The home page can run the table's code.** `packages/shared` is pure TypeScript, and the home page already imports the dice parser from it. The relevant exports:
  - `sightPolygon` (line of sight)
  - `storedWallsFor` / `SHIPPED_MAPS` (walls for all four shipped maps)
  - `decide`, `reduce` (which records undo history in `state.undo`), `history.undo`
  - `formatActivity` (activity log lines)
  - `board/tools.ts` `areaShape` / `tokensTouchingArea` import only from `@vtt/shared`, with no Pixi
- **Home map crops have known geometry.** The crops are cut by `apps/web/scripts/home-maps.mjs` from a grid-square origin with scale `70 / cell`, so any shipped map's walls can be moved into crop coordinates.
- **The library loads full maps as thumbnails.** `LibraryPage` renders `<img src={asset.url}>` for each map card, about 1.9 MB for the four built-ins. Pre-cut thumbnails (67–84 KB) already exist under `public/img/home/`.
- **Pixi is kept off the landing on purpose.** `App.tsx` lazy-loads every page that uses Pixi.
- **The room list cannot carry maps.** `GmRoomSummary` has no map field.

## Goals / Non-Goals

**Goals:**
- One `:root` token set that every surface reads, with surfaces differing only by which layer they declare.
- Apply the change in four reviewable PRs, each one shippable on its own.
- Make every home page demo run the table's code, so the page cannot drift from the product.

**Non-Goals:**
- Light theme at the table, or a third theme.
- Any change to `packages/shared`, the server, or the protocol.
- A component library or CSS framework migration. This stays in `styles.css` and React.
- Choosing the product name.

## Decisions

### 1. Tokens on `:root`, layers by attribute

All tokens move to `:root`, along with the light overrides under `:root[data-theme="light"]`:
- colours
- `--font-ui`, `--font-mono`
- `--radius-control: 6px`, `--radius-surface: 12px`
- the spacing scale
- easing and the three durations

A `data-layer` attribute on `<html>` (`home`, `entry`, `hub`, `table`) selects the ambient background and the density, not the colours.

*Alternatives:* keep page-scoped token blocks like `.home-page`. That is how the drift happened, so it is rejected. A CSS-in-JS theme object would be a framework change for no gain.

### 2. Theme and layer applied by route, before paint

`App.tsx` maps each route to a layer:
- `home` → home
- `signin`, `signup`, `join`, `notFound` → entry
- `gmDashboard`, `library` → hub
- `room`, `encounterEdit` → table

A single `useRouteLayer(route)` hook sets `data-layer`, and for every layer except table it sets `data-theme` from the stored choice. For table it forces dark. `main.tsx` applies the stored theme synchronously before `createRoot`, so a light-theme visitor never sees a dark flash. The storage key stays `vtt.theme`, so existing choices carry over. The theme toggle moves into the shared header.

*Alternative:* each page calls `useGroundTheme`. This flashes on navigation and is easy to forget, so it is rejected.

### 3. Geist everywhere, Pixi waits for it

- Remove the Google Fonts `<link>`.
- Point `--font-body` and `--font-label` at `--font-ui`, then delete them once nothing references them.
- Small-caps panel headings become sentence-case 14px semibold muted text.
- `BOARD_FONT` and the animation preview label face become `"Geist Sans"`.

Pixi measures text on first draw. The board's first label draw therefore awaits `document.fonts.load('600 14px "Geist Sans"')` with a short timeout. Labels drawn before the font is ready are redrawn once on `document.fonts.ready`.

*Alternative:* keep Alegreya for the table. That leaves audit conflict C5 open and keeps a third-party font request. This is the decision the Board owner signs off on (see Migration).

### 4. Invert the button default

The base `button` becomes the neutral control. Rust moves to an explicit primary variant, a `primary` class following the existing `.cta` / `.ui-button` naming. Each view gets one primary button, chosen per the "Rust marks one action" requirement.

Selected tabs, tools and segments use a shared `[aria-selected="true"], [aria-pressed="true"]` treatment: a raised neutral surface plus a 2px rust inset indicator. This replaces their per-component rust fills.

*Alternative:* keep rust as the default and add a neutral class to every secondary button. That needs more edits, and the wrong default stays in place for the next button anyone writes.

### 5. Board colours read from CSS

A small `ui/palette.ts` reads `--ok`, `--warn`, `--danger` and `--focus` from `getComputedStyle(document.documentElement)` once when the board is created. It converts them to Pixi numbers and falls back to the current constants. The table is always dark, so reading once is enough.

HP thresholds move into one shared helper used by the board, the roster and the home page's token disc. The current home `hpColor` is the model: above 50% ok, above 25% warn, otherwise danger.

*Alternative:* duplicate the hex values in TypeScript. That drifts the same way it does today.

### 6. Ambient layers as one component

`ui/Ambient.tsx` renders the fixed layers for the current `data-layer`: lamp gradients, grain, the grid pattern, fog, and the photo plate. Each layer is a `position: fixed; pointer-events: none` element whose animation is limited to transform and opacity. The table renders no `Ambient`.

The entry layer's blurred photo is blurred ahead of time by a `sharp` script (sharp is already a dev dependency), not with CSS `filter: blur`, which repaints on the GPU. Fog dividers reuse the board's own fog puff art from `public/img/fog/`, so the home page's fog is the table's fog.

### 7. One reduced-motion switch for CSS

`main.tsx` and the client settings store keep a `data-motion="reduced"` attribute on `<html>` in sync with either the OS query or the in-app `reducedAnimations` setting. All CSS keyframes and transitions are gated on `:root:not([data-motion="reduced"])`, as well as the existing media query.

This fixes the audit finding that roll card and total entrance keyframes ignored the in-app setting. JS paths keep their existing checks.

### 8. Home demos run the shared kernel; Pixi only where unavoidable

- **Line of sight:** a module holds each shipped map's crop origin (column, row) and scale, so the crop table is no longer private to `home-maps.mjs`. The script imports it.
  - Walls from `storedWallsFor` are transformed into crop pixels.
  - `sightPolygon(segments, origin, {1400, 788})` gives the lit area.
  - It is drawn as an SVG mask: map lit inside; outside, the map dimmed in the board's own darkness colour for that map (`sightColor` of its average colour) at `DIMMED_ALPHA`. Review picked the dimmed map over fog art, pure black and the table's opaque darkness. The table draws opaque darkness, so the demo shows a look the table only gives a player with no token; offering it to every room is a follow-up (a GM setting, which needs a scene field and an ADR).
  - Moving the token snaps with `snapTokenCenter` and refuses moves for which `pathCrossesWall` is true, like the table.
- **Area templates:** `areaShape` and `tokensTouchingArea` from `board/tools.ts`, drawn in SVG.
- **Undo:**
  - A local `RoomState` is built by `reduce`-ing a short scripted list of setup events.
  - A visitor's move is a `token.move` command run through `decide` with a local `DecideContext` (counter-based `newId`), then `reduce`d with event meta.
  - Undo is a `history.undo` command through the same path.
  - Log lines come from `formatActivity`. The undo appears as its own entry, as at the table.
- **Dice:** unchanged. The demo also seeds one settled example roll at mount, so it never opens empty.
- **Attacks:** the play grid's attack tile is the one place that needs Pixi. It dynamically imports `AnimationPreviewStage` when the tile comes within one viewport (IntersectionObserver). Under reduced motion it shows a real still capture instead.
- **Initiative:** `InitiativeTracker` requires a `RoomConnection`, so the tile renders the `TurnNotice` component with a reduced local state instead. No fake connection is built.
- **Conditions:** `ConditionMarker` takes only a condition id, so the conditions tile renders the real markers. Each one shows its shape and abbreviation as well as its colour (FR-TAC-08).

*Alternatives:* recorded videos of the board (heavy, no theme, not operable, and a depiction rather than the product's behaviour), or a live Pixi board in the hero (puts Pixi on the critical path).

### 9. The hero scene is HTML and SVG

The hero is composed from the map crop `<img>` (the LCP element, `fetchpriority="high"`), the faint grid SVG, token discs, and the sight mask from Decision 8 with a thin layer of fog art outside it. Review took out the cone template it first had; templates are shown in the play section. It reuses Decision 8's code at a fixed token position, and the only thing it animates is the fog drift. No Pixi, so the landing stays light.

### 10. Home page split into section files

`HomePage.tsx` (716 lines) becomes `pages/home/` with one file per section plus `HomePage.tsx` composing them. `MapGrid` and `TokenChip` move to `ui/` as the shared `MapGrid` and `TokenDisc`, which the library cards and roster rows adopt. The built-in thumbnail table (`THUMBS`) moves next to `BUILTIN_ASSETS`, so the library and the home strip share it.

### 11. Generated images live in one folder with credits

Generated images go under `public/img/ambient/` as WebP, with a `CREDITS.md` recording the tool and the lighting brief used, matching the existing `CREDITS.md` convention in `public/img/preview/` and `public/sfx/`. The brief itself is written into INTERFACE.md §11.9, so the next image follows it. Light-theme variants share filenames with a `-light` suffix.

The home page's demo maps and tokens are generated too, and they don't use the library's built-in maps. Built-in maps from one set make every section look alike, and their painted style reads as generated. Each scene therefore gets its own theme and drawing style:

| Scene | Section | Style |
| --- | --- | --- |
| Canal market | Hero | Ink and watercolour |
| Desert tomb | Sight | Gouache |
| Dwarven forge | Grid | Coloured pencil |
| Coaching inn | Walls | Technical-pen floor plan |
| Goblin ruin | Templates | Linocut |
| Ship's deck | Recovery | Risograph |

Each scene's tokens are drawn in its map's chat, in that map's style.
- **Grids.** Maps are drawn to a square grid. Each grid is measured, and the crop script scales each axis on its own so every crop has exact 70 px squares.
- **Walls.** The walls the demos run on are traced by hand into `pages/home/homeWalls.ts`, because these maps have no stored walls.
- **Records.** Sources live in `scripts/home-src/`, and the prompts are in `public/img/home/CREDITS.md`.

## Risks / Trade-offs

- **[Risk]** Geist sets wider than Alegreya Sans, so table panels may overflow at 720–1024px or at 200% zoom. → PR 2 checks the panel at 720, 1024 and 1440 widths and at 200% text zoom before merge; labels may wrap, never truncate essential text (§13.8).
- **[Risk]** Pixi caches fallback metrics if the font loads late, leaving labels in a system face. → Decision 3's await plus one redraw on `fonts.ready`; covered by a web test that stubs `document.fonts`.
- **[Risk]** Inverting the button default silently demotes buttons that should stay primary. → PR 2 lists every rust-filled button before the change (grep plus a runtime walk of each panel) and names the one primary per region in the PR description.
- **[Risk]** Running `decide` and `reduce` on the home page grows its bundle. → The recovery and sight demos load as their own chunks when near the viewport; measure the landing chunk before and after in the PR.
- **[Risk]** Ambient layers cost frames on low-end phones. → Fixed layers only, transform/opacity animation only, fog drift disabled under 720px wide and under reduced motion.
- **[Trade-off]** Dashboard room cards stay text-only (name, preset, last active) until `GmRoomSummary` carries a map, which needs an ADR and the Real-Time Architecture owner's review. Recorded as a follow-up, not done here.
- **[Trade-off]** Moving the crop table out of `home-maps.mjs` couples the script to a TS module. It is the only way to keep wall coordinates and image crops from disagreeing.

## Migration Plan

Four PRs, in order. Each passes `npm run lint && npm run typecheck && npm test` and gets screenshots of every surface in both themes at 1440px and 390px:

1. **Tokens and theme plumbing:** Decisions 1, 2, 5 and 7, plus the token, theme and motion parts of INTERFACE.md §11.9 and FRONTEND-CONTRACT §13.8. Visual change is small and global.
2. **The table:** Decisions 3 and 4, plus §11.9's typography and accent rule. This needs the Board owner's agreement on the font before merge.
3. **Entry and hub pages:** shared header, Ambient for entry and hub (Decision 6), library thumbnails, empty states, plus §11.9's layers and shared components. This needs the generated images.
4. **Home page:** Decisions 8–11, plus INTERFACE.md §11.5 and the imagery brief in §11.9.

Rollback is per PR. PR 1 can be reverted alone, because later PRs only consume tokens it defines.

## Open Questions

- The product name and logo mark. The wordmark lives in the shared header component, so the group's pick is a one-file change.
- The final headline wording. Two candidates are recorded in tasks.md, and the choice doesn't change structure.
- Which shipped map each home section uses. Any of the four has walls and a crop, so this is an art direction call.
