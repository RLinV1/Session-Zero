# Proposal

## Why

The product looks like two different apps. The home page has a lit background with grain, Geist type, Geist Mono numbers, 6/12px corners and light and dark themes. Sign-in, join, the dashboard, the library and the table sit on flat charcoal with 4px corners and dark only. The table and the entry pages are set in Alegreya Sans with small-caps headings, and board labels are drawn in Helvetica. Rust, meant as the single accent, fills most buttons and every selected state at the table. The October UI audit (`docs/audits/ui-design-audit-2026-10-29.md`) logged these as failures and doc conflicts (principles 2–4, UI-032, UI-033, C5, C12). INTERFACE.md §11.9 and FRONTEND-CONTRACT §13.8 already chose Geist, Geist Mono and 6/12px corners for every surface, so most of this change applies decisions the team has made.

The home page also undersells the product. It shows four features: grid alignment, the library, hidden tokens and dice. Since then the table has shipped line of sight, flowing fog, shared area templates, attacks with animations, wall detection, UVTT import and export, checkpoints, replay and undo. "Recover safely", one of the README's four promises, is not on the page at all. Its hero is a map with three token chips, and every section below uses the same layout.

## What Changes

- **One design language, "the lit table".** Every screen is the same dark room, and what you are working on is what is lit. The amount of atmosphere is set by layer: most on the home page, less on the entry pages, a faint glow on the hub pages, and none at the table, where the board's own fog and line of sight do the lighting.
- **Shared tokens on `:root` for every surface:**
  - Geist for all text, including board labels.
  - Geist Mono with tabular figures for every number.
  - Corners of 6px on controls and 12px on surfaces, plus the spacing and type scales from §13.8.
  - One shadow, on overlays only.
  - **BREAKING (visual):** the table, the map and encounter editors, and the sign-in and join pages switch from Alegreya Sans to Geist. The Alegreya Google Fonts request is removed.
- **Accent discipline.** Rust marks only the one main action in a view and the active turn. Selected tabs and tools become a raised neutral surface with a rust indicator instead of a rust fill. The board takes its HP, selection and focus colours from the status and focus tokens instead of its own hex values.
- **Light and dark outside the table.** The home, entry and hub pages follow light, dark or the system setting, with one stored choice. The table stays dark.
- **Shared components:**
  - a header for the home, dashboard and library pages
  - a token disc, used the same way on the home page, library cards, roster rows and the board
  - a map thumbnail with its grid
  - one set of buttons, fields, tabs, menus and empty states
- **Faster library thumbnails.** Library map cards load the pre-cut thumbnails for built-in maps instead of the full maps (about 1.9 MB for four cards), and show a placeholder shaped like the card until an uploaded map loads.
- **Home page redesign:**
  - A hero with a live table scene, and a facts row.
  - Sections for preparing, playing, recovering and joining.
  - A library strip and a closing band.
  - Each demo runs the table's own code from `@vtt/shared`:
    - line of sight runs `sightPolygon` over a shipped map's walls
    - area templates use the template geometry
    - the undo demo runs `decide`, `reduce` and the undo helpers on a local room
    - the dice demo runs the dice parser and roller
  - The hero's primary action becomes "Start a room". Joining becomes a second action that opens the invite field in place, already open when this browser has joined rooms before.
- **One lighting brief for generated imagery.** Atmosphere images (hero photo, closing band, empty-state pictures, wood texture) share one written brief. Product imagery is always the real app.
- **Docs.** INTERFACE.md §11.9 is updated to describe the result: tokens, layers, light theme and imagery. This resolves audit conflicts C5 and C12.

## Capabilities

### New Capabilities
- `design-language`: the visual system every surface follows. It covers tokens, type, shapes, the accent rule, theme scope, the background for each layer, shared components, motion and reduced motion, and the imagery rules.

### Modified Capabilities
- `gm-home`: these home page requirements change:
  - **Rewritten:** the first screen's two paths, "you" addressing, what the demos must run, map crop rules, and what the page says is saved (accounts now exist).
  - **Removed:** "both grounds on the home page only". Theme scope moves to `design-language`.
  - **New:** coverage of preparing, joining, playing and recovering, and a rule against advertising features that are not built yet.

## Impact

- **apps/web:**
  - `styles.css` (tokens move to `:root`; Alegreya removed; radius and accent rules)
  - `index.html` (font link)
  - `theme.ts` (theme applied by route)
  - `App.tsx`
  - `pages/HomePage.tsx` (rewritten into section components)
  - `account/AccountPages.tsx`, `pages/JoinPage.tsx`, `pages/GmDashboardPage.tsx`, `pages/LibraryPage.tsx`
  - room chrome under `panels/` and `ui/`
  - `board/boardView.ts` and `board/animationPreview.ts` (label font, token colours)
  - new images under `public/img/`
- **packages/shared, apps/server:** no changes. The home demos import existing pure functions only. No schema or protocol change, so no ADR.
- **Docs:** INTERFACE.md §11.9 and §11.5; FRONTEND-CONTRACT §13.8 only where it lacks the light theme.
- **Review:** the table font change needs the Board owner's agreement (INTERFACE.md §11.1 makes interface direction their call). The product name is undecided, so the wordmark stays "Virtual Tabletop" inside one component.
- **Not in scope:**
  - Map thumbnails on dashboard room cards. `GmRoomSummary` carries no map, so this needs a shared schema change and an ADR; it is a follow-up.
  - A light theme for the table.
  - New features of any kind.
  - The stale `gm-home` requirements about device identity and the account placeholder, which describe the pre-account app.
