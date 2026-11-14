## MODIFIED Requirements

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
