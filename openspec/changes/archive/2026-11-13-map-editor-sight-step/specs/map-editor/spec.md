## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Map setup opens as its own screen
When the room has a map, Manage › Battle map SHALL offer the GM one control, Edit map. Players SHALL NOT see it. It SHALL open the full-screen editor on its first step (Map, or Grid for a fixed map); the editor's step navigation SHALL reach the other steps. The editor SHALL have its own header, step navigation, a map canvas and a side panel. When the room has no map, Manage › Battle map SHALL offer Upload map and, with a library, From library instead. Opening and closing the editor SHALL NOT disconnect the GM or trigger a resync. Closing it SHALL return focus to Edit map.

#### Scenario: Open the editor
- **WHEN** the room has a map and the GM presses Edit map
- **THEN** a full-screen editor opens on its first step, the other steps are reachable from its step navigation, and the room keeps updating behind it

#### Scenario: Each control opens its own step
- **WHEN** the GM opens the editor with Edit map and picks Grid, Walls, Fog or Sight in its step navigation
- **THEN** the editor shows that step

#### Scenario: No map yet
- **WHEN** the room has no map
- **THEN** Manage › Battle map offers Upload map and From library, and no Edit map control

#### Scenario: Close the editor
- **WHEN** the GM opens the editor with Edit map and closes it with nothing unsaved
- **THEN** the board is shown again and focus is on Edit map
