# board-view-filters Specification

## Purpose
Controls what the GM's own board draws (fog, walls, doors and windows, terrain, Token view) without changing what players see, and keeps players' boards free of view controls.

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

### Requirement: The GM can view the board through the selected token's sight
While line of sight is on, the GM's Show menu SHALL include a "Token view" checkbox, unchecked by default, as a compact row like the other options. It SHALL NOT appear while line of sight is off.

#### Scenario: Row shown with line of sight
- **WHEN** line of sight is on and the GM opens Show
- **THEN** a "Token view" checkbox is listed

#### Scenario: Line of sight off
- **WHEN** line of sight is off
- **THEN** the Show menu has no Token view row

### Requirement: Token view darkens the GM's board outside the selected token's sight
While Token view is checked and the GM has a token selected, the GM's board SHALL be darkened outside that token's sight, including a hidden token's, using the sight computation and mask players receive. Tokens outside it SHALL be dimmed by that mask, not removed. It SHALL update as tokens, walls, doors or the range change, and SHALL be view-only: no command is sent and no other participant is affected. Unchecked, the board SHALL be fully lit.

#### Scenario: A token is selected
- **WHEN** Token view is checked and the GM selects a goblin that a wall separates from part of the map
- **THEN** that part is darkened on the GM's board only

### Requirement: Shift-click views several tokens together
While Token view is checked, clicking a token SHALL make that token the only one viewed, and Shift-clicking a token SHALL add it to the viewed tokens or, if already viewed, remove it, without otherwise changing the normal selection. The board SHALL show the union of the viewed tokens' sight and mark each viewed token with a dashed ring. A viewed token that is deleted SHALL drop out of the set. Unchecking Token view or turning line of sight off SHALL clear the set. No command SHALL be sent.

#### Scenario: Two tokens
- **WHEN** Token view is checked, the GM clicks one token and Shift-clicks another
- **THEN** the board is lit where either sees, both tokens carry a dashed ring

#### Scenario: Shift-click again
- **WHEN** the GM Shift-clicks a viewed token
- **THEN** it is no longer viewed

### Requirement: The active view is shown in the Show menu
While Token view is checked, the Show button SHALL be marked active (an accent dot) and the Token view row SHALL carry one muted line, "Shift-click to add tokens". With nothing viewed, the board SHALL show one quiet status pill at its bottom, clear of the tool rail, reading "Select a token to see its view". Token view SHALL turn off when line of sight is turned off, and SHALL be unavailable while the GM previews as a player.

#### Scenario: Nothing selected
- **WHEN** Token view is checked and no token is viewed
- **THEN** the board is not darkened and the pill is shown

#### Scenario: Previewing as a player
- **WHEN** the GM is viewing as a player
- **THEN** the Token view row is not shown
