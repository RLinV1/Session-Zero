# area-templates Specification

## Purpose
Lets the table aim and place spell areas on the map so everyone sees the same squares, with live aiming shared as it happens and only the final placement kept in the room.

## Requirements

### Requirement: Line templates
A participant SHALL be able to place a line template. A line SHALL start at its origin and extend toward its aim point for its length in grid units, with a width in grid units that defaults to one cell. Without Alt, the origin SHALL snap to the nearest half cell and the length to whole cells. Length and width MUST be positive, and width MUST NOT exceed 10 cells.

#### Scenario: Place a 60 ft line
- **WHEN** a player on a 5 ft grid drags a line from a cell corner 12 cells long and releases
- **THEN** every client shows a 60 ft by 5 ft line from that corner in the dragged direction, and the activity log says the player placed a 60 ft line

#### Scenario: 10 ft wide line
- **WHEN** the GM places a line with a width of 2 cells
- **THEN** every client shows the line 10 ft wide

#### Scenario: Invalid width
- **WHEN** a client sends a line placement with a width of 0 or more than 10 cells
- **THEN** the server rejects it and no template is added

### Requirement: Aiming is shared live
While a participant drags the Area tool, every other client allowed to see the result SHALL see a live preview of the template at its current position, size and direction, marked as a preview and labelled with the aiming participant's name. A preview SHALL disappear when the aiming participant places or cancels, and by itself within 1 second of the last update.

#### Scenario: Player aims a cone
- **WHEN** a player drags to aim a 15 ft cone
- **THEN** the GM and other players see a dashed 15 ft cone following the drag, labelled with that player's name

#### Scenario: Aim cancelled
- **WHEN** the aiming player presses Escape
- **THEN** the preview disappears from every other client

#### Scenario: Sender disconnects mid-aim
- **WHEN** the aiming player's connection drops during a drag
- **THEN** the preview disappears from other clients within 1 second

### Requirement: Previews are never persisted
An aim preview MUST NOT change room state, MUST NOT be written to the event log, and MUST NOT take a sequence number. Only placing a template SHALL commit it.

#### Scenario: Aim, then place
- **WHEN** a player aims a template for several seconds and then places it
- **THEN** the room's log gains exactly one template-placed event, at the next sequence number, and nothing for the aiming

#### Scenario: Reload during aim
- **WHEN** another client reloads while a player is still aiming
- **THEN** the reloaded client's state contains no template from that aim

### Requirement: GM-only aiming stays hidden
A preview of a GM-only template MUST be delivered to GMs only. The server MUST drop a GM-only preview sent by a player, and MUST drop any preview whose origin is off the map or that is sent while the scene has no map.

#### Scenario: GM aims a hidden trap area
- **WHEN** the GM aims a GM-only circle
- **THEN** no player receives any message about it

#### Scenario: Forged GM-only preview
- **WHEN** a player sends a preview marked GM-only
- **THEN** no client receives it

### Requirement: Area color
A participant SHALL be able to choose an area's color before placing it, from red, orange, yellow, green, blue, purple and grey, with orange chosen at first. The color SHALL be part of the placed area. Every client that receives the area SHALL draw it in that color, and the live aim preview SHALL show it while aiming. The server MUST reject a placement or a preview with any other color. An area with no color, including one placed before colors existed, SHALL be drawn orange. The activity log SHALL name a placed area's color. The color of a GM-only area MUST NOT reach any player, just as the area itself does not.

#### Scenario: Red fireball
- **WHEN** a player chooses red and places a 20 ft circle
- **THEN** every client draws a red 20 ft circle, and the activity log says the player placed a red 20 ft circle

#### Scenario: Color while aiming
- **WHEN** the GM chooses blue and drags to aim a cone
- **THEN** the other clients see the cone's preview in blue

#### Scenario: Unknown color
- **WHEN** a client sends a placement with a color that isn't one of the seven
- **THEN** the server rejects it and no area is added

#### Scenario: Area from before colors
- **WHEN** a room is opened whose log has an area placed before colors existed
- **THEN** that area is drawn orange

#### Scenario: GM-only area's color
- **WHEN** the GM places a GM-only green circle
- **THEN** no player receives the area or its color

### Requirement: GM-only areas are hatched
A GM-only area SHALL be drawn, for the GMs who receive it, with diagonal hatching in its own color and a solid outline. Other areas SHALL have a plain translucent fill. A GM-only area's aim preview SHALL be hatched too. Being GM-only SHALL NOT change an area's color.

#### Scenario: GM-only and public side by side
- **WHEN** the GM places a red circle and a GM-only red circle
- **THEN** the GM sees both in red, the GM-only one with diagonal hatching, and players see only the first

### Requirement: Line width control
The Area tool SHALL take a line's width as a whole number of squares from 1 to 10 in a number field with decrease and increase buttons, starting at 1. Decrease SHALL be disabled at 1 and increase at 10. A typed value SHALL be rounded to a whole number and kept within 1 to 10 when the field loses focus or Enter is pressed. An empty or invalid entry SHALL keep the last valid width. The server's limit of 10 cells SHALL be unchanged.

#### Scenario: Step the width
- **WHEN** the line width is 1 and the participant presses increase three times
- **THEN** the field shows 4, and a line placed next is 4 squares wide on every client

#### Scenario: Out of range
- **WHEN** the participant types 14 in the width field and presses Enter
- **THEN** the field shows 10

#### Scenario: Cleared field
- **WHEN** the width is 3 and the participant clears the field and clicks away
- **THEN** the field shows 3 again

### Requirement: Square areas are placed by their centre
A square area's placed point SHALL be its centre. Without Alt, the centre SHALL snap to the nearest half cell. The square SHALL turn around its centre to face the aim point. When sized by dragging, its side SHALL be twice the distance from the centre to the pointer, snapped to whole cells unless Alt is held. A square placed by a click SHALL be 2 cells on a side. A square placed before this change SHALL be drawn centred on its stored point. It moves by half its side, and nothing in the log is rewritten.

#### Scenario: Click a square's centre
- **WHEN** a player clicks the centre of a cell with the square shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft square centred on that cell

#### Scenario: Click a cell corner
- **WHEN** a player clicks a cell corner with the square shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft square covering exactly the four cells around that corner

#### Scenario: Drag to size
- **WHEN** a player presses on a cell's centre and drags 1.5 cells to the right
- **THEN** a 15 ft square is centred on that cell and faces right

#### Scenario: Old square
- **WHEN** a room has a 10 ft square placed before this change
- **THEN** it is drawn centred on its stored point, 5 ft from where it was drawn before

### Requirement: A click places a 2-cell area
The Area tool SHALL have no size field. Clicking without dragging SHALL place an area 2 cells in size, in the room grid's unit: a circle with a 2-cell radius, or a cone, a line or a square 2 cells long or wide. It SHALL point right. Dragging SHALL set the size as it does today. A line placed by a click SHALL take its width from the width field.

#### Scenario: Click a circle on a 5 ft grid
- **WHEN** a player clicks a cell corner with the circle shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft circle centred on that corner

#### Scenario: Click on a metric grid
- **WHEN** the GM clicks with the cone shape chosen on a grid of 1.5 m cells
- **THEN** every client shows a 3 m cone pointing right

#### Scenario: Click a line
- **WHEN** the width field shows 2 and a player clicks with the line shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft line, 10 ft wide, pointing right

#### Scenario: No size field
- **WHEN** a participant opens the Area tool
- **THEN** it offers shape, color and, for lines, width, but no size

### Requirement: Placed areas are shared with the table
When a participant places an area with the Area tool, it SHALL be sent to the server and, once accepted, SHALL appear for every connected participant at the same board position, shape, direction and size. It SHALL remain after page reloads and SHALL be present for participants who join later.

#### Scenario: A player's cone reaches everyone
- **WHEN** a player places a 15 ft cone
- **THEN** the GM and every other player see the same cone, and the activity log reads "<player> placed a 15 ft cone"

#### Scenario: A late joiner sees existing areas
- **WHEN** a player joins after a circle was placed
- **THEN** their board shows that circle

### Requirement: The GM can place areas players never see
The GM SHALL be able to mark an area GM only before placing it. A GM-only area SHALL NOT be sent to players in any snapshot, event or response, and players SHALL only learn that something happened at that sequence number. The GM SHALL see GM-only areas drawn in a distinct colour. A player's attempt to place a GM-only area SHALL be refused.

#### Scenario: GM-only box stays hidden
- **WHEN** the GM places a GM-only box
- **THEN** the GM sees it in the GM-only colour and no player receives it

#### Scenario: A player cannot hide an area
- **WHEN** a player sends a place command marked GM only
- **THEN** the server refuses it as forbidden and nothing changes

### Requirement: Owners and the GM remove areas
A placed area SHALL be removable by the participant who placed it and by the GM, and by no one else. Removing SHALL take it off every participant's board. A player's attempt to remove a GM-only area SHALL be answered exactly as for an area that doesn't exist. The removal SHALL record the whole area as it was.

#### Scenario: Erasing your own area
- **WHEN** a player uses the Eraser on a cone they placed
- **THEN** the cone disappears for everyone

#### Scenario: Another player's area is not erasable
- **WHEN** a player uses the Eraser on an area the GM placed
- **THEN** the area remains and no removal is sent

#### Scenario: Clear all removes only your own areas
- **WHEN** the GM activates Clear all while a player's cone and the GM's circle are placed
- **THEN** the GM's circle is removed and the player's cone remains

### Requirement: Rooms hold a bounded number of areas
A room SHALL hold at most 200 placed areas. A placement beyond that SHALL be refused with a message asking to remove some first.

#### Scenario: The cap is reached
- **WHEN** a room already holds 200 areas and a participant places another
- **THEN** the placement is refused and the room is unchanged
