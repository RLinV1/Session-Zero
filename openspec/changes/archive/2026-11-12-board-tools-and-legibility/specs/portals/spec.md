## MODIFIED Requirements

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
