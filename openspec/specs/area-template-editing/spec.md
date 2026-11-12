# area-template-editing Specification

## Purpose
Lets the table move, resize, turn and widen an area after it has been placed, so a spell's area can be adjusted in place and seen the same way by everyone, instead of erased and aimed again.

## Requirements

### Requirement: Who may edit a placed area
An area's owner and the GM SHALL be able to change its position, size, direction and, for a line, its width. The server MUST reject an edit from any other participant. An area the sender may not see, either GM-only or another participant's under fog, MUST be answered as though it did not exist. An edit SHALL keep the area's identity, owner, color and GM-only flag.

#### Scenario: Owner moves their area
- **WHEN** a player moves a circle they placed
- **THEN** every client shows the same circle, still theirs and still its color, at the new place

#### Scenario: GM edits a player's area
- **WHEN** the GM resizes a cone a player placed
- **THEN** the change is accepted and every client shows the new size

#### Scenario: Another player's area
- **WHEN** a player sends an edit for an area another player placed
- **THEN** the server rejects it as not allowed and the area is unchanged

#### Scenario: GM-only area
- **WHEN** a player sends an edit naming a GM-only area
- **THEN** the server answers that no such area exists, as for a missing one, and the area is unchanged

### Requirement: Edits are validated like placements
An edit MUST give a positive size no larger than a placement allows. A line's width MUST be positive and MUST NOT exceed 10 cells of the room's grid. A width given for a shape other than a line SHALL be ignored. The server MUST reject an edit that breaks these rules and leave the area unchanged.

#### Scenario: Line widened past the limit
- **WHEN** a client sends an edit giving a line a width of 11 cells
- **THEN** the server rejects it and the line keeps its width

### Requirement: Edits made from stale geometry are refused
An edit SHALL say which geometry it was made from. When that is no longer the area's current origin, aim, size and width, because someone else changed it first, the server MUST reject the edit and leave the area unchanged. The editing client SHALL then show the area as it now is.

#### Scenario: GM and owner drag at once
- **WHEN** the GM and the area's owner each drag the same area and the GM releases first
- **THEN** the GM's edit is applied, the owner's is refused, and the owner's board shows the area where the GM put it

### Requirement: Selecting a placed area
With the Select tool, pressing on a placed area the viewer may edit SHALL select it and show its handles. A token under the pointer SHALL take the press instead. Pressing on an area the viewer may not edit SHALL do what pressing the map does. The selection SHALL clear when any of these happens:
- the viewer presses the map with the Select tool
- the viewer chooses a tool other than Select or Area
- the viewer presses Escape when no edit is in progress
- the area leaves the room or the viewer's sight

Switching between the Select and Area tools SHALL keep it.

#### Scenario: Press an own area
- **WHEN** a player using the Select tool presses inside a circle they placed, with no token there
- **THEN** the circle is selected and its handle appears

#### Scenario: Token on the area
- **WHEN** a player presses on their token standing inside their own circle
- **THEN** the token is pressed, as it is today, and the circle is not selected

#### Scenario: Someone else's area
- **WHEN** a player presses inside another player's area and drags
- **THEN** the view pans and the area is not selected

### Requirement: Editing with the Area tool
In the Area tool, a press SHALL edit an existing area before it places a new one:
- **On a handle of the selected area:** drags that handle.
- **Inside an area the viewer may edit:** a click selects it without placing anything, and a drag moves it. For a player, these are their own areas; for the GM, every area.
- **Anywhere else:** places a new area as before. This includes a press inside an area the viewer may not edit.

An area hidden from the viewer SHALL NOT block placing. An area the viewer places SHALL become selected once it is in the room, replacing any earlier selection.

#### Scenario: Place then stretch
- **WHEN** a player clicks an empty spot with the circle shape on a 5 ft grid, then drags the new circle's rim handle out to 4 cells
- **THEN** a 10 ft circle is placed and selected, and it becomes a 20 ft circle with the same centre, without the player changing tools

#### Scenario: Turn a cone without leaving the tool
- **WHEN** a player in the Area tool drags the tip handle of their selected cone to point south
- **THEN** the cone turns to point south and no new area is placed

#### Scenario: Click inside own area
- **WHEN** a player in the Area tool clicks inside a circle they placed
- **THEN** that circle is selected and no new area is placed

#### Scenario: Drag own area
- **WHEN** a player in the Area tool presses inside their own square and drags two cells right
- **THEN** the square moves two cells right and no new area is placed

#### Scenario: Inside another player's area
- **WHEN** a player in the Area tool clicks inside a circle another player placed
- **THEN** a new 2-cell area of the chosen shape is placed there, and the other player's circle is unchanged

#### Scenario: GM inside a player's area
- **WHEN** the GM in the Area tool drags from inside a cone a player placed
- **THEN** the player's cone moves, and no new area is placed

#### Scenario: Hidden area doesn't block
- **WHEN** a player in the Area tool clicks inside the footprint of a GM-only circle
- **THEN** a new area is placed there, and nothing about the GM-only circle reaches the player

#### Scenario: Selection survives a tool switch
- **WHEN** a player selects their circle in the Area tool, switches to the Select tool and back
- **THEN** the circle is still selected with its handle showing

### Requirement: Moving an area by its body
Dragging an area's body SHALL move it without changing its size, direction or width. This SHALL apply to any area the viewer may edit, in both the Select tool and the Area tool. The area SHALL follow the pointer while dragging and be sent when released. Without Alt, the placed point SHALL snap to the nearest half cell, as at placement. Escape during the drag SHALL put it back and send nothing. A press that does not move SHALL send nothing.

#### Scenario: Nudge a fireball
- **WHEN** a player drags their 20 ft circle two cells to the left and releases
- **THEN** every client shows the 20 ft circle two cells to the left, and nothing else about it changes

#### Scenario: Cone keeps its facing
- **WHEN** the GM drags a cone pointing north by its body to another square
- **THEN** the cone's apex is at the new square and it still points north

#### Scenario: Cancel a move
- **WHEN** a player drags an area and presses Escape before releasing
- **THEN** the area is back where it was and no change is sent

### Requirement: Size and direction handle
A selected area SHALL show one handle that sets its size, and its direction where it has one, the same way dragging out a placement does:
- **Circle:** on its rim. Sets the radius only.
- **Cone:** at the middle of its far edge. Sets length and direction.
- **Line:** at its far end. Sets length and direction.
- **Square:** at a corner. Sets side and facing, around its centre.

The placed point SHALL stay where it is. Without Alt, the size SHALL snap to whole cells, and it MUST NOT be smaller than one cell. With Alt, it SHALL be free.

#### Scenario: Grow a circle
- **WHEN** a player drags their 10 ft circle's rim handle out to 4 cells from its centre on a 5 ft grid
- **THEN** every client shows a 20 ft circle with the same centre

#### Scenario: Turn and lengthen a cone
- **WHEN** the GM drags a 15 ft cone's tip handle to a point 6 cells east of its apex
- **THEN** every client shows a 30 ft cone from the same apex, pointing east

#### Scenario: Turn a square
- **WHEN** a player drags a square's corner handle around its centre without changing the distance
- **THEN** the square turns to face the pointer and keeps its side and centre

### Requirement: Line width handles
A selected line SHALL show a width handle at the middle of each long edge. Dragging either handle SHALL set the width to twice the pointer's distance from the line's centre line. The width SHALL be snapped to whole cells and kept between 1 and 10 cells, with or without Alt. The line's start, length and direction SHALL be unchanged. The Area tool's width field SHALL be unaffected and SHALL keep setting the width of the next line placed.

#### Scenario: Widen a line
- **WHEN** a player drags a 1-cell-wide line's width handle 1.5 cells away from its centre line on a 5 ft grid
- **THEN** every client shows the line 15 ft wide, with the same start, length and direction

#### Scenario: Past the limit
- **WHEN** a player drags a width handle 8 cells from the centre line
- **THEN** the line stops at 10 cells wide

#### Scenario: Field unchanged
- **WHEN** the width field shows 1 and the player widens a placed line to 3 cells
- **THEN** the field still shows 1, and the next line placed is 1 cell wide

### Requirement: Edits are shared live and never persisted
While an area is being moved or resized, every other client allowed to see the result SHALL see the edited area as a preview in place of the original, labelled with the editor's name. The original SHALL return if the edit is cancelled, and by itself within 1 second of the last update. An edit preview MUST NOT change room state, MUST NOT be written to the event log and MUST NOT take a sequence number. Releasing SHALL commit exactly one change.

#### Scenario: GM watches a player resize
- **WHEN** a player drags their cone's tip handle
- **THEN** the GM sees a dashed cone following the drag where the solid cone was, labelled with that player's name, and not both

#### Scenario: Drag and release
- **WHEN** a player drags an area for several seconds and releases
- **THEN** the room's log gains exactly one area-changed event and nothing for the drag

#### Scenario: Editor disconnects
- **WHEN** the editing player's connection drops during the drag
- **THEN** within 1 second other clients show the area where it was

### Requirement: Edit previews follow the area's visibility
The preview of an edit to a GM-only area MUST reach GMs only. The server MUST drop an edit preview whose sender may not edit the area it names, and one whose point is off the map. A player MUST NOT receive an edit preview of an area that would be hidden from them where the preview puts it.

#### Scenario: GM moves a hidden trap area
- **WHEN** the GM drags a GM-only circle
- **THEN** no player receives any message about it

#### Scenario: Forged edit preview
- **WHEN** a player sends an edit preview naming another player's area
- **THEN** no client receives it, and the area stays shown on every board

### Requirement: Moving an area through fog
When an edit moves another participant's area so that a player can no longer see it, because it went into fog or out of sight, that player's board SHALL remove it. When an edit moves an area into a player's view, their board SHALL show it. The area's owner and the GM SHALL always see the change. A player MUST NOT learn where an area hidden from them is, before or after the edit.

#### Scenario: Into fog
- **WHEN** a player moves their circle from a lit area into fog
- **THEN** other players' boards remove the circle, and the owner and the GM see it in its new place

#### Scenario: Out of fog
- **WHEN** a player moves their circle from fog into a lit area
- **THEN** other players' boards show the circle in its new place

### Requirement: Area edits in the activity log
The activity log SHALL record each committed edit with the editor's name and the area, in the room grid's unit:
- A move that changes only its position: "moved", e.g. "Pat moved a red 20 ft circle".
- A change of direction only: "turned", e.g. "Pat turned a 30 ft cone".
- Any other change: "changed" with the old and new size, e.g. "Pat changed a 15 ft cone to a 30 ft cone". A line's width is named as at placement.

An edit of a GM-only area SHALL say "(GM only)" and MUST NOT reach players.

#### Scenario: Resize logged
- **WHEN** the GM grows a 10 ft circle to 20 ft
- **THEN** the activity log says the GM changed a 10 ft circle to a 20 ft circle
