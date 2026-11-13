## Why

Running a session takes too many detours. Painting terrain opens a modal with its own copy of the map. Locking a door is a hidden Shift-click. The GM's only way to change an enemy's HP is the roster editor. On the board, walls, doors and Difficult terrain are all drawn in similar orange, so the GM can't tell them apart, and the faint terrain fill disappears on sand, wood and dirt maps. Players also get a "Show" menu whose only row is Terrain, which starts off.

## What Changes

- **Terrain tool on the rail (GM).** A new rail tool paints terrain directly on the live board. Its options are the shape (brush or rectangle) and the paint (Normal to erase, Difficult or Blocked); it always paints Base. Terrain is always drawn while the tool is active. The toolbar's **Paint terrain** button and the live terrain dialog are removed, on desktop and from the phone Board options menu.
- **No terrain layers in the interface.** Every terrain control paints Base only: the rail tool and both map editors' Terrain steps lose Add / Rename / Remove layer and the layer list. This is UI only; the shared contract still accepts layer commands, and layers a room already has stay as they are.
- **Doors tool on the rail (GM).** A new rail tool with two modes, **Open/Close** and **Lock/Unlock**. Clicking a door or window applies the current mode. While it is active, portals are always drawn, plain walls are dimmed, and the portal under the pointer is highlighted. It only changes a portal's state; turning walls into portals stays in the map editor. Click and Shift-click on a portal with Select keep working as they do now.
- **Rail grouping.** A divider separates the play tools (Select, Measure, Draw, AoE, Eraser) from the GM tools (Fog, Terrain, Doors, Sight), like the existing divider above Clear. It appears only when GM tools are shown, including in the phone flyout.
- **Show menu is GM-only; terrain shows by default.** Terrain is drawn by default for everyone. Players no longer get a Show button. The GM's Show menu keeps its rows (Fog, Walls, Doors and windows, Terrain, Token view), with Terrain checked by default.
- **Clearer board colors.** One color palette is shared by the board and the map editor, and every element is drawn two-tone (a dark outline under a bright stroke or fill) so it reads on light and dark maps:
  - walls: green, thin
  - doors: orange, thick, with ticks at both ends; an open door shows a gap; a locked door has a red padlock badge
  - windows: light blue
  - Difficult terrain: purple, single-hatched, with a two-tone cell outline
  - Blocked terrain: red, crosshatched, two-tone
  - no "×2" or prohibition glyphs on terrain squares
- **Quick HP on the token card.** When a token is selected, its board token card shows −5, −1, +1 and +5 buttons for anyone allowed to edit that token. Selecting a token never changes the sidebar tab.

No shared schema, server, event or ADR changes: every action uses an existing command (`terrain.paint`, `portal.setState`, `token.setStats`).

## Capabilities

### New Capabilities
- `board-terrain-tool`: the GM's Terrain tool on the board's rail: options, painting on the live board, layer choice, and terrain shown while active.
- `board-doors-tool`: the GM's Doors tool on the rail: Open/Close and Lock/Unlock modes, portals shown and highlighted while active.
- `board-tool-rail`: how the rail groups its tools: play tools, a divider, GM tools, a divider, Clear.
- `board-palette`: the shared two-tone palette for walls, doors, windows and terrain on the board and in the map editor.
- `token-quick-hp`: quick damage and healing on the board's token card.

### Modified Capabilities
- `board-view-filters`: the Show menu becomes GM-only, Terrain is shown by default, and players get no Show control.
- `portals`: "Portals on the board" gains the door shape cues (end ticks, padlock badge) and the Doors tool as a second way for the GM to lock and unlock.

## Impact

- `apps/web/src/board/`: `tools.ts` (new `terrain` and `doors` tool kinds), `boardView.ts` (painting terrain, Doors tool clicks and hover, palette, drawing walls, doors and terrain), `Board.tsx` (toolbar, filters, terrain dialog entry), `BoardFilters.tsx`, `TokenCard.tsx`, a new `palette` module and a pure terrain-stroke helper.
- `apps/web/src/ui/ToolRail.tsx`: new tools, their options, the GM divider (desktop and phone).
- `apps/web/src/pages/mapEditor/TerrainSetup.tsx`: uses the shared stroke helper and palette.
- `apps/web/src/i18n/en` and `zh-TW`: new labels.
- Players see the new door and terrain colors too; walls stay GM-only.
- **Overlaps:** `terrain-panel-icons` also edits `TerrainSetup.tsx`. The in-progress `terrain-effect-layers-in-map-editors` adds layer UI to the map editors, which this change removes; it should be dropped or reconciled.
