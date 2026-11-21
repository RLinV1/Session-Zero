## Purpose

Gives every participant a set of board tools on the side of the map — select, measure, draw, and area shapes — so they can check distances and sketch plans. In this version the marks stay on the viewer's own client.

## ADDED Requirements

### Requirement: The board shows a tool rail with one active tool
The room page SHALL show a tool rail on the side of the board to players and the GM. The rail SHALL offer Select, Measure, Draw, AoE, and Eraser tools and a Clear all action, each with a visible text label under its icon on wider screens and icon-only on phone widths. The rail SHALL have a control to hide and show it; hidden, it shrinks to that control, the active tool keeps working, and the choice is remembered in this browser. Empty space beside the rail SHALL NOT block the board: a press there reaches the board. Exactly one tool SHALL be active at a time, and Select SHALL be active when the board opens. The active tool SHALL be indicated visually and to assistive technology (a pressed state). Every rail control SHALL be reachable and operable by keyboard. Pressing Escape while the board has focus or while a non-Select tool is active SHALL return to Select. The rail SHALL fit on phone widths without covering the board's existing top-left controls.

#### Scenario: Board opens in Select
- **WHEN** a participant opens a room
- **THEN** the tool rail is visible and Select is the active tool

#### Scenario: Switching tools
- **WHEN** the participant activates Measure
- **THEN** Measure is shown as pressed and Select is no longer pressed

#### Scenario: Escape returns to Select
- **WHEN** Draw is active and the participant presses Escape
- **THEN** Select becomes the active tool

### Requirement: Select keeps today's board behaviour
While Select is active, the board SHALL behave as it did before this change: dragging an owned token moves it, dragging empty space pans, the wheel and pinch zoom, and double-click or double-tap pings.

#### Scenario: Token drag in Select
- **WHEN** Select is active and a player drags a token they own
- **THEN** the token moves and a move is committed as before

### Requirement: Tools take the primary drag; camera gestures still work
While Measure, Draw, Area, or Eraser is active, a primary-button or one-finger drag SHALL operate the tool and SHALL NOT pan the board or move a token, including when the drag starts on a token. Other mouse buttons SHALL still pan, the wheel and two-finger pinch SHALL still zoom and pan, and double-click SHALL still ping.

#### Scenario: Measuring from a token
- **WHEN** Measure is active and the participant starts a drag on a token they own
- **THEN** a measurement starts at that point and the token does not move

#### Scenario: Panning with a tool active
- **WHEN** Draw is active and the participant drags with the right or middle mouse button
- **THEN** the board pans and nothing is drawn

### Requirement: Measure shows distance in grid units
With Measure active, dragging SHALL show a line from the start point to the pointer and a label with the distance in the room grid's units, formatted as a number followed by the grid's unit label (for example `25 ft`). By default both ends SHALL snap to the centre of their grid cell, and distance SHALL count cells with every diagonal step counting as one cell, multiplied by the grid's units per cell. While Alt is held, the ends SHALL NOT snap and the distance SHALL be the straight-line length divided by the cell size, multiplied by units per cell, rounded to one decimal place. The last measurement SHALL stay visible until the next measurement starts, the tool changes, or Clear is used.

#### Scenario: Snapped straight measurement
- **WHEN** the grid is 5 ft per cell and the participant measures from one cell to the cell five cells to its right
- **THEN** the label reads `25 ft`

#### Scenario: Snapped diagonal measurement
- **WHEN** the grid is 5 ft per cell and the participant measures three cells right and three cells down
- **THEN** the label reads `15 ft`

#### Scenario: Free measurement
- **WHEN** Alt is held and the drag covers 1.5 cells in a straight line on a 5 ft grid
- **THEN** the ends are not snapped and the label reads `7.5 ft`

### Requirement: Draw places brush, line, rectangle, and circle marks
With Draw active, the participant SHALL choose a shape of brush, line, rectangle, or circle and one colour from a fixed palette. Brush SHALL be the default. A brush SHALL draw a freehand stroke that follows the pointer from press to release. For the other shapes, dragging SHALL preview the shape between the press point and the pointer, and releasing SHALL keep it as a mark: a line joins the two points, a rectangle has them as opposite corners, and a circle is centred on the press point with its edge at the release point. A drag shorter than a few screen pixels SHALL NOT create a mark. Freehand strokes are local to the viewer like every other mark here; this deliberately goes beyond FR-TAC-04, which leaves freehand out of the shared overlays.

#### Scenario: Drawing a rectangle
- **WHEN** Draw is active with rectangle and red chosen, and the participant drags from one point to another
- **THEN** a red rectangle with those two points as opposite corners remains on the map after release

#### Scenario: Brush stroke
- **WHEN** Draw is active with brush chosen and the participant drags a zig-zag
- **THEN** a stroke following that zig-zag remains on the map after release

#### Scenario: A click draws nothing
- **WHEN** Draw is active and the participant clicks without dragging
- **THEN** no mark is created

### Requirement: Area places circle, cone, and box shapes sized by dragging
With Area active, the participant SHALL choose a shape of circle, cone, or box. Pressing SHALL set the origin. Dragging SHALL size and aim the shape so the pointer sits on its far edge, show its size in grid units beside the pointer while dragging, and place it on release. The size SHALL snap to whole grid cells (at least one) unless Alt is held. A click without a drag SHALL place the shape at a size chosen from a set of common sizes, pointing right. A circle SHALL be centred on the origin with the size as its radius. A cone SHALL start at the origin, point toward the pointer, have the size as its length, and be as wide as it is long at its far end. A box SHALL be a square with the size as its side, starting at the origin (the middle of its near side) and extending toward the pointer. The origin SHALL snap to the nearest grid intersection unless Alt is held. A placed area SHALL be drawn translucent so tokens under it stay visible.

#### Scenario: Dragging out a circle
- **WHEN** the grid is 5 ft per cell, Area is active with circle, and the participant presses on a grid intersection and drags three cells away
- **THEN** the label beside the pointer reads `15 ft` and a circle of radius three cells is placed on release

#### Scenario: Aiming a cone by dragging
- **WHEN** Area is active with cone and the participant presses at a point and drags four cells to the right
- **THEN** a cone four cells long, pointing right, starting at the press point, is placed

#### Scenario: Clicking places the chosen size
- **WHEN** the grid is 5 ft per cell, Area is active with circle and 20 ft chosen, and the participant clicks on a grid intersection
- **THEN** a circle of radius four cells centred on that intersection is placed

### Requirement: The eraser removes the marks it touches
With Eraser active, pressing or dragging SHALL remove every mark of the viewer's that the pointer touches: within a few screen pixels of a line, stroke, or measurement, or on or inside a rectangle, circle, or area. It SHALL NOT affect tokens, the map, or anyone else's view.

#### Scenario: Erasing by dragging
- **WHEN** the participant has a rectangle and a cone on the map and drags the eraser across both
- **THEN** neither is shown and every other mark remains

#### Scenario: Erasing a stroke with a click
- **WHEN** the participant clicks the eraser on a brush stroke
- **THEN** that stroke is removed

### Requirement: Clear all removes the viewer's marks
The Clear all action SHALL remove every measurement, drawing, and area the viewer has placed, and SHALL NOT change the active tool.

#### Scenario: Clearing marks
- **WHEN** the participant has two drawings and an area on the map and activates Clear all
- **THEN** none of them are shown and the active tool is unchanged

### Requirement: Each tool has its own cursor
While Measure, Draw, Area, or Eraser is active, the pointer over the board SHALL show a cursor for that tool (a ruler, a brush, an area ring, an eraser), with its hotspot on the point the tool acts on. Select SHALL keep the existing cursors.

#### Scenario: Eraser cursor
- **WHEN** Eraser is active and the pointer is over the board
- **THEN** the cursor is an eraser

### Requirement: Marks stay on the viewer's client and on the map
Measurements and drawings SHALL be visible only to the participant who made them. (Areas are shared with the table; see the `area-templates` capability from `shared-aoe-templates`.) They SHALL NOT be sent to the server or to other participants, SHALL NOT be recorded in the room's history, and SHALL be gone after the page reloads. They SHALL be positioned in board coordinates, so they stay over the same place on the map when the viewer pans or zooms and when room state updates. Their line widths SHALL stay readable at any zoom level.

#### Scenario: Other players do not see marks
- **WHEN** one player draws a circle on the map
- **THEN** no command or ephemeral message is sent, and another player's board shows no circle

#### Scenario: Marks follow the map
- **WHEN** a participant places an area and then zooms and pans
- **THEN** the area stays over the same map location

#### Scenario: Marks survive a state update
- **WHEN** a participant has a drawing on the map and another participant moves a token
- **THEN** the drawing is still shown
