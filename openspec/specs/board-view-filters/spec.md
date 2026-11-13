# board-view-filters Specification

## Purpose
TBD - created by archiving change fog-and-filter-polish. Update Purpose after archive.

## Requirements

### Requirement: The Show menu is compact
The GM's "Show" menu SHALL list each option as a checkbox followed by its label on one line, left aligned. The menu SHALL be only as wide as its longest label plus padding.

#### Scenario: Menu with fog and walls
- **WHEN** the GM opens Show on a room with fog and walls
- **THEN** each of "Fog" and "Walls" appears on its own line with the checkbox to the left of the text, and there is no large empty space around them

### Requirement: Terrain is shown by default and Show is GM-only
Every viewer's board SHALL draw the scene's terrain by default, without any setting. Only the GM SHALL get the board's "Show" control. A player's board SHALL NOT show a Show button, on desktop or in the phone toolbar. The GM's Show menu SHALL keep its rows (Fog, Walls, Doors and windows, Terrain, and Token view while line of sight is on), each shown only when it applies as before, with Terrain and Doors and windows checked whenever the board opens; unchecking either is not remembered past that visit. Unchecking Terrain SHALL hide terrain only on the GM's own board. A GM previewing as a player SHALL see what that player sees, with no Show control.

#### Scenario: Player sees terrain without a menu
- **WHEN** a player opens a room whose scene has Difficult terrain
- **THEN** the Difficult squares are drawn on their board, and their toolbar has no Show button

#### Scenario: GM opens the room
- **WHEN** the GM opens a room with terrain
- **THEN** terrain is drawn, and the Show menu lists Terrain checked

#### Scenario: GM hides terrain for themselves
- **WHEN** the GM unchecks Terrain in Show
- **THEN** terrain is no longer drawn on the GM's board, and every player's board still draws it

#### Scenario: Doors and windows shown on every visit
- **WHEN** the GM unchecks Doors and windows, then reloads the room
- **THEN** doors and windows are drawn again and the row is checked
