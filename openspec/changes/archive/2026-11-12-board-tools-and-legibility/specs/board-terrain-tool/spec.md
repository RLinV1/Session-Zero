## Purpose

Lets the GM paint Difficult and Blocked terrain straight onto the live board from the tool rail, instead of in a separate dialog.

## ADDED Requirements

### Requirement: The GM paints terrain on the board
The GM's rail SHALL offer a Terrain tool. Players SHALL NOT see it. Its options SHALL be a shape (Brush or Rectangle) and a paint (Normal, which erases, Difficult or Blocked), each remembered while another tool is active. With the tool active, dragging on the board SHALL preview the squares the stroke covers, and releasing SHALL send the stroke to the room as one terrain change on the Base layer. Only squares inside the map SHALL be painted. A stroke covering more squares than the room accepts SHALL be refused before sending, with the reason shown. A stroke the server refuses SHALL be dropped from the board, and its reason shown. Esc or a right-click SHALL cancel a stroke in progress. While the Terrain tool is active, the GM's board SHALL draw terrain even if Show has Terrain unchecked. With no map on the scene, the tool SHALL say a map is needed first and paint nothing. Each stroke SHALL be one undoable action, as terrain painting already is.

#### Scenario: Brush a Difficult strip
- **WHEN** the GM picks Terrain, Brush and Difficult, and drags across four squares
- **THEN** those four squares become Difficult for everyone, and the activity log records one terrain change

#### Scenario: Erase with a rectangle
- **WHEN** the GM picks Rectangle and Normal and drags over a block of Blocked squares
- **THEN** those squares go back to Normal ground

#### Scenario: Terrain hidden in Show
- **WHEN** the GM has unchecked Terrain in Show and picks the Terrain tool
- **THEN** terrain is drawn while the tool is active, and hidden again once another tool is picked

#### Scenario: Cancel a stroke
- **WHEN** the GM presses Esc while dragging a stroke
- **THEN** the preview disappears and nothing is sent

### Requirement: Terrain is painted on Base only
The interface SHALL offer no extra terrain layers: the Terrain tool, the room map editor's Terrain step and the library map editor's Terrain step SHALL have no layer choice and no control to add, rename or remove a layer, and every stroke SHALL paint the Base layer. There SHALL be no separate live terrain dialog. The board toolbar SHALL NOT show a Paint terrain button, on desktop or in the phone Board options menu. Extra layers a room already has SHALL be left as they are: they are still drawn and still apply to movement, and nothing in the interface changes them.

#### Scenario: No layer controls
- **WHEN** the GM picks the Terrain tool, or opens the Terrain step of either map editor
- **THEN** there is no layer choice, no Add layer, and no list of layers

#### Scenario: A room that already has a layer
- **WHEN** the GM paints with the Terrain tool in a room that already has an "Ice" layer
- **THEN** the stroke changes Base, and the Ice layer's squares stay as they were

#### Scenario: No toolbar button
- **WHEN** the GM looks at the board toolbar
- **THEN** there is no Paint terrain button
