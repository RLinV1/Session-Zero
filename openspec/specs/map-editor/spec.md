# map-editor Specification

## Purpose
Gives the GM one full-screen place to set up a battle map (its image, its grid and its walls), separate from the board the table plays on.

## Requirements

### Requirement: Map setup opens as its own screen
When the room has a map, Manage › Battle map SHALL offer the GM two controls: Change map and Edit map. Players SHALL NOT see them. Both SHALL open the same full-screen editor with its own header, step navigation, a map canvas and a side panel. Change map SHALL offer only the Map and Grid steps and SHALL open on Map; while a UVTT import's draft is open it SHALL also offer a Walls step, to review the imported walls before Apply. Edit map SHALL offer the Grid, Walls, Fog, Sight and Terrain steps for the room's current map, SHALL open on Grid, and SHALL NOT offer the Map step. For a fixed map (a temporary template-editing room), Battle map SHALL offer only Edit map, with its Grid and Fog steps. The editor SHALL NOT offer Export .uvtt. When the room has no map, Manage › Battle map SHALL offer Upload map and, with a library, From library instead. Opening and closing the editor SHALL NOT disconnect the GM or trigger a resync. Closing it SHALL return focus to the control that opened it, or to the board when the editor closed itself after Apply map.

#### Scenario: Open the editor
- **WHEN** the room has a map and the GM presses Edit map
- **THEN** a full-screen editor opens on the Grid step, its step navigation offers Grid, Walls, Fog, Sight and Terrain and no Map step, and the room keeps updating behind it

#### Scenario: Open Change map
- **WHEN** the room has a map and the GM presses Change map
- **THEN** the editor opens on the Map step, and its step navigation offers only Map and Grid

#### Scenario: UVTT import in Change map
- **WHEN** the GM uploads a .uvtt file in Change map
- **THEN** the step navigation offers Map, Grid and Walls, and the imported walls can be edited before Apply map

#### Scenario: Each control opens its own step
- **WHEN** the GM opens the editor with Edit map and picks Walls, Fog, Sight or Terrain in its step navigation
- **THEN** the editor shows that step

#### Scenario: Template-editing room
- **WHEN** the GM opens Manage › Battle map in a temporary template-editing room
- **THEN** only Edit map is offered, and it opens with the Grid and Fog steps

#### Scenario: No export in the room editor
- **WHEN** the GM opens the editor with Change map or Edit map
- **THEN** no step offers Export .uvtt

#### Scenario: No map yet
- **WHEN** the room has no map
- **THEN** Manage › Battle map offers Upload map and From library, and neither Change map nor Edit map

#### Scenario: Close the editor
- **WHEN** the GM opens the editor with Edit map and closes it with nothing unsaved
- **THEN** the board is shown again and focus is on Edit map

### Requirement: The editor's steps follow the setup order
In Change map, the Map step SHALL offer uploading an image and choosing one from the library. A chosen image SHALL become a private draft and the editor SHALL move to the Grid step to align it, with Apply map publishing both. When the map has tokens on it, Apply map SHALL first ask what to do with them ("Tokens already on the table"). Once the map is applied, whichever token choice the GM made, the editor SHALL close and show the board. With Select and place, the board SHALL already be in placement mode for the ticked tokens, so the GM's next click on the board places them. If applying fails, the editor SHALL stay open on the Grid step with the draft and show why. Cancelling the token question SHALL leave the editor open with the draft. In Edit map, the Grid step SHALL edit the room's current grid. Walls, Fog, Sight and Terrain SHALL edit the room's current map.

#### Scenario: New map end to end
- **WHEN** the GM presses Change map, uploads an image in the Map step, aligns the grid and presses Apply map on a map with no tokens
- **THEN** the table shows the new map and grid, the editor closes and the board is shown

#### Scenario: Select and place goes straight to the board
- **WHEN** the map has Aria and Borin on it, and the GM presses Change map, picks a library map, presses Apply map, chooses Select and place with both ticked, and applies
- **THEN** the editor closes, the board is in placement mode for Aria and Borin, and one click on a square places them

#### Scenario: Scale to fit also returns to the board
- **WHEN** the GM applies a new map with Scale to fit
- **THEN** the editor closes and the board shows the new map with the tokens moved

#### Scenario: Apply fails
- **WHEN** the GM presses Apply map and the room rejects it
- **THEN** the editor stays open on the Grid step with the draft, and shows why

#### Scenario: Cancel the token question
- **WHEN** the GM presses Apply map and cancels the "Tokens already on the table" question
- **THEN** the editor stays open with the draft map, and nothing is sent

#### Scenario: Walls before a map
- **WHEN** the room has no map
- **THEN** neither Change map nor Edit map is offered, so there is no Walls step until the GM applies a map with Upload map or From library

#### Scenario: Walls after a new map
- **WHEN** the GM has applied a new image with Change map and wants to draw its walls
- **THEN** pressing Edit map and choosing Walls shows the new map

### Requirement: Walls are edited in the editor's Walls step
The Walls step SHALL show the map with its walls, and offer Draw, Erase and Detect like this, plus automatic detection with its preview, Apply walls and Clear walls. The board's tool rail SHALL NOT offer a Walls tool. The GM's board SHALL still draw applied walls.

#### Scenario: Erase a false wall
- **WHEN** the GM chooses Erase in the Walls step and clicks a wall on the canvas
- **THEN** that wall is removed from the room

### Requirement: The app runs without wall detection
The server SHALL report whether it can detect walls: a queue is configured and at least one vision worker is connected. When it cannot, Detect walls and Detect like this SHALL be shown disabled with the reason. Drawing and erasing walls, and everything else, SHALL work.

#### Scenario: No Redis or no worker
- **WHEN** the app runs without Redis, or with no wall worker connected
- **THEN** the Walls step shows detection as unavailable, its detect controls are disabled, and Draw and Erase still work

### Requirement: The editor works on phones and tablets
The editor SHALL fit the viewport at phone, tablet and desktop sizes with its close button visible. On narrow or portrait screens the canvas SHALL sit above the side panel, and the panel SHALL scroll on its own instead of pushing the canvas off-screen. Every editor control SHALL be at least 44 by 44 CSS pixels. On the wall canvas, a two-finger pinch SHALL zoom about the fingers' midpoint and a two-finger drag SHALL pan in every mode. A single-finger tap SHALL do the mode's action, and a single-finger drag SHALL pan in Pan mode.

#### Scenario: Pinch while drawing
- **WHEN** the GM is in Draw mode on a phone and pinches the wall canvas
- **THEN** the canvas zooms about the pinch midpoint and no wall is added

#### Scenario: Phone portrait
- **WHEN** the GM opens the Walls step at 390 by 844
- **THEN** the canvas shows above the tools, the tools panel scrolls, and the close button stays reachable

### Requirement: Leaving a step with unsaved changes asks
When the GM chooses another step in the editor while the current step has unsaved changes, the editor SHALL ask whether to save, discard, or keep editing before switching. Unsaved changes are walls or fog that differ from the room, grid edits to the room's current map that differ from its grid, or a draft map. A draft map exists only in Change map. Save SHALL use the existing save for that kind of change (Save changes, applying the grid, or Apply map) and SHALL switch only if it succeeds. If it fails, the editor SHALL stay on the current step and show why. Save SHALL be unavailable, with the reason shown, when the grid is not valid. Discard SHALL drop those changes and switch. Keep editing SHALL stay on the current step with the changes kept. Step changes the editor makes itself SHALL NOT ask. Closing the editor with any unsaved changes SHALL ask the same way.

#### Scenario: Walls to Fog with unsaved walls
- **WHEN** the GM draws a wall in the Walls step and chooses the Fog step
- **THEN** the editor asks Save, Discard or Keep editing, and stays on Walls until the GM chooses

#### Scenario: Save then switch
- **WHEN** the GM chooses Save in that prompt
- **THEN** the wall is sent to the room and the editor shows the Fog step

#### Scenario: Discard then switch
- **WHEN** the GM chooses Discard in that prompt
- **THEN** nothing is sent, the wall is gone from the draft, and the editor shows the Fog step

#### Scenario: Keep editing
- **WHEN** the GM chooses Keep editing in that prompt
- **THEN** the editor stays on the Walls step with the drawn wall still in the draft

#### Scenario: Grid changes when switching
- **WHEN** the GM changes the cell size in Edit map's Grid step and chooses the Walls step
- **THEN** the editor asks, and Save applies the new grid to the room before showing Walls

#### Scenario: Uploading goes from Map to Grid without asking
- **WHEN** the GM uploads a map in Change map's Map step, or chooses the Grid step while a draft map is open
- **THEN** the editor shows the Grid step without asking

#### Scenario: Draft map before Walls
- **WHEN** a draft map is open in Change map
- **THEN** no Walls step is offered; Apply map closes the editor, and the new map's walls are reached through Edit map

#### Scenario: Closing Change map with a draft
- **WHEN** a draft map whose grid the GM has changed is open in Change map, and the GM closes the editor
- **THEN** the editor asks, Save applies the map with its grid and returns to the board, and Discard drops the draft map and closes

#### Scenario: Nothing unsaved
- **WHEN** the GM switches steps with nothing unsaved
- **THEN** the editor switches without asking

#### Scenario: Closing with grid changes
- **WHEN** the GM changes the grid of the current map in Edit map and closes the editor
- **THEN** the editor asks Save, Discard or Keep editing instead of silently dropping the change

### Requirement: The editor has a Sight step
The room's map editor SHALL have a fifth step, "5 · Sight", after Fog. It SHALL need an applied map, and SHALL say so when there is none. It SHALL offer the room's Line of sight switch and a Sight range control with Unlimited and a distance in the grid's units (a number field with the unit label beside it, and a slider in whole squares styled like the editor's other sliders). Both SHALL be part of the editor's draft: they reach the room only with Save changes, Discard drops them, and leaving the step with unsaved changes asks as the other steps do. The step SHALL preview the draft with test tokens: the map darkened outside their sight, computed from the room's walls, fog and the draft range, with the room grid drawn as in the other steps. The preview SHALL zoom and pan like the Walls and Fog maps (+, − and Fit buttons beside the Guide button, the wheel or a pinch, and middle-drag, Space-drag or a two-finger drag), and test tokens SHALL still place, drag and snap correctly while zoomed. The library map editor SHALL NOT have this step.

#### Scenario: Set a range and save
- **WHEN** the GM opens the Sight step, turns line of sight on, sets the range to 60 ft and presses Save changes
- **THEN** the room's line of sight is on with a 60 ft range, and players' boards update

#### Scenario: Discard
- **WHEN** the GM changes the range and presses Discard
- **THEN** the room's range is unchanged

#### Scenario: Preview
- **WHEN** the GM drags the range slider in the Sight step
- **THEN** the preview shows the test tokens' sight shrinking or growing, and nothing is sent until Save changes

#### Scenario: Zoom the preview
- **WHEN** the GM presses + in the Sight step and then Fit
- **THEN** the preview zooms in and then returns to the whole map, and nothing is sent

#### Scenario: Sight before a map
- **WHEN** the room has no map and the GM opens the Sight step
- **THEN** the step asks the GM to apply a map first

### Requirement: The Sight step previews sight from test tokens
The Sight step SHALL show only test tokens on its preview, never the room's tokens. A side panel on the left SHALL list the test tokens and let the GM add and remove them. The step SHALL open with no test token and a prompt asking the GM to place one; Add token SHALL ask again. The Add token button SHALL stay a plus icon while asking, shown as pressed (outlined, not filled); pressing it again, or Escape once a test token exists, SHALL stop asking. While it asks, the next click on the map SHALL place the token there; the prompt SHALL offer no other placement control (a keyboard user presses Enter on the focused map to place it in the middle). The GM SHALL move a test token by dragging it (pressing on the map elsewhere SHALL NOT move it) or one square at a time with the arrow keys. A dropped or added test token SHALL snap to the grid as a token dropped on the board does, and holding Alt while dropping SHALL place it without snapping. Each test token in the panel SHALL have a checkbox (named "Show <name>'s sight") that includes it among the tokens whose sight the preview shows, and a Select all checkbox above the list SHALL show every token, or none if all were shown. Clicking the empty map SHALL NOT change which tokens are shown. Pressing a test token on the map, or pressing Enter on it, SHALL show that token alone. A token added while every token was shown (or the first token) SHALL be shown; otherwise the shown set SHALL stay as it is, and removing a token SHALL remove it from the shown set. With nothing shown, no token sees and the whole map is covered. While at least one token is shown and another is not, a small notice at the bottom right of the map SHALL say how many of the tokens not shown the shown ones see ("<name> sees" for one, "They see" for several); its Close SHALL hide it until the shown set next changes and SHALL NOT change that set. Windows SHALL be drawn in a different colour from doors on the preview. Sight SHALL update when a token is dropped. Clicking a door or window on the preview SHALL open it, or close it if open, for the preview only; the room's walls SHALL NOT change. Test tokens SHALL exist only in the editor: they SHALL NOT be sent to the server, saved, or shown to anyone else.

#### Scenario: Place the first token
- **WHEN** the GM opens the Sight step
- **THEN** there is no test token and a prompt asks the GM to place one; clicking the map places it there

#### Scenario: Add a token behind a wall
- **WHEN** the GM adds a second test token on the far side of a wall and shows only the first one
- **THEN** the notice says the first token sees 0 of 1 other token, and no command is sent

#### Scenario: Move it into view
- **WHEN** the GM then moves the second token to the first token's side of the wall
- **THEN** the notice says the first token sees 1 of 1 other token

#### Scenario: Select all and the empty map
- **WHEN** the GM ticks Select all, then clicks an empty part of the map
- **THEN** every test token's sight is shown, and clicking the map leaves that unchanged

#### Scenario: Press a token
- **WHEN** the GM presses a test token on the map while several are shown
- **THEN** only that token's sight is shown

#### Scenario: Windows have their own colour
- **WHEN** the map has a door and a window
- **THEN** the window is drawn in a different colour from the door

#### Scenario: Open a door in the preview
- **WHEN** a closed door stands between two test tokens and the GM clicks it on the preview
- **THEN** the door shows open, the selected token sees the other one, and no command is sent

#### Scenario: Remove a token
- **WHEN** the GM removes a test token from the left panel
- **THEN** it leaves the preview, and nothing is sent

### Requirement: Walls, Fog and Sight can hide the grid
The Walls, Fog and Sight maps, in the room and library map editors, SHALL have the board's "Show" menu at their top-left corner, opposite the Guide button, with one Grid checkbox (checked by default) for whether the map draws the grid lines. The choice SHALL be a view setting only: it SHALL be shared by those three steps, remembered in the browser, and never sent to the server or saved. The Grid step SHALL always show the grid. The menu and the grid lines SHALL NOT cover the Sight step's placement prompt or catch pointer events meant for the map.

#### Scenario: Hide the grid
- **WHEN** the GM unchecks Grid in the Show menu of the Sight step and opens the Walls step
- **THEN** neither map draws grid lines, Grid is unchecked in both menus, and no command is sent

#### Scenario: Show it again
- **WHEN** the GM checks Grid in the Show menu of the Fog step
- **THEN** the grid is drawn in Fog, Walls and Sight as the Grid step set it
