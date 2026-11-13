# portals Specification

## Purpose
Lets the GM turn walls into doors and windows that open, close and lock, so movement through a doorway follows the portal's state, and players see and use the portals in front of them (FR-GM-18, FR-GM-09).

## Requirements

### Requirement: The GM designates walls as portals
The GM SHALL be able to make any wall a door or a window with a state of open, closed or locked, to change an existing portal's kind or state, and to turn a portal back into a plain wall. Players SHALL NOT be able to do any of these. A designation that changes nothing SHALL be refused. Each change SHALL be one undoable action.

#### Scenario: Mark a doorway
- **WHEN** the GM picks Door and Closed in the map editor's Door / window tool, clicks an existing wall, and saves the editor's changes
- **THEN** that wall becomes a closed door, and the activity log reads "made a wall a closed door"

#### Scenario: Nothing changes before Save
- **WHEN** the GM marks a wall as a door in the map editor but has not saved
- **THEN** the room's walls are unchanged and players see no door

#### Scenario: A new wall drawn as a door
- **WHEN** the GM draws a wall in the map editor, marks it as a door, and saves
- **THEN** the room gains that wall already a door, in one undoable action

#### Scenario: A player cannot designate portals
- **WHEN** a player sends `portal.set`
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Unknown wall
- **WHEN** the GM sends `portal.set` for a wall id that does not exist
- **THEN** the server refuses it as not found

### Requirement: Portal state controls movement
A closed or locked portal SHALL block tokens exactly as a wall does, under the clearance rule of the `token-wall-clearance` capability: no token may stand where it touches the clearance circle at any of the token's sample points, and a player may not move a token so that a sample point's circle sweeps across it. An open portal SHALL NOT block tokens.

#### Scenario: Walk through an open door
- **WHEN** a player moves their token straight through an open door
- **THEN** the move is accepted

#### Scenario: A closed door is in the way
- **WHEN** a player moves their token straight through a closed door
- **THEN** the server refuses it with "That move is unavailable."

#### Scenario: Locked blocks like closed
- **WHEN** a player moves their token straight through a locked window
- **THEN** the server refuses it with "That move is unavailable."

### Requirement: Who may change a portal's state
The GM SHALL be able to set any portal to any state. A player SHALL be able to open a closed portal and close an open one, but only one they can see. A player SHALL NOT be able to lock a portal, or to unlock or open a locked one. Setting a portal to the state it already has SHALL be refused. A plain wall, a missing wall and a portal the player cannot see SHALL all be refused with the same answer.

#### Scenario: A player opens a door
- **WHEN** a player clicks a closed door they can see
- **THEN** the door opens for everyone, and the GM's activity log reads "opened a door"

#### Scenario: A player meets a locked door
- **WHEN** a player sends `portal.setState` to open a locked door
- **THEN** the server refuses it with "That door is locked." and the door stays locked

#### Scenario: A player cannot lock
- **WHEN** a player sends `portal.setState` with state `locked`
- **THEN** the server refuses it as forbidden

#### Scenario: A door under fog
- **WHEN** a player sends `portal.setState` for a door whose midpoint is under fog
- **THEN** the server refuses it as not found, the same answer as for a wall id that does not exist

#### Scenario: The GM locks a door
- **WHEN** the GM Shift-clicks a closed door on the board
- **THEN** the door becomes locked, and the activity log reads "locked a door"

### Requirement: Players see the portals in front of them
A player's state SHALL contain every portal wall any part of which is visible to them (outside every fog region and, with line of sight on, inside their sight), whole, with its kind and state, and SHALL NOT contain portals wholly under fog or out of sight. It SHALL contain plain walls only as the visible pieces defined by the `visible-walls` capability, never a plain wall's unseen parts. When a change reveals or withdraws a portal for a player (a portal added, removed or designated, or fog added or removed), the player SHALL receive a fresh filtered state. A state change of a portal the player can see SHALL reach them as a live event.

#### Scenario: Doors but no walls
- **WHEN** a room has twenty walls, one of them a closed door outside fog and the rest entirely under fog, and a player joins
- **THEN** the player's state holds exactly that door

#### Scenario: A door half under fog
- **WHEN** fog covers a door's midpoint and one end, but not its other end
- **THEN** the player's state holds the whole door

#### Scenario: Fog lifts off a door
- **WHEN** the GM removes the fog over a door
- **THEN** the player's board shows the door

#### Scenario: Door opened in view
- **WHEN** the GM opens a door the player can see
- **THEN** the player's board shows it open without a full reload

### Requirement: Portal changes are reversible
The GM SHALL be able to undo any portal change from the activity log, which restores the previous kind and state. The undo SHALL be refused when that portal has changed since or its wall is gone.

#### Scenario: Undo an opening
- **WHEN** a player opens a door and the GM undoes that action
- **THEN** the door is closed again

#### Scenario: Changed since
- **WHEN** a door was opened, then locked, and the GM tries to undo the opening
- **THEN** the undo is refused because the door has changed since

### Requirement: Portals on the board
The board SHALL draw every portal the viewer can see, with a style that tells doors from windows and open from closed from locked, and thick enough to find at any zoom. Doors SHALL be drawn in the door colour of the `board-palette` capability with a short tick across each end, so a door is told from a plain wall by shape as well as colour. An open portal SHALL be drawn with a gap in its middle. A locked portal SHALL carry a padlock badge at its middle. Clicking a portal the viewer may toggle SHALL open it if closed and close it if open. For the GM, Shift-clicking SHALL lock a closed or open portal and unlock a locked one to closed; the GM's Doors tool (`board-doors-tool`) SHALL offer the same locking without a modifier key. Plain walls SHALL stay visible to the GM only.

#### Scenario: GM opens a door on the board
- **WHEN** the GM clicks a closed door with the Select tool
- **THEN** the door opens and is drawn as open

#### Scenario: Player clicks a locked door
- **WHEN** a player clicks a locked door
- **THEN** the door stays locked and the player sees "That door is locked."

#### Scenario: Door told from wall
- **WHEN** the GM's board shows a closed door set into a plain wall
- **THEN** the door is drawn in the door colour, thicker than the wall, with a tick across each end, and the wall in the wall colour

#### Scenario: Locked door badge
- **WHEN** any viewer sees a locked door
- **THEN** the door is drawn with a padlock badge at its middle
