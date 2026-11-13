# Tasks

## 1. Shared helpers

- [x] 1.1 Extract the terrain stroke model from `TerrainSetup.tsx` into pure `apps/web/src/board/terrainStroke.ts` (start, extend for brush and rectangle, 10,000-cell cap, map bounds, to `PaintRun[]`); switch `TerrainSetup` to it; verify with new `apps/web/test/terrainStroke.test.ts` (brush line, rectangle, cap error, out-of-map cells) and the existing map-editor terrain tests passing
- [x] 1.2 Add `apps/web/src/ui/hpChange.ts` with `applyHpDelta` (clamp to `[MIN_HP, maxHp ?? 9999]`); use it in `MyTokens.tsx`; verify with `apps/web/test/hpChange.test.ts`
- [x] 1.3 Add `apps/web/src/board/mapPalette.ts` (wall green, door orange, window light blue, lock red, difficult purple, blocked red, each with inner and outer colour) and matching `--map-*` custom properties in `styles.css`; verify `npm run typecheck` passes

## 2. Palette and drawing

- [x] 2.1 Redraw walls in `boardView.ts` with the palette's two-tone wall green; verify visually on a shipped map that walls are green with a dark outline
- [x] 2.2 Redraw portals: door orange, window blue, two-tone, end ticks at both jambs, open-gap kept, padlock badge for locked, never thinner than `PORTAL_MIN_PX`; verify visually that closed, open and locked doors and windows are distinct from walls at min and max zoom (spec `portals` "Portals on the board")
- [x] 2.3 Redraw terrain on the board: purple single-hatched Difficult and red crosshatched Blocked (shared `terrainHatch`), two-tone cell outline, no glyphs, layer corner markers in the same colours; verify visually on a light (sand) map and a dark map (spec `board-palette`)
- [x] 2.4 Switch `TerrainCells` and the map editor's wall, portal and legend CSS (`styles.css` wall-stroke, legend-line, walls-legend-swatch, terrain-control accents) to the palette; verify the editor's Terrain and Walls steps match the board

## 3. Show menu

- [x] 3.1 In `Board.tsx`, make `showTerrain` default `true` and render `BoardFilters` (desktop and phone Funnel popover) only for the GM; verify with a web test that a player's board has no Show control and the GM's Show lists Terrain checked (spec `board-view-filters`)

## 4. Rail grouping and new tool kinds

- [x] 4.1 Add `terrain` and `doors` kinds to `BoardTool` (`board/tools.ts`), and `terrain` and `doors` entries to `ToolOptions` and `DEFAULT_TOOL_OPTIONS` with fallbacks for saved options that lack them; verify with a `toolFor` unit test, including an old saved-options object
- [x] 4.2 In `ToolRail.tsx`, add Terrain and Doors (GM only), group tools into play and GM with a `rail-divider` between them (only when a GM tool shows), Sight inside the GM group, and the same divider in the phone flyout; verify with a rail test for GM and player orderings and the select-only case (spec `board-tool-rail`)
- [x] 4.3 Add Terrain options to the rail (Brush/Rectangle, Normal/Difficult/Blocked) and Doors options (Open/Close, Lock/Unlock); add the `en` and `zh-TW` catalog ids following `docs/GLOSSARY-zh-TW.md`; verify `npm run lint` (i18n rule) passes

## 5. Terrain tool on the board

- [x] 5.1 In `boardView.ts`, handle the terrain tool gesture with `terrainStroke`: draw the preview in the mark layer, Esc or right-click cancels, capture `{ boardEpoch, revision }` at stroke start, and on release call a new `paintTerrain` callback; verify a brush drag and a rectangle drag in the running app change terrain for a second (player) client
- [x] 5.2 In `Board.tsx`, wire `paintTerrain` to `terrain.paint`, show refusals in the existing refusal banner, show "add a map first" with no map; strokes always paint Base; verify with a test that a refused paint shows the server message and clears the draft
- [x] 5.3 Draw terrain while the Terrain tool is active even when Show has Terrain off (derived `effectiveShowTerrain`); verify Show's checkbox is unchanged after leaving the tool
- [x] 5.4 Remove the toolbar Paint terrain button (desktop), its phone Board options entry and the live terrain dialog; verify the toolbar no longer shows it (spec `board-terrain-tool`)

## 6. Doors tool on the board

- [x] 6.1 Let `portalUnder()` answer for the doors tool, highlight the hovered portal, dim plain walls, and force portals visible while the tool is active; verify visually and confirm the Show checkbox is unchanged after leaving the tool
- [x] 6.2 In `Board.tsx`, map Doors-tool clicks to `portal.setState` by mode (Toggle: open→closed, closed or locked→open; Lock: open or closed→locked, locked→closed), and do nothing on non-portal clicks; verify with a unit test of the mapping and an app check that locking reaches a player client; confirm Select click and Shift-click still work (spec `board-doors-tool`)

## 7. Quick HP on the token card

- [x] 7.1 Add −5/−1/+1/+5 buttons (no typed amount) to `TokenCard.tsx`, shown only when `!readOnly && can.editToken && hp !== null && !statHidden`; send `token.setStats` via `applyHpDelta`, disable while in flight, and show refusals; verify with a web test for the GM on an NPC, an owner on their token, a player on another's token (no controls) and the max-HP cap (spec `token-quick-hp`)
- [x] 7.2 Confirm that selecting a token never changes the side panel's tab, and that the card has no roster button; verify with Board and TokenCard tests

## 8. Base-only terrain

- [x] 8.1 Remove every layer control: the rail's Layer select and Manage layers, and the layer list / Add / Rename / Remove in `TerrainSetup` (and its `layers` prop in `GmPanel` and `LibraryMapEditor`); drop unused catalog ids and CSS; verify with tests that no layer UI appears and a stroke in a room with an existing layer paints Base (spec `board-terrain-tool`)

## 9. Wrap-up

- [x] 9.1 Run `npm run lint && npm run typecheck && npm test`, and confirm all pass
- [x] 9.2 Check every flow in the running app (`npm run dev`) on desktop and phone width, as GM and as player: rail grouping, Terrain and Doors tools, the Show menu, colours on light and dark maps, and quick HP
- [x] 9.3 Run `openspec validate board-tools-and-legibility --strict` and fix any findings
